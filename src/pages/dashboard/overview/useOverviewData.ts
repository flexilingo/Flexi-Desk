import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';
import { getSetting } from '@/lib/tauri-bridge';
import { getReaderDocuments } from '@/pages/reader/services/readerService';
import { getLibraryCatalog, getLibraryShelf } from '@/pages/reader/services/libraryService';
import { buildReadingQueue } from '@/pages/reader/lib/queue';
import { suggestBooks } from '@/pages/reader/lib/suggest';
import { mapAchievement, type Achievement } from '../types';
import { DESK_EXAMS, isExamKey, type ExamKey, type ExamSessionLike } from './exam';
import {
  buildExamState,
  buildListening,
  buildReview,
  buildSteps,
  buildWeek,
  levelFromXp,
  readingInProgress as pickReadingInProgress,
  ymd,
} from './model';
import * as api from './services';
import { useSource } from './useSource';

const NO_SESSIONS: ExamSessionLike[] = [];

/**
 * Everything the overview shows. Each source is independent: local ones
 * (study, podcast, reader, words, activity) always load; the account's
 * (exam goal, sittings, streak, announcements) only while signed in. A source
 * that fails marks its own card; it never blanks the page.
 */
export function useOverviewData() {
  const { i18n } = useTranslation();
  const session = useAuthStore((s) => s.session);
  const authLoading = useAuthStore((s) => s.isLoading);
  const signedIn = !!session;
  const { targetLang } = useLanguageSettings();
  // One clock for the whole render pass.
  const [now] = useState(() => new Date());

  // ── Local ──
  const activityQ = useSource(api.getActivity);
  const listeningQ = useSource(api.getListening);
  const wordsQ = useSource(api.getWords);
  const decksQ = useSource(api.getDeckStatus);
  const planQ = useSource(api.getDailyPlan);
  const goalsQ = useSource(api.getGoals);
  const docsQ = useSource(() => getReaderDocuments().then((r) => r.items));
  const achievementsQ = useSource(api.refreshAchievements);
  const [level, setLevel] = useState<string | null>(null);
  useEffect(() => {
    getSetting('current_cefr_level')
      .then(setLevel)
      .catch(() => setLevel(null));
  }, []);

  // ── Account ──
  const settingsQ = useSource(api.getUserSettings, signedIn);
  const gamificationQ = useSource(api.getGamification, signedIn);
  const accuracyQ = useSource(api.getAccuracy, signedIn);
  const from = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return ymd(d);
  }, [now]);
  const cloudDaysQ = useSource(() => api.getCloudDays(from, ymd(now)), signedIn);
  const shelfQ = useSource(() => getLibraryShelf().then((r) => r.items), signedIn);

  const settings = settingsQ.data;
  const exam: ExamKey | null =
    settings && isExamKey(settings.exam_goal) ? settings.exam_goal : null;
  const examDate = settings?.exam_date ?? null;
  const sessionsQ = useSource(
    () => (exam ? api.getExamSessions(exam) : Promise.resolve(NO_SESSIONS)),
    signedIn && !!exam,
  );
  const examState = useMemo(
    () => buildExamState(exam, sessionsQ.data ?? NO_SESSIONS, examDate, now),
    [exam, sessionsQ.data, examDate, now],
  );

  const reading = useMemo(
    () => buildReadingQueue(docsQ.data ?? undefined, shelfQ.data ?? undefined),
    [docsQ.data, shelfQ.data],
  );
  const readingInProgress = useMemo(() => pickReadingInProgress(reading), [reading]);
  const listening = useMemo(() => buildListening(listeningQ.data), [listeningQ.data]);
  const review = useMemo(
    () => buildReview(decksQ.data ?? [], planQ.data),
    [decksQ.data, planQ.data],
  );

  const activity = activityQ.data;
  const week = useMemo(
    () => buildWeek(activity?.days ?? [], cloudDaysQ.data ?? [], now),
    [activity, cloudDaysQ.data, now],
  );

  const steps = useMemo(
    () =>
      buildSteps({
        exam: examState,
        hasExam: !!exam,
        practiceAvailable: !!exam && DESK_EXAMS.includes(exam),
        review,
        inProgress: listening.inProgress,
        readingInProgress,
      }),
    [examState, exam, review, listening.inProgress, readingInProgress],
  );

  // ── Starter books when there is nothing to continue ──
  const hasContinue =
    listening.inProgress.length > 0 ||
    readingInProgress.length > 0 ||
    review.dueDecks.length > 0 ||
    !!examState?.open;
  const catalogQ = useSource(
    () => getLibraryCatalog({}).then((r) => r.books),
    signedIn && !hasContinue && !shelfQ.loading,
  );
  const starterBooks = useMemo(() => {
    if (hasContinue) return [];
    const books = catalogQ.data ?? [];
    const has = (code: string | undefined) => !!code && books.some((b) => b.language === code);
    const language = has(targetLang) ? targetLang : has('en') ? 'en' : undefined;
    return suggestBooks(
      books,
      shelfQ.data ?? [],
      language,
      settings?.current_cefr_level ?? level,
      5,
    ).books;
  }, [hasContinue, catalogQ.data, shelfQ.data, targetLang, settings?.current_cefr_level, level]);

  const announcementsQ = useSource(() => api.getAnnouncements(i18n.language), signedIn);

  // ── Numbers for the header ──
  const gamification = gamificationQ.data;
  const localLevel = levelFromXp(activity?.xp_total ?? 0);
  const achievementList: Achievement[] = useMemo(
    () => (achievementsQ.data ?? []).map(mapAchievement),
    [achievementsQ.data],
  );
  const dailyGoal =
    (goalsQ.data ?? []).find((g) => g.goal_type === 'daily_minutes' && g.is_active) ?? null;

  const localReady =
    !!activity && !decksQ.loading && !listeningQ.loading && !docsQ.loading && !wordsQ.loading;
  const loading =
    authLoading ||
    (!localReady && !(activityQ.error || decksQ.error)) ||
    (signedIn && (settingsQ.loading || (!!exam && sessionsQ.loading)));
  const errors = {
    activity: activityQ.error,
    review: decksQ.error,
    listening: listeningQ.error,
    reading: docsQ.error,
    words: wordsQ.error,
    achievements: achievementsQ.error,
    exam: signedIn && (settingsQ.error || sessionsQ.error),
  };

  const reloadAll = useCallback(() => {
    for (const q of [activityQ, listeningQ, wordsQ, decksQ, planQ, goalsQ, docsQ, achievementsQ])
      q.reload();
    if (signedIn)
      for (const q of [
        settingsQ,
        gamificationQ,
        accuracyQ,
        cloudDaysQ,
        shelfQ,
        sessionsQ,
        announcementsQ,
      ])
        q.reload();
  }, [
    activityQ,
    listeningQ,
    wordsQ,
    decksQ,
    planQ,
    goalsQ,
    docsQ,
    achievementsQ,
    signedIn,
    settingsQ,
    gamificationQ,
    accuracyQ,
    cloudDaysQ,
    shelfQ,
    sessionsQ,
    announcementsQ,
  ]);

  return {
    signedIn,
    loading,
    errors,
    failed: Object.values(errors).some(Boolean),
    reloadAll,
    now,
    // account
    settings,
    settingsReload: settingsQ.reload,
    sessionsReload: sessionsQ.reload,
    exam: examState,
    examGoal: settings?.exam_goal ?? null,
    announcements: announcementsQ.data ?? [],
    goalSuggestion: gamification?.goal_suggestion ?? null,
    accuracy: accuracyQ.data,
    // header
    gamificationReady: !!activity,
    streak: Math.max(activity?.current_streak ?? 0, gamification?.current_streak ?? 0),
    bestStreak: Math.max(activity?.longest_streak ?? 0, gamification?.longest_streak ?? 0),
    level: gamification?.level ?? localLevel,
    levelIsLocal: gamification?.level == null,
    xpTotal: activity?.xp_total ?? 0,
    xpToday: activity?.xp_today ?? 0,
    achievements: achievementList.filter((a) => a.isUnlocked).length,
    achievementList,
    achievementsReload: achievementsQ.reload,
    // blocks
    steps,
    week,
    activity,
    activityReload: activityQ.reload,
    dailyGoalMinutes: dailyGoal?.target_value ?? null,
    dailyGoalId: dailyGoal?.id ?? null,
    goalsReload: goalsQ.reload,
    listening,
    reading,
    readingInProgress,
    words: wordsQ.data,
    review,
    reviewReload: decksQ.reload,
    starterBooks,
    starterLoading: !hasContinue && signedIn && catalogQ.loading,
  };
}

export type OverviewData = ReturnType<typeof useOverviewData>;
