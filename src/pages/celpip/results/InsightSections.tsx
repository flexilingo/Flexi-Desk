import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  XCircle,
  Sparkles,
  Headphones,
  BookOpen,
  PenLine,
  Mic,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Info,
  ChevronDown,
} from 'lucide-react';
import type {
  ExamInsight,
  InsightMcqSection,
  InsightMcqQuestionAnalysis,
  InsightWritingTask,
  InsightSpeakingTask,
} from '../types';
import { LookupText } from '../components/session/WordLookup';
import { useInsightLabels } from './TcfExplanations';

const CARD = 'rounded-[9px] border border-border bg-card shadow-sm';

interface SectionTone {
  text: string;
  bg: string;
  border: string;
  headerBg: string;
}

export const SECTION_TONES: Record<'listening' | 'reading' | 'writing' | 'speaking', SectionTone> =
  {
    listening: {
      text: 'text-success',
      bg: 'bg-success/10',
      border: 'border-success/30',
      headerBg: 'bg-success/[0.06]',
    },
    reading: {
      text: 'text-accent',
      bg: 'bg-accent/10',
      border: 'border-accent/30',
      headerBg: 'bg-accent/[0.06]',
    },
    writing: {
      text: 'text-primary',
      bg: 'bg-primary/10',
      border: 'border-primary/30',
      headerBg: 'bg-primary/[0.06]',
    },
    speaking: {
      text: 'text-warning',
      bg: 'bg-warning/10',
      border: 'border-warning/30',
      headerBg: 'bg-warning/[0.06]',
    },
  };

export const SECTION_ICONS = {
  listening: Headphones,
  reading: BookOpen,
  writing: PenLine,
  speaking: Mic,
} as const;

// ── SummaryCard ──────────────────────────────────────────────────────────────

