import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Mic, MicOff, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTutorStore } from '../stores/tutorStore';
import { AudioVisualizer } from './AudioVisualizer';
import { CorrectionPanel } from './CorrectionPanel';
import { SessionSummary } from './SessionSummary';
import type { GrammarCorrection } from '../types';

interface Subtitle {
  role: 'user' | 'assistant';
  text: string;
}

const MODE_LABELS: Record<string, string> = {
  free: 'Free Talk',
  role_play: 'Role Play',
  deck_practice: 'Deck Practice',
  vocab_challenge: 'Vocab Challenge',
  escape_room: 'Escape Room',
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  fa: 'Persian',
  ar: 'Arabic',
  tr: 'Turkish',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  zh: 'Chinese',
  hi: 'Hindi',
  ru: 'Russian',
};

/** Strip correction/vocab blocks from AI content to get clean speech text */
function extractSpeechText(content: string): string {
  return content
    .replace(/```corrections[\s\S]*?```/g, '')
    .replace(/```vocab[\s\S]*?```/g, '')
    .replace(/\*\*Corrections?\*\*[\s\S]*?(?=\n\n|$)/g, '')
    .replace(/\*\*New Words?\*\*[\s\S]*?(?=\n\n|$)/g, '')
    .trim();
}

export function VoiceSession() {
  const {
    activeConversation,
    messages,
    isRecording,
    isTranscribing,
    isSending,
    isStreaming,
    streamingContent,
    startRecording,
    stopAndTranscribe,
    sendMessage,
    speakText,
    endConversation,
    closeConversation,
  } = useTutorStore();

  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [corrections, setCorrections] = useState<GrammarCorrection[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSpokenInitialRef = useRef(false);

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formattedTime = useMemo(() => {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [elapsedSeconds]);

  // Speak initial AI message on mount
  useEffect(() => {
    if (hasSpokenInitialRef.current) return;
    const assistantMessages = messages.filter((m) => m.role === 'assistant');
    if (assistantMessages.length > 0) {
      hasSpokenInitialRef.current = true;
      const firstMsg = assistantMessages[0];
      const speechText = extractSpeechText(firstMsg.content);
      setSubtitles([{ role: 'assistant', text: speechText }]);
      speakText(speechText);

      // Collect corrections
      if (firstMsg.corrections.length > 0) {
        setCorrections((prev) => [...prev, ...firstMsg.corrections]);
      }
    }
  }, [messages, speakText]);

  // Track new messages added after initial load
  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      const newMessages = messages.slice(prevMessageCountRef.current);
      prevMessageCountRef.current = messages.length;

      for (const msg of newMessages) {
        if (msg.role === 'user') {
          setSubtitles((prev) => [...prev.slice(-3), { role: 'user', text: msg.content }]);
        } else if (msg.role === 'assistant') {
          const speechText = extractSpeechText(msg.content);
          setSubtitles((prev) => [...prev.slice(-3), { role: 'assistant', text: speechText }]);
          speakText(speechText);

          if (msg.corrections.length > 0) {
            setCorrections((prev) => [...prev, ...msg.corrections]);
          }
        }
      }
    }
  }, [messages, speakText]);

  const voiceState = useMemo(() => {
    if (isRecording) return 'listening' as const;
    if (isTranscribing || isSending) return 'thinking' as const;
    if (isStreaming) return 'speaking' as const;
    return 'idle' as const;
  }, [isRecording, isTranscribing, isSending, isStreaming]);

  const handleMicClick = useCallback(async () => {
    if (isRecording) {
      const text = await stopAndTranscribe();
      if (text && text.trim()) {
        await sendMessage(text.trim());
      }
    } else {
      await startRecording();
    }
  }, [isRecording, stopAndTranscribe, sendMessage, startRecording]);

  const handleEnd = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    await endConversation();
    setShowSummary(true);
  }, [endConversation]);

  const handleStartNew = useCallback(() => {
    setShowSummary(false);
    closeConversation();
  }, [closeConversation]);

  // Show summary screen
  if (showSummary && activeConversation) {
    const allCorrections = messages.flatMap((m) => m.corrections);
    const allVocab = messages.flatMap((m) => m.vocabSuggestions);
    const userMessageCount = messages.filter((m) => m.role === 'user').length;

    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center p-6">
        <SessionSummary
          summary={{
            grammarScore: allCorrections.length === 0 ? 100 : Math.max(0, 100 - allCorrections.length * 10),
            vocabScore: Math.min(100, allVocab.length * 15),
            fluencyScore: Math.min(100, userMessageCount * 12),
            overallScore: Math.round(
              (allCorrections.length === 0 ? 100 : Math.max(0, 100 - allCorrections.length * 10)) * 0.4 +
              Math.min(100, allVocab.length * 15) * 0.3 +
              Math.min(100, userMessageCount * 12) * 0.3
            ),
            corrections: allCorrections,
            newWords: allVocab,
            durationMinutes: Math.round(elapsedSeconds / 60),
            messageCount: messages.filter((m) => m.role !== 'system').length,
          }}
          onStartNew={handleStartNew}
        />
      </div>
    );
  }

  if (!activeConversation) return null;

  const modeLabel = MODE_LABELS[activeConversation.mode] ?? activeConversation.mode;
  const languageName = LANGUAGE_NAMES[activeConversation.language] ?? activeConversation.language;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] items-center">
      {/* Header bar */}
      <div className="w-full flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Badge>{modeLabel}</Badge>
          <Badge variant="outline">{activeConversation.cefrLevel}</Badge>
          <span className="text-sm text-muted-foreground">{languageName}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm tabular-nums text-foreground">{formattedTime}</span>
          <Button variant="destructive" size="sm" onClick={handleEnd}>
            <Square className="h-3.5 w-3.5 mr-1.5" />
            End
          </Button>
        </div>
      </div>

      {/* Center area — visualizer + subtitles */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 max-w-2xl w-full">
        {/* Audio Visualizer */}
        <AudioVisualizer state={voiceState} />

        {/* Subtitles area */}
        <div className="w-full space-y-3 min-h-[120px]">
          {subtitles.map((sub, i) => (
            <div
              key={i}
              className={`text-center transition-opacity duration-300 ${
                i === subtitles.length - 1 ? 'opacity-100' : 'opacity-40'
              }`}
            >
              <span className="text-xs text-muted-foreground">
                {sub.role === 'assistant' ? 'Tutor' : 'You'}
              </span>
              <p
                className={`text-lg ${
                  sub.role === 'assistant' ? 'text-foreground' : 'text-primary'
                }`}
              >
                {sub.text}
              </p>
            </div>
          ))}

          {/* Live streaming text */}
          {streamingContent && (
            <div className="text-center">
              <span className="text-xs text-muted-foreground">Tutor</span>
              <p className="text-lg text-foreground">{extractSpeechText(streamingContent)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="w-full border-t border-border px-6 py-6">
        <div className="flex items-center justify-center gap-6">
          {/* Mic button */}
          <button
            type="button"
            onClick={handleMicClick}
            disabled={isSending || isTranscribing}
            className={`flex h-16 w-16 items-center justify-center rounded-full transition-all ${
              isRecording
                ? 'bg-error text-white animate-pulse scale-110 ring-4 ring-error/30'
                : isTranscribing
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : isSending
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-primary text-primary-foreground hover:scale-105'
            }`}
          >
            {isTranscribing ? (
              <Loader2 className="h-7 w-7 animate-spin" />
            ) : isRecording ? (
              <MicOff className="h-7 w-7" />
            ) : (
              <Mic className="h-7 w-7" />
            )}
          </button>
        </div>

        {/* Status text */}
        <p className="text-center text-sm text-muted-foreground mt-3">
          {isRecording
            ? 'Listening... Click to stop'
            : isTranscribing
              ? 'Transcribing...'
              : isSending
                ? 'AI is thinking...'
                : 'Click mic to speak'}
        </p>
      </div>

      {/* Corrections panel */}
      {corrections.length > 0 && (
        <div className="w-full px-6 pb-4">
          <CorrectionPanel corrections={corrections} />
        </div>
      )}
    </div>
  );
}
