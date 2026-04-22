// ============================================================
// AI Service — Local Inference Backend
// Connects to local Ollama instance via Tailscale
// All exports use model-agnostic naming.
// ============================================================

import { Message, Case, CategorizationResult, Urgency } from '../types';

// Use same-origin nginx proxy — browser cannot reach Tailscale IPs directly.
// nginx routes /ollama-api/ → http://127.0.0.1:11434/
const OLLAMA_BASE = (process.env.OLLAMA_HOST || '/ollama-api');
const MODEL = (process.env.OLLAMA_MODEL || 'gemma4:e2b');

// ── Shared system instruction (identical logic to OG) ───────
export const getSystemInstruction = (mpName: string, constituency: string, division?: string) => `
You are a highly intelligent, multilingual Digital Assistant for ${mpName}, Member of Parliament for ${constituency}${division ? `, ${division} division` : ''}.

**PRIME DIRECTIVE: MULTIMODAL LISTENING & LANGUAGE MIRRORING**
1. You will receive TEXT messages. The user may write in Singlish, Mandarin, Malay, or Tamil.
2. **Language Mirroring**:
   - If user writes Tamil → Reply in Tamil text ONLY.
   - If user writes Mandarin → Reply in Mandarin text ONLY.
   - If user writes Malay → Reply in Malay text ONLY.
   - If user writes Singlish → Reply in Singlish/English.
3. **NO TRANSLATION**: Show ONLY the user's native language in your reply.

**URGENCY DETECTION & ACTION**:
- If the issue is CRITICAL or URGENT (homelessness, imminent eviction within 24 hours, physical danger, no food, suicide risk), you MUST:
  1. Provide immediate empathetic reassurance.
  2. APPEND this exact tag at the end of your response: ||URGENT_BOOKING||

**Identity**: You represent ${mpName}. Be empathetic, professional, and efficient.
**Safety**: If a user mentions self-harm, provide emergency numbers (999/SOS) immediately.
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
    const messages: any[] = [
      { role: 'system', content: systemInstruction },
      ...history.map(h => ({ role: h.role, content: h.content })),
    ];

    // Compose user content — text + optional images (gemma4 is vision-capable)
    const userContent: any[] = [];

    if (newMessage.trim()) {
      userContent.push({ type: 'text', text: newMessage });
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
    .map(m => `[${m.role.toUpperCase()}]: ${m.content}`)
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
    const prompt = `Draft a formal appeal letter on behalf of ${caseData.mpName} to the relevant Singapore government agency.

Resident: ${caseData.residentName} (NRIC: ${caseData.nricMasked})
Constituency: ${caseData.constituency}
Core Request: ${caseData.coreRequest}
Key Facts: ${caseData.keyFacts?.join('; ')}
Suggested Agencies: ${caseData.suggestedAgencies?.join(', ')}
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
        messages: [{ role: 'user', content: `Explain in 2-3 sentences why this resident case is classified as ${urgency} urgency: ${context}` }],
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