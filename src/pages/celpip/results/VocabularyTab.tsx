import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  BookOpen,
  Plus,
  Check,
  Sparkles,
  Headphones,
  PenLine,
  Mic,
  X,
  Search,
  FileText,
  BarChart3,
  Link2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddToDeckSheet, type AddToDeckItem } from '@/components/common/AddToDeckSheet';
import { getPartVocab } from '../services/celpipCloud';
import { errorCodeOf } from '../stores/celpipStore';
import type { ExamPartVocab, ExamGrammarNote } from '../types';
import { CEFR_COLORS, POS_LABELS } from './shared';

interface VocabularyTabProps {
  sessionId: string;
}

interface VocabResponse {
  parts: ExamPartVocab[];
  total_words: number;
  first_view?: boolean;
}

const PROGRESS_WIDTH: Record<number, string> = {
  0: 'w-[20%]',
  1: 'w-[40%]',
  2: 'w-[60%]',
  3: 'w-[80%]',
  4: 'w-full',
};

const SECTION_BORDER_LEFT: Record<string, string> = {
  listening: 'border-l-success/50',
  reading: 'border-l-accent/50',
  writing: 'border-l-primary/50',
  speaking: 'border-l-warning/50',
};

// Front used emoji per step; desk is emoji-free, so each step carries a Lucide
// glyph shown only for not-yet-reached steps.
const ANALYSIS_STEPS = [
  { key: 'scanning', Icon: Search },
  { key: 'extracting', Icon: FileText },
  { key: 'analyzingCefr', Icon: BarChart3 },
  { key: 'identifyingPatterns', Icon: Link2 },
  { key: 'preparingAnalysis', Icon: Sparkles },
] as const;

// Section tones — listening: success, reading: accent, writing: primary, speaking: warning
const SECTION_PILL: Record<
  string,
  { text: string; bg: string; activeBg: string; icon: typeof Headphones }
> = {
  listening: {
    text: 'text-success',
    bg: 'bg-success/10',
    activeBg: 'bg-success',
    icon: Headphones,
  },
  reading: { text: 'text-accent', bg: 'bg-accent/10', activeBg: 'bg-accent', icon: BookOpen },
  writing: { text: 'text-primary', bg: 'bg-primary/10', activeBg: 'bg-primary', icon: PenLine },
  speaking: { text: 'text-warning', bg: 'bg-warning/10', activeBg: 'bg-warning', icon: Mic },
};