export function SummaryCard({ summary }: { summary: ExamInsight['summary'] }) {
  const { t } = useTranslation('exam');
  // One card, no boxes inside it: the verdict, then strengths and areas to
  // improve as two plain lists — side by side from sm up.
  return (
    <div className={`${CARD} p-4 sm:p-5 flex flex-col gap-4`}>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold text-caption uppercase tracking-[.1em] inline-flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          {t('results.summaryTitle')}
        </p>
        <p dir="auto" className="text-[14.5px] text-foreground leading-relaxed">
          <LookupText text={summary.overall_assessment} />
        </p>
      </div>
      {(summary.strengths.length > 0 || summary.areas_to_improve.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border">
          {summary.strengths.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-caption uppercase tracking-[.1em] mb-2 inline-flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3" />
                {t('strengthsLabel')}
              </p>
              <ul className="flex flex-col gap-1.5">
                {summary.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2 text-[14.5px] text-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-[3px]" />
                    <span dir="auto" className="leading-relaxed">
                      <LookupText text={s} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.areas_to_improve.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-caption uppercase tracking-[.1em] mb-2 inline-flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" />
                {t('areasToImproveLabel')}
              </p>
              <ul className="flex flex-col gap-1.5">
                {summary.areas_to_improve.map((a, i) => (
                  <li key={i} className="flex gap-2 text-[14.5px] text-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0 mt-[8px] mx-1" />
                    <span dir="auto" className="leading-relaxed">
                      <LookupText text={a} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ImprovementPlanCard ──────────────────────────────────────────────────────

const PLAN_COLLAPSED = 3;

export function ImprovementPlanCard({ plan }: { plan: string[] }) {
  const { t } = useTranslation('exam');
  const [showAll, setShowAll] = useState(false);
  if (plan.length === 0) return null;
  const shown = showAll ? plan : plan.slice(0, PLAN_COLLAPSED);
  return (
    <div className={`${CARD} p-4 sm:p-5`}>
      <p className="text-[11px] font-semibold text-caption uppercase tracking-[.1em] mb-3 inline-flex items-center gap-1.5">
        <Lightbulb className="w-3 h-3" />
        {t('improvementPlanTitle')}
      </p>
      <ol className="flex flex-col gap-3">
        {shown.map((tip, i) => (
          <li key={i} className="flex gap-3 text-[14.5px] text-foreground">
            <span className="w-7 h-7 rounded-[7px] bg-muted text-foreground text-[12.5px] font-bold flex items-center justify-center shrink-0 tabular-nums">
              {i + 1}
            </span>
            <span dir="auto" className="leading-relaxed self-center">
              <LookupText text={tip} />
            </span>
          </li>
        ))}
      </ol>
      {plan.length > PLAN_COLLAPSED && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 h-8 px-3 rounded-[8px] text-[13px] font-semibold text-foreground bg-muted hover:bg-muted"
        >
          {showAll ? t('results.showLess') : t('results.showAllSteps', { count: plan.length })}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${showAll ? 'rotate-180' : ''}`}
          />
        </button>
      )}
    </div>
  );
}

// ── McqInsightSection ────────────────────────────────────────────────────────
//
// One card for the section (title, count, strategy, the repeated trap), then
// one card per missed question — siblings, never a card inside a card.
//
// Direction: the question, the options, the passage quote and every
// explanation come from the exam and are English, so each carries its own
// dir="ltr" + text-left and the card flows RTL around them in fa/ar. Nothing
// inside those islands uses an `rtl:` variant: in Tailwind 3 it matches every
// descendant of [dir=rtl] and would leak into the island.

/** Small block label — the same style SummaryCard uses. */
export const LABEL = 'text-[11px] font-semibold text-caption uppercase tracking-[.1em]';
const INSIGHT_CARD = `bg-card border border-border rounded-[9px] shadow-sm`;
/** One English paragraph inside a card that may be RTL. */
export const EN_TEXT = 'text-left text-[14px] text-foreground leading-relaxed';

/** What core writes into user_choice for a blank answer (exam insight / public demo). */
const NO_ANSWER = new Set(['(not answered)', '(no answer)']);

export function McqInsightSection({
  data,
  sectionType,
  explainedInCard,
}: {
  data: InsightMcqSection;
  sectionType: 'listening' | 'reading';
  /** Answer keys whose explanation is in the review card already: no second card here. */
  explainedInCard?: Set<string>;
}) {
  const { t } = useTranslation('exam');
  const labels = useInsightLabels();
  const Icon = SECTION_ICONS[sectionType];
  const tone = SECTION_TONES[sectionType];
  const title =
    sectionType === 'listening' ? t('listeningWrongAnalysis') : t('readingWrongAnalysis');

  // Group the per-question analyses by part so the insight mirrors the review
  // tabs (Part 1 · Part 2 · …) instead of one flat, undifferentiated list.
  const groups = new Map<number, InsightMcqQuestionAnalysis[]>();
  for (const qa of data.question_analyses) {
    if (explainedInCard?.has(`part_${qa.part_index ?? 0}_q_${qa.question_index}`)) continue;
    const key = qa.part_index ?? 0;
    const arr = groups.get(key) ?? [];
    arr.push(qa);
    groups.set(key, arr);
  }
  const partGroups = [...groups.entries()].sort((a, b) => a[0] - b[0]);

  // Only the first N wrong answers get an individual LLM explanation
  // (capped backend-side). When fewer than the true wrong_count are shown, say
  // so instead of silently presenting a partial list as the whole story.
  const shown = data.question_analyses.length;
  const capped = shown < data.wrong_count;

  // "6 of your 9 mistakes were the same trap" — the one lesson the closed trap
  // labels exist for. A trap seen once is not a pattern, so it needs two.
  // Absent on live-AI analyses and on sessions cached before the catalogue.
  const topTrap = data.patterns?.top_traps?.[0];
  const repeatedTrap = topTrap && topTrap.count >= 2 ? topTrap : null;
  const drill = data.patterns?.techniques_to_drill ?? [];
  // A section served wholly from the catalogue has its strategy line written
  // from that same top trap, in English — showing both says it twice.
  const showStrategy = !!data.section_strategy && !(repeatedTrap && data._fully_pregenerated);

  return (
    <div className="flex flex-col gap-4">
      <div className={`${INSIGHT_CARD} p-4 sm:p-5 flex flex-col gap-3`}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[14px] font-bold text-foreground inline-flex items-center gap-2">
            <span
              className={`w-7 h-7 rounded-[7px] ${tone.bg} flex items-center justify-center shrink-0`}
            >
              <Icon className={`w-4 h-4 ${tone.text}`} />
            </span>
            {title}
          </h3>
          <span
            className={`text-[11.5px] tabular-nums font-semibold px-2 py-[3px] rounded-[7px] shrink-0 ${tone.bg} ${tone.text}`}
          >
            {t('wrongCountBadge', { wrong: data.wrong_count, total: data.total_count })}
          </span>
        </div>
        {showStrategy && (
          <p dir="ltr" className="text-left text-[13.5px] text-muted-foreground leading-relaxed">
            <LookupText text={data.section_strategy} />
          </p>
        )}
        {repeatedTrap && (
          <p className="flex items-start gap-2 text-[14px] text-foreground leading-relaxed">
            <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0 mt-[9px]" />
            <span>
              {t('insightQa.commonTrap', {
                count: repeatedTrap.count,
                wrong: data.wrong_count,
                trap: labels.trap(repeatedTrap.trap_type),
              })}
            </span>
          </p>
        )}
        {drill.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className={LABEL}>{t('insightQa.techniquesToPractise')}</p>
            <div className="flex flex-wrap gap-1.5">
              {drill.map((d) => (
                <span
                  key={d.technique}
                  className="text-[13px] text-primary bg-primary/[0.12] rounded-[7px] px-2.5 py-1"
                >
                  {labels.technique(d.technique)}
                </span>
              ))}
            </div>
          </div>
        )}
        {data.question_analyses.length === 0 ? (
          <p className="inline-flex items-center gap-2 text-[14px] font-semibold text-success">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {t('allCorrectLabel')}
          </p>
        ) : (
          capped && (
            <p className="flex items-start gap-1.5 text-[12.5px] text-muted-foreground leading-relaxed">
              <Info className="w-3.5 h-3.5 text-caption shrink-0 mt-0.5" />
              {t('insightAnalyzedNote', { shown, total: data.wrong_count })}
            </p>
          )
        )}
      </div>

      {partGroups.map(([partIndex, items]) => (
        <div key={partIndex} className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-0.5">
            <h4 className={`text-[10.5px] font-bold uppercase tracking-[.12em] ${tone.text}`}>
              {t('part')} {partIndex + 1}
            </h4>
            <span className="text-[10px] text-caption tabular-nums">· {items.length}</span>
            <span className="flex-1 h-px bg-muted" />
          </div>
          {items.map((qa, i) => (
            <QaCard key={i} qa={qa} sectionType={sectionType} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── QaCard (one missed question) ─────────────────────────────────────────────
//
// What happened (question, your answer, the right one), then why: the
// sentence in the passage that settles it, why the option you picked fails,
// why the key is right, what to do next time, and the word that decided it.
// Everything after why_correct / strategy_tip comes only from the
// pre-generated catalogue, so each block renders only when its field is there
// and older reports keep their two-paragraph shape.
//
// technique.how_to_apply and vocabulary_note.why_it_matters are left out on
// purpose: they name options by letter in the bank's order ("option C"), and
// the server only re-letters why_correct / why_your_choice_failed /
// strategy_tip for a shuffled session — which every session is — so those two
// would point at the wrong option.

function QaCard({
  qa,
  sectionType,
}: {
  qa: InsightMcqQuestionAnalysis;
  sectionType: 'listening' | 'reading';
}) {
  const { t } = useTranslation('exam');
  const labels = useInsightLabels();
  const answered = !!qa.user_choice && !NO_ANSWER.has(qa.user_choice);
  const technique = qa.technique?.name ? labels.technique(qa.technique.name) : null;
  const vocab = qa.vocabulary_note?.term && qa.vocabulary_note.gloss ? qa.vocabulary_note : null;

  return (
    <article className={`${INSIGHT_CARD} p-4 sm:p-5 flex flex-col gap-4`}>
      <p
        dir="ltr"
        className="text-left text-[14.5px] font-semibold text-foreground leading-relaxed"
      >
        <LookupText text={qa.question_text} />
      </p>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-start gap-2">
          <XCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-error">
              {t('youChoseLabel')}
            </p>
            {answered ? (
              <p dir="ltr" className={EN_TEXT}>
                <LookupText text={qa.user_choice} />
              </p>
            ) : (
              <p className="text-[14px] text-muted-foreground">{t('notAnswered')}</p>
            )}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-success">
              {t('correctLabel')}
            </p>
            <p dir="ltr" className={`${EN_TEXT} font-semibold`}>
              <LookupText text={qa.correct_choice} />
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 pt-4 border-t border-border">
        {qa.evidence_quote && (
          <figure className="flex flex-col gap-1.5">
            <figcaption className={LABEL}>
              {sectionType === 'listening'
                ? t('insightQa.fromRecording')
                : t('insightQa.fromPassage')}
            </figcaption>
            <blockquote
              dir="ltr"
              className={`${EN_TEXT} italic border-l-[3px] border-primary/50 pl-3`}
            >
              <span aria-hidden="true">“</span>
              <LookupText text={qa.evidence_quote} />
              <span aria-hidden="true">”</span>
            </blockquote>
          </figure>
        )}

        {qa.why_your_choice_failed && (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className={LABEL}>{t('insightQa.whyYourChoiceFailed')}</p>
              {qa.trap_type && (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                  {labels.trap(qa.trap_type)}
                </span>
              )}
            </div>
            <p dir="ltr" className={EN_TEXT}>
              <LookupText text={qa.why_your_choice_failed} />
            </p>
          </div>
        )}

        {qa.why_correct && (
          <div className="flex flex-col gap-1">
            <p className={LABEL}>{t('insightQa.whyCorrect')}</p>
            <p dir="ltr" className={EN_TEXT}>
              <LookupText text={qa.why_correct} />
            </p>
          </div>
        )}

        {(qa.strategy_tip || technique) && (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className={`${LABEL} inline-flex items-center gap-1.5`}>
                <Lightbulb className="w-3 h-3" />
                {t('insightQa.nextTime')}
              </p>
              {technique && (
                <span className="text-[12px] font-semibold text-primary bg-primary/[0.12] rounded-[7px] px-2 py-0.5">
                  {technique}
                </span>
              )}
            </div>
            {qa.strategy_tip && (
              <p dir="ltr" className={EN_TEXT}>
                <LookupText text={qa.strategy_tip} />
              </p>
            )}
          </div>
        )}

        {vocab && (
          <div className="flex flex-col gap-1">
            <p className={LABEL}>{t('insightQa.wordToKnow')}</p>
            <p dir="ltr" className={EN_TEXT}>
              <LookupText text={vocab.term} className="font-semibold" />
              <span className="text-caption"> — </span>
              <LookupText text={vocab.gloss} />
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

// ── TaskCorrections ──────────────────────────────────────────────────────────

const COLLAPSED_COUNT = 3;

/**
 * One writing or speaking task's corrections, shown inside that task's card.
 * Flat on purpose: a divided list, not a box per correction with a box for its
 * explanation — three nested frames per sentence ate a phone's width and made
 * eight tasks of corrections a scroll without end. The first few show; the rest
 * are one tap away.
 */
export function TaskCorrections({ task }: { task: InsightWritingTask | InsightSpeakingTask }) {
  const { t } = useTranslation('exam');
  const [showAll, setShowAll] = useState(false);
  const isSpeaking = 'fluency_notes' in task;
  const note = isSpeaking ? task.fluency_notes : (task as InsightWritingTask).structure_note;
  const vocab = isSpeaking
    ? task.vocabulary_improvements.map((v) => ({ from: v.used, to: v.suggested }))
    : (task as InsightWritingTask).vocabulary_suggestions.map((v) => ({
        from: v.word,
        to: v.better,
      }));
  const noResponse = (task as { _no_response?: boolean })._no_response;
  const corrections = task.sentence_corrections;
  const shown = showAll ? corrections : corrections.slice(0, COLLAPSED_COUNT);

  return (
    <div className="flex flex-col gap-4">
      {note && (
        <p dir="auto" className="text-[14.5px] text-foreground leading-relaxed">
          <LookupText text={note} />
        </p>
      )}

      {corrections.length === 0 ? (
        <p className="inline-flex items-center gap-2 text-[14px] text-muted-foreground">
          {noResponse ? (
            <XCircle className="w-4 h-4 text-caption shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
          )}
          {noResponse ? t('noResponseSubmitted') : t('noGrammarErrors')}
        </p>
      ) : (
        <div>
          <ol className="divide-y divide-border">
            {shown.map((c, i) => (
              <li key={i} dir="auto" className="py-3 first:pt-0 flex flex-col gap-1.5">
                <p className="flex gap-2 text-[13.5px] text-caption leading-relaxed">
                  <XCircle className="w-3.5 h-3.5 text-error shrink-0 mt-[3px]" />
                  <span className="line-through decoration-danger-500/50">
                    <LookupText text={c.original} />
                  </span>
                </p>
                <p className="flex gap-2 text-[14.5px] text-foreground font-semibold leading-relaxed">
                  <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-[4px]" />
                  <span>
                    <LookupText text={c.corrected} />
                  </span>
                </p>
                {(c.rule || c.explanation) && (
                  <div className="ps-[22px]">
                    <p className="text-[13.5px] text-muted-foreground leading-relaxed">
                      {c.rule && <span className="font-semibold text-foreground">{c.rule} · </span>}
                      <LookupText text={c.explanation} />
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {corrections.length > COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-1 inline-flex items-center gap-1 h-8 px-3 rounded-[8px] text-[13px] font-semibold text-foreground bg-muted hover:bg-muted"
            >
              {showAll
                ? t('results.showLess')
                : t('results.showAllCorrections', { count: corrections.length })}
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${showAll ? 'rotate-180' : ''}`}
              />
            </button>
          )}
        </div>
      )}

      {vocab.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-caption uppercase tracking-[.1em] mb-2">
            {t('vocabularyShortLabel')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {vocab.map((v, i) => (
              <span key={i} dir="auto" className="text-[13px] rounded-[7px] px-2.5 py-1 bg-muted">
                <span className="text-caption line-through">{v.from}</span>
                <span className="mx-1 text-caption">→</span>
                <span className="text-foreground font-semibold">{v.to.join(' / ')}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
