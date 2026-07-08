'use client';

import { useState, useRef, useEffect, useTransition, useCallback, useMemo } from 'react';
import { sendMessage, submitCase, generateFactDraft } from '@/app/actions/chat';
import { Send, Bot, User, AlertTriangle, Loader2, CheckCircle2, ArrowLeft, ShieldCheck, Upload, FileCheck2 } from 'lucide-react';
import VoiceRecorder from '@/components/chat/VoiceRecorder';
import AudioPlayback from '@/components/chat/AudioPlayback';
import ChatMarkdown from '@/components/chat/ChatMarkdown';
import Link from 'next/link';

const LANG_LABELS: Record<string, { flag: string; name: string }> = {
  en: { flag: '🇬🇧', name: 'English' },
  zh: { flag: '🇨🇳', name: 'Chinese' },
  ms: { flag: '🇲🇾', name: 'Malay' },
  ta: { flag: '🇮🇳', name: 'Tamil' },
  singlish: { flag: '🇸🇬', name: 'Singlish' },
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isUrgent?: boolean;
  timestamp: Date;
  inputMethod?: 'text' | 'voice';
  detectedLang?: string;
}

interface Props {
  mpName: string;
  constituency: string;
  division?: string;
  constituencyId: number;
}

export default function ChatClient({ mpName, constituency, division, constituencyId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isPending, startTransition] = useTransition();
  const [isTyping, setIsTyping] = useState(false);
  const [urgentDetected, setUrgentDetected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Session ID for audit trail — stable across the conversation
  const sessionId = useMemo(() => crypto.randomUUID(), []);

  // Case submission
  const [readyToSubmit, setReadyToSubmit] = useState(false);
  const [submitName, setSubmitName] = useState('');
  const [submitPhone, setSubmitPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ caseNumber: string; message: string; uploadToken?: string } | null>(null);

  // Derived state for submit CTA visibility
  const userMsgCount = messages.filter(m => m.role === 'user').length;
  const showSubmit = (readyToSubmit || userMsgCount >= 4) && !submitted;

  // Fact-finding review panel
  const [factDraft, setFactDraft] = useState<{
    category: string;
    urgency: string;
    summary: string;
    coreRequest: string;
    keyFacts: string[];
    suggestedAgencies: string[];
  } | null>(null);
  const [loadingFacts, setLoadingFacts] = useState(false);
  const [consentApproved, setConsentApproved] = useState(false);
  const [factReviewActive, setFactReviewActive] = useState(false);

  // Document Upload state
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [uploadState, setUploadState] = useState<{ status: 'idle' | 'uploading' | 'success' | 'error'; message: string }>({ status: 'idle', message: '' });
  const [showUploader, setShowUploader] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Helper to reset submission flow when starting a new case
  const resetSubmissionFlow = useCallback(() => {
    setSubmitted(null);
    setFactDraft(null);
    setFactReviewActive(false);
    setConsentApproved(false);
    setReadyToSubmit(false);
    setUploadedFiles([]);
    setUploadState({ status: 'idle', message: '' });
    setShowUploader(false);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !submitted?.uploadToken) return;

    setUploadState({ status: 'uploading', message: 'Uploading and scanning...' });

    const form = new FormData();
    form.append('file', file);

    try {
      const res = await fetch(`/api/upload/${submitted.uploadToken}`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();

      if (res.ok) {
        setUploadState({ status: 'success', message: `✓ ${file.name} uploaded successfully.` });
        setUploadedFiles(prev => [...prev, file.name]);
      } else {
        setUploadState({ status: 'error', message: data.error || 'Upload failed.' });
      }
    } catch (err) {
      setUploadState({ status: 'error', message: 'Network error. Please try again.' });
    }
  };

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isPending) return;

    // Reset submitted state for a new case flow if they continue chatting after a submission
    if (submitted) {
      resetSubmissionFlow();
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
      inputMethod: 'text',
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setError(null);
    setIsTyping(true);

    startTransition(async () => {
      const history = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const result = await sendMessage({
        message: trimmed,
        history,
        mpName,
        constituency,
        division,
      });

      setIsTyping(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.isUrgent) {
        setUrgentDetected(true);
      }

      if (result.readyToSubmit) {
        setReadyToSubmit(true);
      }

      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.response,
        isUrgent: result.isUrgent,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
    });
  }, [input, isPending, messages, mpName, constituency, division, startTransition, submitted, resetSubmissionFlow]);

  // Handle voice transcription — auto-send the transcribed text
  const handleVoiceTranscription = useCallback((result: { text: string; language: string }) => {
    // Reset submitted state for a new case flow if they continue chatting after a submission
    if (submitted) {
      resetSubmissionFlow();
    }

    const voiceMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: result.text,
      timestamp: new Date(),
      inputMethod: 'voice',
      detectedLang: result.language,
    };

    setMessages(prev => [...prev, voiceMsg]);
    setError(null);
    setIsTyping(true);

    startTransition(async () => {
      const history = [...messages, voiceMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const aiResult = await sendMessage({
        message: result.text,
        history,
        mpName,
        constituency,
        division,
      });

      setIsTyping(false);

      if (aiResult.error) {
        setError(aiResult.error);
        return;
      }

      if (aiResult.isUrgent) {
        setUrgentDetected(true);
      }

      if (aiResult.readyToSubmit) {
        setReadyToSubmit(true);
      }

      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: aiResult.response,
        isUrgent: aiResult.isUrgent,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
    });
  }, [messages, mpName, constituency, division, startTransition, submitted, resetSubmissionFlow]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSubmitCase = async () => {
    if (!submitName.trim()) return;
    if (!consentApproved) return;
    setSubmitting(true);

    const conversation = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const result = await submitCase({
      conversation,
      residentName: submitName.trim(),
      phone: submitPhone.trim() || undefined,
      constituencyId,
      category: factDraft?.category,
      urgency: factDraft?.urgency,
      summary: factDraft?.summary,
      coreRequest: factDraft?.coreRequest,
      keyFacts: factDraft?.keyFacts,
      suggestedAgencies: factDraft?.suggestedAgencies,
    });

    setSubmitting(false);

    if (result.success) {
      setSubmitted({
        caseNumber: result.caseNumber || '',
        message: result.message,
        uploadToken: result.uploadToken
      });
    } else {
      setError(result.message);
    }
  };

  const [aiDisclosureDismissed, setAiDisclosureDismissed] = useState(false);

  return (
    <div className="flex flex-col h-full max-h-[100dvh]">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="shrink-0 px-4 py-3 sm:px-6" style={{ background: 'var(--gov-surface)', borderBottom: '1px solid var(--gov-border)' }}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-slate-100" style={{ border: '1px solid var(--gov-border)' }} aria-label="Back to home">
              <ArrowLeft size={16} style={{ color: 'var(--gov-text-muted)' }} />
            </Link>
            <div>
              <h1 className="text-sm font-bold leading-tight" style={{ color: 'var(--gov-text)' }}>Chat with {mpName}&apos;s Office</h1>
              <p className="text-xs" style={{ color: 'var(--gov-text-muted)' }}>{constituency}{division ? ` · ${division}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Online
          </div>
        </div>
      </header>

      {/* ── AI Disclosure Banner ─── */}
      {!aiDisclosureDismissed && (
        <div
          className="shrink-0 px-4 py-2.5 sm:px-6"
          style={{ background: '#EFF6FF', borderBottom: '1px solid #BFDBFE' }}
          role="status"
          aria-label="AI disclosure notice"
          id="ai-disclosure-banner"
        >
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs" style={{ color: '#1E40AF' }}>
              <Bot size={14} className="shrink-0" />
              <span>
                <strong>AI-Assisted</strong> — Responses are generated by AI. All decisions are reviewed by a human officer.
              </span>
            </div>
            <button
              onClick={() => setAiDisclosureDismissed(true)}
              className="text-xs font-medium shrink-0 px-2 py-1 rounded hover:bg-blue-100 transition-colors"
              style={{ color: '#2563EB' }}
              aria-label="Dismiss AI disclosure"
              id="dismiss-ai-disclosure"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── Urgent banner ──────────────────────────────────── */}
      {urgentDetected && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2.5 sm:px-6">
          <div className="max-w-2xl mx-auto flex items-center gap-2 text-xs text-amber-800">
            <AlertTriangle size={14} className="text-amber-600 shrink-0" />
            <p className="font-semibold">
              Your case has been flagged as urgent. The MP&apos;s office will prioritise this.
            </p>
          </div>
        </div>
      )}

      {/* ── Case submitted actions panel ───────────────────── */}
      {submitted && (
        <div className="shrink-0 px-4 py-4 sm:px-6 border-b border-emerald-200" style={{ background: '#F0FDF4' }}>
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-emerald-900">Case Submitted successfully (Ref: {submitted.caseNumber})</h3>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  Your elected MP, <strong>{mpName}</strong>, and our volunteer case writers will draft a formal appeal representation letter. Your MP will personally review and sign it before it is officially sent to the relevant agency. The agency will formally reply directly to you once they receive and process our letter.
                </p>
              </div>
            </div>

            {/* Upload Panel */}
            {showUploader && submitted.uploadToken && (
              <div className="bg-white p-4 rounded-xl border border-emerald-100 space-y-3 shadow-sm">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Upload size={14} className="text-emerald-600" />
                  Submit Supporting Documents
                </h4>
                <p className="text-[11px] text-slate-500">
                  Please upload copies of any relevant summons, letters, NRIC, notices, or photos to support your case.
                </p>
                
                <div className="flex flex-col gap-2">
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-lg px-4 py-3 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/50 transition-all text-xs font-semibold text-slate-600">
                    <Upload size={14} className="text-slate-400" />
                    Choose File to Upload
                    <input type="file" className="hidden" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={handleFileUpload} disabled={uploadState.status === 'uploading'} />
                  </label>
                  <p className="text-[10px] text-slate-400 text-center">PDF, JPEG, PNG, or WebP · Max 10MB</p>
                </div>

                {uploadState.message && (
                  <div className={`p-2 rounded text-xs ${uploadState.status === 'success' ? 'bg-green-50 text-green-700' : uploadState.status === 'error' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                    {uploadState.message}
                  </div>
                )}

                {uploadedFiles.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Uploaded Documents:</p>
                    {uploadedFiles.map((name, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-slate-700 bg-slate-50 px-2 py-1 rounded">
                        <FileCheck2 size={12} className="text-emerald-500 shrink-0" />
                        <span className="truncate">{name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Button Actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              {submitted.uploadToken && !showUploader && (
                <button
                  type="button"
                  onClick={() => setShowUploader(true)}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm animate-fade-in"
                >
                  <Upload size={13} />
                  I have documents to submit
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  resetSubmissionFlow();
                  setMessages([]); // Clear chat history to start completely fresh
                }}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-lg transition-colors shadow-sm"
              >
                Add new case
              </button>
              <button
                type="button"
                onClick={() => {
                  resetSubmissionFlow();
                  setMessages([
                    {
                      id: crypto.randomUUID(),
                      role: 'assistant',
                      content: `Thank you for using the digital assistant. We have successfully registered your case. Your MP, ${mpName}, and the volunteer case writers are now working on it.\n\nYou may close this window or return to the main portal.`,
                      timestamp: new Date()
                    }
                  ]);
                }}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors shadow-sm"
              >
                End chat session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Messages area ──────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-1">
        <div className="max-w-2xl mx-auto space-y-1">

          {/* Welcome message */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center text-center py-12 space-y-4">
              <div className="w-16 h-16 rounded-xl flex items-center justify-center" style={{ background: 'var(--gov-primary)' }}>
                <Bot size={28} className="text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--gov-text)' }}>How can we help you today?</h2>
                <p className="text-sm mt-1 max-w-md" style={{ color: 'var(--gov-text-secondary)' }}>
                  Tell us about your issue in any language — English, Singlish, 中文, Melayu, or தமிழ்.
                  We&apos;ll make sure it reaches the right agency.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {[
                  'I need help with my HDB flat',
                  'Saya perlukan bantuan kewangan',
                  '我需要帮助申请补贴',
                  'My neighbour very noisy lah',
                ].map(suggestion => (
                  <button
                     key={suggestion}
                     type="button"
                     onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                     className="text-xs px-3 py-2 rounded-lg transition-all"
                     style={{ background: 'var(--gov-surface)', border: '1px solid var(--gov-border)', color: 'var(--gov-text-secondary)' }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat messages */}
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
              <div className={`flex items-end gap-2 max-w-[85%] sm:max-w-[75%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={msg.role === 'user'
                    ? { background: 'var(--gov-primary-50)', color: 'var(--gov-primary)' }
                    : { background: 'var(--gov-surface-inset)', color: 'var(--gov-text-muted)' }
                  }>
                  {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                </div>

                {/* Bubble */}
                <div className={`px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'rounded-2xl rounded-br-md text-white'
                    : 'rounded-2xl rounded-bl-md shadow-sm'
                }`}
                  style={msg.role === 'user'
                    ? { background: 'var(--gov-primary)' }
                    : { background: 'var(--gov-surface)', border: '1px solid var(--gov-border)', color: 'var(--gov-text)' }
                  }>
                  {/* Language badge for voice input */}
                  {msg.inputMethod === 'voice' && msg.detectedLang && (
                    <div className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md mb-1 lang-badge-${msg.detectedLang}`}>
                      {LANG_LABELS[msg.detectedLang]?.flag || '🌐'} {LANG_LABELS[msg.detectedLang]?.name || msg.detectedLang} · voice
                    </div>
                  )}

                  {/* Render markdown */}
                  <ChatMarkdown content={msg.content} />

                  {msg.isUrgent && (
                    <div className="mt-2 pt-2 border-t border-amber-200 flex items-center gap-1.5 text-xs text-amber-600 font-semibold">
                      <AlertTriangle size={12} /> Urgent — prioritised for the MP
                    </div>
                  )}

                  {/* TTS playback on assistant messages */}
                  {msg.role === 'assistant' && (
                    <AudioPlayback text={msg.content} sessionId={sessionId} messageId={msg.id} />
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex justify-start animate-fade-in">
              <div className="flex items-end gap-2">
                <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <Bot size={14} className="text-slate-500" />
                </div>
                <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Submit Case CTA ────────────────────────────────── */}
      {showSubmit && !submitted && (
        <>
          {!factReviewActive ? (
            <div className="shrink-0 px-4 py-3 sm:px-6" style={{ borderTop: '1px solid var(--gov-border)', background: 'var(--gov-primary-50)' }}>
              <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <ShieldCheck size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--gov-primary)' }} />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">We have enough details to process your case.</p>
                    <p className="text-xs text-slate-500 mt-0.5">Please review the extracted facts before submitting to the MP pipeline.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setFactReviewActive(true);
                    setLoadingFacts(true);
                    const result = await generateFactDraft(messages.map(m => ({ role: m.role, content: m.content })));
                    setLoadingFacts(false);
                    if (result) {
                      setFactDraft(result);
                    } else {
                      setFactDraft({
                        category: 'General Inquiry',
                        urgency: 'Medium',
                        summary: 'Reviewing constituency appeal details.',
                        coreRequest: 'Constituency support and assistance.',
                        keyFacts: messages.filter(m => m.role === 'user').slice(0, 3).map(m => m.content),
                        suggestedAgencies: ['General Welfare'],
                      });
                    }
                  }}
                  className="w-full sm:w-auto px-4 py-2 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm shrink-0 flex items-center justify-center"
                  style={{ background: 'var(--gov-primary)' }}
                >
                  Review & Submit Case
                </button>
              </div>
            </div>
          ) : (
            <div className="shrink-0 max-h-[50dvh] overflow-y-auto px-4 py-4 sm:px-6 bg-slate-50 border-t border-slate-200" style={{ borderTop: '1px solid var(--gov-border)' }}>
              <div className="max-w-2xl mx-auto space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-slate-800">
                    <ShieldCheck size={16} className="text-emerald-600" />
                    Fact-Finding & Case Review
                  </h3>
                  <button
                    type="button"
                    onClick={() => setFactReviewActive(false)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Go back to chat
                  </button>
                </div>

                {loadingFacts ? (
                  <div className="flex flex-col items-center py-8 space-y-3">
                    <Loader2 size={24} className="animate-spin text-slate-400" />
                    <p className="text-xs text-slate-500 font-medium">Analyzing case context for fact-finding...</p>
                  </div>
                ) : (
                  <>
                    {/* Summary */}
                    {factDraft && (
                      <div className="bg-white p-3.5 rounded-lg border border-slate-100 shadow-sm space-y-1.5">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Proposed Case Summary</h4>
                        <p className="text-xs text-slate-700 font-medium leading-relaxed">{factDraft.summary}</p>
                      </div>
                    )}

                    {/* Key Facts */}
                    {factDraft && factDraft.keyFacts.length > 0 && (
                      <div className="space-y-1.5">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AI-Extracted Facts</h4>
                        <div className="space-y-1.5">
                          {factDraft.keyFacts.map((fact, idx) => (
                            <div key={idx} className="bg-white p-2.5 rounded-lg border border-slate-100 flex items-start gap-2.5 text-xs text-slate-700 font-medium leading-normal">
                              <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                              <span>{fact}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Meta Section */}
                    {factDraft && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-white p-3 rounded-lg border border-slate-100 space-y-1.5">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Agencies Involved</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {factDraft.suggestedAgencies.map((agency, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-bold text-[10px]">
                                {agency}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="bg-white p-3 rounded-lg border border-slate-100 space-y-1.5">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Category / Priority</h4>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-bold text-[10px] uppercase">
                              {factDraft.category}
                            </span>
                            <span className="px-2 py-0.5 rounded-md font-bold text-[10px] uppercase text-white bg-red-600">
                              {factDraft.urgency} Priority
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* PDPA Consent Gate & Inputs */}
                    <div className="bg-white p-4 rounded-lg border border-slate-200 space-y-4">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={consentApproved}
                          onChange={e => setConsentApproved(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-xs text-slate-700 font-semibold leading-relaxed">
                          I formally approve these fact-finding details as correct and authorize the MP&apos;s office to submit my case into the processing pipeline.
                        </span>
                      </label>

                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <input
                          type="text"
                          placeholder="Your name (as in NRIC)"
                          value={submitName}
                          onChange={e => setSubmitName(e.target.value)}
                          maxLength={100}
                          className="flex-1 px-3 py-2 rounded-lg text-xs focus:outline-none focus:ring-2"
                          style={{ border: '1px solid var(--gov-border)', color: 'var(--gov-text)' }}
                        />
                        <input
                          type="tel"
                          placeholder="Phone number"
                          value={submitPhone}
                          onChange={e => setSubmitPhone(e.target.value)}
                          maxLength={20}
                          className="sm:w-48 px-3 py-2 rounded-lg text-xs focus:outline-none focus:ring-2"
                          style={{ border: '1px solid var(--gov-border)', color: 'var(--gov-text)' }}
                        />
                        <button
                          type="button"
                          onClick={handleSubmitCase}
                          disabled={submitting || !consentApproved || !submitName.trim()}
                          className="px-5 py-2 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shrink-0"
                          style={{ background: 'var(--gov-primary)' }}
                        >
                          {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          {submitting ? 'Submitting…' : 'Confirm & Submit'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Error display ──────────────────────────────────── */}
      {error && (
        <div className="shrink-0 bg-red-50 border-t border-red-200 px-4 py-2 sm:px-6">
          <p className="max-w-2xl mx-auto text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* ── Input bar ──────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 sm:px-6 safe-bottom" style={{ borderTop: '1px solid var(--gov-border)', background: 'var(--gov-surface)' }}>
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <textarea
            ref={inputRef}
            id="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={submitted ? 'Case submitted — you can continue chatting' : 'Type or speak your message…'}
            rows={1}
            maxLength={2000}
            className="flex-1 resize-none rounded-lg px-4 py-2.5 text-sm
                       focus:outline-none focus:ring-2 max-h-32 overflow-y-auto"
            style={{ minHeight: '44px', border: '1px solid var(--gov-border)', color: 'var(--gov-text)' }}
          />

          {/* Show mic when input is empty, send button when text is present */}
          {input.trim() ? (
            <button
              type="button"
              onClick={handleSend}
              disabled={isPending}
              className="w-11 h-11 rounded-lg disabled:opacity-50
                         flex items-center justify-center transition-colors shrink-0"
               style={{ background: 'var(--gov-primary)' }}
              aria-label="Send message"
            >
              {isPending ? (
                <Loader2 size={16} className="text-white animate-spin" />
              ) : (
                <Send size={16} className="text-white" />
              )}
            </button>
          ) : (
            <VoiceRecorder
              sessionId={sessionId}
              onTranscription={handleVoiceTranscription}
              disabled={isPending || isTyping}
            />
          )}
        </div>
        <p className="max-w-2xl mx-auto text-[10px] text-slate-400 mt-1.5 text-center">
          AI-assisted · Your conversation helps the MP&apos;s office understand your case
        </p>
      </div>
    </div>
  );
}
