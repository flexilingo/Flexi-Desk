import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Lightbulb, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AiSetupCard } from '@/components/ai/AiSetupCard';
import { cn } from '@/lib/utils';
import type { Step, Outcome } from '../lib/practiceStore';
import type { AnswerModel, AttemptResult, Direction, Rule } from '../lib/types';
import { hasLiaison, LIAISON_TIE } from '../lib/ipa';
import { AutoSpeak, CARD, Chip } from './cards';
import { IpaLine } from './IpaLine';
import { useLabel } from './labels';
import { SentenceAnalysis } from './SentenceAnalysis';
import { SentenceText } from './SentenceText';
import { Verdict } from './Verdict';

/** Whole days until an ISO time, at least one. */
export const daysUntil = (iso: string) =>
  Math.max(1, Math.round((Date.parse(iso) - Date.now()) / 86_400_000));

/** What an answer did to a card, in words: back in minutes, in days, or learned. */
function scheduleText(
  t: (k: string, o?: Record<string, unknown>) => string,
  s: AttemptResult,
): string {
  const days = daysUntil(s.due_at as string);
  const learnedNow = (s.box_before ?? 0) < 2 && (s.box_after ?? 0) >= 2;
  return !s.correct
    ? t('schedule.again')
    : learnedNow
      ? t('schedule.learned', { days, count: days })
      : t('schedule.later', { days, count: days });
}

/** When the card comes back. A mark, not a panel: green dot for right, ochre for wrong. */
export function ScheduleLine({ schedule }: { schedule: AttemptResult | null }) {
  const { t } = useTranslation('sentences');
  if (!schedule || schedule.status === 'NOT_REVEALED' || !schedule.due_at) return null;
  return (
    <p
      className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-base text-muted-foreground"
      data-testid="schedule"
    >
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          schedule.correct ? 'bg-success' : 'bg-warning',
        )}
      />
      {scheduleText(t, schedule)}
    </p>
  );
}

/** What the previous card's answer did, shown ON THE NEXT CARD — one strip above the next prompt. */
export function OutcomeStrip({ outcome }: { outcome: Outcome }) {
  const { t } = useTranslation('sentences');
  const { schedule, heard } = outcome;
  if (!schedule?.due_at) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-2.5" data-testid="outcome">
      <p className="flex items-center gap-2 text-base text-muted-foreground">
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            schedule.correct ? 'bg-success' : 'bg-warning',
          )}
        />
        {scheduleText(t, schedule)}
      </p>
      {/* The ear said something different from the meaning: say so, or the learner sees "you knew it" after failing to hear a word. */}
      {heard === false && (
        <p className="mt-1.5 flex items-center gap-2 text-base text-muted-foreground">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
          {t('listen.earAgain')}
        </p>
      )}
    </div>
  );
}

/** Why a written answer has no AI scorecard — and, when the AI is not set up, the way to set it up. */
export function JudgeNoteLine({
  note,
  onReady,
}: {
  note: 'not_set_up' | 'unavailable' | null;
  onReady: () => void;
}) {
  const { t } = useTranslation('sentences');
  if (!note) return null;
  if (note === 'not_set_up') {
    return (
      <div className="mt-4 space-y-2" data-testid="ai-setup">
        <p className="text-sm text-muted-foreground">{t('desk.aiSetup')}</p>
        <AiSetupCard compact onReady={onReady} />
      </div>
    );
  }
  return (
    <p className="mt-4 text-sm text-muted-foreground" data-testid="ai-fallback">
      {t('desk.aiFallback')}
    </p>
  );
}

