'use strict';
// =============================================================
// MPS Connect — Server-Side AI Proxy
// OWASP LLM01/06/08 defence: system prompt, PII masking, canary
// tokens, output sanitisation, and AI audit logging are all
// server-side. The browser never sees or controls these.
// =============================================================

const express = require('express');
const crypto  = require('crypto');
const app     = express();

app.use(express.json({ limit: '512kb' }));

// ── Config (server-side only — never sent to browser) ────────
const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT || 'http://100.x.x.x:11434/api/chat';
const AI_MODEL        = process.env.AI_MODEL        || 'gemma4:e2b';
const PORT            = parseInt(process.env.PORT   || '3100', 10);

// Only accept requests from the nginx container on the same network
const ALLOWED_ORIGINS = [
  'http://127.0.0.1',
  'http://localhost',
  'http://mps-connect',
  'https://mps-connect.thegeekybeng.com',
];

// ── PII masking (Singapore-specific) ─────────────────────────
const PII_RULES = [
  { re: /[STFGM]\d{7}[A-Z]/gi,                                  label: '[NRIC REDACTED]'    },
  { re: /\+?65[\s-]?[689]\d{3}[\s-]?\d{4}/g,                    label: '[PHONE REDACTED]'   },
  { re: /\b[89]\d{7}\b/g,                                        label: '[PHONE REDACTED]'   },
  { re: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,   label: '[EMAIL REDACTED]'   },
  { re: /\bS\d{6}[A-Z]\b/gi,                                     label: '[POSTAL REDACTED]'  },
  { re: /\b\d{1,4}\s+[A-Za-z\s]+(Street|Road|Avenue|Drive|Lane|Crescent|Close|Place|Way|Walk|Terrace|Court|Gardens|Blk|Block)\b[^\n]{0,40}/gi,
                                                                  label: '[ADDRESS REDACTED]' },
];

function maskPII(text) {
  if (!text) return '';
  let s = text;
  for (const { re, label } of PII_RULES) s = s.replace(re, label);
  return s;
}

// ── Prompt injection patterns ─────────────────────────────────
const INJECTION_RE = [
  /ignore\s+(all\s+)?(previous\s+)?instructions?/gi,
  /disregard\s+(all\s+)?(previous\s+)?instructions?/gi,
  /forget\s+(all\s+)?(previous\s+)?instructions?/gi,
  /override\s+(system\s+)?instructions?/gi,
  /you\s+are\s+now\s+(?!responding)/gi,
  /new\s+system\s+prompt\s*:/gi,
  /<<\/?SYS>>/g,
  /\[INST\]|\[\/INST\]/g,
  /<\/?system>/gi,
  /\|\|URGENT_BOOKING\|\|/g,             // LLM08 — strip from user input
  /prompt\s+injection/gi,
  /jailbreak/gi,
];

function sanitize(text, maxLen = 2000) {
  if (!text || typeof text !== 'string') return '';
  let s = maskPII(text.slice(0, maxLen));
  for (const re of INJECTION_RE) s = s.replace(re, '[FILTERED]');
  return s;
}

// ── Output sanitisation ───────────────────────────────────────
function sanitizeOutput(text) {
  if (!text) return '';
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[SCRIPT REMOVED]')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript\s*:/gi, 'javascript-blocked:')
    .replace(/vbscript\s*:/gi, 'vbscript-blocked:');
}

// ── System prompt (server-side only) ─────────────────────────
function buildSystemPrompt(mpName, constituency, division, canary) {
  const safe = (v) => sanitize(String(v || ''), 100);
  return `You are a highly intelligent, multilingual Digital Assistant for ${safe(mpName)}, Member of Parliament for ${safe(constituency)}${division ? `, ${safe(division)} division` : ''}.

**PRIME DIRECTIVE: LANGUAGE MIRRORING — NON-NEGOTIABLE**
Detect what language the resident uses. Reply ONLY in that language.

- **Singlish** → Authentic Singlish ONLY. Use: lah, leh, lor, sia, wah, aiyo, hor. Natural warmth, NOT performed auntie-speak. NEVER reply in formal English if they write Singlish.
- **Mandarin / 中文** → Chinese characters ONLY. No pinyin. Zero English words.
- **Malay / Bahasa** → ENTIRELY Malay. Zero English words.
- **Tamil / தமிழ்** → Tamil script ONLY. Zero English words.
- **Formal English** → Professional, empathetic English.

**TIER 1 — EMERGENCY SERVICES (999 / Police / Ambulance)**
These situations require immediate emergency response. Do NOT tag as ||URGENT_BOOKING||.
Instead: respond with immediate empathy, give the correct emergency number, and encourage them to call NOW.
Situations: active violence or assault happening now (to resident OR witnessed nearby), medical emergency, fire, active crime in progress, immediate threat to life.

Example: "My neighbour is being beaten right now" → Tell them to call 999 immediately. This is a police matter, not an MP booking.
Example: "I feel like ending my life" → Give 999 and SOS hotline (1800-221-4444). Show care. Do NOT tag ||URGENT_BOOKING||.

**TIER 2 — URGENT MP CASE (tag: ||URGENT_BOOKING||)**
These situations need urgent MP office intervention — the MP can actually help. Tag these with ||URGENT_BOOKING|| at the END of your reply.
Situations: imminent eviction or forced removal within 24–48 hours, family with no food or shelter tonight, utilities cut off with young children or elderly at home, urgent medical bill crisis with no recourse, resident stranded with no income and no support network.

Steps for Tier 2:
1. Respond with immediate empathy in their language/register.
2. APPEND exactly this tag at the END of your reply: ||URGENT_BOOKING||

**Identity**: You represent ${safe(mpName)}. Be warm, direct, and efficient.
**Scope**: You handle constituency matters. For criminal, medical, or fire emergencies, always direct to 999 first.
[SID:${canary}]`;
}

