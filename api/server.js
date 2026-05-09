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

// ── Causality Engine — inline helpers ────────────────────────
// Ported from CWI: constants/causalityDomains.ts + agencyTemplates.ts + letterGenerator.ts
// Domain-specific config stays inline; engine logic is self-contained.

const MPS_DOMAIN = {
  analystPersona:  'a Singapore constituency case analyst trained in civil administration',
  inputLabel:      'MPS resident conversation transcript',
  domains:         ['housing', 'financial', 'health', 'legal', 'family', 'employment', 'social'],
  routingTargets:  'Known Singapore agencies: HDB (strictly tenancy/flats/rental/eviction), ' +
    'Town Council / TC (strictly S&CC fees or estate maintenance), CPF, MSF, ComCare, ' +
    'FSC (Family Service Centre), LAB (Legal Aid Bureau), MOH/CHAS, MOE, CDC, ' +
    'Yellow Ribbon, MOM, ICA, SPF, NTUC/e2i, WSG (Workforce Singapore), SG Enable, IMH.',
  foundationRules: '- Include only what is stated or strongly implied.\n' +
    '- Do not invent facts.\n- Mark true root cause(s), not the presenting complaint.\n' +
    '- Note hidden conditions (health, debt, family) even if framed differently.',
  reasoningRules:  '- Every non-root node must have at least one cause.\n' +
    '- Hidden risks: conditions not yet presenting but implied.\n' +
    '- Confidence < 0.5 means the link is inferred; mark these.',
  actionRules:     '- Primary routes address root causes and high-confidence nodes.\n' +
    '- Secondary routes address intermediate nodes.\n' +
    '- Long-term routes address hidden risks.\n' +
    '- Respect Singapore sequencing: ComCare before FSC for financial hardship.\n' +
    '- Never route to an agency unless a node clearly maps to their mandate.',
};

const AGENCY_TMPLS = {
  'HDB':           { label: 'Housing & Development Board',               domains: ['housing','financial'],           ph: ['██ BLOCK/STREET ██','██ FLAT TYPE ██','██ LEASE COMMENCEMENT ██'] },
  'Town Council':  { label: 'Town Council',                              domains: ['financial','housing'],           ph: ['██ TOWN COUNCIL ACCOUNT NO ██'] },
  'CPF':           { label: 'Central Provident Fund Board',              domains: ['financial','employment'],        ph: ['██ CPF MEMBER ACCT ██'] },
  'MSF':           { label: 'Ministry of Social and Family Development', domains: ['family','financial','social'],   ph: ['██ HOUSEHOLD SIZE ██','██ HOUSEHOLD INCOME ██'] },
  'ComCare':       { label: 'ComCare',                                   domains: ['financial','family','social'],   ph: ['██ HOUSEHOLD SIZE ██','██ HOUSEHOLD INCOME ██'] },
  'FSC':           { label: 'Family Service Centre',                     domains: ['family','social','health'],      ph: ['██ HOUSEHOLD SIZE ██'] },
  'MOM':           { label: 'Ministry of Manpower',                      domains: ['employment','financial','legal'],ph: ['██ EMPLOYER ██','██ PASS TYPE ██'] },
  'MOH':           { label: 'Ministry of Health',                        domains: ['health','financial'],            ph: ['██ MEDICAL CONDITION ██','██ SUBSIDY TIER ██'] },
  'CHAS':          { label: 'Community Health Assist Scheme',            domains: ['health','financial'],            ph: ['██ MEDICAL CONDITION ██','██ SUBSIDY TIER ██'] },
  'MOE':           { label: 'Ministry of Education',                     domains: ['family','social','financial'],   ph: ['██ SCHOOL NAME ██','██ CHILD NAME(S) ██'] },
  'ICA':           { label: 'Immigration & Checkpoints Authority',       domains: ['legal','family'],                ph: ['██ PASSPORT/PERMIT NO ██'] },
  'SSO':           { label: 'Social Service Office',                     domains: ['financial','social','family'],   ph: ['██ HOUSEHOLD SIZE ██','██ HOUSEHOLD INCOME ██'] },
  'CDC':           { label: 'Community Development Council',             domains: ['social','financial','family'],   ph: [] },
  'LAB':           { label: 'Legal Aid Bureau',                          domains: ['legal','financial'],             ph: [] },
  'Yellow Ribbon': { label: 'Yellow Ribbon Project',                     domains: ['social','employment'],           ph: [] },
  'SG Enable':     { label: 'SG Enable',                                 domains: ['health','social','employment'],  ph: [] },
  'IMH':           { label: 'Institute of Mental Health',                domains: ['health','family'],               ph: ['██ MEDICAL CONDITION ██'] },
  'NTUC/e2i':      { label: 'NTUC Employment and Employability Institute',domains: ['employment','financial'],        ph: [] },
  'SPF':           { label: 'Singapore Police Force',                    domains: ['legal','family','social'],       ph: ['██ REPORT NO ██'] },
};

