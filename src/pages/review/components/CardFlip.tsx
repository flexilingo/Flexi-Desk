import { useMemo } from 'react';
import {
  Sparkles, BookOpen, GraduationCap, ArrowLeftRight, Lightbulb,
  MessageCircle, AlertTriangle, Link2, Volume2, Globe, History,
  RotateCcw, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CardFull, CardNotes } from '../types';

interface Props {
  card: CardFull;
  isFlipped: boolean;
  requeueCount?: number;
  editModeEnabled?: boolean;
  onEdit?: () => void;
  onSpeak?: (text: string) => void;
  isSpeaking?: boolean;
  onDictionary?: (word: string) => void;
}

export function CardFlip({
  card,
  isFlipped,
  requeueCount = 0,
  editModeEnabled = false,
  onEdit,
  onSpeak,
  isSpeaking = false,
  onDictionary,
}: Props) {
  const notes = useMemo<CardNotes | null>(() => {
    if (!card.notes) return null;
    try {
      return JSON.parse(card.notes) as CardNotes;
    } catch {
      return null;
    }
  }, [card.notes]);

  const ipa = notes?.ipa;
  const examples = notes?.examples?.slice(0, 2) ?? [];
  const synonyms = notes?.synonyms?.slice(0, 6) ?? [];
  const antonyms = notes?.antonyms?.slice(0, 6) ?? [];
  const tip = notes?.tip;
  const memoryHook = notes?.memory_hook;
  const isAIGenerated = !!notes?.generated_by;

  return (
    <div className="py-4">
      {/* Top badges row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1">
          {requeueCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-amber-600 dark:text-amber-400 text-xs font-medium shadow-sm">
              <RotateCcw className="w-3.5 h-3.5" />
              Repeat #{requeueCount}
            </span>
          )}
        </div>
        {editModeEnabled && onEdit && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            onClick={onEdit}
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </Button>
        )}
      </div>

      {/* Main card — bordered container (matches front-end SentenceCard) */}
      <div className="bg-[#8BB7A3]/10 rounded-2xl p-6 md:p-8 shadow-lg border-2 border-[#8BB7A3] text-center">
        {/* "Question" label */}
        <div className="text-xs text-primary font-medium mb-3 opacity-70">Question</div>

        {/* Word — large, centered + TTS button */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <h1 className="text-2xl md:text-3xl font-medium text-foreground leading-relaxed">
            {card.front}
          </h1>
          {onSpeak && (
            <button
              onClick={() => onSpeak(card.front)}
              disabled={isSpeaking}
              className="flex-shrink-0 p-2 rounded-full bg-[#8BB7A3] hover:bg-[#8BB7A3]/80 text-white transition-all shadow-md hover:shadow-lg disabled:opacity-50"
              title="Speak"
            >
              <Volume2 className={`w-4 h-4 ${isSpeaking ? 'animate-pulse' : ''}`} />
            </button>
          )}
          {onDictionary && (
            <button
              onClick={() => onDictionary(card.front)}
              className="flex-shrink-0 p-2 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-600 transition-all shadow-md hover:shadow-lg"
              title="Dictionary"
            >
              <BookOpen className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Answer section (inside card, when flipped) */}
        {isFlipped && card.translation && (
          <div className="mt-4 pt-4 border-t border-[#8BB7A3]">
            <div className="text-xs text-primary font-medium mb-3 opacity-70">Answer</div>
            <h2 className="text-xl md:text-2xl font-medium text-foreground leading-relaxed">
              {card.translation}
            </h2>
          </div>
        )}

        {/* "Click to show answer" hint (when not flipped) */}
        {!isFlipped && (
          <p className="mt-4 text-[10px] text-primary opacity-60">Click to show answer</p>
        )}
      </div>

      {/* AI content sections — OUTSIDE card, only when flipped */}
      {isFlipped && (
        <div className="mt-6 space-y-4">
          {/* AI Generated badge + metadata pills */}
          {isAIGenerated && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-500/30 text-purple-600 dark:text-purple-400 text-xs font-medium">
                <Sparkles className="w-3 h-3" />
                AI Generated
              </span>
              {card.pos && (
                <span className="px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs">
                  {card.pos}
                </span>
              )}
              {card.cefrLevel && (
                <span className="px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs">
                  {card.cefrLevel}
                </span>
              )}
              {ipa && (
                <span className="px-2.5 py-1 rounded-full bg-gray-500/20 border border-gray-500/30 text-gray-600 dark:text-gray-400 text-xs font-mono">
                  /{ipa}/
                </span>
              )}
              {notes?.register && notes.register !== 'neutral' && (
                <span className={`px-2.5 py-1 rounded-full text-xs ${
                  notes.register === 'formal'
                    ? 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
                    : notes.register === 'informal'
                    ? 'bg-orange-500/20 border border-orange-500/30 text-orange-600 dark:text-orange-400'
                    : 'bg-pink-500/20 border border-pink-500/30 text-pink-600 dark:text-pink-400'
                }`}>
                  {notes.register}
                </span>
              )}
            </div>
          )}

          {/* Non-AI cards: show POS + CEFR if available */}
          {!isAIGenerated && (card.pos || card.cefrLevel) && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {card.pos && (
                <span className="px-2.5 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs">
                  {card.pos}
                </span>
              )}
              {card.cefrLevel && (
                <span className="px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs">
                  {card.cefrLevel}
                </span>
              )}
            </div>
          )}

          {/* Definition box — emerald icon */}
          {(card.definition || notes?.definition) && (
            <ContentSection
              icon={<BookOpen className="w-4 h-4" />}
              iconBg="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              label="Definition"
            >
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {notes?.definition || card.definition}
              </p>
            </ContentSection>
          )}

          {/* Examples box — blue icon */}
          {examples.length > 0 && (
            <ContentSection
              icon={<GraduationCap className="w-4 h-4" />}
              iconBg="bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400"
              label="Examples"
            >
              <div className="space-y-3">
                {examples.map((ex, i) => (
                  <div key={i} className="pl-3 border-l-2 border-blue-400/50">
                    <div className="flex items-center gap-1">
                      {onSpeak && (
                        <button
                          onClick={() => onSpeak(ex.source)}
                          className="p-1 rounded-full hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-500"
                        >
                          <Volume2 className="w-3 h-3" />
                        </button>
                      )}
                      <p className="text-sm text-slate-700 dark:text-slate-200">{ex.source}</p>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{ex.target}</p>
                  </div>
                ))}
              </div>
            </ContentSection>
          )}

          {/* Example sentence fallback */}
          {card.exampleSentence && examples.length === 0 && (
            <ContentSection
              icon={<GraduationCap className="w-4 h-4" />}
              iconBg="bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400"
              label="Example"
            >
              <p className="text-sm italic text-slate-700 dark:text-slate-200">{card.exampleSentence}</p>
            </ContentSection>
          )}

          {/* Source Context — violet */}
          {notes?.source_context && (
            <GradientSection
              icon={<MessageCircle className="w-4 h-4" />}
              iconBg="bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400"
              label="From Video"
              gradient="from-violet-50 to-purple-50 dark:from-violet-500/10 dark:to-purple-500/10"
              borderColor="border-violet-200 dark:border-violet-500/30"
              labelColor="text-violet-600 dark:text-violet-400"
            >
              <p className="text-sm text-slate-700 dark:text-slate-200 italic">
                &ldquo;{notes.source_context}&rdquo;
              </p>
            </GradientSection>
          )}

          {/* Memory Hook / Tip — amber */}
          {(memoryHook || tip) && (
            <GradientSection
              icon={<Lightbulb className="w-4 h-4" />}
              iconBg="bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"
              label={memoryHook ? 'Memory Hook' : 'Tip'}
              gradient="from-amber-50 to-yellow-50 dark:from-amber-500/10 dark:to-yellow-500/10"
              borderColor="border-amber-200 dark:border-amber-500/30"
              labelColor="text-amber-600 dark:text-amber-400"
            >
              <p className="text-sm text-slate-700 dark:text-slate-200">{memoryHook || tip}</p>
            </GradientSection>
          )}

          {/* Common Mistakes — red */}
          {notes?.common_mistakes && notes.common_mistakes.length > 0 && (
            <GradientSection
              icon={<AlertTriangle className="w-4 h-4" />}
              iconBg="bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400"
              label="Common Mistakes"
              gradient="from-red-50 to-rose-50 dark:from-red-500/10 dark:to-rose-500/10"
              borderColor="border-red-200 dark:border-red-500/30"
              labelColor="text-red-600 dark:text-red-400"
            >
              <div className="space-y-2">
                {notes.common_mistakes.map((m, i) => (
                  <div key={i} className="text-sm">
                    <span className="text-red-500 line-through">{m.wrong}</span>
                    <span className="mx-2 text-slate-400">→</span>
                    <span className="text-green-600 dark:text-green-400">{m.correct}</span>
                  </div>
                ))}
              </div>
            </GradientSection>
          )}

          {/* Collocations — cyan */}
          {notes?.collocations && notes.collocations.length > 0 && (
            <ContentSection
              icon={<Link2 className="w-4 h-4" />}
              iconBg="bg-cyan-100 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400"
              label="Collocations"
            >
              <div className="flex flex-wrap gap-1.5">
                {notes.collocations.map((col, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 text-xs">
                    {col}
                  </span>
                ))}
              </div>
            </ContentSection>
          )}

          {/* Synonyms & Antonyms — indigo */}
          {(synonyms.length > 0 || antonyms.length > 0) && (
            <ContentSection
              icon={<ArrowLeftRight className="w-4 h-4" />}
              iconBg="bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
              label={synonyms.length > 0 && antonyms.length > 0 ? 'Synonyms & Antonyms' : synonyms.length > 0 ? 'Synonyms' : 'Antonyms'}
            >
              {synonyms.length > 0 && (
                <div className="mb-2">
                  {antonyms.length > 0 && <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Synonyms</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {synonyms.map((s, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300 text-xs">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {antonyms.length > 0 && (
                <div>
                  {synonyms.length > 0 && <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Antonyms</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {antonyms.map((a, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs">{a}</span>
                    ))}
                  </div>
                </div>
              )}
            </ContentSection>
          )}

          {/* Pronunciation Tips — orange */}
          {notes?.pronunciation_tips && (
            <ContentSection
              icon={<Volume2 className="w-4 h-4" />}
              iconBg="bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400"
              label="Pronunciation Tips"
            >
              <p className="text-sm text-slate-700 dark:text-slate-200">{notes.pronunciation_tips}</p>
            </ContentSection>
          )}

          {/* Cultural Note — teal */}
          {notes?.cultural_note && (
            <GradientSection
              icon={<Globe className="w-4 h-4" />}
              iconBg="bg-teal-100 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400"
              label="Cultural Note"
              gradient="from-teal-50 to-emerald-50 dark:from-teal-500/10 dark:to-emerald-500/10"
              borderColor="border-teal-200 dark:border-teal-500/30"
              labelColor="text-teal-600 dark:text-teal-400"
            >
              <p className="text-sm text-slate-700 dark:text-slate-200">{notes.cultural_note}</p>
            </GradientSection>
          )}

          {/* Etymology — purple */}
          {notes?.etymology && (
            <ContentSection
              icon={<History className="w-4 h-4" />}
              iconBg="bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400"
              label="Etymology"
            >
              <p className="text-sm text-slate-700 dark:text-slate-200">{notes.etymology}</p>
            </ContentSection>
          )}

          {/* Footer stats */}
          <div className="text-xs text-muted-foreground/60 text-center">
            {card.reviewCount} reviews · interval: {card.intervalDays}d
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reusable section components ──

function ContentSection({
  icon,
  iconBg,
  label,
  children,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-100 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${iconBg}`}>{icon}</div>
        <div className="flex-1">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function GradientSection({
  icon,
  iconBg,
  label,
  gradient,
  borderColor,
  labelColor,
  children,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  gradient: string;
  borderColor: string;
  labelColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-gradient-to-r ${gradient} rounded-xl p-4 border ${borderColor}`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${iconBg}`}>{icon}</div>
        <div className="flex-1">
          <p className={`text-xs font-medium ${labelColor} mb-1`}>{label}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
