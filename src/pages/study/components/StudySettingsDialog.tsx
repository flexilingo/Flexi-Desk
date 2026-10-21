import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, ListChecks, Shuffle, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { getSetting, setSetting } from '@/lib/tauri-bridge';
import { useStudyStore } from '../stores/studyStore';
import {
  ACTIVE_METHODS,
  type ActivityType,
  type DeckStatus,
  type DeckStrategy,
  type UpdateConfigBody,
} from '../types';

export type StudySettingsTab = 'pace' | 'activities' | 'prefs';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decks: DeckStatus[];
  /** Tab to land on when the dialog opens (e.g. 'activities' from the Custom chip). */
  initialTab?: StudySettingsTab;
}

const DURATION_OPTIONS = [5, 10, 15, 20, 30] as const;
const WEIGHT_STEPS = [0.5, 1, 1.5, 2, 2.5, 3] as const;
const WEIGHT_BAR_H = [
  'h-[6px]',
  'h-[9px]',
  'h-[12px]',
  'h-[15px]',
  'h-[18px]',
  'h-[21px]',
] as const;

// Per-activity segment colors for the live mix preview — literal Tailwind classes
// (never concatenated) so the content scanner emits them. Desk theme tokens only.
const ACTIVITY_SEGMENT: Record<ActivityType, string> = {
  recall: 'bg-primary',
  cloze: 'bg-success',
  type_test: 'bg-warning',
  listen_again: 'bg-info',
  synonym_discrim: 'bg-accent',
  mini_reading: 'bg-primary-light',
  use_in_sentence: 'bg-error',
  speak_test: 'bg-muted-foreground',
};

const DECK_STRATEGIES: { id: DeckStrategy; icon: LucideIcon }[] = [
  { id: 'mix', icon: Shuffle },
  { id: 'isolated', icon: ListChecks },
  { id: 'rotation', icon: RefreshCw },
];

const SRS_OPTIONS = ['leitner', 'sm2', 'fsrs'] as const;
type SrsAlgorithm = (typeof SRS_OPTIONS)[number];

