import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  GraduationCap,
  Target,
  Shuffle,
  Clock,
  Headphones,
  BookOpen,
  PenLine,
  Mic,
  AlertCircle,
  ChevronDown,
  Check,
  TimerOff,
  Loader2,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCelpipStore } from '../../stores/celpipStore';
import { SECTION_META } from '../../results/shared';
import type { SectionType, StartPracticePayload } from '../../types';

type StartMode = 'full' | 'practice' | 'learning';

/** The exam is CELPIP General — the only exam a desk client can start. */
const EXAM_TYPE = 'celpip';

// Named parts per section — the full per-part picker lives inside this dialog
// (front folded its old /practice page in here). Labels stay English: they are
// the real CELPIP part names, not translated UI chrome.
const SECTION_PARTS: Record<SectionType, string[]> = {
  listening: [
    'Part 1 — Problem Solving',
    'Part 2 — Daily Conversation',
    'Part 3 — Information',
    'Part 4 — News Item',
    'Part 5 — Discussion',
    'Part 6 — Viewpoints',
  ],
  reading: [
    'Part 1 — Correspondence',
    'Part 2 — Diagram',
    'Part 3 — Information',
    'Part 4 — Viewpoints',
  ],
  writing: ['Task 1 — Email', 'Task 2 — Survey Response'],
  speaking: [
    'Task 1 — Giving Advice',
    'Task 2 — Personal Experience',
    'Task 3 — Describing a Scene',
    'Task 4 — Making Predictions',
    'Task 5 — Comparing & Persuading',
    'Task 6 — Difficult Situation',
    'Task 7 — Expressing Opinions',
    'Task 8 — Unusual Situation',
  ],
};

const SECTIONS: SectionType[] = ['listening', 'reading', 'writing', 'speaking'];

/**
 * Learning mode is no longer a THIRD MODE — it is a switch inside practice, the
 * same as the web dialog. As a card it asked the learner to classify themselves
 * before they had picked anything, and nobody did (zero learning sessions in the
 * 30 days to 2026-10-02). The capability is untouched: the same
 * `learning_mode: true` on the same start call, the same untimed clocks and the
 * same tap-to-translate — asked as "do you want the timer off?" after the
 * sections are chosen, which is when the question makes sense.
 */

// The mode cards, practice first — it is what learners choose and finish (330
// practice sessions against 25 full exams in the 30 days to 2026-10-02). They
// are a single-select group, so the accent marks the SELECTION, not one card.
const MODES: { key: StartMode; icon: typeof GraduationCap; recommended?: boolean }[] = [
  { key: 'practice', icon: Target, recommended: true },
  { key: 'full', icon: GraduationCap },
];

interface StartExamDialogProps {
  open: boolean;
  onClose: () => void;
}

