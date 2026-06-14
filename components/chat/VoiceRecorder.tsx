'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Play, Pause, Send, X, Loader2, AlertCircle } from 'lucide-react';
import { transcribeAudio } from '@/app/actions/chat';

type RecordingState = 'idle' | 'recording' | 'preview' | 'processing';

interface Props {
  sessionId: string;
  onTranscription: (result: { text: string; language: string }) => void;
  disabled?: boolean;
}

const LANG_LABELS: Record<string, { flag: string; name: string; color: string }> = {
  en: { flag: '🇬🇧', name: 'English', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  zh: { flag: '🇨🇳', name: 'Chinese', color: 'bg-red-100 text-red-700 border-red-200' },
  ms: { flag: '🇲🇾', name: 'Malay', color: 'bg-green-100 text-green-700 border-green-200' },
  ta: { flag: '🇮🇳', name: 'Tamil', color: 'bg-amber-100 text-amber-700 border-amber-200' },
};

const MAX_DURATION = 60; // seconds

export default function VoiceRecorder({ sessionId, onTranscription, disabled }: Props) {
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobRef = useRef<Blob | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [audioUrl]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const startRecording = useCallback(async () => {
    setError(null);
    setDetectedLang(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      // Prefer webm/opus (Chrome/Edge) or webm (Firefox), fall back to whatever is available
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        // Stop all tracks to release the microphone
        stream.getTracks().forEach(t => t.stop());

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        blobRef.current = blob;

        // Create preview URL
        const url = URL.createObjectURL(blob);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(url);
        setState('preview');
      };

      recorder.start(250); // collect chunks every 250ms
      setState('recording');
      setElapsed(0);

      // Timer — auto-stop at MAX_DURATION
      timerRef.current = setInterval(() => {
        setElapsed(prev => {
          if (prev >= MAX_DURATION - 1) {
            stopRecording();
            return MAX_DURATION;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone access in your browser settings.');
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone and try again.');
      } else {
        setError('Unable to access microphone.');
      }
    }
  }, [audioUrl]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    blobRef.current = null;
    setDetectedLang(null);
    setElapsed(0);
    setState('idle');
  }, [audioUrl]);

  const togglePlayback = useCallback(() => {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying, audioUrl]);

  const sendRecording = useCallback(async () => {
    if (!blobRef.current) return;
    setState('processing');
    setError(null);

    try {
      const formData = new FormData();
      formData.set('audio', blobRef.current, 'recording.webm');
      formData.set('sessionId', sessionId);

      const result = await transcribeAudio(formData);

      if (result.error) {
        setError(result.error);
        setState('preview');
        return;
      }

      if (!result.text.trim()) {
        setError('No speech detected. Please try again and speak clearly.');
        setState('preview');
        return;
      }

      setDetectedLang(result.language);
      onTranscription({ text: result.text, language: result.language });

      // Reset after successful transcription
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      blobRef.current = null;
      setElapsed(0);
      setState('idle');

    } catch {
      setError('Failed to send recording.');
      setState('preview');
    }
  }, [sessionId, onTranscription, audioUrl]);

  return (
    <div className="voice-recorder">
      {/* Error display */}
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 mb-2 animate-fade-in">
          <AlertCircle size={12} className="shrink-0" />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600" aria-label="Dismiss">
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── IDLE state ─────────────────────────────── */}
      {state === 'idle' && (
        <button
          type="button"
          onClick={startRecording}
          disabled={disabled}
          className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-indigo-100 hover:text-indigo-600
                     disabled:opacity-50 flex items-center justify-center transition-all
                     text-slate-500 shrink-0 group"
          aria-label="Tap to speak"
          title="Tap to speak"
        >
          <Mic size={18} className="group-hover:scale-110 transition-transform" />
        </button>
      )}

      {/* ── RECORDING state ────────────────────────── */}
      {state === 'recording' && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 animate-fade-in">
          {/* Waveform animation */}
          <div className="voice-waveform flex items-center gap-0.5 mr-1" aria-hidden="true">
            <span className="voice-wave-bar" />
            <span className="voice-wave-bar" style={{ animationDelay: '0.15s' }} />
            <span className="voice-wave-bar" style={{ animationDelay: '0.3s' }} />
            <span className="voice-wave-bar" style={{ animationDelay: '0.1s' }} />
            <span className="voice-wave-bar" style={{ animationDelay: '0.25s' }} />
          </div>

          {/* Timer */}
          <span className="text-sm font-mono font-bold text-red-700 min-w-[3rem]">
            {formatTime(elapsed)}
          </span>

          {/* Stop button */}
          <button
            type="button"
            onClick={stopRecording}
            className="w-8 h-8 rounded-lg bg-red-600 hover:bg-red-700 flex items-center justify-center
                       text-white transition-colors shrink-0 recording-pulse"
            aria-label="Stop recording"
          >
            <Square size={14} fill="currentColor" />
          </button>
        </div>
      )}

      {/* ── PREVIEW state ──────────────────────────── */}
      {state === 'preview' && (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 animate-fade-in">
          {/* Hidden audio element for playback */}
          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={() => setIsPlaying(false)}
              preload="auto"
            />
          )}

          {/* Play/Pause */}
          <button
            type="button"
            onClick={togglePlayback}
            className="w-8 h-8 rounded-lg bg-slate-200 hover:bg-slate-300 flex items-center justify-center
                       text-slate-700 transition-colors shrink-0"
            aria-label={isPlaying ? 'Pause playback' : 'Play recording'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>

          {/* Duration */}
          <span className="text-xs text-slate-500 font-mono min-w-[3rem]">
            {formatTime(elapsed)}
          </span>

          {/* Cancel */}
          <button
            type="button"
            onClick={cancelRecording}
            className="w-8 h-8 rounded-lg bg-red-100 hover:bg-red-200 flex items-center justify-center
                       text-red-600 transition-colors shrink-0"
            aria-label="Cancel recording"
          >
            <X size={14} />
          </button>

          {/* Send */}
          <button
            type="button"
            onClick={sendRecording}
            className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center
                       text-white transition-colors shrink-0"
            aria-label="Send recording for transcription"
          >
            <Send size={14} />
          </button>
        </div>
      )}

      {/* ── PROCESSING state ───────────────────────── */}
      {state === 'processing' && (
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 animate-fade-in">
          <Loader2 size={16} className="text-indigo-600 animate-spin" />
          <span className="text-xs font-medium text-indigo-700">Transcribing…</span>
        </div>
      )}
    </div>
  );
}
