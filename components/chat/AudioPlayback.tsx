'use client';

import { useState, useRef, useCallback } from 'react';
import { Volume2, Loader2, VolumeX } from 'lucide-react';
import { synthesizeSpeech } from '@/app/actions/chat';

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
      playAudio(cachedUrl);
      return;
    }

    // Fetch TTS audio
    setIsLoading(true);
    try {
      const result = await synthesizeSpeech(text, sessionId);
      if (result.error || !result.audioBase64) {
        setError(true);
        setIsLoading(false);
        return;
      }

      // Convert base64 to blob URL
      const byteChars = atob(result.audioBase64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteArray[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      audioCache.set(messageId, url);

      setIsLoading(false);
      playAudio(url);

    } catch {
      setError(true);
      setIsLoading(false);
    }
  }, [text, sessionId, messageId, isPlaying]);

  const playAudio = (url: string) => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.onerror = () => {
        setIsPlaying(false);
        setError(true);
      };
    }
    audioRef.current.src = url;
    audioRef.current.play();
    setIsPlaying(true);
  };

  if (error) {
    return (
      <button
        type="button"
        onClick={() => setError(false)}
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
