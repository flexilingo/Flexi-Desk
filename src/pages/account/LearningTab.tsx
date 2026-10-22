import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, GraduationCap, Info, Languages, Loader2, Volume2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Settings as SettingsIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';
import { getSetting } from '@/lib/tauri-bridge';
import { getAccountSettings, updateAccountSettings } from '@/lib/account/api';
import { planLanguageSync, saveLanguage, type LanguageSync } from '@/lib/account/learning';
import type { AccountSettings, ExamGoal } from '@/lib/account/types';
import { getLanguageName } from '@/config/languages';
import {
  getSpeechAccent,
  setSpeechAccent,
  setSpeechPreference,
  speak,
  useSpeechPreference,
  type SpeechPreference,
} from '@/lib/speech';
import { useRemote } from '@/hooks/useRemote';
import { LanguageSearchSelect } from './components/LanguageSearchSelect';
import { CardTitleRow, ErrorLine, Spinner, useAccountT } from './components/AccountBits';
import { engineToPreference, preferenceToEngine, type Engine } from '@/lib/account/voice';

const ENGINES: Engine[] = ['microsoft', 'google', 'flexilingo', 'device'];
const EXAMS: ExamGoal[] = ['celpip', 'tcf', 'tcf_quebec', 'none'];

function useSavedTick() {
  const [saved, setSaved] = useState(false);
  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return [saved, flash] as const;
}

export function LearningTab() {
  const { t, errorText } = useAccountT();
  const session = useAuthStore((s) => s.session);
  const signedIn = !!session;
  const { nativeLang, targetLang, setNativeLang, setTargetLang } = useLanguageSettings();
  const account = useRemote(() => getAccountSettings(), [session?.user_id], signedIn);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, flashSaved] = useSavedTick();
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<LanguageSync | null>(null);

  // Compare what this computer has with the account once the account answered.
  useEffect(() => {
    if (!signedIn || !account.data) {
      setSync(null);
      return;
    }
    let live = true;
    void (async () => {
      const [n, l] = await Promise.all([
        getSetting('native_language'),
        getSetting('target_language'),
      ]);
      if (!live) return;
      const plan = planLanguageSync(
        { native: n, target: l },
        {
          native: account.data!.native_language ?? null,
          learning: account.data!.learning_language ?? null,
        },
      );
      if (plan.kind === 'adopt') {
        if (plan.native) await setNativeLang(plan.native);
        if (plan.learning) await setTargetLang(plan.learning);
        setSync({ kind: 'in-sync' });
      } else setSync(plan);
    })();
    return () => {
      live = false;
    };
  }, [signedIn, account.data, setNativeLang, setTargetLang]);

  const learning = (signedIn && account.data?.learning_language) || targetLang;
  const native = (signedIn && account.data?.native_language) || nativeLang;

  const pick = useCallback(
    async (field: 'learning' | 'native', code: string) => {
      setSaving(field);
      setError(null);
      try {
        await saveLanguage(field, code, {
          signedIn,
          patchAccount: (patch) => updateAccountSettings(patch),
          setLocal: (key, value) =>
            key === 'target_language' ? setTargetLang(value) : setNativeLang(value),
        });
        if (signedIn) await account.reload();
        flashSaved();
      } catch (e) {
        setError(errorText(e));
      } finally {
        setSaving(null);
      }
    },
    [signedIn, account, setTargetLang, setNativeLang, errorText, flashSaved],
  );

  const resolveConflict = async (useAccount: boolean) => {
    if (sync?.kind !== 'conflict') return;
    setSaving('sync');
    setError(null);
    try {
      if (useAccount) {
        if (sync.account.native) await setNativeLang(sync.account.native);
        if (sync.account.learning) await setTargetLang(sync.account.learning);
      } else {
        await updateAccountSettings({
          native_language: sync.local.native,
          learning_language: sync.local.target,
        });
        await account.reload();
      }
      setSync({ kind: 'in-sync' });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(null);
    }
  };

  const pushLocal = async () => {
    if (sync?.kind !== 'offer-push') return;
    setSaving('sync');
    try {
      await updateAccountSettings({
        native_language: sync.local.native,
        learning_language: sync.local.target,
      });
      await account.reload();
      setSync({ kind: 'in-sync' });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(null);
    }
  };

  const pair = (a: string | null, b: string | null) =>
    `${a ? getLanguageName(a) : '-'} / ${b ? getLanguageName(b) : '-'}`;

  if (signedIn && account.loading && !account.data) return <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={SettingsIcon}
        title={t('settings.title')}
        subtitle={t('settings.settingsSubtitle')}
      />
      <ErrorLine
        message={error ?? (account.error ? errorText(account.error) : null)}
        onDismiss={() => setError(null)}
        onRetry={signedIn ? () => void account.reload() : undefined}
        retryLabel={t('subscription.retry')}
      />

      <Card>
        <CardTitleRow
          icon={Languages}
          title={t('settings.learningLanguages')}
          right={
            <>
              {saving && saving !== 'sync' && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
              {saved && (
                <span className="flex items-center gap-1 text-xs text-success">
                  <Check className="h-3 w-3" />
                  {t('settings.saved')}
                </span>
              )}
            </>
          }
        />
        <div className="flex flex-col gap-4 px-5 py-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('settings.languageSetupHelp')}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-foreground">
                {t('settings.imLearning')}
              </label>
              <LanguageSearchSelect
                value={learning}
                onSelect={(c) => void pick('learning', c)}
                disabled={saving === 'learning'}
                label={t('settings.imLearning')}
                searchPlaceholder={t('desk.learning.search')}
                noResults={t('desk.learning.noResults')}
              />
            </div>
            <ArrowRight className="mb-2.5 h-4 w-4 text-muted-foreground rtl:-scale-x-100" />
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-foreground">
                {t('settings.myNativeLanguage')}
              </label>
              <LanguageSearchSelect
                value={native}
                onSelect={(c) => void pick('native', c)}
                disabled={saving === 'native'}
                label={t('settings.myNativeLanguage')}
                searchPlaceholder={t('desk.learning.search')}
                noResults={t('desk.learning.noResults')}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {signedIn ? t('desk.learning.mirrored') : t('desk.learning.signedOutNote')}
          </p>
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('desk.learning.notAppLanguage')}
            </p>
          </div>

          {sync?.kind === 'conflict' && (
            <div
              role="status"
              className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-3 text-sm"
            >
              <p className="font-semibold text-foreground">{t('desk.learning.conflictTitle')}</p>
              <p className="text-muted-foreground">
                {t('desk.learning.conflictBody', {
                  local: pair(sync.local.target, sync.local.native),
                  account: pair(sync.account.learning, sync.account.native),
                })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  loading={saving === 'sync'}
                  onClick={() => void resolveConflict(true)}
                >
                  {t('desk.learning.useAccount')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  loading={saving === 'sync'}
                  onClick={() => void resolveConflict(false)}
                >
                  {t('desk.learning.keepLocal')}
                </Button>
              </div>
            </div>
          )}
          {sync?.kind === 'offer-push' && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {t('desk.learning.offerPush', {
                  local: pair(sync.local.target, sync.local.native),
                })}
              </span>
              <Button
                size="sm"
                variant="outline"
                loading={saving === 'sync'}
                onClick={() => void pushLocal()}
              >
                {t('desk.learning.pushLocal')}
              </Button>
            </div>
          )}
        </div>
      </Card>

      <VoiceCard
        settings={signedIn ? account.data : null}
        signedIn={signedIn}
        reload={account.reload}
      />
      <ExamCard
        settings={signedIn ? account.data : null}
        signedIn={signedIn}
        reload={account.reload}
      />
    </div>
  );
}

