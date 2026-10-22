import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { InlineError } from '@/components/common/InlineError';
import { SignInDialog } from '@/components/auth/SignInDialog';
import { useAuthStore } from '@/stores/authStore';
import { useAiSource } from '@/stores/aiSourceStore';
import type { AiSource } from '@/lib/aiSource';
import { baseLocale } from '../lib/locale';
import { usePracticeStore, useVerbPages } from '../lib/practiceStore';
import { LEVELS, type PanelSection, type Unit } from '../lib/types';
import { AnswerStepCard, CARD, ListenTextCard, PromptCard, UnitBox } from './cards';
import { ComingSoon } from './ComingSoon';
import { LabelsProvider } from './labels';
import { PracticeSettings } from './PracticeSettings';
import {
  FilterFinishedCard,
  FinishedCard,
  Notice,
  OutcomeStrip,
  ResultCard,
  RetryBanner,
} from './results';
import { SentencesShell } from './SentencesShell';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sentence practice — the website's screen, in the app.
 *
 * See the sentence and say what it means, hear it, see the meaning and write the
 * sentence, or answer a question. After you answer, the whole sentence opens up:
 * every word, the verb's derivation, agreement, register, the rules in full. A
 * written sentence is judged by YOUR OWN AI (never the cloud, never silently) and by
 * the card's own check while it is not set up.
 */
