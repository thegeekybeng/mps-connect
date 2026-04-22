import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold, Modality, Content, Part } from "@google/genai";
import { Message, Case, CategorizationResult, Urgency } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const MODEL_CHAT = 'gemini-2.5-flash';
const MODEL_TTS = 'gemini-2.5-flash-preview-tts';

// Dynamic System Instruction - POLYGLOT MODE
export const getSystemInstruction = (mpName: string, constituency: string, division?: string) => `
You are a highly intelligent, multilingual Digital Assistant for ${mpName}, Member of Parliament for ${constituency}.

**PRIME DIRECTIVE: MULTIMODAL LISTENING & LANGUAGE MIRRORING**
1. **Input**: You will receive TEXT or AUDIO recordings.
2. **Audio Analysis**: Listen to the tone, language, and content. The user may speak Singlish, Mandarin, Malay, or Tamil.
3. **Language Mirroring**: 
   - If user speaks Tamil -> Reply in Tamil text ONLY.
   - If user speaks Mandarin -> Reply in Mandarin text ONLY.
   - If user speaks Malay -> Reply in Malay text ONLY.
   - If user speaks Singlish -> Reply in Singlish/English.
4. **NO TRANSLATION**: Do NOT provide an English translation of your response in the output. The user must see ONLY their native language. Maintain the natural conversational flow.

**URGENCY DETECTION & ACTION**:
- If the resident's issue is **CRITICAL** or **URGENT** (e.g., homelessness, imminent eviction within 24 hours, physical danger, no food, suicide risk), you MUST:
  1. Provide immediate empathetic reassurance.
  2. **APPEND** this exact tag to the end of your response: ||URGENT_BOOKING||
  3. This tag will trigger a physical appointment scheduler for them. Do not mention the tag in your speech.

**Identity**: You represent ${mpName}. Be empathetic, professional, and efficient.
**Safety**: If a user mentions self-harm, provide emergency numbers (999/SOS) immediately.
`;

export const sendMessageToGemini = async (
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

    const chat = ai.chats.create({
      model: MODEL_CHAT,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ]
      },
      history: history.map(h => ({
        role: h.role,
        parts: [{ text: h.content }],
      }))
    });

    // We allow empty text IF there is audio or image
    if (!newMessage.trim() && (!images || images.length === 0) && !audioBase64) {
        return "I didn't catch that.";
    }

    const parts: any[] = [];
    
    // Add Text (if any)
    if (newMessage.trim()) {
        parts.push({ text: newMessage });
    }
    
    // Add Images
    if (images && images.length > 0) {
        images.forEach(img => {
            const base64Data = img.split(',')[1]; 
            const mimeType = img.split(';')[0].split(':')[1];
            parts.push({
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                }
            });
        });
    }

    // Add Audio (The Raw Voice)
    if (audioBase64) {
        let cleanBase64 = audioBase64;
        let mimeType = "audio/webm";

        // Try to extract actual mime type from base64 header
        if (audioBase64.includes(',')) {
             const parts = audioBase64.split(',');
             cleanBase64 = parts[1];
             const header = parts[0]; 
             const match = header.match(/data:(.*?);base64/);
             if (match) {
                 mimeType = match[1];
             }
        }
        
        parts.push({
            inlineData: {
                data: cleanBase64,
                mimeType: mimeType
            }
        });
        
        // Add a hint to the model so it knows this is voice input
        parts.push({ text: "\n\n[SYSTEM: The user sent an audio recording. Listen to the language and respond in the SAME language. Do NOT translate to English.]" });
    }

    const response = await chat.sendMessage({ message: parts } as any);

    return response.text || "I apologize, I am having trouble understanding at the moment.";
  } catch (error: any) {
    console.error("Gemini Chat Error FULL DETAILS:", error);
    return `System Error: ${error.message || JSON.stringify(error)}`;
  }
};

export const generateTTS = async (text: string): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_TTS,
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // 'Kore' provides a balanced, natural tone
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
};

export const analyzeAndCategorizeCase = async (conversation: Message[]): Promise<CategorizationResult> => {
  // Construct multimodal history for accurate analysis of Audio/Image/Text
  const allParts: Part[] = [];
  
  conversation.forEach(msg => {
      // Add text label
      allParts.push({ text: `[${msg.role.toUpperCase()}]: ${msg.content}` });
      
      // Add attachments (Audio/Images) to the analysis context
      if (msg.attachments) {
          msg.attachments.forEach(att => {
             if (att.includes(',')) {
                 const [header, data] = att.split(',');
                 const mimeType = header.match(/:(.*?);/)?.[1];
                 if (mimeType && data) {
                     allParts.push({ inlineData: { mimeType, data } });
                 }
             }
          });
      }
  });

  const analysisPrompt = `
      Analyze the conversation above.
      The user may have spoken in Tamil, Malay, Mandarin, or Singlish.
      
      CRITICAL INSTRUCTIONS:
      1. IGNORE the language of the audio/text for the *output format*. 
      2. The output MUST be in ENGLISH.
      3. Translate any vernacular input to English internally for your analysis (Summary, Facts, Request).
      
      Tasks:
      - Categorize the case (Housing, Immigration, Financial, etc.)
      - Assess Urgency (Low, Medium, High, Critical)
      - Summarize the situation (in English)
      - Extract Key Facts (in English)
      - Identify the Core Request (in English)
      - Suggest Agencies
      
      Return JSON matching the schema.
  `;
  
  allParts.push({ text: analysisPrompt });

  try {
    const response = await ai.models.generateContent({
      model: MODEL_CHAT,
      contents: [{ role: 'user', parts: allParts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            subCategory: { type: Type.STRING },
            urgency: { type: Type.STRING, enum: ["Low", "Medium", "High", "Critical"] },
            summary: { type: Type.STRING },
            keyFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
            coreRequest: { type: Type.STRING },
            suggestedAgencies: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["category", "subCategory", "urgency", "summary", "keyFacts", "coreRequest", "suggestedAgencies"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return result as CategorizationResult;
  } catch (error) {
    console.error("Categorization Error:", error);
    return {
      category: "Uncategorized", subCategory: "General", urgency: Urgency.LOW,
      summary: "Automatic processing failed.", keyFacts: [], coreRequest: "Manual Review", suggestedAgencies: []
    };
  }
};

export const generateFormalLetter = async (caseData: Case): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model: MODEL_CHAT,
            contents: `Draft appeal letter for ${caseData.mpName} in English.
            Resident: ${caseData.residentName} (${caseData.nricMasked})
            Request: ${caseData.coreRequest}
            Facts: ${caseData.keyFacts?.join(', ')}
            Date: Today. Tone: Professional.`,
        });
        return response.text || "Error generating draft.";
    } catch (e) { return "Error generating draft."; }
};

export const explainAIReasoning = async (context: string, urgency: string): Promise<string> => {
    try {
        const response = await ai.models.generateContent({ model: MODEL_CHAT, contents: `Explain why this is ${urgency}: ${context}` });
        return response.text || "No explanation.";
    } catch (e) { return "Unavailable."; }
};