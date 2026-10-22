import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Settings,
  LogOut,
  Loader2,
  AlertCircle,
  User,
  Mic,
  Brain,
  Languages,
  Palette,
  Sun,
  Moon,
  Monitor,
  Check,
  Download,
  Upload,
  Mail,
  ArrowLeft,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { WhisperSetup } from '@/pages/caption/components/WhisperSetup';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

import { SyncSettings } from '@/pages/settings/SyncSettings';
import { UpdatesSection } from '@/pages/settings/components/UpdatesSection';
import { AiSettingsSection } from '@/pages/settings/components/AiSettingsSection';
import { ExportDialog } from '@/pages/settings/ExportDialog';
import { LanguageSearchSelect } from '@/pages/account/components/LanguageSearchSelect';
import { getLanguageByCode } from '@/config/languages';
import { ImportDialog } from '@/pages/settings/ImportDialog';
import { getSetting, setSetting } from '@/lib/tauri-bridge';
import { authErrorText } from '@/components/auth/authError';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { useTranslation } from 'react-i18next';

type SettingsTab = 'general' | 'ai' | 'whisper' | 'sync' | 'data';

/** Opens the account area (languages, profile, XP, plan, community, friends) - the website's settings tabs. */
const ACCOUNT_PATH = '/account/learning';

// The 'sync' tab stays hidden: the sync engine has no transport yet (nothing to push to).
// The 'data' tab (Export / Import) is local-only and works through the Rust export commands.
const TABS: { id: SettingsTab; icon: typeof User; labelKey: string }[] = [
  { id: 'general', icon: Settings, labelKey: 'tabs.general' },
  { id: 'ai', icon: Brain, labelKey: 'tabs.ai' },
  { id: 'whisper', icon: Mic, labelKey: 'tabs.whisper' },
  { id: 'data', icon: Download, labelKey: 'tabs.data' },
];

const ALL_TAB_IDS = TABS.map((t) => t.id);

const SETTINGS_NS = 'settingsDesk';

// --- Auth Section ---

