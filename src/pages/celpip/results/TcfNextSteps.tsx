import { useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { subscriptionUrl } from '@/components/layout/sidebarConfig';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Crown, Lightbulb, Lock, Route } from 'lucide-react';
import type {
  AiTaskFeedback,
  CelpipModelAnswers,
  CelpipModelBand,
  ListeningContent,
  ReadingContent,
  SectionResult,
  SpeakingTaskContent,
  TcfExplanations,
  TcfModelAnswers,
  TcfModelBand,
} from '../types';
import { SECTION_META, type ScoreScale } from './shared';
import {
  EN_TEXT,
  LABEL,
  useInsightLabels,
  ModelAnswerInline,
  ProTag,
  bandLevel,
  isTcfExplanation,
  tcfTargetBand,
  tcfTaskNclc,
  useBandHelp,
} from './TcfExplanations';

// "Your next step" on the Overview tab — TCF, and CELPIP alike (2026-10-16).
//
// One compact card beside the score card (owner: «خیلی خیلی خلاصه … الکی پرش
// نکنی»): a row per section, nothing else.
//   - listening / reading: the two missed items at the lowest CEFR level (the
//     most learnable), one line each — the question, then the right answer;
//     on Pro a tap opens why it is right and what to do next time;
//   - writing / speaking: the two lowest-scoring tasks, each with the model
//     answer one rung above the task's band (NCLC / CLB): below 5 → 5,
//     5–6 → 7, 7–8 → 9 — two lines and "show more".
// A section with nothing to show is left out. A free account gets one short
// lock line per section, never one per item. CELPIP: a listening/reading part
// holds several questions, so its items are counted per question.

const SECTIONS = ['listening', 'reading', 'writing', 'speaking'] as const;
const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const PER_SECTION = 2;

interface TcfNextStepsProps {
  takenSections: string[];
  /** Sections still being scored: left out until their score lands. */
  pendingSkills: string[];
  sectionLabels: Record<string, string>;
  sectionResults: SectionResult[];
  listeningContent?: ListeningContent | null;
  readingContent?: ReadingContent | null;
  explanations?: TcfExplanations;
  modelAnswers?: TcfModelAnswers | CelpipModelAnswers;
  /** Speaking prompts (Pro only) — the source of a speaking task's title. */
  speakingTasks?: SpeakingTaskContent[];
  taskLabel: string;
  scale: ScoreScale;
  onOpenSkill: (skill: string) => void;
  /** get_results tcf_access / celpip_access — `free_monthly` = one of a free account's full results. */
  access?: { via: 'pro' | 'free_monthly' | null; free_remaining: number | null };
  /** Which exam: band name (NCLC / CLB), the content's language, items per part. Default TCF. */
  exam?: 'tcf' | 'celpip';
}

