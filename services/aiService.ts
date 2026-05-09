// ============================================================
// AI Service — Server-Side Proxy Client
// All AI calls go to /api/ai/ (mps-ai-proxy container).
// System prompt, PII masking, canary tokens, injection
// sanitization, and audit logging are all server-side.
// The browser never contacts Ollama directly.
// ============================================================

import { Message, Case, CategorizationResult, Urgency } from '../types';

// Same-origin proxy paths — nginx routes these to mps-ai-proxy
const AI_BASE    = '/api/ai';
const SPEECH_BASE = (import.meta.env.VITE_SPEECH_HOST || '/ai-speech');

// ── STT ──────────────────────────────────────────────────────
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  const form = new FormData();
  form.append('audio', audioBlob, 'recording.webm');
  const response = await fetch(`${SPEECH_BASE}/transcribe`, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`STT error: ${response.statusText}`);
  const data = await response.json();
  return (data.text || '').trim();
};

// ── TTS ──────────────────────────────────────────────────────
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

// ── 1. Chat ───────────────────────────────────────────────────
// Returns { text, isUrgent } — server strips ||URGENT_BOOKING|| from text
// and signals urgency via the boolean flag (LLM08 human-gate fix).
export const sendMessage = async (
  history: Message[],
  newMessage: string,
  mpName: string,
  constituency: string,
  division?: string,
  images?: string[],
  audioBase64?: string
): Promise<{ text: string; isUrgent: boolean }> => {
  try {
    // Note: images passed as metadata in message text (vision not supported in proxy v1)
    const messageText = newMessage + (images?.length ? ` [${images.length} image(s) attached]` : '')
                      + (audioBase64 && !newMessage.trim() ? ' [Voice message]' : '');

    const response = await fetch(`${AI_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: messageText,
        history: history.map(h => ({ role: h.role === 'model' ? 'assistant' : h.role, content: h.content })),
        mpName,
        constituency,
        division,
      }),
    });

    if (!response.ok) throw new Error(`Proxy error: ${response.status}`);
    const data = await response.json();
    return { text: data.response || '', isUrgent: !!data.isUrgent };
  } catch (error: any) {
    console.error('AI Chat Error:', error);
    return { text: "I'm currently unavailable. Please try again shortly.", isUrgent: false };
  }
};

// ── 2. Case Categorization ────────────────────────────────────
export const analyzeAndCategorizeCase = async (conversation: Message[]): Promise<CategorizationResult> => {
  try {
    const response = await fetch(`${AI_BASE}/categorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation: conversation.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) throw new Error(`Proxy error: ${response.status}`);
    const data = await response.json();

    // Urgency enum normalisation (server returns string, types expect enum)
    const urgencyMap: Record<string, Urgency> = {
      Low: Urgency.LOW, Medium: Urgency.MEDIUM, High: Urgency.HIGH, Critical: Urgency.CRITICAL,
    };
    return { ...data, urgency: urgencyMap[data.urgency] || Urgency.LOW } as CategorizationResult;
  } catch (error) {
    console.error('Categorization Error:', error);
    return {
      category: 'Uncategorized', subCategory: 'General', urgency: Urgency.LOW,
      summary: 'Automatic processing failed.', keyFacts: [], coreRequest: 'Manual Review', suggestedAgencies: [],
    };
  }
};

// ── 3. Formal Letter ──────────────────────────────────────────
export const generateFormalLetter = async (caseData: Case): Promise<string> => {
  try {
    const response = await fetch(`${AI_BASE}/letter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseData }),
    });

    if (!response.ok) throw new Error(`Proxy error: ${response.status}`);
    const data = await response.json();
    return data.letter || 'Error generating draft.';
  } catch (e) {
    return 'Error generating draft.';
  }
};

// ── 4. AI Reasoning Explanation ───────────────────────────────
export const explainAIReasoning = async (context: string, urgency: string): Promise<string> => {
  try {
    const response = await fetch(`${AI_BASE}/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, urgency }),
    });

    if (!response.ok) throw new Error(`Proxy error: ${response.status}`);
    const data = await response.json();
    return data.explanation || 'No explanation available.';
  } catch (e) {
    return 'Unavailable.';
  }
};

// ── 5. Causality Engine — Case Writer Intelligence ─────────────────────────────
// 3-stage pipeline: Foundation → Reasoning → Action.
// Returns CausalGraph + assembled letters. Takes 60–120 s — call only on demand.
export const runCausalityEngine = async (
  conversation: Message[],
  mpName: string,
  constituency: string,
  writerName?: string,
): Promise<{ causalGraph: any; letters: any[] }> => {
  const response = await fetch(`${AI_BASE}/causality`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation: conversation.map(m => ({ role: m.role, content: m.content })),
      mpName,
      constituency,
      writerName: writerName || '',
    }),
    // 3 min — covers 3 sequential Ollama calls each with their own timeout
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as any).error || `Causality engine failed: ${response.status}`);
  }
  return response.json();
};