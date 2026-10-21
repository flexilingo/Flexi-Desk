import { useTranslation } from 'react-i18next';
import { LookupText } from '../components/session/WordLookup';
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
} from 'lucide-react';
import type {
  ExamInsight,
  InsightMcqSection,
  InsightWritingTask,
  InsightSpeakingTask,
} from '../types';

// Every sentence of the analysis is word-clickable: `<LookupText>` renders plain
// text when no `WordLookupProvider` is above it, so these components stay usable
// anywhere.

interface SectionTone {
  text: string;
  bg: string;
  border: string;
  headerBg: string;
}

// Skill → colour identity, matching SECTION_META in shared.ts (listening=success,
// reading=accent, writing=primary, speaking=warning).
const SECTION_TONES: Record<'listening' | 'reading' | 'writing' | 'speaking', SectionTone> = {
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

const SECTION_ICONS = {
  listening: Headphones,
  reading: BookOpen,
  writing: PenLine,
  speaking: Mic,
} as const;

// ── SummaryCard ──────────────────────────────────────────────────────────────

export function SummaryCard({ summary }: { summary: ExamInsight['summary'] }) {
  const { t } = useTranslation('celpip');
  return (
    <div className="bg-accent/[0.06] border border-accent/25 rounded-[14px] p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-[10px] bg-accent/15 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-accent" />
        </div>
        <p className="text-[13px] text-foreground leading-relaxed flex-1 self-center">
          <LookupText text={summary.overall_assessment} />
        </p>
      </div>
      {(summary.strengths.length > 0 || summary.areas_to_improve.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-accent/15">
          {summary.strengths.length > 0 && (
            <div className="bg-success/[0.06] border border-success/25 rounded-[10px] p-3.5">
              <p className="text-[10px] font-bold text-success uppercase tracking-[.12em] mb-2 inline-flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3" />
                {t('strengthsLabel')}
              </p>
              <ul className="flex flex-col gap-1.5">
                {summary.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] text-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.areas_to_improve.length > 0 && (
            <div className="bg-warning/[0.06] border border-warning/25 rounded-[10px] p-3.5">
              <p className="text-[10px] font-bold text-warning uppercase tracking-[.12em] mb-2 inline-flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" />
                {t('areasToImproveLabel')}
              </p>
              <ul className="flex flex-col gap-1.5">
                {summary.areas_to_improve.map((a, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] text-foreground">
                    <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{a}</span>
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

export function ImprovementPlanCard({ plan }: { plan: string[] }) {
  const { t } = useTranslation('celpip');
  if (plan.length === 0) return null;
  return (
    <div className="bg-card border border-border rounded-[14px] p-5 shadow-sm">
      <p className="text-[10px] font-bold text-accent uppercase tracking-[.12em] mb-3 inline-flex items-center gap-1.5">
        <Lightbulb className="w-3 h-3" />
        {t('improvementPlanTitle')}
      </p>
      <ol className="flex flex-col gap-3">
        {plan.map((tip, i) => (
          <li key={i} className="flex gap-3 text-[13px] text-foreground">
            <span className="w-7 h-7 rounded-full bg-accent text-white text-[12px] font-extrabold flex items-center justify-center shrink-0 tabular-nums">
              {i + 1}
            </span>
            <span className="leading-relaxed self-center">{tip}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── McqInsightSection ────────────────────────────────────────────────────────

export function McqInsightSection({
  data,
  sectionType,
}: {
  data: InsightMcqSection;
  sectionType: 'listening' | 'reading';
}) {
  const { t } = useTranslation('celpip');
  const Icon = SECTION_ICONS[sectionType];
  const tone = SECTION_TONES[sectionType];
  const title =
    sectionType === 'listening' ? t('listeningWrongAnalysis') : t('readingWrongAnalysis');

  return (
    <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
      <div
        className={`px-5 py-3.5 ${tone.headerBg} border-b border-border flex items-center justify-between gap-3`}
      >
        <h3 className="text-[14px] font-bold text-foreground inline-flex items-center gap-2">
          <span className={`w-7 h-7 rounded-[8px] ${tone.bg} flex items-center justify-center`}>
            <Icon className={`w-4 h-4 ${tone.text}`} />
          </span>
          {title}
        </h3>
        <span
          className={`text-[11.5px] tabular-nums font-semibold px-2 py-[3px] rounded-[6px] ${tone.bg} ${tone.text}`}
        >
          {t('wrongCountBadge', { wrong: data.wrong_count, total: data.total_count })}
        </span>
      </div>
      <div className="p-5 flex flex-col gap-4">
        {data.section_strategy && (
          <p className="text-[13px] text-muted-foreground italic border-s-2 border-accent/30 ps-3 leading-relaxed">
            <LookupText text={data.section_strategy} />
          </p>
        )}
        {data.question_analyses.length === 0 ? (
          <div className="flex items-center gap-2 text-[13px] text-success font-semibold bg-success/[0.08] border border-success/30 rounded-[10px] px-4 py-3">
            <CheckCircle2 className="w-4 h-4" />
            {t('allCorrectLabel')}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {data.question_analyses.map((qa, i) => (
              <div
                key={i}
                className="rounded-[12px] border-l-[3px] border-l-warning border border-warning/25 bg-warning/[0.05] p-4 flex flex-col gap-3"
              >
                <p className="text-[13px] font-semibold text-foreground">{qa.question_text}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-start gap-2 text-[13px] bg-error/[0.08] border border-error/25 rounded-[8px] p-2.5">
                    <XCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-bold text-error uppercase tracking-wider block">
                        {t('youChoseLabel')}
                      </span>
                      <span className="text-foreground">{qa.user_choice}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-[13px] bg-success/[0.08] border border-success/25 rounded-[8px] p-2.5">
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-bold text-success uppercase tracking-wider block">
                        {t('correctLabel')}
                      </span>
                      <span className="text-foreground">{qa.correct_choice}</span>
                    </div>
                  </div>
                </div>
                <div className="bg-card border border-border rounded-[10px] px-3 py-2.5 flex flex-col gap-1.5">
                  <p className="text-[12px] text-foreground leading-relaxed">
                    <LookupText text={qa.why_correct} />
                  </p>
                  {qa.strategy_tip && (
                    <div className="flex items-start gap-1.5 pt-1.5 border-t border-border">
                      <Sparkles className="w-3 h-3 text-accent shrink-0 mt-0.5" />
                      <p className="text-[12px] text-accent leading-relaxed">
                        <LookupText text={qa.strategy_tip} />
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── WritingInsightSection ────────────────────────────────────────────────────

export function WritingInsightSection({ task }: { task: InsightWritingTask }) {
  const { t } = useTranslation('celpip');
  const noResponse = (task as InsightWritingTask & { _no_response?: boolean })._no_response;
  const tone = SECTION_TONES.writing;

  return (
    <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
      <div className={`px-5 py-3.5 ${tone.headerBg} border-b border-border`}>
        <h3 className="text-[14px] font-bold text-foreground inline-flex items-center gap-2">
          <span className={`w-7 h-7 rounded-[8px] ${tone.bg} flex items-center justify-center`}>
            <PenLine className={`w-4 h-4 ${tone.text}`} />
          </span>
          {t('writingTaskCorrections', { num: task.task_index + 1 })}
        </h3>
      </div>
      <div className="p-5 flex flex-col gap-5">
        {task.sentence_corrections.length === 0 ? (
          <div
            className={`flex items-center gap-2 text-[13px] font-semibold rounded-[10px] px-4 py-3 ${
              noResponse
                ? 'bg-muted border border-border text-muted-foreground'
                : 'bg-success/[0.08] border border-success/30 text-success'
            }`}
          >
            {noResponse ? (
              <XCircle className="w-4 h-4 text-muted-foreground" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {noResponse ? t('noResponseSubmitted') : t('noGrammarErrors')}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {task.sentence_corrections.map((c, i) => (
              <CorrectionCard
                key={i}
                original={c.original}
                corrected={c.corrected}
                rule={c.rule}
                explanation={c.explanation}
              />
            ))}
          </div>
        )}
        {task.vocabulary_suggestions.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-accent uppercase tracking-[.12em] mb-2">
              {t('vocabularyImprovementsLabel')}
            </p>
            <div className="flex flex-wrap gap-2">
              {task.vocabulary_suggestions.map((v, i) => (
                <div
                  key={i}
                  className="text-[11.5px] border border-border rounded-[8px] px-3 py-1.5 bg-muted"
                >
                  <span className="text-muted-foreground line-through">{v.word}</span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span className="text-accent font-semibold">{v.better.join(' / ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {task.structure_note && (
          <p className="text-[13px] text-muted-foreground italic border-s-2 border-primary/40 ps-3 leading-relaxed">
            <LookupText text={task.structure_note} />
          </p>
        )}
      </div>
    </div>
  );
}

// ── SpeakingInsightSection ───────────────────────────────────────────────────

export function SpeakingInsightSection({ task }: { task: InsightSpeakingTask }) {
  const { t } = useTranslation('celpip');
  const tone = SECTION_TONES.speaking;
  return (
    <div className="bg-card border border-border rounded-[14px] overflow-hidden shadow-sm">
      <div className={`px-5 py-3.5 ${tone.headerBg} border-b border-border`}>
        <h3 className="text-[14px] font-bold text-foreground inline-flex items-center gap-2">
          <span className={`w-7 h-7 rounded-[8px] ${tone.bg} flex items-center justify-center`}>
            <Mic className={`w-4 h-4 ${tone.text}`} />
          </span>
          {t('speakingTaskFeedback', { num: task.task_index + 1 })}
        </h3>
      </div>
      <div className="p-5 flex flex-col gap-5">
        {task.fluency_notes && (
          <p className="text-[13px] text-foreground leading-relaxed border-s-2 border-warning/40 ps-3">
            <LookupText text={task.fluency_notes} />
          </p>
        )}
        {task.sentence_corrections.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-accent uppercase tracking-[.12em] mb-3">
              {t('grammarCorrectionsLabel')}
            </p>
            <div className="flex flex-col gap-3">
              {task.sentence_corrections.map((c, i) => (
                <CorrectionCard
                  key={i}
                  original={c.original}
                  corrected={c.corrected}
                  rule={c.rule}
                  explanation={c.explanation}
                />
              ))}
            </div>
          </div>
        )}
        {task.vocabulary_improvements.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-accent uppercase tracking-[.12em] mb-2">
              {t('vocabularyShortLabel')}
            </p>
            <div className="flex flex-wrap gap-2">
              {task.vocabulary_improvements.map((v, i) => (
                <div
                  key={i}
                  className="text-[11.5px] border border-border rounded-[8px] px-3 py-1.5 bg-muted"
                >
                  <span className="text-muted-foreground line-through">{v.used}</span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span className="text-accent font-semibold">{v.suggested.join(' / ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CorrectionCard (shared) ──────────────────────────────────────────────────

export function CorrectionCard({
  original,
  corrected,
  rule,
  explanation,
}: {
  original: string;
  corrected: string;
  rule: string;
  explanation: string;
}) {
  return (
    <div className="rounded-[12px] border-l-[3px] border-l-error border border-error/25 bg-error/[0.04] p-4 flex flex-col gap-2.5">
      <div className="flex gap-2 text-[13px]">
        <XCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
        <span className="line-through text-muted-foreground">{original}</span>
      </div>
      <div className="flex gap-2 text-[13px]">
        <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
        <span className="text-success font-semibold">{corrected}</span>
      </div>
      <div className="bg-card border border-border rounded-[8px] px-3 py-2 flex flex-col gap-1">
        <p className="text-[11.5px] font-bold text-accent">{rule}</p>
        <p className="text-[11.5px] text-muted-foreground leading-relaxed">
          <LookupText text={explanation} />
        </p>
      </div>
    </div>
  );
}
