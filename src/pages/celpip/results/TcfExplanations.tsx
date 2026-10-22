import { useState, type ReactNode } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { subscriptionUrl } from '@/components/layout/sidebarConfig';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Crown, Languages, Lightbulb, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { translateExplanation } from '../services/celpipCloud';
import { errorCodeOf } from '../stores/celpipStore';
import type {
  CelpipModelBand,
  ExplanationTranslationLocale,
  ServedModelTask,
  TcfExplanationEntry,
  TcfMcqExplanation,
  TcfModelBand,
} from '../types';
import { LookupText } from '../components/session/WordLookup';
import { ClampText } from './ClampText';

// TCF Canada explanations on the results page (2026-10-16).
//
// Listening/reading: under each missed item, the pre-authored explanation —
// the French sentence that settles it, why the learner's pick fails, why the
// key is right, what to do next time, the word that decided it. Writing and
// speaking: the same task answered at NCLC 5 and 7, and the steps from 5 to 7.
//
// The explanations are English; a Pro member can translate one card into the
// UI language on demand. French is the material being studied and stays
// left-to-right everywhere — inside a translation too (each «…» is isolated).
//
// Flat on purpose, like QaCard: labelled paragraphs divided by a rule, never a
// box per block. The only tinted surface is the translation under its English.

const TRANSLATABLE: readonly ExplanationTranslationLocale[] = ['fa', 'ar', 'fr', 'hi', 'zh'];
const RTL_LOCALES = new Set(['fa', 'ar']);

export const LABEL = 'text-[11px] font-semibold text-muted-foreground uppercase tracking-[.1em]';
/** One English paragraph inside a card that may be RTL. */
export const EN_TEXT = 'text-left text-[14px] text-foreground leading-relaxed';

function humanize(key: string): string {
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Trap and technique names: the translated label where we have one, else the key made readable. */
export function useInsightLabels() {
  const { t, i18n } = useTranslation('exam');
  return {
    trap: (key: string) =>
      i18n.exists(`insightQa.traps.${key}`, { ns: 'exam' })
        ? t(`insightQa.traps.${key}`)
        : humanize(key),
    technique: (key: string) =>
      i18n.exists(`insightQa.techniques.${key}`, { ns: 'exam' })
        ? t(`insightQa.techniques.${key}`)
        : humanize(key),
  };
}

/** Translations already fetched this page visit — a tab switch must not refetch. */
const translationCache = new Map<string, Record<string, string>>();

export function isTcfExplanation(
  entry: TcfExplanationEntry | undefined,
): entry is TcfMcqExplanation {
  return !!entry && !('locked' in entry && entry.locked);
}

// ── Translate on demand ──────────────────────────────────────────────────────

interface Translation {
  /** The UI language can be translated into (every UI language but English). */
  available: boolean;
  locale: string;
  dir: 'rtl' | 'ltr';
  /** The translated texts while shown, else null. */
  texts: Record<string, string> | null;
  loaded: boolean;
  shown: boolean;
  loading: boolean;
  error: string | null;
  toggle: () => void;
}

function useExplanationTranslation(
  kind: 'mcq' | 'model_answer',
  partId: string,
  questionIndex?: number,
  /** CELPIP listening / reading: the session, whose option order sets the letters. */
  sessionId?: string,
): Translation {
  const { i18n, t } = useTranslation('celpip');
  const locale = i18n.language.split('-')[0];
  const target = TRANSLATABLE.find((l) => l === locale) ?? null;
  const cacheKey = `${kind}:${partId}:${questionIndex ?? ''}:${sessionId ?? ''}:${locale}`;
  const [texts, setTexts] = useState<Record<string, string> | null>(
    () => translationCache.get(cacheKey) ?? null,
  );
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(false);

  const toggle = () => {
    if (texts) {
      setShown((s) => !s);
      return;
    }
    if (!target || isLoading) return;
    setError(null);
    setLoading(true);
    translateExplanation({
      kind,
      part_id: partId,
      locale: target,
      ...(typeof questionIndex === 'number' ? { question_index: questionIndex } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
    })
      .then((res) => {
        const got = res?.texts ?? {};
        translationCache.set(cacheKey, got);
        setTexts(got);
        setShown(true);
      })
      .catch((err: unknown) => {
        const code = errorCodeOf(err);
        setError(
          t(`errors.${code}`, { defaultValue: t('errors.UNKNOWN_ERROR', 'Something went wrong') }),
        );
      })
      .finally(() => setLoading(false));
  };

  return {
    available: target !== null,
    locale,
    dir: RTL_LOCALES.has(locale) ? 'rtl' : 'ltr',
    texts: shown ? texts : null,
    loaded: texts !== null,
    shown,
    loading: isLoading,
    error,
    toggle,
  };
}

/** The one translate button of a card, and its error underneath. */
function TranslateControl({ tr }: { tr: Translation }) {
  const { t } = useTranslation('exam');
  const label = tr.loading
    ? t('results.tcfHelp.translating')
    : !tr.loaded
      ? t('results.tcfHelp.translate')
      : tr.shown
        ? t('results.tcfHelp.hideTranslation')
        : t('results.tcfHelp.showTranslation');
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={tr.toggle}
        loading={tr.loading}
        aria-pressed={tr.loaded ? tr.shown : undefined}
        className="!shadow-none"
      >
        {!tr.loading && <Languages />}
        {label}
      </Button>
      {tr.error && (
        <p role="alert" className="text-[12.5px] text-error leading-relaxed">
          {tr.error}
        </p>
      )}
    </div>
  );
}

/**
 * The exam's own words quoted inside a translation — French «…» (TCF), English
 * '…', "…" or “…” (CELPIP) — keep their own left-to-right order. A single quote
 * opens only after a non-letter and closes only before one, so the apostrophe
 * in "isn't" or "Kevin's" is never taken for a quote.
 */
const QUOTED =
  /«[^»]*»|“[^”]*”|"[^"\n]*"|(?<![\p{L}\p{N}])'(?=\S)(?:[^'\n]|'(?=\p{L}))*?(?<=\S)'(?![\p{L}\p{N}])/gu;

