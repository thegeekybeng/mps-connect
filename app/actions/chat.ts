'use server';

// =============================================================
// Resident Chat — Server Actions (PUBLIC, no auth required)
// All AI proxy calls happen server-side (Docker-internal hostname).
// Rate limiting is enforced by the AI proxy (30 req/min per IP).
// =============================================================

import { db, dbOne } from '@/lib/db';

const AI_PROXY = process.env.AI_PROXY_URL || 'http://mps-ai-proxy:3103';

interface ChatResponse {
  response: string;
  isUrgent: boolean;
  readyToSubmit?: boolean;
  error?: string;
}

interface SubmitCaseResult {
  success: boolean;
  caseNumber?: string;
  uploadToken?: string;
  message: string;
}

/**
 * Send a resident message to the AI chat assistant.
 * No authentication required — this is the public-facing chat.
 * The AI proxy handles rate limiting, PII masking, and canary tokens.
 */
export async function sendMessage(input: {
  message: string;
  history: Array<{ role: string; content: string }>;
  mpName: string;
  constituency: string;
  division?: string;
}): Promise<ChatResponse> {
  const { message, history, mpName, constituency, division } = input;

  // Input validation — basic length/type checks only; AI proxy does deep sanitisation
  if (!message || typeof message !== 'string' || message.length > 2000) {
    return { response: '', isUrgent: false, error: 'Message is required (max 2000 characters).' };
  }

  try {
    const resp = await fetch(`${AI_PROXY}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history: (history || []).slice(-10),
        mpName,
        constituency,
        division: division || '',
      }),
      signal: AbortSignal.timeout(65_000),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      if (resp.status === 429) return { response: '', isUrgent: false, error: 'Please wait a moment before sending another message.' };
      if (resp.status === 503) return { response: '', isUrgent: false, error: 'The AI assistant is currently unavailable. Please try again shortly.' };
      return { response: '', isUrgent: false, error: `Service error (${resp.status})` };
    }

    const data = await resp.json();
    return {
      response: data.response || '',
      isUrgent: data.isUrgent || false,
      readyToSubmit: data.readyToSubmit || false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('timeout') || msg.includes('abort')) {
      return { response: '', isUrgent: false, error: 'The assistant is taking too long. Please try a shorter message.' };
    }
    return { response: '', isUrgent: false, error: 'Unable to reach the AI assistant. Please try again.' };
  }
}

/**
 * Submit a resident conversation as a new case.
 * Calls the categorise endpoint to auto-triage, then inserts into PostgreSQL.
 * No authentication — case enters the pipeline with status 'new'.
 */
export async function generateFactDraft(conversation: Array<{ role: string; content: string }>) {
  try {
    const catResp = await fetch(`${AI_PROXY}/api/ai/categorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!catResp.ok) return null;
    return await catResp.json();
  } catch (err) {
    console.error('[generateFactDraft] Error:', err);
    return null;
  }
}

