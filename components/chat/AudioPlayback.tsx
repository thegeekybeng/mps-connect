'use client';

import { useState, useRef, useCallback } from 'react';
import { Volume2, Loader2, VolumeX } from 'lucide-react';

interface Props {
  text: string;
  sessionId: string;
  messageId: string;
}

// Cache TTS audio per message to avoid re-synthesizing on replay
const audioCache = new Map<string, string>();

export default function AudioPlayback({ text, sessionId, messageId }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playAudio = useCallback(async (url: string) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.onerror = () => {
        setIsPlaying(false);
        setError(true);
      };
    }
    audioRef.current.src = url;
    try {
      await audioRef.current.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
      setError(true);
    }
  }, []);

  const handlePlay = useCallback(async () => {
    setError(false);

    // If already playing, pause
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    // Check cache first
    const cachedUrl = audioCache.get(messageId);
    if (cachedUrl) {
      await playAudio(cachedUrl);
      return;
    }

    // Fetch TTS audio via API route — streams raw WAV bytes
    setIsLoading(true);
    try {
      const resp = await fetch('/api/audio/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sessionId }),
      });

      if (!resp.ok) {
        throw new Error(`Synthesis failed: ${resp.status}`);
      }

      // Response is raw WAV bytes — create blob URL directly
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      audioCache.set(messageId, url);

      setIsLoading(false);
      await playAudio(url);
    } catch {
      setError(true);
      setIsLoading(false);
    }
  }, [text, sessionId, messageId, isPlaying, playAudio]);

  if (error) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(false);
          handlePlay();
        }}
        className="inline-flex items-center gap-1 text-[10px] text-red-400 hover:text-red-500 transition-colors mt-1"
        title="Audio unavailable — tap to retry"
      >
        <VolumeX size={12} />
        <span>Audio unavailable</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handlePlay}
      disabled={isLoading}
      className={`inline-flex items-center gap-1 text-[10px] transition-colors mt-1 ${
        isPlaying
          ? 'text-indigo-600'
          : 'text-slate-400 hover:text-indigo-500'
      }`}
      title={isPlaying ? 'Pause' : 'Listen to response'}
      aria-label={isPlaying ? 'Pause audio' : 'Play audio response'}
    >
      {isLoading ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <Volume2 size={12} className={isPlaying ? 'animate-pulse' : ''} />
      )}
      <span>{isLoading ? 'Loading…' : isPlaying ? 'Playing' : 'Listen'}</span>
    </button>
  );
}