// ── AI audit log ──────────────────────────────────────────────
function auditLog(type, meta) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), type, ...meta }));
}

// ── In-memory rate limiter ────────────────────────────────────
const rl = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const e = rl.get(key) || { n: 0, reset: now + windowMs };
  if (now > e.reset) { e.n = 0; e.reset = now + windowMs; }
  e.n++;
  rl.set(key, e);
  return e.n <= limit;
}

// ── Middleware: restrict to internal callers only ─────────────
app.use((req, res, next) => {
  // This service is not exposed externally — nginx is the only caller
  // Adding an origin header check as defence-in-depth
  const origin = req.headers['origin'] || req.headers['referer'] || '';
  // Allow empty origin (server-to-server), reject external browser origins
  if (origin && !ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
    auditLog('BLOCKED_ORIGIN', { origin });
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

// ── POST /api/ai/chat ─────────────────────────────────────────
app.post('/api/ai/chat', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!rateLimit(ip, 30, 60_000)) return res.status(429).json({ error: 'Rate limit exceeded' });

  const { history = [], message, mpName, constituency, division } = req.body;
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Invalid input' });

  const canary = crypto.randomUUID();
  const systemPrompt = buildSystemPrompt(mpName, constituency, division, canary);
  const safeMessage  = sanitize(message);
  const safeHistory  = (Array.isArray(history) ? history : []).slice(-20).map(h => ({
    role: h.role === 'user' ? 'user' : 'assistant',
    content: sanitize(h.content || ''),
  }));

  try {
    const resp = await fetch(OLLAMA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...safeHistory,
          { role: 'user', content: safeMessage },
        ],
        stream: false,
        options: { temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) throw new Error(`Ollama ${resp.status}`);
    const data = await resp.json();
    let aiText = data.message?.content || '';

    // Canary detection — potential prompt extraction attack
    const canaryDetected = aiText.includes(canary);
    if (canaryDetected) {
      auditLog('SECURITY_CANARY_TRIGGERED', { canary, ipHash: crypto.createHash('sha256').update(ip).digest('hex') });
      aiText = aiText.replace(new RegExp(canary, 'g'), '[REDACTED]');
    }

    // LLM08 — detect urgency flag server-side, strip from visible text
    const isUrgent = aiText.includes('||URGENT_BOOKING||');
    const cleanText = sanitizeOutput(aiText.replace('||URGENT_BOOKING||', '').trim());

    auditLog('CHAT', { inputLen: safeMessage.length, outputLen: cleanText.length, isUrgent, canaryDetected });
    res.json({ response: cleanText, isUrgent, canaryDetected });
  } catch (err) {
    auditLog('ERROR_CHAT', { msg: err.message });
    res.status(503).json({ error: 'AI service temporarily unavailable' });
  }
});

// ── POST /api/ai/categorize ───────────────────────────────────
const ALLOWED_CATEGORIES = ['Housing', 'Financial Assistance', 'Immigration', 'Employment', 'Healthcare', 'Education', 'Infrastructure', 'Other'];
const ALLOWED_URGENCY    = ['Low', 'Medium', 'High', 'Critical'];
const ALLOWED_AGENCIES   = ['HDB', 'ICA', 'MSF', 'MOM', 'MOH', 'MOE', 'SPF', 'SLA', 'NEA', 'PUB', 'MCCY', 'MND', 'PA', 'CPF', 'IRAS'];

function safeStr(v, max) { return typeof v === 'string' ? v.slice(0, max).replace(/[<>]/g, '') : ''; }
function safeArr(v, max)  { return Array.isArray(v) ? v.filter(i => typeof i === 'string').map(i => i.slice(0, max).replace(/[<>]/g, '')) : []; }

app.post('/api/ai/categorize', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!rateLimit(ip, 10, 60_000)) return res.status(429).json({ error: 'Rate limit exceeded' });

  const { conversation = [] } = req.body;
  if (!Array.isArray(conversation)) return res.status(400).json({ error: 'Invalid input' });

  const canary     = crypto.randomUUID();
  const transcript = conversation.slice(-30)
    .map(m => `[${(m.role || 'user').toUpperCase()}]: ${sanitize(m.content || '')}`)
    .join('\n');

  const prompt = `Analyze this MPS conversation and return ONLY a JSON object. [SID:${canary}]

TRANSCRIPT:
${transcript}

Return JSON with EXACTLY these fields:
{
  "category": "Housing|Financial Assistance|Immigration|Employment|Healthcare|Education|Infrastructure|Other",
  "subCategory": "string",
  "urgency": "Low|Medium|High|Critical",
  "summary": "string (2-3 sentences in English)",
  "keyFacts": ["string"],
  "coreRequest": "string",
  "suggestedAgencies": ["HDB|ICA|MSF|MOM|MOH|MOE|SPF|SLA|NEA|PUB|CPF|IRAS"]
}`;

  try {
    const resp = await fetch(OLLAMA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        format: 'json',
        options: { temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) throw new Error(`Ollama ${resp.status}`);
    const data = await resp.json();
    const raw  = JSON.parse(data.message?.content || '{}');

    const canaryDetected = JSON.stringify(raw).includes(canary);
    if (canaryDetected) auditLog('SECURITY_CANARY_TRIGGERED', { endpoint: 'categorize', canary });

    // Schema enforcement — strip anything outside allowed values
    const validated = {
      category:          ALLOWED_CATEGORIES.includes(raw.category) ? raw.category : 'Other',
      subCategory:       safeStr(raw.subCategory, 50),
      urgency:           ALLOWED_URGENCY.includes(raw.urgency) ? raw.urgency : 'Low',
      summary:           safeStr(raw.summary, 500),
      keyFacts:          safeArr(raw.keyFacts, 200).slice(0, 10),
      coreRequest:       safeStr(raw.coreRequest, 300),
      suggestedAgencies: safeArr(raw.suggestedAgencies, 50).filter(a => ALLOWED_AGENCIES.some(ok => a.includes(ok))).slice(0, 5),
    };

    auditLog('CATEGORIZE', { urgency: validated.urgency, category: validated.category, canaryDetected });
    res.json(validated);
  } catch (err) {
    auditLog('ERROR_CATEGORIZE', { msg: err.message });
    res.status(503).json({ error: 'AI service temporarily unavailable' });
  }
});