export function PracticeScreen({ lang }: { lang: string }) {
  const { t, i18n } = useTranslation('sentences');
  const navigate = useNavigate();
  const locale = baseLocale(i18n.language);
  const session = useAuthStore((s) => s.session);
  const authLoading = useAuthStore((s) => s.isLoading);
  const [signInOpen, setSignInOpen] = useState(false);

  const s = usePracticeStore();
  const verbPages = useVerbPages();
  const { own, refresh: refreshAi } = useAiSource();
  const ownRef = useRef<AiSource>(own);
  ownRef.current = own;

  // Arriving from the record with picks («review all due», «back to practice») starts that round.
  const location = useLocation();
  const arrival = (location.state as { picks?: Record<string, string> } | null)?.picks;
  const open = usePracticeStore((x) => x.open);
  useEffect(() => {
    if (session) void open(lang, locale, arrival);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, lang, locale, open, location.key]);

  const errorText = useCallback(
    (code: string) =>
      i18n.exists(`sentences:errors.${code}`) ? t(`errors.${code}`) : t('errors.UNKNOWN_ERROR'),
    [t, i18n],
  );

  const submitWritten = async (typed: string) => {
    // The AI facts load once; an answer typed in the first seconds waits for them rather than skipping the judge.
    for (let i = 0; i < 40 && ownRef.current.kind === 'checking'; i++) await sleep(100);
    await s.submitWritten(typed, ownRef.current);
  };

  if (!session) {
    return (
      <SentencesShell>
        {authLoading ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : (
          <div className={`${CARD} mx-auto max-w-xl text-center`} data-testid="sign-in-card">
            <p className="text-lg font-bold text-foreground">{t('desk.signInTitle')}</p>
            <p className="mt-1.5 text-base text-muted-foreground">{t('desk.signInBody')}</p>
            <div className="mt-4 flex justify-center">
              <Button size="sm" onClick={() => setSignInOpen(true)}>
                <LogIn className="h-4 w-4" />
                {t('desk.signIn')}
              </Button>
            </div>
            <SignInDialog
              open={signInOpen}
              onOpenChange={setSignInOpen}
              onSignedIn={() => setSignInOpen(false)}
              description={t('desk.signInBody')}
            />
          </div>
        )}
      </SentencesShell>
    );
  }

  const { meta, step, busy } = s;
  const pickBusy = !!busy && busy.startsWith('pick:');

  if (step.k === 'notReady') {
    return (
      <SentencesShell>
        <ComingSoon loading={false} onRetry={() => void s.reload()} />
      </SentencesShell>
    );
  }

  if (!meta) {
    return (
      <SentencesShell>
        {step.k === 'notice' ? (
          <Notice
            message={errorText(step.code)}
            label={t('desk.tryAgain')}
            onAction={() => void s.reload()}
          />
        ) : (
          <div className="space-y-3" data-testid="boot">
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        )}
      </SentencesShell>
    );
  }

  const order = meta.deal.order ?? 'random';
  const unitPick = Number(meta.deal.unit);
  const level = (LEVELS as readonly string[]).includes(meta.level) ? meta.level : 'A1';
  const unitBox = (u: number | null | undefined) => {
    // The unit strip is shown wherever a unit is in play — its title is how the learner knows which unit they are inside.
    if (!(order === 'course' || (Number.isInteger(unitPick) && unitPick > 0))) return null;
    const found = meta.units.find((x: Unit) => x.unit === u);
    return found ? <UnitBox unit={found} /> : null;
  };

  const stats = s.stats;
  const dueNow = stats ? (meta.deal.dir === 'listen' ? stats.dueListen : stats.due) : 0;
  const trackRow = meta.sections.find((x) => x.track);
  const historyTo = `/sentences/${lang}/history?${new URLSearchParams({
    level,
    ...(trackRow && trackRow.value ? { path: trackRow.value } : {}),
  })}`;
  const link = 'font-semibold text-primary underline-offset-4 hover:underline';

  const trailing = (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      {stats && (
        <>
          <span data-testid="stats-line">
            {t('stats.line', { practiced: stats.practiced, learned: stats.learned })}
          </span>
          {stats.streak > 0 && (
            <>
              <span aria-hidden className="text-border">
                ·
              </span>
              <span>{t('stats.streak', { days: stats.streak, count: stats.streak })}</span>
            </>
          )}
          {(stats.practiced > 0 || (dueNow > 0 && order !== 'review')) && (
            <span aria-hidden className="h-4 w-px bg-border" />
          )}
          {dueNow > 0 && order !== 'review' && (
            <button
              type="button"
              className={link}
              onClick={() => void s.showReview()}
              data-testid="review-link"
            >
              {t('review.link', { count: dueNow })}
            </button>
          )}
          {stats.practiced > 0 && (
            <Link to={historyTo} className={link} data-testid="history-link">
              {t('history.link')}
            </Link>
          )}
        </>
      )}
      {s.score.n > 0 && (
        <span className="rounded-full bg-success/15 px-2 py-0.5 text-success" data-testid="score">
          {s.score.r}/{s.score.n}
        </span>
      )}
    </span>
  );

  const onNavigate = (_section: PanelSection, value: string) => navigate(`/sentences/${value}`);

  let body: React.ReactNode;
  switch (step.k) {
    case 'boot':
    case 'loading':
      body = <Skeleton className="h-56 w-full rounded-xl" data-testid="dealing" />;
      break;
    case 'prompt':
      body = (
        <>
          {unitBox(step.dealt.card.unit)}
          {step.retry && (
            <RetryBanner
              wrong={step.retry.wrong}
              skipped={step.retry.skipped}
              busy={busy}
              onSkip={() => void s.skip()}
            />
          )}
          <PromptCard
            dealt={step.dealt}
            lang={lang}
            busy={busy}
            plays={s.plays}
            autoPlay={s.autoPlay}
            onPlay={s.countPlay}
            onReveal={() => void s.reveal()}
            onSubmit={(typed) => void submitWritten(typed)}
          />
          {s.judging && (
            <p className="text-center text-sm text-muted-foreground" data-testid="ai-checking">
              {t('desk.aiChecking')}
            </p>
          )}
        </>
      );
      break;
    case 'listenText':
      body = (
        <>
          {unitBox(step.sentence.unit)}
          <ListenTextCard
            sentence={step.sentence}
            lang={lang}
            plays={s.plays}
            onPlay={s.countPlay}
            audio={step.dealt.audio}
            onHeard={s.hear}
          />
        </>
      );
      break;
    case 'answerStep':
      body = (
        <>
          {unitBox(step.sentence.unit)}
          <AnswerStepCard
            sentence={step.sentence}
            lang={lang}
            busy={busy}
            plays={s.plays}
            onPlay={s.countPlay}
            audio={step.dealt.audio}
            onSubmit={(typed, heard) => void s.submitQuestion(typed, heard)}
          />
        </>
      );
      break;
    case 'result':
      body = (
        <>
          {unitBox(step.sentence.unit)}
          <ResultCard
            step={step}
            lang={lang}
            locale={s.explain}
            verbPages={verbPages}
            busy={busy}
            autoPlay={s.autoPlay}
            nextLabel={t('next')}
            onNext={() => void s.next()}
            onSelf={(knew) => void s.selfGrade(knew)}
            onOwn={(right) => void s.judgeOwn(right)}
            onAiReady={() => void refreshAi()}
          />
        </>
      );
      break;
    case 'finished': {
      const nextUnit = step.nextUnit;
      const swap = (key: string, value: string) => {
        const row = meta.sections.find((x) => x.param === key);
        if (!row) return;
        void s.pick({ ...row, resets: row.resets ?? [] }, value);
      };
      body =
        step.scope === 'level' ? (
          <FinishedCard
            level={step.level}
            due={step.due}
            busy={busy}
            canReset={!!step.reset}
            onAgain={() => void s.startOver()}
            onReview={() => void s.showReview()}
          />
        ) : (
          <FilterFinishedCard
            filter={step.scope}
            unit={step.unit}
            nextUnit={nextUnit}
            nextTitle={meta.units.find((x: Unit) => x.unit === nextUnit)?.title}
            due={step.due}
            busy={busy}
            canReplay={!!step.replay}
            onNext={() => nextUnit && swap(step.scope, String(nextUnit))}
            onAll={() => swap(step.scope, '')}
            onReplay={() => void s.replay()}
            onReview={() => void s.showReview()}
          />
        );
      break;
    }
    case 'reviewEmpty': {
      const orderRow = meta.sections.find((x) => x.key === 'order');
      body = (
        <Notice
          message={t('review.empty')}
          label={t('review.back')}
          onAction={() =>
            orderRow && void s.pick({ ...orderRow, resets: [], keepsScore: false }, 'random')
          }
        />
      );
      break;
    }
    case 'empty':
      body = <Notice message={t('empty')} />;
      break;
    case 'notice':
      body = (
        <Notice
          message={errorText(step.code)}
          label={step.again === 'reload' ? t('desk.tryAgain') : t('next')}
          onAction={() => void (step.again === 'reload' ? s.reload() : s.deal())}
        />
      );
      break;
    default:
      body = null;
  }

  return (
    <SentencesShell>
      <LabelsProvider labels={meta.labels}>
        <PracticeSettings
          sections={meta.sections}
          ui={meta.ui}
          autoPlay={s.autoPlay}
          loading={pickBusy}
          trailing={trailing}
          onPick={(section, value) => void s.pick(section, value)}
          onNavigate={onNavigate}
          onAutoPlay={s.setAutoPlay}
        />
        {s.outcome && step.k === 'prompt' && <OutcomeStrip outcome={s.outcome} />}
        {s.warning && (
          <InlineError
            message={s.warning === 'NOT_SAVED' ? t('desk.notSaved') : errorText(s.warning)}
          />
        )}
        {body}
      </LabelsProvider>
    </SentencesShell>
  );
}