function withFrenchIsolated(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  for (const m of text.matchAll(QUOTED)) {
    const at = m.index ?? 0;
    if (at > cursor) out.push(text.slice(cursor, at));
    out.push(
      <bdi key={at} dir="ltr">
        {m[0]}
      </bdi>,
    );
    cursor = at + m[0].length;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

/** One translated paragraph, in a soft box under the English it replaces. */
function TranslatedText({ tr, textKey }: { tr: Translation; textKey: string }) {
  const text = tr.texts?.[textKey];
  if (!text) return null;
  return (
    <p
      dir={tr.dir}
      lang={tr.locale}
      className="mt-2 rounded-[7px] bg-muted px-3 py-2.5 text-start text-[14px] text-foreground leading-relaxed"
    >
      {withFrenchIsolated(text)}
    </p>
  );
}

// ── Pro lock ─────────────────────────────────────────────────────────────────

/** The Pro chip ModelAnswerLadder puts on a locked band. */
export function ProTag() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[7px] bg-warning/[0.12] text-warning text-[10.5px] font-bold tracking-wide shrink-0">
      <Crown className="w-3 h-3" />
      Pro
    </span>
  );
}

/**
 * What a free account sees where Pro text would be: a few placeholder lines,
 * one sentence on what is behind them, and the way to Pro. The text itself was
 * never sent. The button is neutral: a list of missed items would otherwise be
 * a column of orange buttons.
 */
