import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Mic, MicOff, Square, Loader2, Eye, EyeOff } from 'lucide-react';
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
function cleanSpeechText(content: string): string {
  return content
    // :::blocks:::
    .replace(/:::corrections[\s\S]*?:::/g, '')
    .replace(/:::vocabulary[\s\S]*?:::/g, '')
    // ```blocks```
    .replace(/```corrections[\s\S]*?```/g, '')
    .replace(/```vocabulary[\s\S]*?```/g, '')
    // ### Headers with JSON arrays
    .replace(/###\s*Corrections?\s*:?\s*\[[\s\S]*?\]/g, '')
    .replace(/###\s*Vocabulary\s*:?\s*\[[\s\S]*?\]/g, '')
    // **Bold** headers with JSON
    .replace(/\*\*Corrections?\*\*\s*:?\s*\[[\s\S]*?\]/g, '')
    .replace(/\*\*Vocabulary\*\*\s*:?\s*\[[\s\S]*?\]/g, '')
    // Clean markdown artifacts
    .replace(/\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
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
    startRecording,
    stopAndTranscribe,
    sendMessage,
    speakText,
    stopSpeaking,
    endConversation,
    closeConversation,
    showSubtitles,
    toggleSubtitles,
  } = useTutorStore();

  const [currentSubtitle, setCurrentSubtitle] = useState<Subtitle | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [corrections, setCorrections] = useState<GrammarCorrection[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSpokenInitialRef = useRef(false);
  const prevMessageCountRef = useRef(messages.length);

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
      const speechText = cleanSpeechText(firstMsg.content);

      // Start speaking immediately — subtitle appears with speech
      setIsSpeaking(true);
      setCurrentSubtitle({ role: 'assistant', text: speechText });
      speakText(speechText).finally(() => setIsSpeaking(false));

      if (firstMsg.corrections.length > 0) {
        setCorrections((prev) => [...prev, ...firstMsg.corrections]);
      }
    }
  }, [messages, speakText]);

  // Handle new messages (after user sends and AI responds)
  useEffect(() => {
    if (messages.length <= prevMessageCountRef.current) return;

    const newMessages = messages.slice(prevMessageCountRef.current);
    prevMessageCountRef.current = messages.length;

    for (const msg of newMessages) {
      if (msg.role === 'system') continue;

      if (msg.role === 'user') {
        // Show user's transcribed speech briefly
        setCurrentSubtitle({ role: 'user', text: msg.content });
      } else if (msg.role === 'assistant') {
        const speechText = cleanSpeechText(msg.content);

        // AI speaks — subtitle shows what AI is saying
        setIsSpeaking(true);
        setCurrentSubtitle({ role: 'assistant', text: speechText });
        speakText(speechText).finally(() => setIsSpeaking(false));

        if (msg.corrections.length > 0) {
          setCorrections((prev) => [...prev, ...msg.corrections]);
        }
      }
    }
  }, [messages, speakText]);

  // Determine visualizer state
  const voiceState = useMemo(() => {
    if (isRecording) return 'listening' as const;
    if (isSpeaking) return 'speaking' as const;
    if (isTranscribing || isSending || isStreaming) return 'thinking' as const;
    return 'idle' as const;
  }, [isRecording, isTranscribing, isSending, isStreaming, isSpeaking]);

  const handleMicClick = useCallback(async () => {
    if (isRecording) {
      const text = await stopAndTranscribe();
      if (text && text.trim()) {
        setCurrentSubtitle({ role: 'user', text: text.trim() });
        await sendMessage(text.trim());
      }
    } else {
      // If AI is speaking, interrupt it
      if (isSpeaking) {
        await stopSpeaking();
        setIsSpeaking(false);
      }
      setCurrentSubtitle(null);
      await startRecording();
    }
  }, [isRecording, isSpeaking, stopAndTranscribe, sendMessage, startRecording, stopSpeaking]);

  const handleEnd = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    await endConversation();
    setShowSummary(true);
  }, [endConversation]);

  const handleStartNew = useCallback(() => {
    setShowSummary(false);
    closeConversation();
  }, [closeConversation]);

  // Session summary screen
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

  // Status text for the user
  const statusText = isRecording
    ? 'Listening...'
    : isTranscribing
      ? 'Transcribing...'
      : isSending || isStreaming
        ? 'Thinking...'
        : isSpeaking
          ? 'Tap to interrupt'
          : 'Tap to speak';

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] items-center bg-background">
      {/* Minimal header */}
      <div className="w-full flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{modeLabel}</Badge>
          <Badge variant="outline" className="text-xs">{activeConversation.cefrLevel}</Badge>
          <span className="text-xs text-muted-foreground">{languageName}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleSubtitles}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            title={showSubtitles ? 'Hide subtitles' : 'Show subtitles'}
          >
            {showSubtitles ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">{formattedTime}</span>
          <Button variant="destructive" size="sm" onClick={handleEnd}>
            <Square className="h-3 w-3 mr-1" />
            End
          </Button>
        </div>
      </div>

      {/* Main area — visualizer centered, subtitle below */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 max-w-xl w-full">
        {/* Audio visualizer */}
        <AudioVisualizer state={voiceState} />

        {/* Current subtitle — only shows what's being said RIGHT NOW */}
        <div className="w-full min-h-[80px] flex flex-col items-center justify-center">
          {showSubtitles && currentSubtitle && (
            <div className="text-center animate-in fade-in duration-300">
              <span className={`text-xs font-medium ${
                currentSubtitle.role === 'assistant' ? 'text-[#8BB7A3]' : 'text-primary'
              }`}>
                {currentSubtitle.role === 'assistant' ? 'Tutor' : 'You'}
              </span>
              <p className="text-base text-foreground mt-1 leading-relaxed">
                {currentSubtitle.text}
              </p>
            </div>
          )}

          {/* Status indicator (when no subtitle or subtitles off) */}
          {(!showSubtitles || !currentSubtitle) && statusText && (
            <p className="text-sm text-muted-foreground">{statusText}</p>
          )}
        </div>
      </div>

      {/* Bottom — mic button */}
      <div className="w-full px-6 py-8">
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={handleMicClick}
            disabled={isTranscribing}
            className={`flex h-16 w-16 items-center justify-center rounded-full transition-all ${
              isRecording
                ? 'bg-error text-white animate-pulse scale-110 ring-4 ring-error/30'
                : isSpeaking
                  ? 'bg-[#C58C6E] text-white hover:scale-105 active:scale-95'
                  : isTranscribing || isSending || isStreaming
                    ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                    : 'bg-primary text-primary-foreground hover:scale-105 active:scale-95'
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

          {statusText && (
            <p className="text-xs text-muted-foreground">{statusText}</p>
          )}
        </div>
      </div>

      {/* Corrections — small indicator at bottom */}
      {corrections.length > 0 && (
        <div className="w-full px-6 pb-4">
          <CorrectionPanel corrections={corrections} />
        </div>
      )}
    </div>
  );
}