function VoiceCard({
  settings,
  signedIn,
  reload,
}: {
  settings: AccountSettings | null;
  signedIn: boolean;
  reload: () => Promise<void>;
}) {
  const { t, errorText } = useAccountT();
  const [pref] = useSpeechPreference();
  const [saved, flash] = useSavedTick();
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [accent, setAccent] = useState<'us' | 'uk'>(getSpeechAccent());
  const current: Engine = (signedIn && settings?.tts_engine) || preferenceToEngine(pref);

  const choose = async (engine: Engine) => {
    setError(null);
    setSpeechPreference(engineToPreference(engine));
    try {
      if (signedIn) await updateAccountSettings({ tts_engine: engine });
      flash();
      if (signedIn) await reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const sample = async (engine: Engine, a: 'us' | 'uk' = accent) => {
    setPlaying(engine);
    setError(null);
    try {
      const pref: SpeechPreference = engineToPreference(engine);
      await speak('Hello, this is how I sound.', 'en', {
        accent: a,
        engines: pref === 'device' ? ['device'] : ['cloud', 'device'],
      });
    } catch {
      setError(t('settings.voice.sampleFailed'));
    } finally {
      setPlaying(null);
    }
  };

  const pickAccent = async (a: 'us' | 'uk') => {
    setAccent(a);
    setSpeechAccent(a);
    try {
      if (signedIn) await updateAccountSettings({ tts_voice: a });
      flash();
    } catch (e) {
      setError(errorText(e));
    }
    void sample(current, a);
  };

  return (
    <Card>
      <CardTitleRow
        icon={Volume2}
        title={t('settings.voice.title')}
        right={
          saved && (
            <span className="flex items-center gap-1 text-xs text-success">
              <Check className="h-3 w-3" />
              {t('settings.voice.saved')}
            </span>
          )
        }
      />
      <div className="flex flex-col gap-4 px-5 py-4">
        <p className="text-xs leading-relaxed text-muted-foreground">{t('settings.voice.help')}</p>
        <p className="text-xs text-muted-foreground">{t('desk.voice.deskNote')}</p>
        <ErrorLine message={error} onDismiss={() => setError(null)} />
        <div className="grid gap-2 sm:grid-cols-2">
          {ENGINES.map((engine) => {
            const active = current === engine;
            return (
              <div
                key={engine}
                className={`flex flex-col gap-2 rounded-lg border p-3 ${active ? 'border-primary/40 bg-primary/10' : 'border-border bg-card'}`}
              >
                <button
                  type="button"
                  onClick={() => void choose(engine)}
                  aria-pressed={active}
                  className="flex flex-col gap-0.5 text-start"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    {t(`settings.voice.engines.${engine}.name`)}
                    {engine === 'microsoft' && (
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">
                        {t('settings.voice.recommended')}
                      </span>
                    )}
                    {active && <Check className="ms-auto h-3.5 w-3.5 text-primary" />}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(`settings.voice.engines.${engine}.desc`)}
                  </span>
                </button>
                <div>
                  <Button
                    size="xs"
                    variant="outline"
                    loading={playing === engine}
                    onClick={() => void sample(engine)}
                  >
                    <Volume2 />
                    {t('settings.voice.listen')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold text-foreground">
            {t('settings.voice.accentTitle')} - {t('settings.voice.languages.en')}
          </p>
          <div className="flex flex-wrap gap-2">
            {(['us', 'uk'] as const).map((a) => (
              <Button
                key={a}
                size="sm"
                variant={accent === a ? 'default' : 'outline'}
                onClick={() => void pickAccent(a)}
                aria-pressed={accent === a}
              >
                {t(a === 'us' ? 'settings.voice.regions.en_US' : 'settings.voice.regions.en_GB')}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t('settings.voice.accentHelp')}</p>
        </div>
      </div>
    </Card>
  );
}

function ExamCard({
  settings,
  signedIn,
  reload,
}: {
  settings: AccountSettings | null;
  signedIn: boolean;
  reload: () => Promise<void>;
}) {
  const { t, errorText } = useAccountT();
  const [saving, setSaving] = useState(false);
  const [saved, flash] = useSavedTick();
  const [error, setError] = useState<string | null>(null);
  const [localGoal, setLocalGoal] = useState<string>('');
  const [localDate, setLocalDate] = useState<string>('');

  useEffect(() => {
    if (signedIn) return;
    void getSetting('exam_goal').then((v) => setLocalGoal(v ?? ''));
    void getSetting('exam_date').then((v) => setLocalDate(v ?? ''));
  }, [signedIn]);

  const goal = signedIn ? (settings?.exam_goal ?? '') : localGoal;
  const date = signedIn ? (settings?.exam_date ?? '') : localDate;
  const hasExam = goal !== '' && goal !== 'none';

  const save = async (patch: Record<string, string | null>) => {
    setSaving(true);
    setError(null);
    try {
      if (signedIn) {
        await updateAccountSettings(patch as AccountSettings);
        await reload();
      } else {
        const { setSetting } = await import('@/lib/tauri-bridge');
        for (const [k, v] of Object.entries(patch)) await setSetting(k, v ?? '');
        if ('exam_goal' in patch) setLocalGoal(patch.exam_goal ?? '');
        if ('exam_date' in patch) setLocalDate(patch.exam_date ?? '');
      }
      flash();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardTitleRow
        icon={GraduationCap}
        title={t('settings.exam.title')}
        right={
          <>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {saved && (
              <span className="flex items-center gap-1 text-xs text-success">
                <Check className="h-3 w-3" />
                {t('settings.exam.saved')}
              </span>
            )}
          </>
        }
      />
      <div className="flex flex-wrap gap-4 px-5 py-4">
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-muted-foreground">
          {t('settings.exam.examLabel')}
          <select
            value={goal}
            onChange={(e) =>
              void save({
                exam_goal: e.target.value || null,
                ...(e.target.value === 'none' ? { exam_date: null } : {}),
              })
            }
            className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <option value="">{t('settings.exam.notSet')}</option>
            {EXAMS.map((g) => (
              <option key={g} value={g}>
                {t(`settings.exam.goals.${g}`)}
              </option>
            ))}
          </select>
        </label>
        {hasExam && (
          <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-muted-foreground">
            {t('settings.exam.dateLabel')}
            <Input
              type="date"
              value={date}
              onChange={(e) => void save({ exam_date: e.target.value || null })}
            />
          </label>
        )}
        <div className="w-full">
          <ErrorLine
            message={error ? t('settings.exam.error') : null}
            onDismiss={() => setError(null)}
          />
        </div>
      </div>
    </Card>
  );
}