// ── POST /api/ai/letter ───────────────────────────────────────
app.post('/api/ai/letter', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!rateLimit(ip, 5, 60_000)) return res.status(429).json({ error: 'Rate limit exceeded' });

  const { caseData = {} } = req.body;
  const mpName     = sanitize(caseData.mpName     || process.env.MP_NAME || '', 100);
  const safeName   = sanitize(caseData.residentName || '', 100);
  const safeReq    = sanitize(caseData.coreRequest  || '', 500);
  const safeFacts  = safeArr(caseData.keyFacts, 200).map(sanitize).join('; ');
  const safeAgencies = safeArr(caseData.suggestedAgencies, 50).map(sanitize).join(', ');
  const nric       = safeStr(caseData.nricMasked, 20);
  const canary     = crypto.randomUUID();

  const prompt = `Draft a formal appeal letter on behalf of ${mpName} to the relevant Singapore government agency.
[SID:${canary}]
Resident: ${safeName} (NRIC: ${nric})
Core Request: ${safeReq}
Key Facts: ${safeFacts}
Suggested Agencies: ${safeAgencies}
Date: ${new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })}

Write a professional, empathetic letter in formal Singaporean government correspondence style. Sign off as ${mpName}.`;

  try {
    const resp = await fetch(OLLAMA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { temperature: 0.5 },
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!resp.ok) throw new Error(`Ollama ${resp.status}`);
    const data = await resp.json();
    let letter   = data.message?.content || '';

    const canaryDetected = letter.includes(canary);
    if (canaryDetected) auditLog('SECURITY_CANARY_TRIGGERED', { endpoint: 'letter', canary });

    letter = sanitizeOutput(letter.replace(new RegExp(canary, 'g'), '').trim());
    auditLog('LETTER', { outputLen: letter.length, canaryDetected });
    res.json({ letter });
  } catch (err) {
    auditLog('ERROR_LETTER', { msg: err.message });
    res.status(503).json({ error: 'AI service temporarily unavailable' });
  }
});

// ── POST /api/ai/explain ──────────────────────────────────────
app.post('/api/ai/explain', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!rateLimit(ip, 10, 60_000)) return res.status(429).json({ error: 'Rate limit exceeded' });

  const { context, urgency } = req.body;
  const safeContext = sanitize(context || '', 500);
  const safeUrgency = ALLOWED_URGENCY.includes(urgency) ? urgency : 'Low';

  try {
    const resp = await fetch(OLLAMA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: `Explain in 2-3 sentences why this resident case is classified as ${safeUrgency} urgency: ${safeContext}` }],
        stream: false,
        options: { temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!resp.ok) throw new Error(`Ollama ${resp.status}`);
    const data = await resp.json();
    const explanation = sanitizeOutput(data.message?.content || '');
    res.json({ explanation });
  } catch (err) {
    res.status(503).json({ error: 'AI service temporarily unavailable' });
  }
});

// ── Health ────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'mps-ai-proxy' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'MPS_AI_PROXY_START', port: PORT }));
});