/** How one model answer is grouped: yes / no / short, the register shown as a chip. */
function kindOf(a: AnswerModel): 'affirmative' | 'negative' | 'short' {
  if (
    a.text
      .replace(/[^\p{L}\p{N}' -]/gu, '')
      .trim()
      .split(/\s+/).length <= 3
  )
    return 'short';
  return a.polarity === 'negative' ? 'negative' : 'affirmative';
}

/** Every model answer to the question, grouped — yes, no, short. The one the learner's answer matched is marked. */
function AnswerGroups({
  answers,
  matched,
  rules,
  lang,
}: {
  answers: AnswerModel[];
  matched: number | null;
  rules: Rule[];
  lang: string;
}) {
  const { t } = useTranslation('sentences');
  const label = useLabel();
  if (!answers.length) return null;
  const titles = new Map(rules.map((r) => [r.key, r.title]));
  const groups = (['affirmative', 'negative', 'short'] as const)
    .map((kind) => ({
      kind,
      items: answers.map((a, i) => ({ a, i })).filter(({ a }) => kindOf(a) === kind),
    }))
    .filter((g) => g.items.length);

  return (
    <div className={CARD} data-testid="answer-groups">
      <p className="text-lg font-extrabold text-foreground">{t('qa.answers')}</p>
      <p className="mt-1 text-sm text-caption">{t('qa.slotsHint')}</p>
      <div className="mt-4 space-y-5">
        {groups.map((g) => (
          <section key={g.kind}>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-caption">
              {t(`qa.kinds.${g.kind}`)}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {g.items.map(({ a, i }) => (
                <li
                  key={i}
                  className={cn(
                    'rounded-lg border p-3',
                    i === matched ? 'border-success/60 bg-success/10' : 'border-border bg-muted',
                  )}
                >
                  <p dir="ltr" className="text-lg font-bold text-foreground">
                    <SentenceText text={a.text} lang={lang} />
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {a.meaning && (
                      <span className="text-base text-muted-foreground">{a.meaning}</span>
                    )}
                    {i === matched && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                        <Check className="h-3 w-3" />
                        {t('qa.yours')}
                      </span>
                    )}
                    {a.register && a.register !== 'standard' && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {label('registers', a.register)}
                      </span>
                    )}
                  </div>
                  {(a.note || a.rule_keys?.length) && (
                    <details className="mt-2">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-primary hover:underline">
                        <Lightbulb className="h-3.5 w-3.5" />
                        {t('qa.details')}
                      </summary>
                      {a.note && (
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{a.note}</p>
                      )}
                      {!!a.rule_keys?.length && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {a.rule_keys.map((k) => (
                            <span
                              key={k}
                              className="rounded-md border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground"
                            >
                              {titles.get(k) ?? k}
                            </span>
                          ))}
                        </div>
                      )}
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

type ResultStep = Extract<Step, { k: 'result' }>;

type ResultProps = {
  step: ResultStep;
  lang: string;
  /** The language the explanations are in. */
  locale: string;
  verbPages: string[];
  busy: string | null;
  autoPlay: boolean;
  nextLabel: string;
  onNext: () => void;
  onSelf: (knew: boolean) => void;
  onOwn: (right: boolean) => void;
  onAiReady: () => void;
};

/** Question and answer: the ANSWER is the card; every possible answer follows; the question's grammar is folded away. */
function QAResult({ step, lang, locale, verbPages, busy, nextLabel, onNext, onOwn }: ResultProps) {
  const { t } = useTranslation('sentences');
  const { sentence, rules, answer, answers, answerGrade } = step;
  const matched = answerGrade?.index ?? null;
  const unmatched = answerGrade?.verdict === 'unmatched';
  // The breakdown is of the QUESTION: the answers' rules stay out of it.
  const own = new Set([
    ...(sentence.rule_keys ?? []),
    ...(sentence.analysis?.tokens ?? []).flatMap((x) => x.rule_keys ?? []),
    ...(sentence.analysis?.mechanics ?? []).flatMap((x) => x.rule_keys ?? []),
  ]);
  const questionRules = rules.filter((r) => own.has(r.key));
  return (
    <>
      <div className={CARD} data-testid="qa-result">
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted px-4 py-3">
          <div className="min-w-0">
            <p dir="ltr" className="text-xl font-bold text-foreground">
              <SentenceText text={sentence.text} lang={lang} />
            </p>
            <p className="mt-0.5 text-base text-muted-foreground">{sentence.meaning}</p>
          </div>
        </div>

        <p className="mt-5 text-xs font-bold uppercase tracking-widest text-caption">
          {t('qa.yourAnswer')}
        </p>
        <p
          dir="ltr"
          lang={lang}
          className="mt-2 rounded-lg border border-border bg-card p-4 text-2xl font-bold text-foreground"
        >
          {answer || '—'}
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {answerGrade && (
            <p
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold',
                unmatched ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success',
              )}
            >
              {unmatched ? <Lightbulb className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {t(`qa.grade.${answerGrade.verdict}`)}
            </p>
          )}
          {!step.asking && (
            <Button size="sm" onClick={onNext} loading={busy === 'next'} disabled={!!busy}>
              {nextLabel}
            </Button>
          )}
        </div>

        {matched !== null && answers?.[matched] && (
          <p className="mt-3 text-base text-muted-foreground">
            {t('qa.matchedModel')}{' '}
            <span dir="ltr" className="font-bold text-foreground">
              {answers[matched].text}
            </span>
          </p>
        )}

        {/* No model matched: the learner judges, here, next to the answer. */}
        {step.asking && (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-4">
            <p className="text-base font-bold text-foreground">{t('qa.askRight')}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('qa.askRightHint')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button loading={busy === 'right'} disabled={!!busy} onClick={() => onOwn(true)}>
                <Check className="h-4 w-4" />
                {t('qa.wasRight')}
              </Button>
              <Button
                variant="outline"
                loading={busy === 'wrong'}
                disabled={!!busy}
                onClick={() => onOwn(false)}
              >
                <X className="h-4 w-4" />
                {t('qa.wasWrong')}
              </Button>
            </div>
          </div>
        )}
        <ScheduleLine schedule={step.schedule} />
      </div>

      <AnswerGroups answers={answers ?? []} matched={matched} rules={rules} lang={lang} />

      <details className={CARD}>
        <summary className="flex cursor-pointer list-none items-center justify-between text-base font-bold text-foreground">
          {t('qa.questionAnalysis')}
          <span className="text-sm font-semibold text-primary">{t('qa.open')}</span>
        </summary>
        <div className="mt-4">
          <SentenceAnalysis
            sentence={sentence}
            rules={questionRules}
            lang={lang}
            locale={locale}
            verbPages={verbPages}
          />
        </div>
      </details>
    </>
  );
}

/** The answer, and everything the card was hiding. */
export function ResultCard(props: ResultProps) {
  const { t } = useTranslation('sentences');
  const { step, lang, locale, verbPages, busy, autoPlay, nextLabel, onNext, onSelf, onAiReady } =
    props;
  const { sentence, rules, dealt, answer, grade, asking, schedule } = step;
  const dir: Direction = dealt.dir;

  // Production that misses does not move on until the sentence has been written correctly once. Reading a
  // correction is not doing it. `variant` and `exact` pass through: those ARE the sentence, in their own words.
  const next = asking ? null : (
    <Button
      size="sm"
      onClick={onNext}
      loading={busy === 'next'}
      disabled={!!busy}
      data-testid="next"
    >
      {nextLabel}
    </Button>
  );

  const nextRef = useRef(onNext);
  nextRef.current = onNext;

  // Enter moves on too — a drill is typed, and reaching for the mouse after every card is what makes it stop being a drill.
  useEffect(() => {
    if (asking || dir === 'answer') return;
    const readyAt = Date.now() + 400;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (Date.now() < readyAt) return;
      const el = e.target as HTMLElement | null;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(el.tagName)) return;
      e.preventDefault();
      nextRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [asking, dir, dealt.token]);

  if (dir === 'answer') return <QAResult {...props} />;

  return (
    <>
      <div className={CARD} data-testid="result" data-dir={dir}>
        {dir !== 'produce' ? (
          <>
            <Chip>{t(dir === 'listen' ? 'prompt.listen' : 'prompt.recognize')}</Chip>
            <div className="flex items-center justify-between gap-3">
              <p
                dir="ltr"
                className="text-3xl font-extrabold leading-relaxed text-foreground sm:text-4xl"
              >
                <SentenceText text={sentence.text} lang={lang} />
              </p>
              {next}
            </div>
            {sentence.ipa && (
              <>
                <IpaLine
                  text={sentence.text}
                  ipa={sentence.ipa}
                  className="mt-2 font-mono text-base text-caption"
                />
                {hasLiaison(sentence.text, sentence.ipa) && (
                  <p className="mt-1 text-sm text-caption">
                    <span className="font-bold text-accent">{LIAISON_TIE}</span> {t('liaisonHint')}
                  </p>
                )}
              </>
            )}
            <div className="mt-5 rounded-lg border border-border bg-muted p-4">
              <p className="text-2xl font-bold text-foreground">{sentence.meaning}</p>
              {sentence.literal && (
                <p className="mt-2 text-base text-caption">
                  {t('literal')}: {sentence.literal}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <Chip>{t('prompt.produce')}</Chip>
            <div className="flex items-center justify-between gap-3">
              <p className="text-2xl font-extrabold leading-relaxed text-foreground sm:text-3xl">
                {sentence.meaning}
              </p>
              {next}
            </div>
            <p
              dir="ltr"
              lang={lang}
              className="mt-4 min-h-[3.75rem] rounded-lg border border-border bg-muted p-4 text-xl text-muted-foreground"
            >
              {answer || '—'}
            </p>
            {grade && (
              <Verdict
                sentence={{ text: sentence.text, ipa: sentence.ipa }}
                result={grade}
                lang={lang}
              />
            )}
            {/* Heard only now: in production the sentence IS the answer. */}
            <AutoSpeak text={sentence.text} lang={lang} on={autoPlay} />
            <JudgeNoteLine note={step.judgeNote} onReady={onAiReady} />
          </>
        )}
        {asking && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-base font-bold text-foreground">{t('askKnew')}</p>
            <p className="mt-1 text-sm leading-6 text-caption">{t('askKnewHint')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                loading={busy === 'knew'}
                disabled={!!busy}
                onClick={() => onSelf(true)}
                data-testid="knew"
              >
                <Check className="h-4 w-4" />
                {t('knewIt')}
              </Button>
              <Button
                variant="outline"
                loading={busy === 'missed'}
                disabled={!!busy}
                onClick={() => onSelf(false)}
                data-testid="missed"
              >
                <X className="h-4 w-4" />
                {t('didntKnow')}
              </Button>
            </div>
          </div>
        )}
        <ScheduleLine schedule={schedule} />
      </div>

      <SentenceAnalysis
        sentence={sentence}
        rules={rules}
        lang={lang}
        locale={locale}
        verbPages={verbPages}
      />
    </>
  );
}

/**
 * Above a card that came back because it was written wrong: why it is here, and the
 * way out. The skip is offered once per sentence — a sentence skipped before comes
 * back without it, and has to be written.
 */
export function RetryBanner({
  wrong,
  skipped,
  busy,
  onSkip,
}: {
  /** Times this sentence has been written wrong, this one included. */
  wrong: number;
  /** Times it was skipped before. */
  skipped: number;
  busy: string | null;
  onSkip: () => void;
}) {
  const { t } = useTranslation('sentences');
  const locked = skipped > 0;
  return (
    <div
      data-testid="retry-banner"
      className={cn(
        'mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4',
        locked ? 'border-error/40 bg-error/10' : 'border-warning/30 bg-warning/10',
      )}
    >
      <div className="min-w-0">
        <p className="text-base font-bold text-foreground">
          {locked ? t('retry.lockedTitle', { count: Math.max(wrong, 1) }) : t('retry.title')}
        </p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {locked ? t('retry.lockedHint') : t('retry.hint')}
        </p>
      </div>
      {!locked && (
        <Button
          variant="outline"
          size="sm"
          onClick={onSkip}
          loading={busy === 'skip'}
          disabled={!!busy}
        >
          {t('retry.skip')}
        </Button>
      )}
    </div>
  );
}

/** A refusal (the daily budget, an expired card) — said plainly, with a way on. */
export function Notice({
  message,
  label,
  onAction,
  loading,
}: {
  message: string;
  label?: string;
  onAction?: () => void;
  loading?: boolean;
}) {
  return (
    <div className={cn(CARD, 'text-center')} data-testid="notice">
      <p className="text-base font-medium text-accent">{message}</p>
      {label && onAction && (
        <div className="mt-3 flex justify-center">
          <Button size="sm" onClick={onAction} loading={loading}>
            {label}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Every sentence of the level answered in this cycle. Going round again deletes nothing. */
export function FinishedCard({
  level,
  due,
  busy,
  canReset,
  onAgain,
  onReview,
}: {
  level: string;
  due: number;
  busy: string | null;
  canReset: boolean;
  onAgain: () => void;
  onReview: () => void;
}) {
  const { t } = useTranslation('sentences');
  return (
    <div className={cn(CARD, 'text-center')} data-testid="finished" data-scope="level">
      <p className="text-lg font-bold text-foreground">{t('finished.title', { level })}</p>
      <p className="mt-1.5 text-base text-muted-foreground">{t('finished.body')}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {due > 0 && (
          <Button size="sm" onClick={onReview}>
            {t('review.start', { count: due })}
          </Button>
        )}
        {canReset && (
          <Button
            size="sm"
            variant={due > 0 ? 'outline' : 'default'}
            loading={busy === 'again'}
            disabled={!!busy}
            onClick={onAgain}
          >
            <RotateCcw className="h-4 w-4" />
            {t('finished.again')}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * A FILTER ran out, not the level. What this offers is the only thing that is
 * actually next — the unit that still has cards in it. Nothing here resets the level.
 */
export function FilterFinishedCard({
  filter,
  unit,
  nextUnit,
  nextTitle,
  due,
  busy,
  canReplay,
  onNext,
  onAll,
  onReplay,
  onReview,
}: {
  filter: 'unit' | 'topic';
  unit: number | null;
  nextUnit: number | null;
  nextTitle?: string;
  due: number;
  busy: string | null;
  canReplay: boolean;
  onNext: () => void;
  onAll: () => void;
  onReplay: () => void;
  onReview: () => void;
}) {
  const { t } = useTranslation('sentences');
  const onward = filter === 'unit' && nextUnit ? nextUnit : null;
  return (
    <div className={cn(CARD, 'text-center')} data-testid="finished" data-scope={filter}>
      <p className="text-lg font-bold text-foreground">
        {filter === 'unit'
          ? t('finished.unitTitle', { unit: unit ?? '' })
          : t('finished.topicTitle')}
      </p>
      <p className="mt-1.5 text-base text-muted-foreground">
        {filter === 'unit' ? t('finished.unitBody') : t('finished.topicBody')}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {onward ? (
          <Button size="sm" onClick={onNext}>
            {t('finished.nextUnit', { unit: onward })}
          </Button>
        ) : (
          <Button size="sm" onClick={onAll}>
            {filter === 'unit' ? t('allUnits') : t('allTopics')}
          </Button>
        )}
        {canReplay && unit && (
          <Button
            size="sm"
            variant="outline"
            loading={busy === 'again'}
            disabled={!!busy}
            onClick={onReplay}
          >
            <RotateCcw className="h-4 w-4" />
            {t('finished.againUnit', { unit })}
          </Button>
        )}
        {due > 0 && (
          <Button size="sm" variant="outline" onClick={onReview}>
            {t('review.start', { count: due })}
          </Button>
        )}
      </div>
      {onward && nextTitle && <p className="mt-3 text-sm leading-6 text-caption">{nextTitle}</p>}
      {onward && (
        <p className="mt-2">
          <button
            type="button"
            onClick={onAll}
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            {t('allUnits')}
          </button>
        </p>
      )}
    </div>
  );
}