export function TcfNextSteps({
  takenSections,
  pendingSkills,
  sectionLabels,
  sectionResults,
  listeningContent,
  readingContent,
  explanations,
  modelAnswers,
  speakingTasks,
  taskLabel,
  scale,
  onOpenSkill,
  access,
  exam = 'tcf',
}: TcfNextStepsProps) {
  const { t } = useTranslation('exam');
  const lang = exam === 'celpip' ? 'en' : 'fr';

  const rows = SECTIONS.filter((s) => takenSections.includes(s) && !pendingSkills.includes(s))
    .map((section) => {
      const result = sectionResults.find((r) => r.section_type === section);
      if (!result) return null;
      const label = sectionLabels[section] ?? section;
      if (section === 'listening' || section === 'reading') {
        const content = section === 'listening' ? listeningContent : readingContent;
        const row = mcqRow(
          content?.parts ?? [],
          (result.answers ?? {}) as Record<string, number>,
          exam === 'celpip',
        );
        if (!row) return null;
        return (
          <McqRow
            key={section}
            section={section}
            label={label}
            {...row}
            explanations={explanations}
            onOpen={() => onOpenSkill(section)}
            lang={lang}
          />
        );
      }
      const picked = taskRows(
        result.ai_feedback?.tasks ?? [],
        modelAnswers?.[section],
        speakingTasks,
        section,
        scale,
      );
      if (picked.length === 0) return null;
      return (
        <TaskRow
          key={section}
          section={section}
          label={label}
          rows={picked}
          taskLabel={taskLabel}
          onOpen={() => onOpenSkill(section)}
          exam={exam}
        />
      );
    })
    .filter(Boolean);

  if (rows.length === 0) return null;

  return (
    <section className={`bg-card border border-border rounded-[9px] shadow-sm`}>
      <h2 className="px-4 sm:px-5 pt-3.5 pb-3 inline-flex items-center gap-2 text-[14px] font-bold text-foreground">
        <Route className="w-4 h-4 text-primary" />
        {t('results.nextSteps.title')}
      </h2>
      {access?.via === 'free_monthly' && (
        <p className="px-4 sm:px-5 -mt-1.5 pb-3 text-[12.5px] leading-relaxed text-muted-foreground">
          {t('results.nextSteps.freeMonthly')}
        </p>
      )}
      <div className="border-t border-border divide-y divide-border">{rows}</div>
    </section>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

/** The section's name — also the way into its tab. */
function SectionHead({
  section,
  label,
  caption,
  onOpen,
}: {
  section: (typeof SECTIONS)[number];
  label: string;
  caption?: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation('exam');
  const Icon = SECTION_META[section].icon;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('results.nextSteps.openSection', { section: label })}
        className="inline-flex items-center gap-1.5 -ms-1 px-1 py-0.5 rounded-[7px] text-[12.5px] font-semibold text-primary hover:text-foreground hover:bg-muted transition-colors"
      >
        <Icon className="w-3.5 h-3.5" />
        {label}
        <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
      </button>
      {caption && (
        <span className="ms-auto text-[11.5px] text-caption tabular-nums shrink-0">{caption}</span>
      )}
    </div>
  );
}

/** One short line where Pro text would be, with the way to Pro. */
function LockLine({ text }: { text: string }) {
  const { t, i18n } = useTranslation('exam');
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground leading-relaxed">
      <Lock className="w-3.5 h-3.5 text-caption shrink-0" />
      <span>{text}</span>
      <button
        type="button"
        onClick={() => void openUrl(subscriptionUrl(i18n.language))}
        className="inline-flex items-center gap-1 font-semibold text-primary hover:text-foreground underline-offset-2 hover:underline"
      >
        <Crown className="w-3.5 h-3.5 text-warning" />
        {t('insightUpgradeCta')}
      </button>
    </p>
  );
}

// ── Listening / reading ──────────────────────────────────────────────────────

type McqParts = (ListeningContent | ReadingContent)['parts'];

/** One question of a listening/reading part: TCF has one per part, CELPIP several. */
interface QuestionRef {
  pi: number;
  qi: number;
  /** Paper order across the section. */
  order: number;
}

/** The missed items worth a look, or null when nothing was missed. */
function mcqRow(parts: McqParts, answers: Record<string, number>, everyQuestion = false) {
  const levelRank = (pi: number) => {
    const i = CEFR_ORDER.indexOf((parts[pi] as { level?: string }).level ?? '');
    return i < 0 ? CEFR_ORDER.length : i;
  };
  const items: QuestionRef[] = [];
  parts.forEach((part, pi) => {
    const count = everyQuestion ? (part?.questions?.length ?? 0) : part?.questions?.[0] ? 1 : 0;
    for (let qi = 0; qi < count; qi++) items.push({ pi, qi, order: items.length });
  });
  // Unanswered counts as missed, as everywhere on this page.
  const missed = items.filter(
    ({ pi, qi }) => answers[`part_${pi}_q_${qi}`] !== parts[pi].questions[qi].correct_index,
  );
  if (missed.length === 0) return null;
  // Lowest level first (the most learnable), then paper order.
  const picked = [...missed]
    .sort((a, b) => levelRank(a.pi) - levelRank(b.pi) || a.order - b.order)
    .slice(0, PER_SECTION);
  return { parts, picked, missedCount: missed.length, total: items.length, multi: everyQuestion };
}