export function StartExamDialog({ open, onClose }: StartExamDialogProps) {
  const { t } = useTranslation('celpip');
  const navigate = useNavigate();

  const {
    start,
    startPracticeSession,
    isStarting,
    error: storeError,
    clearError,
  } = useCelpipStore();

  const emptyParts = (): Record<SectionType, Set<number>> => ({
    listening: new Set(),
    reading: new Set(),
    writing: new Set(),
    speaking: new Set(),
  });

  const [mode, setMode] = useState<StartMode>('practice');
  const [noRepeat, setNoRepeat] = useState(true);
  // "Untimed, with translation" — the old Learning mode, now a practice option.
  const [untimed, setUntimed] = useState(false);
  const [selectedParts, setSelectedParts] = useState<Record<SectionType, Set<number>>>(emptyParts);
  // Practice opens with Listening unfolded, so the default mode shows its choices
  // instead of four collapsed rows above a button with nothing to start.
  const [expandedSection, setExpandedSection] = useState<SectionType | null>('listening');
  // Client-only guard message (empty selection) — distinct from a backend code.
  const [clientError, setClientError] = useState<string | null>(null);

  const totalSelected = SECTIONS.reduce((sum, key) => sum + selectedParts[key].size, 0);
  const allPartsSelected = SECTIONS.every(
    (key) => selectedParts[key].size === SECTION_PARTS[key].length,
  );

  // Reset every time the dialog opens (render-adjust pattern, matching the store's
  // own reset idiom) and drop any stale backend error left in the shared store.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setMode('practice');
      setNoRepeat(true);
      setUntimed(false);
      setSelectedParts(emptyParts());
      setExpandedSection('listening');
      setClientError(null);
      clearError();
    }
  }

  const resetErrors = () => {
    setClientError(null);
    if (storeError) clearError();
  };

  const selectMode = (m: StartMode) => {
    setMode(m);
    resetErrors();
  };

  // Section header click toggles all its parts; a chip click toggles one part.
  const toggleSection = (key: SectionType) => {
    setSelectedParts((prev) => {
      const all = SECTION_PARTS[key].map((_, i) => i);
      const allSelected = all.every((i) => prev[key].has(i));
      return { ...prev, [key]: allSelected ? new Set<number>() : new Set(all) };
    });
    resetErrors();
  };

  const togglePart = (key: SectionType, index: number) => {
    setSelectedParts((prev) => {
      const next = new Set(prev[key]);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { ...prev, [key]: next };
    });
    resetErrors();
  };

  // A backend CODE resolves via the `errors` group; anything unmapped falls back
  // to the mode's generic message. NO_SECTIONS_SELECTED / INSUFFICIENT_PARTS /
  // EXAM_COOLDOWN all live in that group.
  const resolveBackendError = (code: string | null): string | null => {
    if (!code) return null;
    const key = `errors.${code}`;
    const msg = t(key);
    if (msg !== key) return msg;
    return t(mode === 'full' ? 'startExamError' : 'startPracticeError');
  };

  const shownError = clientError ?? resolveBackendError(storeError);

  const goToSession = (sessionId: string | null) => {
    // The dialog stays open on failure (id === null): the store already holds the
    // error code and we surface it inline — never auto-close on a bad start.
    if (sessionId) {
      onClose();
      navigate(`/celpip/session/${sessionId}`);
    }
  };

  const startFull = async (learning = false) => {
    setClientError(null);
    const id = await start({
      exam_type: EXAM_TYPE,
      no_repeat: noRepeat,
      ...(learning ? { learning_mode: true } : {}),
    });
    goToSession(id);
  };

  const startPractice = async (learning = false) => {
    if (totalSelected === 0) {
      // Desk rule: the submit button is never disabled — validate on click and
      // explain inline instead.
      setClientError(t('selectSectionError'));
      return;
    }
    // A full-selection learning run goes through the full-exam path so the
    // no-repeat option keeps behaving like a real assembly.
    if (learning && allPartsSelected) {
      await startFull(true);
      return;
    }
    setClientError(null);
    const sections: StartPracticePayload['sections'] = {};
    for (const key of SECTIONS) {
      if (selectedParts[key].size > 0) {
        sections[key] = Array.from(selectedParts[key]).sort((a, b) => a - b);
      }
    }
    const id = await startPracticeSession({
      exam_type: EXAM_TYPE,
      sections,
      ...(learning ? { learning_mode: true } : {}),
    });
    goToSession(id);
  };

  const onSubmit = () => {
    if (mode === 'full') void startFull(false);
    else void startPractice(untimed);
  };

  const submitLabel = () => {
    if (isStarting) return mode === 'practice' ? t('startingPractice') : t('assembling');
    if (mode === 'practice') {
      return totalSelected > 0 ? `${t('startPractice')} (${totalSelected})` : t('startPractice');
    }
    return t('startExam');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 pb-3 pt-5 text-left">
          <DialogTitle className="text-[17px] font-bold text-foreground">
            {t('startDialogTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {/* Mode chooser */}
          <div className="flex flex-col gap-1.5">
            {MODES.map(({ key, icon: Icon, recommended }) => (
              <button
                key={key}
                type="button"
                onClick={() => selectMode(key)}
                className={`flex flex-col gap-1 rounded-[10px] border px-2.5 py-2.5 text-left transition-colors ${
                  mode === key
                    ? 'border-accent bg-accent/10'
                    : 'border-border bg-card hover:bg-muted'
                }`}
              >
                <span className="inline-flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-foreground">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${mode === key ? 'text-accent' : 'text-muted-foreground'}`}
                  />
                  {t(
                    key === 'full' ? 'fullExam' : key === 'practice' ? 'practice' : 'learningMode',
                  )}
                  {recommended && (
                    <span className="rounded-full bg-primary/[0.12] px-2 py-0.5 text-[10.5px] font-bold text-primary">
                      {t('modeRecommended')}
                    </span>
                  )}
                </span>
                <span className="text-[11.5px] leading-snug text-muted-foreground">
                  {key === 'full'
                    ? t('modeFullDesc', { duration: t('duration') })
                    : t(key === 'practice' ? 'modePracticeDesc' : 'modeLearningDesc')}
                </span>
              </button>
            ))}
          </div>

          {mode === 'full' && (
            <>
              <NoRepeatToggle checked={noRepeat} onChange={setNoRepeat} label={t('noRepeatMode')} />
              <MetaStrip duration={t('duration')} sectionsLabel={t('sections')} />
            </>
          )}

          {/* Practice: the untimed switch — the old Learning mode, asked as a
              question about THIS run. */}
          {mode === 'practice' && (
            <>
              <SwitchRow
                icon={TimerOff}
                label={t('untimedMode')}
                hint={t('untimedModeHint')}
                checked={untimed}
                onChange={setUntimed}
              />
              {/* No-repeat only means anything when the whole exam is assembled. */}
              {untimed && allPartsSelected && (
                <NoRepeatToggle
                  checked={noRepeat}
                  onChange={setNoRepeat}
                  label={t('noRepeatMode')}
                />
              )}
            </>
          )}

          {mode !== 'full' && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[12px] font-semibold text-muted-foreground">
                {t('choosePracticeSections')}
              </p>
              <div className="flex flex-col gap-1.5">
                {SECTIONS.map((key) => {
                  const Icon = SECTION_META[key].icon;
                  const parts = SECTION_PARTS[key];
                  const picked = selectedParts[key];
                  const allSelected = picked.size === parts.length;
                  const someSelected = picked.size > 0;
                  const isExpanded = expandedSection === key;
                  return (
                    <div
                      key={key}
                      className={`rounded-[10px] border transition-colors ${
                        someSelected
                          ? 'border-primary/50 bg-primary/[0.05]'
                          : 'border-border bg-card'
                      }`}
                    >
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => toggleSection(key)}
                          className="inline-flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span
                            className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors ${
                              allSelected
                                ? 'border-primary bg-primary'
                                : someSelected
                                  ? 'border-primary'
                                  : 'border-border'
                            }`}
                          >
                            {allSelected && (
                              <Check className="h-3 w-3 text-white" strokeWidth={3} />
                            )}
                            {!allSelected && someSelected && (
                              <span className="h-2 w-2 rounded-[2px] bg-primary" />
                            )}
                          </span>
                          <Icon className={`h-4 w-4 shrink-0 ${SECTION_META[key].color}`} />
                          <span className="text-[13px] font-bold text-foreground">{t(key)}</span>
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {picked.size}/{parts.length}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedSection(isExpanded ? null : key)}
                          aria-label={t('choosePracticeSections')}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted"
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                          {parts.map((label, i) => {
                            const on = picked.has(i);
                            return (
                              <button
                                key={i}
                                type="button"
                                onClick={() => togglePart(key, i)}
                                className={`inline-flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors ${
                                  on
                                    ? 'border-primary/40 bg-primary/15 text-primary'
                                    : 'border-border bg-muted text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                {on && <Check className="h-3 w-3" strokeWidth={3} />}
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {shownError && (
            <div className="flex items-center gap-2 rounded-[9px] border border-error/40 bg-error/10 px-3 py-2 text-[12.5px] text-error">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {shownError}
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-border px-5 py-3.5">
          <Button variant="default" onClick={onSubmit} disabled={isStarting}>
            {isStarting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel()}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NoRepeatToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 rounded-[9px] border border-border bg-card px-3 py-2.5"
    >
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
        <Shuffle className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}

function MetaStrip({ duration, sectionsLabel }: { duration: string; sectionsLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[12px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" />
        {duration}
      </span>
      <span className="inline-flex flex-wrap items-center gap-2">
        <span>4 {sectionsLabel}:</span>
        <span className="inline-flex items-center gap-0.5 font-semibold text-success">
          <Headphones className="h-3 w-3" /> L
        </span>
        <span className="inline-flex items-center gap-0.5 font-semibold text-accent">
          <BookOpen className="h-3 w-3" /> R
        </span>
        <span className="inline-flex items-center gap-0.5 font-semibold text-primary">
          <PenLine className="h-3 w-3" /> W
        </span>
        <span className="inline-flex items-center gap-0.5 font-semibold text-warning">
          <Mic className="h-3 w-3" /> S
        </span>
      </span>
    </div>
  );
}

/** A labelled switch with a line of explanation under it. */
function SwitchRow({
  icon: Icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: typeof TimerOff;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-start justify-between gap-3 rounded-[9px] border border-border bg-card px-3 py-2.5 text-left"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {label}
        </span>
        <span className="text-[11.5px] leading-snug text-muted-foreground">{hint}</span>
      </span>
      <span
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}
