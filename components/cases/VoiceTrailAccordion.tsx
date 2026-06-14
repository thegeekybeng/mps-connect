'use client';

import { useState, useEffect } from 'react';
import { Mic, Volume2, Languages, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

interface VoiceEvent {
  id: number;
  timestamp: string;
  type: string;
  detail: {
    detectedLanguage?: string;
    transcriptionText?: string;
    audioSizeBytes?: number;
    whisperModel?: string;
    inputText?: string;
    outputLen?: number;
    piperModel?: string;
    voice?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    sourceText?: string;
    translatedText?: string;
    ollamaModel?: string;
    errorMessage?: string;
    inputLen?: number;
  };
}

interface Props {
  sessionId: string;
}

const EVENT_ICONS: Record<string, typeof Mic> = {
  STT_TRANSCRIBE: Mic,
  STT_ERROR: AlertCircle,
  TTS_SYNTHESIZE: Volume2,
  TTS_ERROR: AlertCircle,
  TRANSLATE: Languages,
};

const EVENT_LABELS: Record<string, string> = {
  STT_TRANSCRIBE: 'Voice Input (STT)',
  STT_ERROR: 'Transcription Error',
  TTS_SYNTHESIZE: 'Audio Playback (TTS)',
  TTS_ERROR: 'Synthesis Error',
  TRANSLATE: 'Translation',
};

const LANG_FLAGS: Record<string, string> = {
  en: '🇬🇧',
  zh: '🇨🇳',
  ms: '🇲🇾',
  ta: '🇮🇳',
  singlish: '🇸🇬',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function VoiceTrailAccordion({ sessionId }: Props) {
  const [events, setEvents] = useState<VoiceEvent[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || events.length > 0) return;

    const fetchEvents = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`/api/ai/voice-trail/${sessionId}`);
        if (!resp.ok) throw new Error('Failed to fetch');
        const data = await resp.json();
        setEvents(data.events || []);
      } catch {
        setError('Unable to load voice trail.');
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [isOpen, sessionId, events.length]);

  // Don't render if no voice events will exist (accordion appears only when opened)
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700
                   hover:bg-slate-50 transition-colors"
      >
        <Mic size={16} className="text-indigo-500" />
        <span>Voice Interaction Trail</span>
        <span className="ml-auto text-slate-400">
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-3 animate-fade-in">
          {loading && (
            <p className="text-xs text-slate-400">Loading voice trail…</p>
          )}

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          {!loading && !error && events.length === 0 && (
            <p className="text-xs text-slate-400">No voice interactions recorded for this session.</p>
          )}

          {events.map(event => {
            const Icon = EVENT_ICONS[event.type] || Mic;
            const label = EVENT_LABELS[event.type] || event.type;
            const isError = event.type.includes('ERROR');
            const d = event.detail;
            const time = new Date(event.timestamp).toLocaleTimeString('en-SG', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            return (
              <div
                key={event.id}
                className={`rounded-lg border p-3 text-xs ${
                  isError
                    ? 'border-red-200 bg-red-50'
                    : 'border-slate-100 bg-white'
                }`}
              >
                {/* Header */}
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} className={isError ? 'text-red-500' : 'text-indigo-500'} />
                  <span className="font-semibold text-slate-700">{label}</span>
                  <span className="text-slate-400 ml-auto font-mono">{time}</span>
                </div>

                {/* STT details */}
                {event.type === 'STT_TRANSCRIBE' && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium lang-badge-${d.detectedLanguage || 'en'}`}>
                        {LANG_FLAGS[d.detectedLanguage || 'en'] || '🌐'} {d.detectedLanguage}
                      </span>
                      {d.audioSizeBytes && <span className="text-slate-400">{formatSize(d.audioSizeBytes)}</span>}
                      {d.whisperModel && <span className="text-slate-400">· {d.whisperModel}</span>}
                    </div>
                    {d.transcriptionText && (
                      <p className="text-slate-600 bg-slate-50 rounded px-2 py-1 leading-relaxed">
                        &ldquo;{d.transcriptionText}&rdquo;
                      </p>
                    )}
                  </div>
                )}

                {/* TTS details */}
                {event.type === 'TTS_SYNTHESIZE' && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-slate-400">
                      {d.piperModel && <span>{d.piperModel}</span>}
                      {d.outputLen && <span>· {formatSize(d.outputLen)}</span>}
                    </div>
                    {d.inputText && (
                      <p className="text-slate-600 bg-slate-50 rounded px-2 py-1 leading-relaxed">
                        &ldquo;{d.inputText}&rdquo;
                      </p>
                    )}
                  </div>
                )}

                {/* Translation details */}
                {event.type === 'TRANSLATE' && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-slate-400">
                      <span>{LANG_FLAGS[d.sourceLanguage || ''] || ''} {d.sourceLanguage}</span>
                      <span>→</span>
                      <span>{LANG_FLAGS[d.targetLanguage || ''] || ''} {d.targetLanguage}</span>
                      {d.ollamaModel && <span>· {d.ollamaModel}</span>}
                    </div>
                    {d.sourceText && (
                      <p className="text-slate-500 bg-slate-50 rounded px-2 py-1">&ldquo;{d.sourceText}&rdquo;</p>
                    )}
                    {d.translatedText && (
                      <p className="text-slate-700 bg-indigo-50 rounded px-2 py-1">→ &ldquo;{d.translatedText}&rdquo;</p>
                    )}
                  </div>
                )}

                {/* Error details */}
                {isError && d.errorMessage && (
                  <p className="text-red-600 bg-red-100 rounded px-2 py-1">{d.errorMessage}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