export function LockedNote({
  text,
  lines = 3,
  showCta = true,
}: {
  text: string;
  lines?: 0 | 3 | 4;
  /** False where another lock in the same block already offers Pro. */
  showCta?: boolean;
}) {
  const { t, i18n } = useTranslation('exam');
  return (
    <div className="flex flex-col items-start gap-3">
      {lines > 0 && (
        <div aria-hidden="true" className="w-full flex flex-col gap-2">
          <span className="h-2.5 w-[92%] rounded-full bg-muted" />
          <span className="h-2.5 w-[78%] rounded-full bg-muted" />
          <span className="h-2.5 w-[60%] rounded-full bg-muted" />
          {lines === 4 && <span className="h-2.5 w-[86%] rounded-full bg-muted" />}
        </div>
      )}
      <p className="flex items-start gap-1.5 text-[13.5px] text-muted-foreground leading-relaxed">
        <Lock className="w-3.5 h-3.5 text-caption shrink-0 mt-[3px]" />
        <span>{text}</span>
      </p>
      {showCta && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void openUrl(subscriptionUrl(i18n.language))}
        >
          <Crown className="w-3.5 h-3.5 text-warning" />
          {t('insightUpgradeCta')}
        </Button>
      )}
    </div>
  );
}

// ── Listening / reading: one missed item ─────────────────────────────────────

interface McqExplanationProps {
  entry: TcfExplanationEntry;
  sectionType: 'listening' | 'reading';
  /** The learner's pick (0-based, stored order); undefined when unanswered. */
  userChoice: number | undefined;
  /** The item's question_index in its content, for the translate request. */
  questionIndex?: number;
  /** The exam's language, for the quoted evidence and the key word (TCF fr, CELPIP en). */
  contentLang?: string;
  /** CELPIP: the session, sent with a translate request (its option order sets the letters). */
  sessionId?: string;
}

/**
 * The explanation under a missed item (TCF or CELPIP), inside that item's
 * card: a rule, then the blocks. A locked result gets the lock in the same place.
 */
export function TcfMcqExplanationBlock({
  entry,
  sectionType,
  userChoice,
  questionIndex,
  contentLang = 'fr',
  sessionId,
}: McqExplanationProps) {
  const { t } = useTranslation('exam');
  return (
    <div className="mt-4 pt-4 border-t border-border">
      {isTcfExplanation(entry) ? (
        <McqExplanationBody
          explanation={entry}
          sectionType={sectionType}
          userChoice={userChoice}
          questionIndex={questionIndex}
          contentLang={contentLang}
          sessionId={sessionId}
        />
      ) : (
        <LockedNote text={t('results.tcfHelp.lockedExplanation')} />
      )}
    </div>
  );
}

function McqExplanationBody({
  explanation: e,
  sectionType,
  userChoice,
  questionIndex,
  contentLang,
  sessionId,
}: {
  explanation: TcfMcqExplanation;
  sectionType: 'listening' | 'reading';
  userChoice: number | undefined;
  questionIndex?: number;
  contentLang: string;
  sessionId?: string;
}) {
  const { t } = useTranslation('exam');
  const labels = useInsightLabels();
  const tr = useExplanationTranslation('mcq', e.part_id, questionIndex, sessionId);

  // Unanswered: there is no pick to explain, only the key.
  const distractor =
    typeof userChoice === 'number'
      ? (e.distractors ?? []).find((d) => d.option_index === userChoice && d.why_it_fails)
      : undefined;
  // "Next time" reads the item's own advice; the technique's general advice
  // only stands in when the item has none.
  const nextText = e.how_to_spot_next_time || e.technique?.how_to_apply || null;
  const nextKey = e.how_to_spot_next_time ? 'how_to_spot_next_time' : 'technique_how';
  const technique = e.technique?.name ? labels.technique(e.technique.name) : null;
  const vocab = e.vocabulary_note?.term && e.vocabulary_note.gloss ? e.vocabulary_note : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Pro only — a free account's free full result comes with can_translate: false. */}
      {tr.available && e.can_translate !== false && <TranslateControl tr={tr} />}

      {e.evidence_quote && (
        <figure className="flex flex-col gap-1.5">
          <figcaption className={LABEL}>
            {sectionType === 'listening'
              ? t('insightQa.fromRecording')
              : t('insightQa.fromPassage')}
          </figcaption>
          <blockquote
            dir="ltr"
            lang={contentLang}
            className={`${EN_TEXT} italic border-l-[3px] border-primary/50 pl-3`}
          >
            <span aria-hidden="true">“</span>
            <LookupText text={e.evidence_quote} />
            <span aria-hidden="true">”</span>
          </blockquote>
        </figure>
      )}

      {distractor && (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className={LABEL}>{t('insightQa.whyYourChoiceFailed')}</p>
            {distractor.trap_type && (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                {labels.trap(distractor.trap_type)}
              </span>
            )}
          </div>
          <p dir="ltr" className={EN_TEXT}>
            {distractor.why_it_fails}
          </p>
          <TranslatedText tr={tr} textKey={`distractor_${distractor.option_index}`} />
        </div>
      )}

      {e.why_correct && (
        <div className="flex flex-col gap-1">
          <p className={LABEL}>{t('insightQa.whyCorrect')}</p>
          <p dir="ltr" className={EN_TEXT}>
            {e.why_correct}
          </p>
          <TranslatedText tr={tr} textKey="why_correct" />
        </div>
      )}

      {(nextText || technique) && (
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
          {nextText && (
            <>
              <p dir="ltr" className={EN_TEXT}>
                {nextText}
              </p>
              <TranslatedText tr={tr} textKey={nextKey} />
            </>
          )}
        </div>
      )}

      {vocab && (
        <div className="flex flex-col gap-1">
          <p className={LABEL}>{t('insightQa.wordToKnow')}</p>
          <p dir="ltr" className={EN_TEXT}>
            <span lang={contentLang}>
              <LookupText text={vocab.term} className="font-semibold" />
            </span>
            <span className="text-caption"> — </span>
            {vocab.gloss}
          </p>
          <TranslatedText tr={tr} textKey="vocabulary_gloss" />
        </div>
      )}
    </div>
  );
}