export async function submitCase(input: {
  conversation: Array<{ role: string; content: string }>;
  residentName: string;
  phone?: string;
  constituencyId: number;
  category?: string;
  urgency?: string;
  summary?: string;
  coreRequest?: string;
  keyFacts?: string[];
  suggestedAgencies?: string[];
}): Promise<SubmitCaseResult> {
  const {
    conversation,
    residentName,
    phone,
    constituencyId,
    category: inputCategory,
    urgency: inputUrgency,
    summary: inputSummary,
    coreRequest: inputCoreRequest,
    keyFacts: inputKeyFacts,
    suggestedAgencies: inputSuggestedAgencies,
  } = input;

  // Validate
  if (!residentName || residentName.trim().length < 2) {
    return { success: false, message: 'Please provide your name.' };
  }
  if (!conversation || conversation.length < 2) {
    return { success: false, message: 'Please have a conversation first so we can understand your issue.' };
  }

  const safeName = residentName.trim().slice(0, 100);
  const safePhone = phone ? phone.trim().slice(0, 20).replace(/[^0-9+\-\s]/g, '') : null;

  try {
    // Step 1: Categorise via AI proxy or use pre-approved inputs
    let category = inputCategory || 'Other';
    let urgency = inputUrgency || 'Medium';
    let summary = inputSummary || '';
    let coreRequest = inputCoreRequest || '';
    let keyFacts: string[] = inputKeyFacts || [];
    let suggestedAgencies: string[] = inputSuggestedAgencies || [];

    if (!inputSummary) {
      try {
        const catResp = await fetch(`${AI_PROXY}/api/ai/categorize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation }),
          signal: AbortSignal.timeout(30_000),
        });

        if (catResp.ok) {
          const catData = await catResp.json();
          category = catData.category || 'Other';
          urgency = catData.urgency || 'Medium';
          summary = catData.summary || '';
          coreRequest = catData.coreRequest || '';
          keyFacts = catData.keyFacts || [];
          suggestedAgencies = catData.suggestedAgencies || [];
        }
      } catch {
        // Categorisation failed — proceed with defaults.
      }
    }

    // Step 2: Insert case into PostgreSQL (parameterised query — no SQL injection)
    // key_facts and suggested_agencies are text[] columns — the pg driver converts
    // native JS arrays to PostgreSQL array literals automatically.
    // case_number is generated via COALESCE + nextval to guarantee a non-NULL value.
    const caseRow = await dbOne<{ id: number; case_number: string }>(
      `INSERT INTO cases (
        resident_name, phone, category, urgency, status,
        summary, core_request, key_facts, suggested_agencies,
        constituency_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'new', $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING id, case_number`,
      [
        safeName,
        safePhone,
        category,
        urgency,
        summary,
        coreRequest,
        keyFacts,
        suggestedAgencies,
        constituencyId,
      ]
    );

    if (!caseRow) {
      return { success: false, message: 'Failed to create case record. Please try again.' };
    }

    // Step 3: Write case_event for audit trail
    await dbOne(
      `INSERT INTO case_events (case_id, event_type, action, actor, detail)
       VALUES ($1, 'case_created', 'create', 'resident_self_service', $2)`,
      [caseRow.id, JSON.stringify({ source: 'chat', category, urgency })]
    );

    // Step 4: Enqueue full Causality Engine pipeline (async, fire-and-forget)
    // This runs the 3-stage pipeline in the background so that when staff
    // open the case, the causal graph + letters + doc requirements are ready.
    // Look up MP name for letter context.
    try {
      const constRow = await dbOne<{ mp_name: string; name: string }>(
        'SELECT mp_name, name FROM constituencies WHERE id = $1',
        [constituencyId]
      );
      const transcript = conversation
        .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
        .join('\n');

      // Fire-and-forget — do not await the full pipeline
      fetch(`${AI_PROXY}/api/ai/causality/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseRow.id,
          transcript,
          mpName: constRow?.mp_name || '',
          constituency: constRow?.name || '',
        }),
        signal: AbortSignal.timeout(10_000),
      }).catch(err => {
        console.error('[submitCase] Causality enqueue failed (non-blocking):', err instanceof Error ? err.message : err);
      });
    } catch {
      // Causality enqueue failure must never block case submission
      console.error('[submitCase] Failed to prepare causality enqueue (non-blocking)');
    }

    // Step 5: Generate a public upload token for this case to allow document uploads
    let uploadToken: string | null = null;
    try {
      const tokenRow = await dbOne<{ token: string }>(
        `INSERT INTO upload_tokens (case_id, created_by)
         VALUES ($1, NULL)
         RETURNING token::text`,
        [caseRow.id]
      );
      uploadToken = tokenRow?.token || null;
    } catch (err) {
      console.error('[submitCase] Failed to create upload token:', err);
    }

    return {
      success: true,
      caseNumber: caseRow.case_number || `MPS-${String(caseRow.id).padStart(4, '0')}`,
      uploadToken: uploadToken || undefined,
      message: `Your case (${caseRow.case_number || caseRow.id}) has been submitted. The MP's office will follow up.`,
    };
  } catch (err) {
    console.error('[submitCase] Error:', err instanceof Error ? err.message : err);
    return { success: false, message: 'Unable to submit your case. Please contact the constituency office directly.' };
  }
}

// =============================================================
// Voice — STT / TTS / Translation
// All calls proxy through the AI proxy container (audit + PII)
// =============================================================