export function StudySettingsDialog({ open, onOpenChange, decks, initialTab = 'pace' }: Props) {
  const { t } = useTranslation('study');
  const config = useStudyStore((s) => s.config);
  const updateConfig = useStudyStore((s) => s.updateConfig);

  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [srsAlgorithm, setSrsAlgorithm] = useState<SrsAlgorithm>('fsrs');
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsDelay, setTtsDelay] = useState(2);
  const [ttsVoice, setTtsVoice] = useState<'us' | 'uk'>('us');

  // Controlled tab, re-seeded from `initialTab` on every open — so the Custom chip
  // lands on Activities while the Settings button still opens on Pace.
  const [tab, setTab] = useState<StudySettingsTab>(initialTab);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setTab(initialTab);
  }

  // Load the settings that live outside the study config (desk `settings` table).
  useEffect(() => {
    if (!open) return;
    invoke<string>('study_get_srs_algorithm')
      .then((a) =>
        setSrsAlgorithm(
          (SRS_OPTIONS as readonly string[]).includes(a) ? (a as SrsAlgorithm) : 'fsrs',
        ),
      )
      .catch(() => {});
    getSetting('auto_tts_enabled')
      .then((v) => setTtsEnabled(v === 'true'))
      .catch(() => {});
    getSetting('auto_tts_delay_seconds')
      .then((v) => setTtsDelay(v ? Number(v) : 2))
      .catch(() => {});
    getSetting('tts_voice')
      .then((v) => setTtsVoice(v === 'uk' ? 'uk' : 'us'))
      .catch(() => {});
  }, [open]);

  // First open with an empty activity set: seed all active methods at weight 1, so
  // the mix preview and rows have something to show.
  const initialized = useRef(false);
  useEffect(() => {
    if (!open || !config || initialized.current) return;
    initialized.current = true;
    if (!config.enabled_activities?.length) {
      updateConfig({
        enabled_activities: ACTIVE_METHODS,
        activity_weights: Object.fromEntries(ACTIVE_METHODS.map((a) => [a, 1])),
      });
    }
  }, [open, config, updateConfig]);

  const isSaving = (key: string) => savingKeys.has(key);

  const withSaving = async (key: string, fn: () => Promise<unknown>) => {
    setSavingKeys((prev) => new Set(prev).add(key));
    setError(null);
    try {
      await fn();
    } catch {
      setError(t('settings.errorSaving'));
    } finally {
      setSavingKeys((prev) => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });
    }
  };

  const saveConfig = (key: string, patch: UpdateConfigBody) =>
    withSaving(key, () => updateConfig(patch));

  // Live mix preview — enabled activities' weights normalized into shares, so the
  // user can *see* what the toggles/weights below add up to.
  const enabledForMix = ACTIVE_METHODS.filter((a) =>
    config?.enabled_activities?.length ? config.enabled_activities.includes(a) : true,
  );
  const mixTotal = enabledForMix.reduce((s, a) => s + (config?.activity_weights?.[a] ?? 1), 0);
  const mixShares =
    mixTotal > 0
      ? enabledForMix.map((a) => ({
          activity: a,
          share: (100 * (config?.activity_weights?.[a] ?? 1)) / mixTotal,
        }))
      : [];

  // Decks the learner switched OFF — a hard exclusion from every daily plan,
  // stored separately from deck_weights (whose lowest step is 0.5×, and which
  // the backend only reads as a soft priority term) so a deck's tuned weight
  // survives being switched off and back on.
  const disabledDecks = new Set(config?.disabled_deck_ids ?? []);
  const isDeckOn = (deckId: string) => !disabledDecks.has(deckId);
  const anyDeckOff = decks.some((d) => !isDeckOn(d.deck_id));
  const allDecksOff = decks.length > 0 && decks.every((d) => !isDeckOn(d.deck_id));

  function setDeckEnabled(deckId: string, enabled: boolean) {
    const next = enabled
      ? (config?.disabled_deck_ids ?? []).filter((id) => id !== deckId)
      : [...new Set([...(config?.disabled_deck_ids ?? []), deckId])];
    saveConfig(`deck_enabled_${deckId}`, { disabled_deck_ids: next });
  }

  const TABS: { id: StudySettingsTab; label: string }[] = [
    { id: 'pace', label: t('settings.tab.schedule') },
    { id: 'activities', label: t('settings.tab.activities') },
    { id: 'prefs', label: t('settings.tab.preferences') },
  ];

  const PREF_TOGGLES: {
    key: keyof UpdateConfigBody;
    label: string;
    sub: string;
    value: boolean;
  }[] = [
    {
      key: 'always_show_translation',
      label: t('settings.alwaysShowTranslation'),
      sub: t('settings.alwaysShowTranslation_sub'),
      value: !!config?.always_show_translation,
    },
    {
      key: 'reverse_card',
      label: t('settings.reverseCard'),
      sub: t('settings.reverseCard_sub'),
      value: !!config?.reverse_card,
    },
    {
      key: 'auto_pronounce',
      label: t('settings.autoPronounce'),
      sub: t('settings.autoPronounce_sub'),
      value: !!config?.auto_pronounce,
    },
    {
      key: 'use_listen_again',
      label: t('settings.useListenAgain'),
      sub: t('settings.useListenAgain_sub'),
      value: !!config?.use_listen_again,
    },
    {
      key: 'use_ai_grading',
      label: t('settings.useAiGrading'),
      sub: t('settings.useAiGrading_sub'),
      value: !!config?.use_ai_grading,
    },
  ];

  const Spinner = ({ on }: { on: boolean }) =>
    on ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" /> : null;

  /** The 6-step weight ladder used by both deck weights and activity weights. */
  const WeightBars = ({
    value,
    disabled,
    onPick,
  }: {
    value: number;
    disabled?: boolean;
    onPick: (step: number) => void;
  }) => (
    <div className={cn('flex items-end gap-[3px] transition-opacity', disabled && 'opacity-30')}>
      {WEIGHT_STEPS.map((step, i) => (
        <button
          key={step}
          type="button"
          disabled={disabled}
          title={`${step}×`}
          onClick={() => {
            if (step !== value) onPick(step);
          }}
          className={cn(
            'w-2.5 rounded-[3px] transition-all disabled:cursor-not-allowed',
            WEIGHT_BAR_H[i],
            step <= value ? 'bg-primary hover:opacity-80' : 'bg-muted hover:bg-muted-foreground/40',
          )}
        />
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 pb-3 pt-5">
          <DialogTitle className="text-[17px] font-bold text-foreground">
            {t('settings.title')}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="shrink-0 px-5 pt-3">
            <div className="rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mx-5 mt-3 flex shrink-0 rounded-lg border border-border bg-muted/40 p-1">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-[12px] font-semibold transition-colors',
                tab === tb.id
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tb.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 pt-4">
          {/* ── Tab 1: Pace & Decks ─────────────────────────────────── */}
          {tab === 'pace' && (
            <div className="space-y-5">
              {/* Session duration */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('settings.section.capacity')}
                  </span>
                  <Spinner on={isSaving('daily_minutes')} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {DURATION_OPTIONS.map((min) => {
                    const active = config?.daily_minutes === min;
                    return (
                      <button
                        key={min}
                        type="button"
                        disabled={isSaving('daily_minutes')}
                        onClick={() => saveConfig('daily_minutes', { daily_minutes: min })}
                        className={cn(
                          'inline-flex items-baseline gap-1 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                          active
                            ? 'border-primary/50 bg-primary/15 text-primary'
                            : 'border-border bg-card text-muted-foreground hover:border-primary/40',
                        )}
                      >
                        {min}
                        <span className="text-[10.5px] font-semibold">{t('settings.min')}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Deck strategy */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('settings.section.deckStrategy')}
                  </span>
                  <Spinner on={isSaving('deck_strategy')} />
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                  {DECK_STRATEGIES.map(({ id, icon: Icon }) => {
                    const active = (config?.deck_strategy ?? 'mix') === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={isSaving('deck_strategy')}
                        onClick={() => saveConfig('deck_strategy', { deck_strategy: id })}
                        className={cn(
                          'flex flex-col gap-1 rounded-lg border p-2.5 text-start transition-all disabled:opacity-50',
                          active
                            ? 'border-primary/60 bg-primary/10'
                            : 'border-border bg-card hover:border-primary/30',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 text-[12px] font-semibold',
                            active ? 'text-primary' : 'text-foreground',
                          )}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          {t(`settings.${id}`)}
                        </span>
                        <span className="text-[10.5px] leading-snug text-muted-foreground">
                          {t(`settings.${id}_sub`)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* The deck "One deck" actually runs on. Without this picker the
                  backend has no active_deck_id to filter by, and every session
                  built from that strategy came back empty. */}
              {(config?.deck_strategy ?? 'mix') === 'isolated' && decks.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="study-active-deck"
                      className="shrink-0 text-[11.5px] font-semibold text-muted-foreground"
                    >
                      {t('settings.activeDeck')}
                    </label>
                    <select
                      id="study-active-deck"
                      value={config?.active_deck_id ?? ''}
                      disabled={isSaving('active_deck_id')}
                      onChange={(e) =>
                        saveConfig('active_deck_id', { active_deck_id: e.target.value || null })
                      }
                      className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-[12px] text-foreground disabled:opacity-50"
                    >
                      <option value="">{t('settings.selectDeck')}</option>
                      {decks.map((d) => (
                        <option key={d.deck_id} value={d.deck_id}>
                          {d.deck_title}
                        </option>
                      ))}
                    </select>
                    <Spinner on={isSaving('active_deck_id')} />
                  </div>
                  {!config?.active_deck_id && (
                    <p className="text-[10.5px] leading-snug text-muted-foreground">
                      {t('settings.activeDeckNoneHint')}
                    </p>
                  )}
                </div>
              )}

              {/* Deck weights + per-deck on/off */}
              {decks.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('settings.deckWeights')}
                    </span>
                    {anyDeckOff && (
                      <button
                        type="button"
                        onClick={() => saveConfig('disabled_deck_ids', { disabled_deck_ids: [] })}
                        disabled={isSaving('disabled_deck_ids')}
                        className="shrink-0 text-[10.5px] font-semibold text-muted-foreground underline underline-offset-2 hover:text-accent disabled:opacity-50"
                      >
                        {t('settings.deckEnableAll')}
                      </button>
                    )}
                  </div>
                  {/* Switching every deck off is a legitimate choice, but never a
                      silent one — otherwise it surfaces as an empty session with
                      no explanation. */}
                  {allDecksOff && (
                    <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[11.5px] text-warning">
                      {t('settings.deckAllOffWarning')}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {decks.map((deck) => {
                      const deckKey = `deck_weight_${deck.deck_id}`;
                      const toggleKey = `deck_enabled_${deck.deck_id}`;
                      const currentWeight = config?.deck_weights?.[deck.deck_id] ?? 1;
                      const on = isDeckOn(deck.deck_id);
                      return (
                        <div
                          key={deck.deck_id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5"
                        >
                          <span
                            className={cn(
                              'flex-1 truncate text-[12.5px] font-medium',
                              on ? 'text-foreground' : 'text-muted-foreground',
                            )}
                          >
                            {deck.deck_title}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            <Spinner on={isSaving(deckKey) || isSaving(toggleKey)} />
                            {/* Weights stay visible but inert while the deck is
                                off, so the tuning comes back untouched when it
                                is switched on again. */}
                            <WeightBars
                              value={currentWeight}
                              disabled={!on || isSaving(deckKey)}
                              onPick={(step) =>
                                saveConfig(deckKey, {
                                  deck_weights: {
                                    ...(config?.deck_weights ?? {}),
                                    [deck.deck_id]: step,
                                  },
                                })
                              }
                            />
                            <Checkbox
                              checked={on}
                              aria-label={t('settings.deckToggleA11y', { deck: deck.deck_title })}
                              disabled={isSaving(toggleKey)}
                              onCheckedChange={(checked) => setDeckEnabled(deck.deck_id, checked)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Tab 2: Activities ───────────────────────────────────── */}
          {tab === 'activities' && (
            <div className="space-y-2">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('settings.section.activities')}
              </span>
              <p className="text-[11.5px] leading-snug text-muted-foreground">
                {t('settings.section.activitiesHint')}
              </p>

              {/* Live mix preview */}
              {mixShares.length > 0 && (
                <div className="space-y-2 rounded-lg border border-border bg-card px-3.5 py-3">
                  <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('settings.mixPreview')}
                  </span>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                    {mixShares.map(({ activity, share }) => (
                      <div
                        key={activity}
                        className={cn(
                          'h-full transition-all duration-300',
                          ACTIVITY_SEGMENT[activity],
                        )}
                        style={{ width: `${share}%` }}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {mixShares.map(({ activity, share }) => (
                      <span
                        key={activity}
                        className="inline-flex items-center gap-1.5 text-[10.5px] text-muted-foreground"
                      >
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            ACTIVITY_SEGMENT[activity],
                          )}
                        />
                        {t(`activity.${activity}`)}
                        <span className="font-bold tabular-nums text-foreground">
                          {Math.round(share)}%
                        </span>
                      </span>
                    ))}
                  </div>
                  <p className="text-[10.5px] leading-snug text-muted-foreground">
                    {t('settings.mixPreviewHint')}
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                {ACTIVE_METHODS.map((activity) => {
                  const enabledList = config?.enabled_activities?.length
                    ? config.enabled_activities
                    : ACTIVE_METHODS;
                  const isEnabled = enabledList.includes(activity);
                  const weight = config?.activity_weights?.[activity] ?? 1;
                  const toggleKey = `toggle_${activity}`;
                  const weightKey = `weight_${activity}`;
                  return (
                    <div
                      key={activity}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
                          <span
                            className={cn(
                              'h-2 w-2 shrink-0 rounded-full',
                              ACTIVITY_SEGMENT[activity],
                              !isEnabled && 'opacity-30',
                            )}
                          />
                          <span className="truncate">{t(`activity.${activity}`)}</span>
                        </span>
                        <span className="mt-0.5 block text-[10.5px] leading-snug text-muted-foreground">
                          {t(`activityDesc.${activity}`)}
                        </span>
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <Spinner on={isSaving(toggleKey) || isSaving(weightKey)} />
                        <WeightBars
                          value={weight}
                          disabled={!isEnabled || isSaving(weightKey)}
                          onPick={(step) =>
                            saveConfig(weightKey, {
                              activity_weights: {
                                ...(config?.activity_weights ?? {}),
                                [activity]: step,
                              },
                            })
                          }
                        />
                        <Checkbox
                          checked={isEnabled}
                          disabled={isSaving(toggleKey)}
                          onChange={(e) => {
                            const current = config?.enabled_activities?.length
                              ? config.enabled_activities
                              : [...ACTIVE_METHODS];
                            const next = e.target.checked
                              ? [...current.filter((a) => a !== activity), activity]
                              : current.filter((a) => a !== activity);
                            saveConfig(toggleKey, { enabled_activities: next });
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Tab 3: Preferences ──────────────────────────────────── */}
          {tab === 'prefs' && (
            <div className="space-y-4">
              {/* SRS algorithm */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('settings.srsAlgorithm')}
                  </span>
                  <Spinner on={isSaving('srs_algorithm')} />
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                  {SRS_OPTIONS.map((algo) => {
                    const active = srsAlgorithm === algo;
                    return (
                      <button
                        key={algo}
                        type="button"
                        disabled={isSaving('srs_algorithm')}
                        onClick={() =>
                          withSaving('srs_algorithm', async () => {
                            await invoke('study_set_srs_algorithm', { algorithm: algo });
                            setSrsAlgorithm(algo);
                          })
                        }
                        className={cn(
                          'rounded-lg border-[1.5px] p-2.5 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed',
                          active
                            ? 'border-primary/60 bg-primary/10'
                            : 'border-border bg-card hover:border-primary/30',
                        )}
                      >
                        <span className="block text-[12px] font-semibold text-foreground">
                          {t(`settings.algo.${algo}`)}
                        </span>
                        <span className="mt-0.5 block text-[10.5px] leading-snug text-muted-foreground">
                          {t(`settings.algo.${algo}_sub`)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10.5px] leading-snug text-muted-foreground">
                  {t('settings.srsAlgorithmHint')}
                </p>
              </div>

              {/* Preference toggles */}
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {PREF_TOGGLES.map(({ key, label, sub, value }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-4 bg-card px-3.5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold text-foreground">
                        {label}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{sub}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Spinner on={isSaving(key)} />
                      <Checkbox
                        checked={value}
                        disabled={isSaving(key)}
                        onChange={(e) =>
                          saveConfig(key, { [key]: e.target.checked } as UpdateConfigBody)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Auto-play TTS */}
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="flex items-center justify-between gap-4 bg-card px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold text-foreground">
                      {t('settings.autoPlayTTS')}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {t('settings.autoPlayTTSDescription')}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Spinner on={isSaving('auto_tts_enabled')} />
                    <Checkbox
                      checked={ttsEnabled}
                      disabled={isSaving('auto_tts_enabled')}
                      onChange={(e) => {
                        const next = e.target.checked;
                        withSaving('auto_tts_enabled', async () => {
                          await setSetting('auto_tts_enabled', String(next));
                          setTtsEnabled(next);
                        });
                      }}
                    />
                  </div>
                </div>

                {ttsEnabled && (
                  <div className="divide-y divide-border border-t border-border bg-muted/30">
                    {/* Delay */}
                    <div className="flex items-center justify-between gap-4 px-3.5 py-3">
                      <div className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-semibold text-foreground">
                          {t('settings.delayBeforeNext')}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {t('settings.delayDescription')}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Spinner on={isSaving('auto_tts_delay_seconds')} />
                        <input
                          type="number"
                          min={0.5}
                          max={10}
                          step={0.5}
                          defaultValue={ttsDelay}
                          disabled={isSaving('auto_tts_delay_seconds')}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            withSaving('auto_tts_delay_seconds', async () => {
                              await setSetting('auto_tts_delay_seconds', String(v));
                              setTtsDelay(v);
                            });
                          }}
                          className="w-16 rounded-md border border-border bg-background px-2 py-1 text-center text-[12.5px] font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                        />
                      </div>
                    </div>

                    {/* Voice */}
                    <div className="flex items-center justify-between gap-4 px-3.5 py-3">
                      <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-foreground">
                        {t('settings.voiceAccent')}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Spinner on={isSaving('tts_voice')} />
                        {(['us', 'uk'] as const).map((accent) => (
                          <button
                            key={accent}
                            type="button"
                            disabled={isSaving('tts_voice')}
                            onClick={() =>
                              withSaving('tts_voice', async () => {
                                await setSetting('tts_voice', accent);
                                setTtsVoice(accent);
                              })
                            }
                            className={cn(
                              'rounded-md border-[1.5px] px-3 py-1.5 text-[11.5px] font-semibold transition-all disabled:opacity-50',
                              ttsVoice === accent
                                ? 'border-primary/60 bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:border-primary/30',
                            )}
                          >
                            {accent.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