function McqRow({
  section,
  label,
  parts,
  picked,
  missedCount,
  total,
  multi,
  explanations,
  onOpen,
  lang,
}: {
  section: 'listening' | 'reading';
  label: string;
  parts: McqParts;
  picked: QuestionRef[];
  missedCount: number;
  total: number;
  /** CELPIP: several questions per part, numbered part.question. */
  multi: boolean;
  explanations?: TcfExplanations;
  onOpen: () => void;
  lang: string;
}) {
  const { t } = useTranslation('exam');
  const labels = useInsightLabels();
  const entries = explanations?.[section] ?? {};
  const free = explanations?.locked === true;
  // TCF keys an explanation by its part's position (one question per part);
  // CELPIP by the question's answer key (get_results celpip_explanations).
  const entryOf = ({ pi, qi }: QuestionRef) =>
    multi ? entries[`part_${pi}_q_${qi}`] : entries[String(pi)];
  // Only lock what exists: an item with no explanation authored has none on Pro either.
  const anyLocked = free && picked.some((item) => entryOf(item));

  return (
    <div className="px-4 sm:px-5 py-3 flex flex-col gap-2">
      <SectionHead
        section={section}
        label={label}
        caption={t('results.nextSteps.missedCount', { missed: missedCount, total })}
        onOpen={onOpen}
      />
      {picked.map((item) => {
        const { pi, qi } = item;
        const q = parts[pi].questions[qi];
        const entry = entryOf(item);
        const e = !free && isTcfExplanation(entry) ? entry : null;
        const nextText = e ? e.how_to_spot_next_time || e.technique?.how_to_apply || null : null;
        const technique = e?.technique?.name ? labels.technique(e.technique.name) : null;
        const lines = (
          <div className="min-w-0 flex-1">
            <p
              dir="ltr"
              lang={lang}
              className="text-left text-[13.5px] text-foreground leading-snug line-clamp-1 group-open:line-clamp-none"
            >
              <span className="text-caption tabular-nums me-1">
                {multi ? `${pi + 1}.${qi + 1}` : `${pi + 1}.`}
              </span>
              {q.question}
            </p>
            <p
              dir="ltr"
              lang={lang}
              className="mt-0.5 text-left text-[13px] font-semibold text-success leading-snug line-clamp-1 group-open:line-clamp-none"
            >
              {OPTION_LETTERS[q.correct_index] ?? q.correct_index + 1} ·{' '}
              {q.options[q.correct_index]}
            </p>
          </div>
        );
        if (!e || (!e.why_correct && !nextText)) {
          return (
            <div key={`${pi}_${qi}`} className="flex items-start gap-2">
              {lines}
            </div>
          );
        }
        return (
          <details key={`${pi}_${qi}`} className="group">
            <summary className="flex cursor-pointer list-none items-start gap-2 [&::-webkit-details-marker]:hidden">
              {lines}
              <ChevronDown className="w-4 h-4 mt-0.5 text-caption shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {e.why_correct && (
                <div className="flex flex-col gap-0.5">
                  <p className={LABEL}>{t('insightQa.whyCorrect')}</p>
                  <p dir="ltr" className={EN_TEXT}>
                    {e.why_correct}
                  </p>
                </div>
              )}
              {nextText && (
                <div className="flex flex-col gap-0.5">
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
                  <p dir="ltr" className={EN_TEXT}>
                    {nextText}
                  </p>
                </div>
              )}
            </div>
          </details>
        );
      })}
      {anyLocked && <LockLine text={t('results.nextSteps.lockedMcq')} />}
    </div>
  );
}

// ── Writing / speaking ───────────────────────────────────────────────────────

interface TaskPick {
  i: number;
  n: number;
  title?: string;
  /** TCF: the examiner's /20. */
  score: number | null;
  /** CELPIP: the task's CLB. */
  clb: number | null;
  band: (TcfModelBand | CelpipModelBand) & { level: number };
  /** The learner is already at or above this rung (band 9 and up). */
  reference: boolean;
}

/** The two lowest-scoring tasks that have a model answer to show. */
function taskRows(
  tasks: AiTaskFeedback[],
  served: TcfModelAnswers['writing'] | CelpipModelAnswers['writing'] | undefined,
  speakingTasks: SpeakingTaskContent[] | undefined,
  section: 'writing' | 'speaking',
  scale: ScoreScale,
): TaskPick[] {
  // Lowest score first; a tie keeps the earlier task. The /20 is the finer
  // measure; a task without one falls back to its band.
  const value = (task: AiTaskFeedback) =>
    typeof task.score === 'number'
      ? task.score
      : typeof task.clb_score === 'number'
        ? task.clb_score
        : Infinity;
  return tasks
    .map((task, i) => ({ task, i }))
    .sort((a, b) => value(a.task) - value(b.task) || a.i - b.i)
    .map(({ task, i }): TaskPick | null => {
      const servedTask = served?.[String(i)];
      const bands = ((servedTask?.bands ?? []) as Array<TcfModelBand | CelpipModelBand>).map(
        (b) => ({
          ...b,
          level: bandLevel(b),
        }),
      );
      const nclc = tcfTaskNclc(task);
      const target = tcfTargetBand(
        bands.map((b) => b.level),
        nclc ?? 0,
      );
      const band = bands.find((b) => b.level === target);
      if (!band) return null;
      return {
        i,
        n: Number.isInteger(task.task_index)
          ? (task.task_index as number) + 1 - scale.taskIndexBase
          : i + 1,
        title:
          servedTask?.title ||
          (section === 'speaking'
            ? speakingTasks?.find((s) => s.task_index === i)?.title
            : undefined),
        score: typeof task.score === 'number' ? task.score : null,
        clb: typeof task.clb_score === 'number' ? task.clb_score : null,
        band,
        reference: nclc != null && band.level <= nclc,
      };
    })
    .filter((r): r is TaskPick => r !== null)
    .slice(0, PER_SECTION);
}