// ── Writing / speaking: model answers for one task ───────────────────────────

/** A speaking answer is a dialogue: "Examinateur : …" / "Candidat : …". */
const SPEAKER_LINE = /^\s*(Examinat(?:eur|rice)|Candidat(?:e)?)\s*:/i;
const EXAMINER_LINE = /^\s*Examinat(?:eur|rice)\s*:/i;

/**
 * A model answer's French as inline content for a whitespace-pre-wrap block:
 * line breaks kept, examiner lines of a spoken dialogue muted. Inline spans in
 * one block, so a line clamp around it still counts lines.
 */
export function ModelAnswerInline({ text }: { text: string }) {
  const lines = text.split('\n');
  if (!lines.some((l) => SPEAKER_LINE.test(l))) return <LookupText text={text} />;
  return (
    <>
      {lines.map((line, i) => (
        <span key={i} className={EXAMINER_LINE.test(line) ? 'text-caption' : undefined}>
          <LookupText text={line} />
          {i < lines.length - 1 ? '\n' : null}
        </span>
      ))}
    </>
  );
}

/** The answer as written (TCF French, CELPIP English), clamped with "show more". */
export function ModelAnswerText({
  text,
  lines = 6,
  lang = 'fr',
}: {
  text: string;
  lines?: 3 | 4 | 6;
  lang?: string;
}) {
  return (
    <ClampText
      lines={lines}
      lang={lang}
      dir="ltr"
      className="text-left text-[14.5px] text-foreground leading-relaxed whitespace-pre-wrap"
    >
      <ModelAnswerInline text={text} />
    </ClampText>
  );
}

/**
 * A task's NCLC, to pick the model answer one rung above it. TCF Canada stores
 * it per task (clb_score). TCF Québec / IRN store none — their level is a CEFR
 * letter — so the examiner's /20 is read on the same thresholds the scorer
 * uses. Only ever used to choose a rung, never shown as the learner's level.
 */
export function tcfTaskNclc(task: {
  clb_score?: number | null;
  score?: number | null;
}): number | null {
  if (typeof task.clb_score === 'number') return task.clb_score;
  const s = task.score;
  if (typeof s !== 'number' || !Number.isFinite(s)) return null;
  if (s >= 16) return 10;
  if (s >= 14) return 9;
  if (s >= 12) return 8;
  if (s >= 10) return 7;
  if (s >= 7) return 6;
  if (s >= 6) return 5;
  if (s >= 4) return 4;
  return 3; // below NCLC 4
}