function getAgencyTmpl(agency) {
  return AGENCY_TMPLS[agency] || { label: agency, domains: [], ph: [] };
}

function selectFacts(graph, agencyDomains, maxFacts = 5) {
  const factTypes = ['root_cause', 'presenting_problem', 'intermediate'];
  const scored = graph.nodes
    .filter(n => factTypes.includes(n.type))
    .map(node => {
      const idx = agencyDomains.indexOf(node.domain);
      const domainScore = idx >= 0 ? (agencyDomains.length - idx) * 10 : 0;
      const typeScore = node.type === 'root_cause' ? 5 : node.type === 'presenting_problem' ? 3 : 1;
      return { node, score: domainScore + typeScore + (node.confidence || 0) };
    });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxFacts).map(s => s.node.label);
}

function buildCrossRef(allRoutes, currentAgency) {
  const others = allRoutes
    .filter(r => r.agency !== currentAgency && (r.priority === 'primary' || r.priority === 'secondary'))
    .map(r => r.agency);
  return others.length > 0 ? `Concurrent letters have been sent to: ${others.join(', ')}.` : null;
}

function assembleLetter(graph, route, order, mpName, constituency, writerName) {
  const tmpl = getAgencyTmpl(route.agency);
  const facts = selectFacts(graph, tmpl.domains);
  const crossRef = buildCrossRef(graph.agencyRoutes, route.agency);
  const isUrgent = graph.urgency.overall === 'Critical' || graph.urgency.overall === 'High';
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const lines = [
    '══════════════════════════════════════════════',
    '⚠️  COMPLETE ██ FIELDS BEFORE SENDING VIA GATHER  ⚠️',
    '══════════════════════════════════════════════',
    '',
    `RE: Appeal — ██ RESIDENT NAME ██ (██ NRIC ██)`,
    `MP: ${mpName || '██ MP NAME ██'}, Member of Parliament for ${constituency || '██ CONSTITUENCY ██'}`,
    `Date: ${today}`,
  ];

  if (tmpl.ph.length > 0) {
    lines.push('');
    lines.push(`Agency-specific fields to complete: ${tmpl.ph.join(', ')}`);
  }

  lines.push('', `To: ${tmpl.label}`, '', 'Dear Sir/Madam,', '');
  lines.push(`SUBJECT: ${route.specificAsk}`, '', 'FACTS:');
  facts.forEach((fact, i) => lines.push(`${i + 1}. ${fact}`));
  lines.push('', 'REQUEST:', route.specificAsk, '');

  if (crossRef) { lines.push('CROSS-REFERRAL:', crossRef, ''); }
  if (isUrgent)  { lines.push('Given the time-sensitive nature of this matter, I would appreciate your urgent attention.', ''); }

  lines.push('Yours faithfully,', mpName || '██ MP NAME ██', `Member of Parliament for ${constituency || '██ CONSTITUENCY ██'}`);
  if (writerName) { lines.push('', `Prepared by: ${writerName}`); }

  return { agency: route.agency, agencyLabel: tmpl.label, content: lines.join('\n'), order, priority: route.priority, hasContext: false };
}

function assembleAllLetters(graph, mpName, constituency, writerName) {
  const ordered = [...graph.agencyRoutes].sort((a, b) => {
    const aQ = graph.documentQueue.find(d => d.agency === a.agency);
    const bQ = graph.documentQueue.find(d => d.agency === b.agency);
    return (aQ?.order ?? 999) - (bQ?.order ?? 999);
  });
  return ordered.map((route, idx) => assembleLetter(graph, route, idx + 1, mpName, constituency, writerName));
}

async function ollamaJSON(prompt, systemMsg, timeoutMs) {
  const resp = await fetch(OLLAMA_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user',   content: prompt },
      ],
      stream: false,
      format: 'json',
      options: { temperature: 0.1 },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) throw new Error(`Ollama ${resp.status}`);
  const data = await resp.json();
  const content = data.message?.content;
  if (!content) throw new Error('Empty causality response from Ollama');
  return JSON.parse(content);
}