function TaskRow({
  section,
  label,
  rows,
  taskLabel,
  onOpen,
  exam,
}: {
  section: 'writing' | 'speaking';
  label: string;
  rows: TaskPick[];
  taskLabel: string;
  onOpen: () => void;
  exam: 'tcf' | 'celpip';
}) {
  const { t } = useTranslation('exam');
  const help = useBandHelp(exam);
  const nextSteps = (key: string, values: Record<string, number>) =>
    exam === 'celpip' ? help(key, values) : t(`results.nextSteps.${key}`, values);
  const lang = exam === 'celpip' ? 'en' : 'fr';
  const anyLocked = rows.some((r) => r.band.locked);
  return (
    <div className="px-4 sm:px-5 py-3 flex flex-col gap-2.5">
      <SectionHead section={section} label={label} onOpen={onOpen} />
      {rows.map((r) => (
        <div key={r.i} className="flex flex-col gap-1">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13.5px] leading-snug">
            <span className="font-semibold text-foreground">
              {taskLabel} {r.n}
            </span>
            {r.title && (
              <>
                <span aria-hidden="true" className="text-caption">
                  ·
                </span>
                <bdi
                  dir="ltr"
                  lang={lang}
                  className="min-w-0 max-w-[14rem] truncate text-muted-foreground"
                >
                  {r.title}
                </bdi>
              </>
            )}
            {exam === 'tcf' && r.score != null && (
              <>
                <span aria-hidden="true" className="text-caption">
                  ·
                </span>
                <span className="text-muted-foreground tabular-nums">
                  <bdi dir="ltr">{r.score}/20</bdi>
                </span>
              </>
            )}
            {exam === 'celpip' && r.clb != null && (
              <>
                <span aria-hidden="true" className="text-caption">
                  ·
                </span>
                <span className="text-muted-foreground tabular-nums">
                  <bdi dir="ltr">{t('results.bandLabel', { band: r.clb })}</bdi>
                </span>
              </>
            )}
            <span aria-hidden="true" className="text-caption">
              ·
            </span>
            <span className="text-caption">
              {r.reference
                ? nextSteps('referenceBand', { band: r.band.level })
                : nextSteps('nextLevelBand', { band: r.band.level })}
            </span>
            {r.band.locked && <ProTag />}
          </p>
          {!r.band.locked && r.band.answer && (
            <AnswerPeek
              answer={r.band.answer}
              note={r.band.what_sets_this_band}
              band={r.band.level}
              exam={exam}
            />
          )}
        </div>
      ))}
      {anyLocked && (
        <LockLine
          text={exam === 'celpip' ? help('lockedTasks') : t('results.nextSteps.lockedTasks')}
        />
      )}
    </div>
  );
}

/** The answer's first two lines; "show more" opens all of it and its note. */
function AnswerPeek({
  answer,
  note,
  band,
  exam,
}: {
  answer: string;
  note?: string;
  band: number;
  exam: 'tcf' | 'celpip';
}) {
  const { t } = useTranslation('exam');
  const help = useBandHelp(exam);
  const [open, setOpen] = useState(false);
  // Closed, the peek starts at the first real sentence: two lines of
  // «Objet : …» / «Salut tout le monde,» say nothing about the level.
  const lines = answer.split('\n');
  const first = lines.findIndex((l) => l.trim().split(/\s+/).length >= 6);
  const peek = first > 0 ? lines.slice(first).join('\n') : answer;
  return (
    <div className="flex flex-col gap-1.5">
      <p
        dir="ltr"
        lang={exam === 'celpip' ? 'en' : 'fr'}
        className={`text-left text-[13.5px] text-foreground leading-relaxed whitespace-pre-wrap ${open ? '' : 'line-clamp-2'}`}
      >
        <ModelAnswerInline text={open ? answer : peek} />
      </p>
      {open && note && (
        <div className="flex flex-col gap-0.5">
          <p className={LABEL}>{help('whatSetsBand', { band })}</p>
          <p dir="ltr" className={EN_TEXT}>
            {note}
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="self-start inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
      >
        {open ? t('results.showLess') : t('results.showMore')}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
    </div>
  );
}
