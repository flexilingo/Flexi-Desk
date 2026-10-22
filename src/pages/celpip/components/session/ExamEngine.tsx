import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, WifiOff } from 'lucide-react';
import { ExamProgress } from './ExamProgress';
import { SectionIntro } from './SectionIntro';
import { ListeningSection } from './sections/ListeningSection';
import { ReadingSection } from './sections/ReadingSection';
import { WritingSection } from './sections/WritingSection';
import SpeakingSection from './sections/SpeakingSection';
import { DevSkipButton } from './DevSkipButton';
import { ConfirmDialog } from './ConfirmDialog';
import { WordLookupProvider } from './WordLookup';
import { ExamSettingsProvider } from './ExamSettingsContext';
import { useCelpipStore } from '../../stores/celpipStore';
import { TcfListeningSection } from './tcf/TcfListeningSection';
import { TcfReadingSection } from './tcf/TcfReadingSection';
import { TcfWritingSection } from './tcf/TcfWritingSection';
import { clearDraft, loadDraft, elapsedSince } from '../../services/examDraft';
import { examBase, getExamProfile, sectionClockSeconds } from '../../examProfiles';
import { SECTION_TYPES } from '../../types';
import type { SectionType, SubmitSectionPayload } from '../../types';

/**
 * Orchestrates an exam session (CELPIP or the TCF family): gates each section
 * behind its intro, runs the four sections in canonical order, auto-completes
 * when they're done, and offers an early exit. What differs per exam type (item
 * mode, clocks, recording folder, labels) comes from the session's exam profile.
 * Data + mutations flow through `useCelpipStore`; drafts persist to SQLite so a
 * crash mid-exam loses nothing.
 */