// ── POST /api/ai/causality ────────────────────────────────────
// 3-stage causality pipeline (Foundation → Reasoning → Action).
// Returns { causalGraph, letters }. Rate: 3/min. Latency: 60–120 s.
app.post('/api/ai/causality', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (!rateLimit(ip, 3, 60_000)) return res.status(429).json({ error: 'Rate limit exceeded' });

  const { conversation = [], mpName, constituency, writerName } = req.body;
  if (!Array.isArray(conversation)) return res.status(400).json({ error: 'Invalid input' });

  const transcript = conversation.slice(-30)
    .map(m => `[${(m.role || 'user').toUpperCase()}]: ${sanitize(m.content || '', 2000)}`)
    .join('\n');
  if (!transcript.trim()) return res.status(400).json({ error: 'Empty transcript' });

  const d = MPS_DOMAIN;

  try {
    // Stage 1+2: Foundation — entities + timeline
    const foundation = await ollamaJSON(
      `You are ${d.analystPersona}.\nAnalyse this ${d.inputLabel}.\n\nTRANSCRIPT:\n${transcript}\n\n` +
      `Return a JSON object with:\n"entities": [{ "type", "name", "details", "firstMentioned" }]\n` +
      `type: person|condition|event|agency|resource|obligation\n\n` +
      `"timeline": [{ "date", "event", "entityRefs", "isRootCause", "currentStatus" }]\n` +
      `currentStatus: "past"|"ongoing"|"imminent"\n\nRules:\n${d.foundationRules}`,
      `You are ${d.analystPersona}. Extract entities and timeline. Return only valid JSON.`,
      55_000
    );

    // Stage 3+4: Reasoning — causal graph + gaps
    const domainEnum = d.domains.map(x => `"${x}"`).join(' | ');
    const reasoning = await ollamaJSON(
      `You are ${d.analystPersona}.\n\nTRANSCRIPT:\n${transcript}\n\n` +
      `ENTITIES:\n${JSON.stringify(foundation.entities || [])}\n\n` +
      `TIMELINE:\n${JSON.stringify(foundation.timeline || [])}\n\n` +
      `Return a JSON object with:\n` +
      `"nodes": [{ "id", "label", "type", "causes", "effects", "confidence", "domain" }]\n` +
      `type: "root_cause"|"intermediate"|"presenting_problem"|"hidden_risk"|"consequence"\n` +
      `confidence: 0.0–1.0\ndomain: ${domainEnum}\n\n` +
      `"gaps": [{ "description", "affectedNodeIds", "severity", "questionToAsk" }]\n` +
      `severity: "blocking"|"important"|"nice_to_have"\n\nRules:\n${d.reasoningRules}`,
      `You are ${d.analystPersona}. Build a causal graph and detect information gaps. Return only valid JSON.`,
      65_000
    );

    // Stage 5+6+7: Action — urgency + routing + document queue
    const action = await ollamaJSON(
      `You are ${d.analystPersona}.\n\nNODES:\n${JSON.stringify(reasoning.nodes || [])}\n\n` +
      `GAPS:\n${JSON.stringify(reasoning.gaps || [])}\n\n` +
      `TIMELINE:\n${JSON.stringify(foundation.timeline || [])}\n\n${d.routingTargets}\n\n` +
      `Return a JSON object with:\n` +
      `"urgency": { "overall", "rationale", "timeSensitiveFactors", "criticalPathNodeIds" }\n` +
      `overall: "Low"|"Medium"|"High"|"Critical"\n\n` +
      `"agencyRoutes": [{ "agency", "priority", "addressesNodeIds", "specificAsk", "estimatedProcessingDays", "prerequisiteAgencies" }]\n` +
      `priority: "primary"|"secondary"|"long_term"\n\n` +
      `"documentQueue": [{ "order", "type", "agency", "subject", "urgency", "dependsOn" }]\n` +
      `type: "letter"|"referral"|"internal_note"|"follow_up"\n\nRules:\n${d.actionRules}`,
      `You are ${d.analystPersona}. Score urgency and route to agencies. Return only valid JSON.`,
      65_000
    );

    const causalGraph = {
      entities:      foundation.entities      || [],
      timeline:      foundation.timeline      || [],
      nodes:         reasoning.nodes          || [],
      gaps:          reasoning.gaps           || [],
      urgency:       action.urgency           || { overall: 'Low', rationale: '', timeSensitiveFactors: [], criticalPathNodeIds: [] },
      agencyRoutes:  action.agencyRoutes      || [],
      documentQueue: action.documentQueue     || [],
      engineVersion: '2.2.0-mps',
      processedAt:   new Date().toISOString(),
    };

    const safeMP    = sanitize(mpName       || '', 100);
    const safeCons  = sanitize(constituency || '', 100);
    const safeWriter= sanitize(writerName   || '', 100);
    const letters   = assembleAllLetters(causalGraph, safeMP, safeCons, safeWriter);

    auditLog('CAUSALITY', { nodes: causalGraph.nodes.length, routes: causalGraph.agencyRoutes.length, letters: letters.length, urgency: causalGraph.urgency.overall });
    res.json({ causalGraph, letters });

  } catch (err) {
    auditLog('ERROR_CAUSALITY', { msg: err.message });
    res.status(503).json({ error: 'AI service temporarily unavailable' });
  }
});

// ── Health ────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'mps-ai-proxy' }));


app.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'MPS_AI_PROXY_START', port: PORT }));
});
