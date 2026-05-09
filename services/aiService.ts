// ============================================================
// AI Service — Local Inference Backend
// LLM:  Ollama (SEA-LION 27B) via Tailscale → /ollama-api/
// STT:  Wyoming Whisper (small-int8) via bridge → /ai-speech/transcribe
// TTS:  Wyoming Piper (hfc_male-medium) via bridge → /ai-speech/synthesize
// ============================================================

import { Message, Case, CategorizationResult, Urgency } from '../types';

// Nginx proxy base paths — all same-origin, no CORS issues
const OLLAMA_BASE  = (import.meta.env.VITE_OLLAMA_HOST  || '/ollama-api');
const SPEECH_BASE  = (import.meta.env.VITE_SPEECH_HOST  || '/ai-speech');
const MODEL        = (import.meta.env.VITE_OLLAMA_MODEL || 'gemma4:e2b');

// --- PROMPT INJECTION DEFENCE ---
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous\s+)?instructions?/gi,
  /disregard\s+(all\s+)?(previous\s+)?instructions?/gi,
  /forget\s+(all\s+)?(previous\s+)?instructions?/gi,
  /override\s+(system\s+)?instructions?/gi,
  /you\s+are\s+now\s+/gi,
  /new\s+system\s+prompt\s*:/gi,
  /<<\/?SYS>>/g,
  /\[INST\]|\[\/INST\]/g,
  /<\/?system>/gi,
  /act\s+as\s+(if\s+you\s+are|an?\s+)/gi,
  // PI-01: Strip URGENT_BOOKING tag from user input to prevent spoofing
  /\|\|URGENT_BOOKING\|\|/g,
];
const MAX_USER_CHARS = 2000;
function sanitizePromptInput(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let s = text.slice(0, MAX_USER_CHARS);
  for (const p of INJECTION_PATTERNS) s = s.replace(p, '[FILTERED]');
  return s;
}

// ── STT ──────────────────────────────────────────────────────
/**
 * Send a recorded audio Blob to the Wyoming bridge and get back transcribed text.
 * Browser records via MediaRecorder (webm/opus) — bridge accepts any ffmpeg-compatible format.
 */
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  const form = new FormData();
  form.append('audio', audioBlob, 'recording.webm');

  const response = await fetch(`${SPEECH_BASE}/transcribe`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) throw new Error(`STT error: ${response.statusText}`);
  const data = await response.json();
  return (data.text || '').trim();
};

// ── TTS ──────────────────────────────────────────────────────
/**
 * Send AI response text to Piper and get back a playable object URL.
 * Caller is responsible for calling URL.revokeObjectURL() when done.
 */
export const synthesizeSpeech = async (text: string): Promise<string> => {
  const response = await fetch(`${SPEECH_BASE}/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) throw new Error(`TTS error: ${response.statusText}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

// ── Shared system instruction ────────────────────────────────
export const getSystemInstruction = (mpName: string, constituency: string, division?: string) => `
You are a highly intelligent, multilingual Digital Assistant for ${mpName}, Member of Parliament for ${constituency}${division ? `, ${division} division` : ''}.

**PRIME DIRECTIVE: LANGUAGE MIRRORING — NON-NEGOTIABLE**
Detect what language the resident uses. Reply ONLY in that language.

- **Singlish** → Authentic Singlish ONLY. Use: lah, leh, lor, sia, wah, aiyo, hor, can or not, got or not, one, already, faster [verb]. Natural warmth, NOT performed auntie-speak. Good examples: "Come come, I listen you talk." / "Aiyoh, must faster figure out together lah." / "Wah, that one urgent sia." NEVER reply in formal ang moh English if they write Singlish.
- **Mandarin / 中文** → Chinese characters ONLY. No pinyin. No romanisation. Not a single English word or sentence.
- **Malay / Bahasa** → ENTIRELY Malay. No romanisation of other scripts. Zero English words.
- **Tamil / தமிழ்** → Tamil script ONLY. Zero English words.
- **Formal English** → Professional, empathetic English.

**URGENCY DETECTION**:
If the issue is CRITICAL (homelessness, eviction within 24 hours, physical danger, no food, suicide risk):
1. Respond with immediate empathy in their language/register.
2. APPEND exactly this tag at the END of your reply: ||URGENT_BOOKING||

**Identity**: You represent ${mpName}. Be warm and efficient.
**Safety**: If self-harm is mentioned, give 999 / SOS immediately.
`;




// ── 1. Chat ──────────────────────────────────────────────────
export const sendMessage = async (
  history: Message[],
  newMessage: string,
  mpName: string,
  constituency: string,
  division?: string,
  images?: string[],
  audioBase64?: string
): Promise<string> => {
  try {
    const systemInstruction = getSystemInstruction(mpName, constituency, division);

    // Build Ollama message array
    // NOTE: App uses 'model' role (Gemini convention) — Ollama requires 'assistant'
    const normalizeRole = (role: string) => role === 'model' ? 'assistant' : role;

    const messages: any[] = [
      { role: 'system', content: systemInstruction },
      // PI-05: sanitize history to prevent conversation poisoning from earlier turns
      ...history.map(h => ({ role: normalizeRole(h.role), content: sanitizePromptInput(h.content) })),
    ];

    // Compose user content — text + optional images (gemma4 is vision-capable)
    const userContent: any[] = [];

    if (newMessage.trim()) {
      // PI-06: sanitize user message before embedding in prompt
      userContent.push({ type: 'text', text: sanitizePromptInput(newMessage) });
    }

    // Inline images as base64 (gemma4:e2b supports vision)
    if (images && images.length > 0) {
      images.forEach(img => {
        const base64Data = img.includes(',') ? img.split(',')[1] : img;
        userContent.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } });
      });
    }

    // Audio: Ollama cannot process raw audio — treat transcription as text
    if (audioBase64 && !newMessage.trim()) {
      userContent.push({ type: 'text', text: '[Voice message received — please type your concern if the assistant does not respond correctly.]' });
    }

    if (userContent.length === 0) {
      return "I didn't catch that.";
    }

    messages.push({ role: 'user', content: userContent.length === 1 && userContent[0].type === 'text' ? userContent[0].text : userContent });

    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, stream: false, options: { temperature: 0.7 } }),
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
    const data = await response.json();
    return data.message?.content || "I apologize, I am having trouble understanding at the moment.";
  } catch (error: any) {
    console.error("Ollama Chat Error:", error);
    return `System Error: ${error.message || 'Connection failed'}`;
  }
};