function VocabAnalysisAnimation({
  isDataReady,
  onComplete,
}: {
  isDataReady: boolean;
  onComplete: () => void;
}) {
  const { t } = useTranslation('celpip');
  const [currentStep, setCurrentStep] = useState(0);
  const hasSignaled = useRef(false);

  useEffect(() => {
    if (currentStep < ANALYSIS_STEPS.length - 1) {
      const timer = setTimeout(() => setCurrentStep((s) => s + 1), 2000);
      return () => clearTimeout(timer);
    }
  }, [currentStep]);

  useEffect(() => {
    // Hold on the last step until the data is actually in, then a brief beat so
    // the reveal doesn't feel like a flicker.
    if (currentStep === ANALYSIS_STEPS.length - 1 && isDataReady && !hasSignaled.current) {
      hasSignaled.current = true;
      const timer = setTimeout(onComplete, 800);
      return () => clearTimeout(timer);
    }
  }, [currentStep, isDataReady, onComplete]);

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6">
      <div className="relative">
        <div className="w-16 h-16 rounded-[14px] bg-accent/10 border border-accent/25 flex items-center justify-center">
          <BookOpen className="w-7 h-7 text-accent animate-pulse" />
        </div>
        <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-accent animate-bounce" />
      </div>

      <div className="w-64 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full bg-accent rounded-full transition-all duration-1000 ease-out ${PROGRESS_WIDTH[currentStep]}`}
        />
      </div>

      <div className="flex flex-col gap-3 w-72">
        {ANALYSIS_STEPS.map((step, i) => {
          const StepIcon = step.Icon;
          return (
            <div
              key={step.key}
              className={`flex items-center gap-3 text-[13px] transition-all duration-500 ${
                i < currentStep
                  ? 'text-accent opacity-60'
                  : i === currentStep
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground/50'
              }`}
            >
              <span className="w-5 flex justify-center">
                {i < currentStep ? (
                  <Check className="w-3.5 h-3.5 text-accent" strokeWidth={3} />
                ) : i === currentStep ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                ) : (
                  <StepIcon className="w-3 h-3" />
                )}
              </span>
              <span>{t(`results.vocabulary.analysis.${step.key}`)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function VocabularyTab({ sessionId }: VocabularyTabProps) {
  const { t } = useTranslation('celpip');
  const [data, setData] = useState<VocabResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errCode, setErrCode] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [vocabTab, setVocabTab] = useState<'words' | 'collocations' | 'idioms' | 'grammar'>(
    'words',
  );
  const [animationDone, setAnimationDone] = useState(false);

  const handleAnimationComplete = useCallback(() => setAnimationDone(true), []);

  // Vocabulary is a free, unlimited endpoint — fetched directly rather than
  // through the session store so a results re-fetch never clobbers it.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrCode(null);
    getPartVocab(sessionId)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((err) => {
        if (!cancelled) setErrCode(errorCodeOf(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const isError = errCode != null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  // Staged "analyzing" reveal — FIRST vocab delivery only; the backend stamps it
  // and repeat views render instantly (undefined = older backend → keep reveal).
  if (!isError && data && data.first_view !== false && !animationDone) {
    return <VocabAnalysisAnimation isDataReady onComplete={handleAnimationComplete} />;
  }

  if (isError) {
    if (errCode === 'EXAM_VOCAB_LIMIT_REACHED') {
      return (
        <div className="text-center py-12">
          <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-[14px] font-bold text-foreground mb-1">
            {t('errors.EXAM_VOCAB_LIMIT_REACHED')}
          </p>
          <p className="text-[12.5px] text-muted-foreground">
            {t('results.vocabulary.upgradePrompt')}
          </p>
        </div>
      );
    }
    if (errCode === 'EXAM_VOCAB_NOT_READY') {
      return (
        <div className="text-center py-12">
          <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-[13px] text-muted-foreground">{t('results.vocabulary.notReady')}</p>
        </div>
      );
    }
    return (
      <div className="text-center py-8 text-error text-[13px]">{t('errors.UNKNOWN_ERROR')}</div>
    );
  }

  if (!data?.parts?.length) {
    return (
      <div className="text-center py-12">
        <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-[13px] text-muted-foreground">{t('results.vocabulary.notReady')}</p>
      </div>
    );
  }

  const filteredParts =
    sectionFilter === 'all'
      ? data.parts
      : data.parts.filter((p) => p.section_type === sectionFilter);

  const allWords = filteredParts.flatMap((p) =>
    p.vocabulary.map((w) => ({
      ...w,
      _section: p.section_type,
      _key: `${p.part_id}_${w.word}`,
    })),
  );
  const allCollocations = filteredParts.flatMap((p) =>
    p.collocations.map((c, i) => ({
      ...c,
      _section: p.section_type,
      _key: `col_${p.part_id}_${i}`,
    })),
  );
  const allIdioms = filteredParts.flatMap((p) =>
    p.idioms.map((idiom, i) => ({
      ...idiom,
      _section: p.section_type,
      _key: `idi_${p.part_id}_${i}`,
    })),
  );
  const allGrammar = filteredParts.flatMap((p) =>
    p.grammar_notes.map((g) => ({ ...g, _section: p.section_type })),
  );

  const toggleItem = (key: string) => {
    setSelectedWords((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Grammar has no selection, so its key list is empty (drives select-all + bar).
  const currentTabKeys =
    vocabTab === 'words'
      ? allWords.map((w) => w._key)
      : vocabTab === 'collocations'
        ? allCollocations.map((c) => c._key)
        : vocabTab === 'idioms'
          ? allIdioms.map((i) => i._key)
          : [];

  const currentTabSelectedCount = currentTabKeys.filter((k) => selectedWords.has(k)).length;

  const toggleAllCurrentTab = () => {
    setSelectedWords((prev) => {
      const next = new Set(prev);
      if (currentTabSelectedCount === currentTabKeys.length) {
        currentTabKeys.forEach((k) => next.delete(k));
      } else {
        currentTabKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  // CELPIP content is English; every card enters the deck as an `en` word with
  // whatever metadata the extraction attached.
  const getSelectedItems = (): AddToDeckItem[] => {
    const items: AddToDeckItem[] = [];
    allWords.forEach((w) => {
      if (selectedWords.has(w._key)) {
        items.push({
          word: w.word,
          language: 'en',
          definition: w.definition,
          pos: w.pos,
          cefrLevel: w.cefr_level,
          exampleSentence: w.example,
        });
      }
    });
    allCollocations.forEach((c) => {
      if (selectedWords.has(c._key)) {
        items.push({
          word: c.collocation,
          language: 'en',
          definition: c.definition,
          cefrLevel: c.cefr_level,
          exampleSentence: c.example,
        });
      }
    });
    allIdioms.forEach((idiom) => {
      if (selectedWords.has(idiom._key)) {
        items.push({
          word: idiom.idiom,
          language: 'en',
          definition: idiom.meaning,
          exampleSentence: idiom.example,
        });
      }
    });
    return items;
  };

  const sections = [...new Set(data.parts.map((p) => p.section_type))] as string[];

  const selectedItems = getSelectedItems();

  return (
    <div className="flex flex-col gap-5">
      {/* Heading */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[11px] bg-accent/10 border border-accent/25 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-[16px] font-bold text-foreground">
              {t('results.vocabulary.title')}
            </h3>
            <p className="text-[12.5px] text-muted-foreground tabular-nums">
              {t('results.vocabulary.wordsExtracted', { count: data.total_words })}
            </p>
          </div>
        </div>
      </div>

      {/* Inner pill tabs — only non-empty groups appear */}
      <div className="flex gap-1 p-1 bg-muted rounded-[10px] w-fit overflow-x-auto">
        {(
          [
            { key: 'words', label: t('results.vocabulary.words'), count: allWords.length },
            {
              key: 'collocations',
              label: t('results.vocabulary.collocations'),
              count: allCollocations.length,
            },
            { key: 'idioms', label: t('results.vocabulary.idioms'), count: allIdioms.length },
            {
              key: 'grammar',
              label: t('results.vocabulary.grammarNotes'),
              count: allGrammar.length,
            },
          ] as const
        )
          .filter((tab) => tab.count > 0)
          .map((tab) => (
            <button
              key={tab.key}
              onClick={() => setVocabTab(tab.key)}
              className={`px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap rounded-[8px] transition-all ${
                vocabTab === tab.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              <span
                className={`ms-1.5 text-[10.5px] tabular-nums font-bold ${
                  vocabTab === tab.key ? 'text-accent' : 'text-muted-foreground'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
      </div>

      {/* Section filter pills — colored by section */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setSectionFilter('all')}
          className={`inline-flex items-center px-2.5 py-1 rounded-[8px] text-[11.5px] font-semibold transition-all ${
            sectionFilter === 'all'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-muted text-muted-foreground hover:bg-muted/70'
          }`}
        >
          {t('results.vocabulary.all')}
        </button>
        {sections.map((s) => {
          const pill = SECTION_PILL[s];
          if (!pill) return null;
          const Icon = pill.icon;
          const active = sectionFilter === s;
          return (
            <button
              key={s}
              onClick={() => setSectionFilter(s)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] text-[11.5px] font-semibold transition-all capitalize ${
                active
                  ? `${pill.activeBg} text-white shadow-sm`
                  : `${pill.bg} ${pill.text} hover:opacity-80`
              }`}
            >
              <Icon className="w-3 h-3" />
              {s}
            </button>
          );
        })}
      </div>

      {/* Select-all bar — grammar has no selection */}
      {vocabTab !== 'grammar' && currentTabKeys.length > 0 && (
        <div className="flex items-center justify-between bg-muted border border-border rounded-[10px] px-3 py-2">
          <button
            onClick={toggleAllCurrentTab}
            className="text-[12px] font-bold text-accent hover:opacity-80 transition-opacity"
          >
            {currentTabSelectedCount === currentTabKeys.length
              ? t('results.vocabulary.deselectAll')
              : t('results.vocabulary.selectAll')}
          </button>
          {currentTabSelectedCount > 0 && (
            <span className="text-[11.5px] text-muted-foreground tabular-nums font-semibold">
              {currentTabSelectedCount} / {currentTabKeys.length}
            </span>
          )}
        </div>
      )}

      {/* Words tab */}
      {vocabTab === 'words' && allWords.length > 0 && (
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {allWords.map((w) => {
            const sel = selectedWords.has(w._key);
            const sectionBorderClass = SECTION_BORDER_LEFT[w._section] ?? 'border-l-border';
            return (
              <button
                key={w._key}
                onClick={() => toggleItem(w._key)}
                className={`text-start px-3 py-2.5 rounded-[10px] border-l-[3px] transition-all relative ${
                  sel
                    ? 'bg-accent/[0.06] border-l-accent border border-accent/40 shadow-sm'
                    : `bg-card ${sectionBorderClass} border border-border hover:border-accent/25`
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={`inline-flex items-center justify-center w-4 h-4 rounded-[5px] border-2 shrink-0 ${
                        sel ? 'border-accent bg-accent' : 'border-border'
                      }`}
                    >
                      {sel && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                    </span>
                    <span className="font-bold text-[13px] text-foreground truncate">{w.word}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={`px-1.5 py-0.5 rounded-[5px] text-[9px] font-bold ${
                        CEFR_COLORS[w.cefr_level] || 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {w.cefr_level}
                    </span>
                    <span className="text-[9px] text-muted-foreground font-mono">
                      {POS_LABELS[w.pos] || w.pos}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1 ps-[24px]">
                  {w.definition}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Collocations tab */}
      {vocabTab === 'collocations' && allCollocations.length > 0 && (
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {allCollocations.map((c) => {
            const sel = selectedWords.has(c._key);
            return (
              <button
                key={c._key}
                onClick={() => toggleItem(c._key)}
                className={`text-start px-3 py-2.5 rounded-[10px] border transition-all ${
                  sel
                    ? 'border-accent bg-accent/[0.06] shadow-sm'
                    : 'border-border bg-card hover:border-accent/25'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center justify-center w-4 h-4 rounded-[5px] border-2 shrink-0 ${
                      sel ? 'border-accent bg-accent' : 'border-border'
                    }`}
                  >
                    {sel && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </span>
                  <span className="font-bold text-[13px] text-foreground">{c.collocation}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-[5px] text-[9px] font-bold ${
                      CEFR_COLORS[c.cefr_level] || 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {c.cefr_level}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 ps-[24px]">{c.definition}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Idioms tab */}
      {vocabTab === 'idioms' && allIdioms.length > 0 && (
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
          {allIdioms.map((idiom) => {
            const sel = selectedWords.has(idiom._key);
            return (
              <button
                key={idiom._key}
                onClick={() => toggleItem(idiom._key)}
                className={`text-start px-3 py-2.5 rounded-[10px] border transition-all ${
                  sel
                    ? 'border-accent bg-accent/[0.06] shadow-sm'
                    : 'border-border bg-card hover:border-accent/25'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center justify-center w-4 h-4 rounded-[5px] border-2 shrink-0 ${
                      sel ? 'border-accent bg-accent' : 'border-border'
                    }`}
                  >
                    {sel && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </span>
                  <span className="font-bold text-[13px] text-foreground">{idiom.idiom}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 ps-[24px]">{idiom.meaning}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Grammar tab — read-only, no selection */}
      {vocabTab === 'grammar' && allGrammar.length > 0 && (
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
          {allGrammar.map((g: ExamGrammarNote & { _section: string }, i: number) => (
            <div key={i} className="px-3 py-2.5 rounded-[10px] border border-border bg-card">
              <span className="font-bold text-[13px] text-foreground">{g.pattern}</span>
              <p className="text-[11px] text-muted-foreground mt-1">{g.explanation}</p>
              {g.example && (
                <p className="text-[11px] text-muted-foreground/80 mt-0.5 italic line-clamp-1">
                  &quot;{g.example}&quot;
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Floating action bar — fixed so it stays reachable while scrolling long
          lists. Appears only with a selection. */}
      {selectedWords.size > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 p-1.5 rounded-full bg-card/95 backdrop-blur-sm border border-border shadow-lg">
          <button
            onClick={() => setSelectedWords(new Set())}
            aria-label={t('vocabClearSelection')}
            title={t('vocabClearSelection')}
            className="w-8 h-8 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
          <Button
            variant="default"
            size="md"
            onClick={() => setShowAddDialog(true)}
            className="rounded-full"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('results.vocabulary.addToDeck', { count: selectedItems.length })}
          </Button>
        </div>
      )}

      <AddToDeckSheet
        open={showAddDialog}
        onOpenChange={(o) => {
          setShowAddDialog(o);
          // Closing the sheet ends the batch — reset so the next open starts clean.
          if (!o) setSelectedWords(new Set());
        }}
        items={selectedItems}
        defaultLanguage="en"
      />
    </div>
  );
}