export function ExamEngine({ sessionId: sessionIdProp }: { sessionId?: string }) {
  const params = useParams();
  const sessionId = sessionIdProp ?? params.sessionId ?? '';
  const navigate = useNavigate();
  const { t } = useTranslation('celpip');

  const detail = useCelpipStore((s) => s.detail);
  const isDetailLoading = useCelpipStore((s) => s.isDetailLoading);
  const storeError = useCelpipStore((s) => s.error);
  const isSubmitting = useCelpipStore((s) => s.isSubmitting);
  const isCompleting = useCelpipStore((s) => s.isCompleting);
  const submitNotice = useCelpipStore((s) => s.submitNotice);
  const fetchDetail = useCelpipStore((s) => s.fetchDetail);
  const submit = useCelpipStore((s) => s.submit);
  const complete = useCelpipStore((s) => s.complete);
  const clearDetail = useCelpipStore((s) => s.clearDetail);

  const [introShown, setIntroShown] = useState<Set<number>>(new Set());
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Learning mode: tap-to-translate is opt-in via the header switch — always-on
  // word clicks would fight selecting answer options.
  const [translateOn, setTranslateOn] = useState(false);
  // End-early flow: capture in-progress work from the draft, then force-complete.
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [endSummary, setEndSummary] = useState('');
  const [ending, setEnding] = useState(false);
  // Whether the current section has a persisted draft (async — SQLite).
  const [hasDraft, setHasDraft] = useState(false);
  // Guards the auto-complete effect from firing twice.
  const autoCompleteTriggered = useRef(false);

  // Load the session on mount, drop it on unmount.
  useEffect(() => {
    if (sessionId) fetchDetail(sessionId);
    return () => clearDetail();
  }, [sessionId, fetchDetail, clearDetail]);

  // Warn the user before leaving mid-exam.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const session = detail?.session;
  // Everything that differs per exam type. CELPIP's profile reproduces what this
  // engine did before profiles existed; an unknown type falls back to it.
  const profile = getExamProfile(session?.exam_type);
  const base = examBase(profile.examType);
  const isPractice = session?.mode === 'practice';
  // Learning mode: untimed, word-clickable, relaxed navigation.
  const learningMode = session?.practice_config?.learning_mode === true;
  const currentSectionIndex = session?.current_section ?? 0;
  const currentSectionType: SectionType | undefined = SECTION_TYPES[currentSectionIndex];
  const isCompleted = session?.status === 'completed';

  // Does the current section have a resumable draft? (drives `sectionStarted`)
  useEffect(() => {
    if (!currentSectionType) {
      setHasDraft(false);
      return;
    }
    let cancelled = false;
    loadDraft(sessionId, currentSectionType).then((d) => {
      if (!cancelled) setHasDraft(d !== null);
    });
    return () => {
      cancelled = true;
    };
  }, [currentSectionType, sessionId, currentSectionIndex]);

  // A section the server already holds has no use for its draft any more. The
  // draft is cleared only here and by the store after a confirmed submit - never
  // before, so a submit lost offline plus a restart cannot throw the answers away.
  useEffect(() => {
    if (!detail) return;
    detail.section_results.forEach((r) => {
      if (r.status !== 'pending') void clearDraft(sessionId, r.section_type);
    });
  }, [detail, sessionId]);

  // Completed sessions (incl. expired ones the backend finalized) aren't
  // resumable — send the user straight to results.
  useEffect(() => {
    if (isCompleted) navigate(`${base}/results/${sessionId}`, { replace: true });
  }, [isCompleted, navigate, sessionId, base]);

  // Auto-complete when all sections are done — there is no finish button.
  useEffect(() => {
    if (!session || isCompleting || autoCompleteTriggered.current) return;
    if (session.current_section >= SECTION_TYPES.length && session.status !== 'completed') {
      autoCompleteTriggered.current = true;
      complete(sessionId).then((ok) => {
        if (ok) navigate(`${base}/results/${sessionId}`);
        else autoCompleteTriggered.current = false;
      });
    }
  }, [session, isCompleting, sessionId, navigate, complete, base]);

  // Loading / error gates.
  if (!detail || !session) {
    if (storeError && !isDetailLoading) {
      return (
        <div className="p-8 text-center text-muted-foreground bg-background min-h-[200px] flex items-center justify-center">
          {t('sessionLoadError')}
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-64 bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  // Completed / all-done — redirect/auto-complete is in flight.
  if (isCompleted || currentSectionIndex >= SECTION_TYPES.length) {
    return (
      <div className="flex items-center justify-center min-h-[400px] bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  const sectionStatuses = detail.section_results.map((s, i) => {
    if (i === currentSectionIndex && s.status === 'pending') return 'in_progress' as const;
    return s.status;
  }) as Array<'pending' | 'scoring' | 'scored' | 'in_progress'>;

  const currentResult = detail.section_results.find((s) => s.section_type === currentSectionType);

  const sectionStarted =
    introShown.has(currentSectionIndex) ||
    (currentResult != null && currentResult.status !== 'pending') ||
    hasDraft;

  const handleSubmitSection = async (
    answers: Record<string, unknown>,
    timeSpent: number,
    transcripts?: Record<string, string>,
  ): Promise<boolean> => {
    if (!currentSectionType) return false;
    setSubmitError(null);
    const payload: SubmitSectionPayload = {
      session_id: sessionId,
      section_type: currentSectionType,
      answers,
      time_spent_sec: timeSpent,
      ...(transcripts ? { transcripts } : {}),
    };
    const ok = await submit(payload);
    if (!ok) {
      const code = useCelpipStore.getState().error;
      setSubmitError(
        code
          ? t(`errors.${code}`, { defaultValue: t('sectionSubmitError') })
          : t('sectionSubmitError'),
      );
    }
    return ok;
  };

  // Items/tasks this session holds in a section — shown on the intro of a
  // practice slice instead of the full paper's count (TCF copy only).
  const heldCount = (section: SectionType): number | undefined => {
    const set = detail.exam_set;
    if (section === 'listening') return set.listening_content?.parts?.length;
    if (section === 'reading') return set.reading_content?.parts?.length;
    if (section === 'writing') return set.writing_prompts?.tasks?.length;
    return set.speaking_prompts?.tasks?.length;
  };
  // A section clock belongs to the whole paper (TCF CO: 35 min for 39 items); a
  // practice slice gets the same pace for what it holds. Counted in the unit of
  // `sectionPartCount`: parts for CELPIP, items for TCF (one part each).
  const clockSec = (section: 'listening' | 'reading' | 'writing') =>
    sectionClockSeconds(profile, section, isPractice, heldCount(section));

  // What will actually be kept if the user ends now — precomputed (drafts are
  // async) so the confirm dialog never surprises them with an empty result.
  const openEndConfirm = async () => {
    const completedCount = detail.section_results.filter((s) => s.status !== 'pending').length;
    let currentAnswered = 0;
    if (currentSectionType) {
      const draft = await loadDraft(sessionId, currentSectionType);
      currentAnswered =
        Object.keys((draft?.answers as Record<string, unknown>) ?? {}).length +
        Object.keys(draft?.audioAnswers ?? {}).length;
    }
    setEndSummary(
      completedCount === 0 && currentAnswered === 0
        ? t('endExamNothingCaptured')
        : t('endExamCaptureSummary', { completed: completedCount, answers: currentAnswered }),
    );
    setShowEndConfirm(true);
  };

  // End early: submit whatever the current section has in its draft (partial
  // answers count), then force-complete. The backend scores the submitted
  // sections and drops untouched ones.
  const handleEndExam = async () => {
    setEnding(true);
    setSubmitError(null);
    autoCompleteTriggered.current = true; // don't race the auto-complete effect
    try {
      const currentRow = detail.section_results.find((s) => s.section_type === currentSectionType);
      if (currentSectionType && currentRow?.status === 'pending') {
        const draft = await loadDraft(sessionId, currentSectionType);
        const draftAnswers = (draft?.answers ?? {}) as Record<string, unknown>;
        const audioAnswers = draft?.audioAnswers ?? {};
        const hasProgress =
          Object.keys(draftAnswers).length > 0 || Object.keys(audioAnswers).length > 0;
        if (hasProgress) {
          const timeSpent = draft?.sectionStartedAt ? elapsedSince(draft.sectionStartedAt) : 0;
          let ok: boolean;
          if (currentSectionType === 'speaking') {
            // Audio answers win; typed/browser transcripts fill the gaps.
            const merged: Record<string, unknown> = { ...draftAnswers, ...audioAnswers };
            ok = await submit({
              session_id: sessionId,
              section_type: 'speaking',
              answers: merged,
              time_spent_sec: timeSpent,
              transcripts: draftAnswers as Record<string, string>,
            });
          } else {
            ok = await submit({
              session_id: sessionId,
              section_type: currentSectionType,
              answers: draftAnswers,
              time_spent_sec: timeSpent,
            });
          }
          if (!ok) throw new Error('SECTION_SUBMIT_FAILED');
        }
      }
      const completed = await complete(sessionId, true);
      if (!completed) throw new Error('COMPLETE_FAILED');
      // complete() already clears every section's draft.
      setShowEndConfirm(false);
      navigate(`${base}/results/${sessionId}`);
    } catch {
      autoCompleteTriggered.current = false;
      setSubmitError(t('sectionSubmitError'));
      setShowEndConfirm(false);
    } finally {
      setEnding(false);
    }
  };

  const renderSection = () => {
    if (!sectionStarted) {
      return (
        <SectionIntro
          sectionType={currentSectionType as SectionType}
          requiresMic={currentSectionType === 'speaking'}
          copyPrefix={profile.sectionIntroPrefix}
          copyNs={profile.ns}
          itemCount={isPractice ? heldCount(currentSectionType as SectionType) : undefined}
          onStart={() => setIntroShown((prev) => new Set([...prev, currentSectionIndex]))}
        />
      );
    }

    switch (currentSectionType) {
      case 'listening':
        if (profile.listeningMode === 'items') {
          return (
            <TcfListeningSection
              sessionId={sessionId}
              content={detail.exam_set.listening_content}
              audioUrls={detail.exam_set.audio_urls || {}}
              timeLimitSec={clockSec('listening')}
              onSubmit={(answers, time) => handleSubmitSection(answers, time)}
              isSubmitting={isSubmitting}
            />
          );
        }
        return (
          <ListeningSection
            sessionId={sessionId}
            content={detail.exam_set.listening_content}
            audioUrls={detail.exam_set.audio_urls || {}}
            learningMode={learningMode}
            pauseClockWhileAway={isPractice}
            onSubmit={(answers, time) =>
              handleSubmitSection(answers as Record<string, unknown>, time)
            }
            isSubmitting={isSubmitting}
          />
        );
      case 'reading':
        if (profile.readingMode === 'items') {
          return (
            <TcfReadingSection
              sessionId={sessionId}
              content={detail.exam_set.reading_content}
              timeLimitSec={clockSec('reading')}
              pauseClockWhileAway={isPractice}
              onSubmit={(answers, time) => handleSubmitSection(answers, time)}
              isSubmitting={isSubmitting}
            />
          );
        }
        return (
          <ReadingSection
            sessionId={sessionId}
            content={detail.exam_set.reading_content}
            learningMode={learningMode}
            onSubmit={(answers, time) =>
              handleSubmitSection(answers as Record<string, unknown>, time)
            }
            isSubmitting={isSubmitting}
          />
        );
      case 'writing':
        if (profile.writingClock === 'shared') {
          return (
            <TcfWritingSection
              sessionId={sessionId}
              prompts={detail.exam_set.writing_prompts}
              timeLimitSec={clockSec('writing')}
              pauseClockWhileAway={isPractice}
              onSubmit={(answers, time) => handleSubmitSection(answers, time)}
              isSubmitting={isSubmitting}
            />
          );
        }
        return (
          <WritingSection
            sessionId={sessionId}
            prompts={detail.exam_set.writing_prompts}
            learningMode={learningMode}
            pauseClockWhileAway={isPractice}
            onSubmit={(answers, time) =>
              handleSubmitSection(answers as Record<string, unknown>, time)
            }
            isSubmitting={isSubmitting}
          />
        );
      case 'speaking':
        // Owned by another agent — submits internally via the store, which
        // advances `current_section` and trips the auto-complete effect above.
        return (
          <SpeakingSection
            sessionId={sessionId}
            prompts={detail.exam_set.speaking_prompts}
            learningMode={learningMode}
            recordingSegment={profile.recordingSegment}
            startWithoutPrep={profile.speakingStartsWithoutPrep}
            contentLang={profile.examType === 'celpip' ? undefined : profile.contentLang}
          />
        );
      default:
        return null;
    }
  };

  const engineContent = (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background">
      <ExamProgress
        currentSection={currentSectionIndex}
        totalSections={4}
        sectionStatuses={sectionStatuses}
        onEndExam={openEndConfirm}
        sectionLabels={[
          profile.sectionShortLabels.listening,
          profile.sectionShortLabels.reading,
          profile.sectionShortLabels.writing,
          profile.sectionShortLabels.speaking,
        ]}
        translateOn={learningMode ? translateOn : undefined}
        onTranslateChange={learningMode ? setTranslateOn : undefined}
      />
      {submitNotice && (
        <div
          role="status"
          className="mx-4 mt-2 flex items-start gap-2 rounded-[10px] border border-warning/40 bg-warning/10 p-3 text-sm text-foreground"
        >
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            {submitNotice === 'offline' ? t('sectionSubmitOffline') : t('sectionSubmitUnreachable')}
          </span>
        </div>
      )}
      {submitError && (
        <div className="mx-4 mt-2 p-3 bg-error/10 border border-error/40 rounded-[10px] text-sm text-error flex items-center justify-between">
          <span>{submitError}</span>
          <button
            onClick={() => setSubmitError(null)}
            className="text-error hover:text-error/80 font-bold ms-2"
          >
            &times;
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">{renderSection()}</div>
      {!sectionStarted && currentSectionType && (
        <DevSkipButton
          label="Skip intro"
          onClick={() => setIntroShown((prev) => new Set([...prev, currentSectionIndex]))}
        />
      )}
      <ConfirmDialog
        open={showEndConfirm}
        onOpenChange={(o) => {
          if (!ending) setShowEndConfirm(o);
        }}
        variant="warning"
        title={t('endExamConfirmTitle')}
        description={endSummary}
        confirmText={t('endExamButton')}
        cancelText={t('cancel')}
        onConfirm={handleEndExam}
        isLoading={ending}
      />
    </div>
  );

  // Learning mode: every LookupText in the sections becomes word-clickable,
  // opening the shared word dialog. Normal exams render plain text.
  const withLookup = learningMode ? (
    <WordLookupProvider enabled={translateOn} contentLang={profile.contentLang}>
      {engineContent}
    </WordLookupProvider>
  ) : (
    engineContent
  );

  // Text size applies to every exam, timed or not.
  return <ExamSettingsProvider>{withLookup}</ExamSettingsProvider>;
}