/**
 * The rung to aim for: the lowest band above the learner's NCLC; at or above
 * the top band, the top band itself (it is then the reference to keep).
 */
export function tcfTargetBand(bands: number[], nclc: number | null): number | null {
  if (nclc == null || bands.length === 0) return null;
  const sorted = [...bands].sort((a, b) => a - b);
  return sorted.find((b) => b > nclc) ?? sorted[sorted.length - 1];
}

/** "5" / "7" / "9" before a French line of the steps. */
function BandTag({ nclc, higher }: { nclc: number; higher?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-[7px] text-[12px] font-bold tabular-nums shrink-0 ${
        higher ? 'bg-primary/[0.14] text-primary' : 'bg-muted text-muted-foreground'
      }`}
    >
      {nclc}
    </span>
  );
}

/** One "from band A to band B" list: the rule, then the two lines of the answers. */
function StepsList({
  title,
  steps,
  from,
  to,
  tr,
  keyPrefix,
  lang = 'fr',
}: {
  title: string;
  steps: Array<{ rule: string; lower: string; higher: string }>;
  from: number;
  to: number;
  tr: Translation;
  /** Translation key of step i: `${keyPrefix}${i}_rule`. */
  keyPrefix: string;
  /** The answers' language: TCF French, CELPIP English. */
  lang?: string;
}) {
  return (
    <section className="flex flex-col gap-3 pt-4 border-t border-border">
      <p className={LABEL}>{title}</p>
      <ol className="flex flex-col gap-4">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="w-7 h-7 rounded-[7px] bg-muted text-foreground text-[12.5px] font-bold flex items-center justify-center shrink-0 tabular-nums">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 flex flex-col gap-2">
              <div>
                <p dir="ltr" className={EN_TEXT}>
                  {step.rule}
                </p>
                <TranslatedText tr={tr} textKey={`${keyPrefix}${i}_rule`} />
              </div>
              <div dir="ltr" lang={lang} className="flex flex-col gap-1.5">
                <p className="flex items-start gap-2 text-left text-[14px] text-muted-foreground leading-relaxed">
                  <BandTag nclc={from} />
                  <span className="min-w-0 pt-0.5">
                    <LookupText text={step.lower} />
                  </span>
                </p>
                <p className="flex items-start gap-2 text-left text-[14px] text-foreground font-semibold leading-relaxed">
                  <BandTag nclc={to} higher />
                  <span className="min-w-0 pt-0.5">
                    <LookupText text={step.higher} />
                  </span>
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A band's level, whichever exam served it (TCF `nclc`, CELPIP `clb`). */
export function bandLevel(band: TcfModelBand | CelpipModelBand): number {
  return 'nclc' in band ? band.nclc : band.clb;
}

/** Strings that name the band scale: CELPIP's own (CLB) where it has one, else TCF's (NCLC). */
export function useBandHelp(exam: 'tcf' | 'celpip') {
  const { t, i18n } = useTranslation('exam');
  return (key: string, values?: Record<string, string | number>) =>
    exam === 'celpip' && i18n.exists(`results.celpipHelp.${key}`, { ns: 'exam' })
      ? t(`results.celpipHelp.${key}`, values)
      : t(`results.tcfHelp.${key}`, values);
}

interface ModelAnswersProps {
  task: ServedModelTask;
  /** The learner's band on this task (see tcfTaskNclc), when known. */
  taskBand: number | null;
  /** Which exam served it: the band name (NCLC / CLB) and the answers' language. Default TCF. */
  exam?: 'tcf' | 'celpip';
}

/**
 * One task answered at band 5 (everyone), 7 and 9 (full result), then the steps
 * from 5 to 7 and from 7 to 9 (full result). The rung just above the learner's
 * own band is marked; at or above the top rung, that rung is marked as the
 * reference. TCF's NCLC and CELPIP's CLB alike (owner, 2026-10-16).
 */
export function TcfModelAnswersBlock({ task, taskBand, exam = 'tcf' }: ModelAnswersProps) {
  const { t } = useTranslation('exam');
  const help = useBandHelp(exam);
  const lang = exam === 'celpip' ? 'en' : 'fr';
  const tr = useExplanationTranslation('model_answer', task.part_id);
  // steps_up is null exactly for free accounts.
  const isPro = task.steps_up !== null;
  const bands = (task.bands as Array<TcfModelBand | CelpipModelBand>)
    .map((b) => ({ ...b, level: bandLevel(b) }))
    .sort((a, b) => a.level - b.level);
  const lowest = bands[0]?.level;
  const target = tcfTargetBand(
    bands.map((b) => b.level),
    taskBand,
  );
  // A rung above the learner is the next step. At or above NCLC 9 there is
  // nothing higher, so 9 is the reference; while 9 is not authored yet, a
  // learner above 7 gets no mark rather than a rung below their own level.
  const targetMark: 'next' | 'reference' | null =
    target == null || taskBand == null
      ? null
      : target > taskBand
        ? 'next'
        : target >= 9
          ? 'reference'
          : null;
  const lastLocked = [...bands].reverse().find((b) => b.locked)?.level;
  const steps5 = (task.steps_up ?? []).map((s) => ({
    rule: s.rule,
    lower: s.from_5,
    higher: s.in_7,
  }));
  const steps9 = (task.steps_up_9 ?? []).map((s) => ({
    rule: s.rule,
    lower: s.from_7,
    higher: s.in_9,
  }));

  if (bands.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className={`${LABEL} pt-1`}>{t('results.tcfHelp.modelAnswersTitle')}</p>
        {isPro && tr.available && task.can_translate !== false && <TranslateControl tr={tr} />}
      </div>

      {bands.map((band, i) => {
        const isTarget = band.level === target && targetMark !== null;
        // Score unknown: every rung above the first is simply the next level.
        const isNextLevel = taskBand == null && band.level !== lowest;
        return (
          <section
            key={band.level}
            className={`flex flex-col gap-3 ${i > 0 ? 'pt-4 border-t border-border' : ''}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-[7px] bg-muted text-foreground text-[12px] font-bold tabular-nums shrink-0">
                {help('bandChip', { band: band.level })}
              </span>
              {band.locked && <ProTag />}
              {isTarget && (
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent">
                  <ArrowUpRight className="w-3 h-3 shrink-0" />
                  {targetMark === 'reference'
                    ? t('results.tcfHelp.reference')
                    : t('results.yourNextStep')}
                </span>
              )}
              {isNextLevel && (
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground">
                  <ArrowUpRight className="w-3 h-3 shrink-0" />
                  {t('results.tcfHelp.nextLevel')}
                </span>
              )}
              {!band.locked && !isTarget && !isNextLevel && band.level === lowest && (
                <span className="text-[12px] text-caption">{t('results.tcfHelp.openToAll')}</span>
              )}
            </div>

            {band.locked ? (
              // One way to Pro per block: only the last locked rung carries it.
              <LockedNote
                text={help('lockedBand', { band: band.level })}
                lines={4}
                showCta={band.level === lastLocked}
              />
            ) : (
              <>
                {band.answer && <ModelAnswerText text={band.answer} lang={lang} />}
                {band.what_sets_this_band && (
                  <div className="flex flex-col gap-1">
                    <p className={LABEL}>{help('whatSetsBand', { band: band.level })}</p>
                    <p dir="ltr" className={EN_TEXT}>
                      {band.what_sets_this_band}
                    </p>
                    <TranslatedText tr={tr} textKey={`band_${band.level}_note`} />
                  </div>
                )}
              </>
            )}
          </section>
        );
      })}

      {steps5.length > 0 && (
        <StepsList
          title={help('stepsTitle', { count: steps5.length })}
          steps={steps5}
          from={5}
          to={7}
          tr={tr}
          keyPrefix="step_"
          lang={lang}
        />
      )}
      {steps9.length > 0 && (
        <StepsList
          title={help('stepsTitle9', { count: steps9.length })}
          steps={steps9}
          from={7}
          to={9}
          tr={tr}
          keyPrefix="step9_"
          lang={lang}
        />
      )}
    </div>
  );
}