function AuthSection() {
  const { t } = useTranslation(SETTINGS_NS);
  const session = useAuthStore((s) => s.session);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const sendOtp = useAuthStore((s) => s.sendOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const logout = useAuthStore((s) => s.logout);
  const clearError = useAuthStore((s) => s.clearError);

  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSending(true);
    try {
      await sendOtp(email);
      setStep('otp');
    } catch {
      // Error is set in the store
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return;
    clearError();
    setVerifying(true);
    try {
      await verifyOtp(email, otp);
    } catch {
      // Error is set in the store
    } finally {
      setVerifying(false);
    }
  };

  const handleBack = () => {
    setStep('email');
    setOtp('');
    clearError();
  };

  const handleResend = async () => {
    clearError();
    setSending(true);
    try {
      await sendOtp(email);
    } catch {
      // Error is set in the store
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (session) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{t('auth.title')}</CardTitle>
              <CardDescription>{session.email}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{t('auth.loggedIn')}</p>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 me-1" />
              {t('auth.logout')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">{t('auth.title')}</CardTitle>
            <CardDescription>{t('auth.signInHint')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {error && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{authErrorText(error)}</span>
            </div>
          )}

          {step === 'email' && <GoogleSignInButton />}

          {step === 'email' ? (
            <form onSubmit={handleSendOtp} className="space-y-3">
              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  {t('auth.email')}
                </label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  required
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <Button type="submit" disabled={sending || !email}>
                {sending ? (
                  <Loader2 className="h-4 w-4 me-2 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4 me-2" />
                )}
                {sending ? t('auth.sending') : t('auth.sendCode')}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('auth.codeSentTo')}{' '}
                <span className="font-medium text-foreground" dir="ltr">
                  {email}
                </span>
              </p>
              <div>
                <label
                  htmlFor="auth-otp"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  {t('auth.verificationCode')}
                </label>
                <input
                  id="auth-otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  required
                  autoFocus
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground text-center tracking-[0.3em] font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <Button type="submit" disabled={verifying || otp.length !== 6}>
                {verifying ? (
                  <Loader2 className="h-4 w-4 me-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 me-2" />
                )}
                {verifying ? t('auth.verifying') : t('auth.verify')}
              </Button>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3 w-3" />
                  {t('auth.useAnotherEmail')}
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={sending}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {sending ? t('auth.sendingShort') : t('auth.resend')}
                </button>
              </div>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Languages Section ---

const UI_LANGUAGES = ['en', 'fa', 'ar', 'fr', 'hi', 'zh', 'de', 'vi'];

function LanguagesSection() {
  const { t, i18n } = useTranslation(SETTINGS_NS);
  const { t: ta } = useTranslation('account');
  const [nativeLang, setNativeLang] = useState('');
  const [targetLang, setTargetLang] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const n = await getSetting('native_language');
      if (n) setNativeLang(n);
      const t = await getSetting('target_language');
      if (t) setTargetLang(t);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setSetting('native_language', nativeLang);
      await setSetting('target_language', targetLang);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleUILanguageChange = (code: string) => {
    i18n.changeLanguage(code);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Languages className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">{t('languages.title')}</CardTitle>
            <CardDescription>{t('languages.subtitle')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('languages.native')}</label>
          <div>
            <LanguageSearchSelect
              value={nativeLang || 'en'}
              onSelect={setNativeLang}
              label={t('languages.native')}
              searchPlaceholder={ta('desk.learning.search')}
              noResults={ta('desk.learning.noResults')}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t('languages.learning')}</label>
          <div>
            <LanguageSearchSelect
              value={targetLang || 'en'}
              onSelect={setTargetLang}
              label={t('languages.learning')}
              searchPlaceholder={ta('desk.learning.search')}
              noResults={ta('desk.learning.noResults')}
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin me-2" />
          ) : saved ? (
            <Check className="h-4 w-4 me-2" />
          ) : null}
          {saved ? t('languages.saved') : t('languages.save')}
        </Button>

        <div className="pt-4 border-t border-border space-y-2">
          <label className="text-sm font-medium">{t('languages.appLanguage')}</label>
          <div className="flex flex-wrap gap-2">
            {UI_LANGUAGES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => handleUILanguageChange(code)}
                className={`inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  i18n.language.split('-')[0] === code
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:bg-muted text-foreground'
                }`}
              >
                {getLanguageByCode(code)?.nativeName ?? (code === 'vi' ? 'Tiếng Việt' : code)}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Appearance Section ---

function AppearanceSection() {
  const { t } = useTranslation(SETTINGS_NS);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const themes: { id: 'light' | 'dark' | 'system'; icon: typeof Sun; label: string }[] = [
    { id: 'light', icon: Sun, label: t('appearance.light') },
    { id: 'dark', icon: Moon, label: t('appearance.dark') },
    { id: 'system', icon: Monitor, label: t('appearance.system') },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Palette className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">{t('appearance.title')}</CardTitle>
            <CardDescription>{t('appearance.subtitle')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('appearance.theme')}</label>
          <div className="flex flex-wrap gap-2">
            {themes.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  type="button"
                  className={`inline-flex min-w-24 flex-col items-center gap-2 p-4 rounded-lg border transition-colors ${
                    theme === t.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 ${theme === t.id ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  <span className="text-sm font-medium">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Data Section (Export/Import) ---

function DataSection() {
  const { t } = useTranslation(SETTINGS_NS);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{t('data.title')}</CardTitle>
              <CardDescription>{t('data.subtitle')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={() => setShowExport(true)} variant="outline">
            <Download className="h-4 w-4 me-2" />
            {t('data.export')}
          </Button>
          <Button onClick={() => setShowImport(true)} variant="outline">
            <Upload className="h-4 w-4 me-2" />
            {t('data.import')}
          </Button>
        </CardContent>
      </Card>

      <ExportDialog open={showExport} onOpenChange={setShowExport} />
      <ImportDialog open={showImport} onOpenChange={setShowImport} />
    </>
  );
}

// --- General Section (Account + Languages + Appearance) ---

function GeneralSection() {
  return (
    <div className="space-y-6">
      <AuthSection />
      <LanguagesSection />
      <AppearanceSection />
      <UpdatesSection />
    </div>
  );
}

// --- Main Settings Page ---

export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t: ta } = useTranslation('account');
  const { t } = useTranslation(SETTINGS_NS);
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    (searchParams.get('tab') as SettingsTab) || 'general',
  );

  useEffect(() => {
    const tab = searchParams.get('tab') as SettingsTab;
    if (tab && ALL_TAB_IDS.includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>{t('page.title')}</CardTitle>
              <CardDescription>{t('page.subtitle')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Tab Switcher */}
          <div className="flex gap-1 rounded-lg bg-muted p-1 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t(tab.labelKey)}
                </button>
              );
            })}
            <button
              onClick={() => navigate(ACCOUNT_PATH)}
              className="flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap text-muted-foreground hover:text-foreground"
            >
              <User className="h-4 w-4" />
              {ta('desk.nav.account')}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Tab Content */}
      {activeTab === 'general' && <GeneralSection />}
      {activeTab === 'ai' && <AiSettingsSection />}
      {activeTab === 'whisper' && <WhisperSetup />}
      {activeTab === 'sync' && <SyncSettings />}
      {activeTab === 'data' && <DataSection />}
    </div>
  );
}