// ── 2. Case Analysis & Categorization ───────────────────────
export const analyzeAndCategorizeCase = async (conversation: Message[]): Promise<CategorizationResult> => {
  const transcript = conversation
    // PI-05: sanitize each turn before embedding in analysis prompt
    .map(m => `[${m.role.toUpperCase()}]: ${sanitizePromptInput(m.content)}`)
    .join('\n');

  const prompt = `Analyze this MPS (Member of Parliament Session) conversation transcript and return ONLY a JSON object.

TRANSCRIPT:
${transcript}

INSTRUCTIONS:
- The user may have spoken in Tamil, Malay, Mandarin, or Singlish.
- ALL output fields must be in ENGLISH regardless of input language.
- Translate vernacular inputs internally for your analysis.

Return a JSON object with EXACTLY these fields:
{
  "category": "string (e.g. Housing, Financial Assistance, Immigration, Employment, Healthcare, Education, Infrastructure, Other)",
  "subCategory": "string (specific sub-type)",
  "urgency": "Low | Medium | High | Critical",
  "summary": "string (2-3 sentence summary in English)",
  "keyFacts": ["array", "of", "key", "facts", "in", "English"],
  "coreRequest": "string (what the resident is asking for)",
  "suggestedAgencies": ["array", "of", "relevant", "Singapore", "government", "agencies"]
}`;

  try {
    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        format: 'json',
        options: { temperature: 0.3 },
      }),
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
    const data = await response.json();
    const result = JSON.parse(data.message?.content || '{}');

    // Normalise urgency to enum
    const urgencyMap: Record<string, Urgency> = {
      low: Urgency.LOW, medium: Urgency.MEDIUM, high: Urgency.HIGH, critical: Urgency.CRITICAL,
    };
    result.urgency = urgencyMap[(result.urgency || '').toLowerCase()] || Urgency.LOW;

    return result as CategorizationResult;
  } catch (error) {
    console.error("Categorization Error:", error);
    return {
      category: "Uncategorized", subCategory: "General", urgency: Urgency.LOW,
      summary: "Automatic processing failed.", keyFacts: [], coreRequest: "Manual Review", suggestedAgencies: [],
    };
  }
};

// ── 4. Formal Letter Generation ──────────────────────────────
export const generateFormalLetter = async (caseData: Case): Promise<string> => {
  try {
    // PI-04: sanitize AI-generated intermediary data before reuse in subsequent prompt
    const safeName = sanitizePromptInput(caseData.residentName || '').slice(0, 100);
    const safeRequest = sanitizePromptInput(caseData.coreRequest || '').slice(0, 500);
    const safeFacts = (caseData.keyFacts || []).map(f => sanitizePromptInput(f).slice(0, 200)).join('; ');
    const safeAgencies = (caseData.suggestedAgencies || []).map(a => sanitizePromptInput(a).slice(0, 50)).join(', ');

    const prompt = `Draft a formal appeal letter on behalf of ${caseData.mpName} to the relevant Singapore government agency.

Resident: ${safeName} (NRIC: ${caseData.nricMasked})
Constituency: ${caseData.constituency}
Core Request: ${safeRequest}
Key Facts: ${safeFacts}
Suggested Agencies: ${safeAgencies}
Date: ${new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })}

Write a professional, empathetic letter. Use formal Singaporean government correspondence style. Sign off as ${caseData.mpName}.`;

    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { temperature: 0.5 },
      }),
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
    const data = await response.json();
    return data.message?.content || "Error generating draft.";
  } catch (e) {
    return "Error generating draft.";
  }
};

// ── 5. AI Reasoning Explanation ──────────────────────────────
export const explainAIReasoning = async (context: string, urgency: string): Promise<string> => {
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: `Explain in 2-3 sentences why this resident case is classified as ${sanitizePromptInput(urgency)} urgency: ${sanitizePromptInput(context).slice(0, 500)}` }],
        stream: false,
        options: { temperature: 0.4 },
      }),
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
    const data = await response.json();
    return data.message?.content || "No explanation available.";
  } catch (e) {
    return "Unavailable.";
  }
};