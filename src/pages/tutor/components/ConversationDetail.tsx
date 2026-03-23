import { ArrowLeft, Trophy, Clock, MessageSquare, AlertCircle, BookOpen, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTutorStore } from '../stores/tutorStore';
import { ScoreRing } from './ScoreRing';
import type { CorrectionType, GrammarCorrection, VocabSuggestion } from '../types';

const borderColorByType: Record<CorrectionType, string> = {
  grammar: 'border-l-primary',
  spelling: 'border-l-[#C58C6E]',
  word_choice: 'border-l-[#8BB7A3]',
  word_order: 'border-l-muted',
};

const MODE_LABELS: Record<string, string> = {
  free: 'Free Talk',
  role_play: 'Role Play',
  deck_practice: 'Deck Practice',
  vocab_challenge: 'Vocab Challenge',
  escape_room: 'Escape Room',
};

export function ConversationDetail() {
  const { activeConversation, messages, setView, openConversation } = useTutorStore();

  if (!activeConversation) return null;

  const conv = activeConversation;
  const chatMessages = messages.filter((m) => m.role !== 'system');
  const userMessages = messages.filter((m) => m.role === 'user');

  // Gather all corrections and vocab from assistant messages
  const allCorrections: GrammarCorrection[] = [];
  const allVocab: VocabSuggestion[] = [];
  for (const msg of messages) {
    if (msg.role === 'assistant') {
      allCorrections.push(...msg.corrections);
      allVocab.push(...msg.vocabSuggestions);
    }
  }

  // Calculate scores (same logic as VoiceSession/SessionSummary)
  const grammarScore = allCorrections.length === 0 ? 100 : Math.max(0, 100 - allCorrections.length * 10);
  const vocabScore = Math.min(100, allVocab.length * 15);
  const fluencyScore = Math.min(100, userMessages.length * 12);
  const overallScore = Math.round(grammarScore * 0.4 + vocabScore * 0.3 + fluencyScore * 0.3);

  // Duration
  const firstMsg = chatMessages[0];
  const lastMsg = chatMessages[chatMessages.length - 1];
  const durationMinutes =
    firstMsg && lastMsg
      ? Math.max(1, Math.round((new Date(lastMsg.createdAt).getTime() - new Date(firstMsg.createdAt).getTime()) / 60000))
      : 0;

  const isActive = conv.status === 'active';

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <button
          type="button"
          onClick={() => setView('landing')}
          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground truncate">{conv.title}</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{MODE_LABELS[conv.mode] ?? conv.mode}</span>
            <span>·</span>
            <span>{conv.cefrLevel}</span>
            <span>·</span>
            <span>{new Date(conv.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        {isActive && (
          <Button
            size="sm"
            onClick={() => openConversation(conv.id)}
            className="gap-1.5"
          >
            <Mic className="h-3.5 w-3.5" />
            Resume
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-6 py-6 space-y-8">
          {/* Score Section */}
          {chatMessages.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-6">
                <ScoreRing score={grammarScore} label="Grammar" />
                <ScoreRing score={vocabScore} label="Vocabulary" />
                <ScoreRing score={fluencyScore} label="Fluency" />
                <ScoreRing score={overallScore} label="Overall" size={96} />
              </div>

              <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  {durationMinutes} min
                </span>
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4" />
                  {chatMessages.length} messages
                </span>
                {allCorrections.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" />
                    {allCorrections.length} fixes
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Corrections */}
          {allCorrections.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground border-b border-border pb-2">
                Corrections ({allCorrections.length})
              </h4>
              <div className="space-y-2">
                {allCorrections.map((correction, i) => (
                  <div
                    key={i}
                    className={`border-l-4 ${borderColorByType[correction.type]} rounded bg-muted/30 p-3 space-y-1`}
                  >
                    <p className="text-sm text-muted-foreground line-through">
                      ❌ {correction.original}
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      ✅ {correction.corrected}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      💡 {correction.explanation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New Words */}
          {allVocab.length > 0 && (
            <div className="space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground border-b border-border pb-2">
                <BookOpen className="h-4 w-4" />
                New Words ({allVocab.length})
              </h4>
              <div className="space-y-2">
                {allVocab.map((vocab, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded bg-muted/30 px-3 py-2"
                  >
                    <span className="text-sm text-foreground">
                      <span className="font-medium">{vocab.word}</span>
                      <span className="text-muted-foreground"> — {vocab.translation}</span>
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {vocab.cefr}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full Conversation Transcript */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground border-b border-border pb-2">
              Conversation
            </h4>
            <div className="space-y-3">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-foreground'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{cleanMessageContent(msg.content)}</p>
                    <p
                      className={`text-[10px] mt-1 ${
                        msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'
                      }`}
                    >
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Strip :::corrections, :::vocabulary blocks from display text */
function cleanMessageContent(content: string): string {
  return content
    .replace(/:::corrections[\s\S]*?:::/g, '')
    .replace(/:::vocabulary[\s\S]*?:::/g, '')
    .replace(/```corrections[\s\S]*?```/g, '')
    .replace(/```vocabulary[\s\S]*?```/g, '')
    .trim();
}
