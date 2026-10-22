import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SignInDialog } from '@/components/auth/SignInDialog';
import { InlineError } from '@/components/common/InlineError';
import { Button } from '@/components/ui/button';
import { AchievementsCard } from './AchievementsCard';
import { AnnouncementBanner, GoalSuggestionBanner } from './banners';
import { CALENDAR_ANCHOR, WeekCard } from './WeekCard';
import { CalendarHeatmap } from './CalendarHeatmap';
import { ContinueShelf } from './ContinueShelf';
import { ExamGoalPanel, ExamResultPanel, examGoalPanelMode, resultSnoozedAt } from './ExamPanels';
import { examResultOpen, type ExamGoalPanelMode } from './exam';
import { LearningPath } from './LearningPath';
import { NextStepCard } from './NextStepCard';
import { OverviewGreeting } from './OverviewGreeting';
import { OverviewSkeleton } from './OverviewSkeleton';
import { PendingReviewsWidget } from './PendingReviewsWidget';
import { SignInHint } from './parts';
import { TodayStatusBar } from './TodayStatusBar';
import { AchievementToast, StreakCelebration } from './toasts';
import { useOverviewData } from './useOverviewData';

/**
 * The overview, top to bottom, one question per block: what do I do now (next
 * step) · how did my week go · what have I built in each part of the app (the
 * learning path) · where did I leave off · the whole year. "Which exam?" takes
 * the next-step slot for people who asked for it and sits as a one-line row for
 * everyone else; signed out, a calm sign-in hint stands where the account's
 * parts would be.
 */
export function OverviewPage() {
  const { t } = useTranslation('dashboard');
  const data = useOverviewData();
  const [signInOpen, setSignInOpen] = useState(false);
  const openSignIn = useCallback(() => setSignInOpen(true), []);

  // Latched once asked: saving the answer clears exam_goal's null before the
  // practice opens, and the panel must stay put while it does.
  const [goalMode, setGoalMode] = useState<ExamGoalPanelMode | null>(null);
  const [goalDone, setGoalDone] = useState(false);
  if (goalMode === null && !data.loading && data.settings) {
    const mode = examGoalPanelMode(data.settings.exam_goal);
    if (mode) setGoalMode(mode);
  }
  const closeGoal = useCallback(() => setGoalDone(true), []);
  const goalInSlot = goalMode === 'full' && !goalDone;
  const goalRow = goalMode === 'compact' && !goalDone;
  const settings = data.settings;
  const resultOpen = examResultOpen(settings, resultSnoozedAt());

  return (
    <div
      className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 sm:gap-5"
      data-testid="overview"
    >
      <AchievementToast list={data.achievementList} ready={!data.loading} />
      <StreakCelebration streak={data.streak} ready={data.gamificationReady} />

      {data.signedIn && <AnnouncementBanner announcements={data.announcements} />}
      <OverviewGreeting data={data} />
      {data.signedIn && settings && (
        <ExamResultPanel settings={settings} onSaved={data.settingsReload} />
      )}
      {data.signedIn && (
        <GoalSuggestionBanner suggestion={data.goalSuggestion} onDone={data.reloadAll} />
      )}

      {data.failed && !data.loading && (
        <div className="flex flex-wrap items-center gap-3">
          <InlineError message={t('desk.loadErrorSome')} className="flex-1" />
          <Button variant="outline" size="sm" onClick={data.reloadAll} className="inline-flex">
            {t('desk.retry')}
          </Button>
        </div>
      )}

      {data.loading ? (
        <OverviewSkeleton />
      ) : (
        <>
          {!data.signedIn && (
            <SignInHint
              title={t('desk.examSignedOutTitle')}
              body={t('desk.examSignedOutBody')}
              onSignIn={openSignIn}
            />
          )}
          {data.signedIn && settings && goalRow && (
            <ExamGoalPanel
              compact
              settings={settings}
              onHidden={closeGoal}
              onSaved={data.settingsReload}
            />
          )}
          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            {data.signedIn && settings && goalInSlot ? (
              <ExamGoalPanel
                settings={settings}
                onHidden={closeGoal}
                onSaved={data.settingsReload}
              />
            ) : (
              <NextStepCard data={data} quiet={resultOpen} />
            )}
            <WeekCard data={data} />
          </div>
          <TodayStatusBar data={data} />
          <LearningPath data={data} onSignIn={openSignIn} />
          <ContinueShelf data={data} />
          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <AchievementsCard data={data} />
            <PendingReviewsWidget data={data} />
          </div>
          <div id={CALENDAR_ANCHOR} className="scroll-mt-6">
            <CalendarHeatmap data={data} />
          </div>
        </>
      )}
      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        onSignedIn={data.reloadAll}
        description={t('desk.examSignedOutBody')}
      />
    </div>
  );
}