interface TranscribeResult {
  text: string;
  language: string;
  error?: string;
}

interface SynthesizeResult {
  audioUrl?: string;
  audioBase64?: string;
  error?: string;
}

interface TranslateResult {
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  error?: string;
}

/**
 * Send an audio recording to the AI proxy for transcription (STT).
 * The proxy forwards to Wyoming Bridge and audit-logs the event.
 */
export async function transcribeAudio(formData: FormData): Promise<TranscribeResult> {
  const audioFile = formData.get('audio') as File | null;
  if (!audioFile || audioFile.size === 0) {
    return { text: '', language: '', error: 'No audio provided.' };
  }

  // Max 10MB — the proxy also enforces this, but reject early
  if (audioFile.size > 10 * 1024 * 1024) {
    return { text: '', language: '', error: 'Audio file too large (max 10MB).' };
  }

  try {
    // Rebuild FormData for the proxy — Next.js server actions receive Web API FormData
    const proxyForm = new FormData();
    proxyForm.set('audio', audioFile);

    const sessionId = (formData.get('sessionId') as string) || '';
    if (sessionId) proxyForm.set('sessionId', sessionId);

    const resp = await fetch(`${AI_PROXY}/api/ai/transcribe`, {
      method: 'POST',
      body: proxyForm,
      signal: AbortSignal.timeout(65_000),
    });

    if (!resp.ok) {
      if (resp.status === 429) return { text: '', language: '', error: 'Please wait before recording again.' };
      return { text: '', language: '', error: 'Transcription service unavailable.' };
    }

    const data = await resp.json();
    return {
      text: data.text || '',
      language: data.language || 'unknown',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('timeout') || msg.includes('abort')) {
      return { text: '', language: '', error: 'Transcription timed out. Try a shorter recording.' };
    }
    return { text: '', language: '', error: 'Unable to transcribe audio.' };
  }
}

/**
 * Convert text to speech via the AI proxy → Wyoming Bridge (Piper TTS).
 * Returns base64-encoded WAV audio for browser playback.
 */
export async function synthesizeSpeech(text: string, sessionId?: string): Promise<SynthesizeResult> {
  if (!text || !text.trim()) {
    return { error: 'No text provided.' };
  }

  try {
    const resp = await fetch(`${AI_PROXY}/api/ai/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 2000), sessionId }),
      signal: AbortSignal.timeout(35_000),
    });

    if (!resp.ok) {
      if (resp.status === 429) return { error: 'Please wait before requesting speech again.' };
      return { error: 'Speech synthesis unavailable.' };
    }

    const arrayBuffer = await resp.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return {
      audioBase64: base64,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('timeout') || msg.includes('abort')) {
      return { error: 'Speech synthesis timed out.' };
    }
    return { error: 'Unable to generate speech.' };
  }
}

/**
 * Translate text via the AI proxy → Ollama.
 * Used to show English translations of non-English voice input.
 */
export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string = 'en',
  sessionId?: string
): Promise<TranslateResult> {
  if (!text || !text.trim()) {
    return { translatedText: '', sourceLang: '', targetLang: '', error: 'No text provided.' };
  }

  // Skip if already in the target language
  if (sourceLang === targetLang) {
    return { translatedText: text, sourceLang, targetLang };
  }

  try {
    const resp = await fetch(`${AI_PROXY}/api/ai/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.slice(0, 2000),
        sourceLang,
        targetLang,
        sessionId,
      }),
      signal: AbortSignal.timeout(35_000),
    });

    if (!resp.ok) {
      if (resp.status === 429) return { translatedText: '', sourceLang, targetLang, error: 'Rate limit exceeded.' };
      return { translatedText: '', sourceLang, targetLang, error: 'Translation unavailable.' };
    }

    const data = await resp.json();
    return {
      translatedText: data.translatedText || '',
      sourceLang: data.sourceLang || sourceLang,
      targetLang: data.targetLang || targetLang,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('timeout') || msg.includes('abort')) {
      return { translatedText: '', sourceLang, targetLang, error: 'Translation timed out.' };
    }
    return { translatedText: '', sourceLang, targetLang, error: 'Unable to translate.' };
  }
}
