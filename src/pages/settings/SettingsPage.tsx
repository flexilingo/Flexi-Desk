import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  Keyboard,
  Sun,
  Moon,
  Monitor,
  Check,
  Cloud,
  Download,
  Mail,
  ArrowLeft,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { WhisperSetup } from '@/pages/caption/components/WhisperSetup';
import { ShortcutSettingsPage } from '@/pages/settings/ShortcutSettingsPage';
import { SyncSettings } from '@/pages/settings/SyncSettings';
import { OllamaModelManager } from '@/pages/settings/components/OllamaModelManager';
import { ExportDialog } from '@/pages/settings/ExportDialog';
import { ImportDialog } from '@/pages/settings/ImportDialog';
import { getSetting, setSetting } from '@/lib/tauri-bridge';
import { useTranslation } from 'react-i18next';

type SettingsTab = 'account' | 'ai' | 'languages' | 'appearance' | 'shortcuts' | 'whisper' | 'sync' | 'data';

const TABS: { id: SettingsTab; icon: typeof User; label: string }[] = [
  { id: 'account', icon: User, label: 'Account' },
  { id: 'ai', icon: Brain, label: 'AI Provider' },
  { id: 'languages', icon: Languages, label: 'Languages' },
  { id: 'appearance', icon: Palette, label: 'Appearance' },
  { id: 'shortcuts', icon: Keyboard, label: 'Shortcuts' },
  { id: 'whisper', icon: Mic, label: 'Whisper' },
  // TODO: Enable when fully tested
  // { id: 'sync', icon: Cloud, label: 'Sync' },
  // { id: 'data', icon: Download, label: 'Export / Import' },
];

const ALL_TAB_IDS = TABS.map((t) => t.id);

// --- Auth Section ---

function AuthSection() {
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
              <CardTitle className="text-base">FlexiLingo Account</CardTitle>
              <CardDescription>{session.email}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Logged in. Cloud features like Quiz, Ask Lena, and Feedback are available.
            </p>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4 mr-1" />
              Logout
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
            <CardTitle className="text-base">FlexiLingo Account</CardTitle>
            <CardDescription>
              Sign in to access cloud features: Quiz, Ask Lena, Feedback, and more.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {error && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'email' ? (
            <form onSubmit={handleSendOtp} className="space-y-3">
              <div>
                <label htmlFor="auth-email" className="block text-sm font-medium text-foreground mb-1.5">
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <Button type="submit" className="w-full" disabled={sending || !email}>
                {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                {sending ? 'Sending code...' : 'Send code'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Code sent to <span className="font-medium text-foreground">{email}</span>
              </p>
              <div>
                <label htmlFor="auth-otp" className="block text-sm font-medium text-foreground mb-1.5">
                  Verification code
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
              <Button type="submit" className="w-full" disabled={verifying || otp.length !== 6}>
                {verifying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                {verifying ? 'Verifying...' : 'Verify'}
              </Button>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Use another email
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={sending}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {sending ? 'Sending...' : 'Resend code'}
                </button>
              </div>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// --- AI Provider Section ---

type AIProvider = 'ollama' | 'openai' | 'anthropic';

function AIProviderSection() {
  const [provider, setProvider] = useState<AIProvider>('ollama');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await getSetting('ai_provider');
      if (p) setProvider(p as AIProvider);
      const key = await getSetting(`${p || 'openai'}_api_key`);
      if (key) setApiKey(key);
      const url = await getSetting(`${p || 'ollama'}_base_url`);
      if (url) setBaseUrl(url);
      const m = await getSetting('ai_model');
      if (m) setModel(m);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setSetting('ai_provider', provider);
      if (apiKey) await setSetting(`${provider}_api_key`, apiKey);
      await setSetting(`${provider}_base_url`, baseUrl);
      if (model) await setSetting('ai_model', model);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const providerOptions: { id: AIProvider; name: string; description: string }[] = [
    { id: 'ollama', name: 'Ollama (Local)', description: 'Free, private, runs on your machine' },
    { id: 'openai', name: 'OpenAI', description: 'GPT-4o, requires API key' },
    { id: 'anthropic', name: 'Anthropic', description: 'Claude, requires API key' },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">AI Provider</CardTitle>
            <CardDescription>
              Configure the AI backend for Tutor, Writing Coach, and Exams
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Provider Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Provider</label>
          <div className="space-y-2">
            {providerOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setProvider(opt.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                  provider === opt.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <div
                  className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                    provider === opt.id ? 'border-primary' : 'border-muted-foreground/30'
                  }`}
                >
                  {provider === opt.id && <div className="h-2 w-2 rounded-full bg-primary" />}
                </div>
                <div>
                  <p className="text-sm font-medium">{opt.name}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* API Key (for cloud providers) */}
        {provider !== 'ollama' && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        )}

        {/* Base URL (for Ollama) */}
        {provider === 'ollama' && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Ollama URL</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        )}

        {/* Ollama: Model Manager */}
        {provider === 'ollama' && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Models</label>
            <OllamaModelManager />
          </div>
        )}

        {/* Cloud providers: Model text input */}
        {provider !== 'ollama' && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={
                provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514'
              }
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : saved ? (
            <Check className="h-4 w-4 mr-2" />
          ) : null}
          {saved ? 'Saved!' : 'Save Configuration'}
        </Button>
      </CardContent>
    </Card>
  );
}

// --- Languages Section ---

const TARGET_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fa', name: 'Persian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'tr', name: 'Turkish' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'zh', name: 'Chinese' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ru', name: 'Russian' },
];

const UI_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fa', name: 'Persian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'fr', name: 'French' },
  { code: 'hi', name: 'Hindi' },
  { code: 'zh', name: 'Chinese' },
];

function LanguagesSection() {
  const { i18n } = useTranslation();
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
            <CardTitle className="text-base">Languages</CardTitle>
            <CardDescription>Set your native and target languages</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Native Language */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Native Language</label>
          <select
            value={nativeLang}
            onChange={(e) => setNativeLang(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Select...</option>
            {TARGET_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        {/* Target Language */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Learning Language</label>
          <select
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Select...</option>
            {TARGET_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : saved ? (
            <Check className="h-4 w-4 mr-2" />
          ) : null}
          {saved ? 'Saved!' : 'Save Languages'}
        </Button>

        {/* UI Language */}
        <div className="pt-4 border-t border-border space-y-2">
          <label className="text-sm font-medium">App Language (UI)</label>
          <div className="grid grid-cols-3 gap-2">
            {UI_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleUILanguageChange(lang.code)}
                className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  i18n.language === lang.code
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:bg-muted text-foreground'
                }`}
              >
                {lang.name}
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
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const themes: { id: 'light' | 'dark' | 'system'; icon: typeof Sun; label: string }[] = [
    { id: 'light', icon: Sun, label: 'Light' },
    { id: 'dark', icon: Moon, label: 'Dark' },
    { id: 'system', icon: Monitor, label: 'System' },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Palette className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Appearance</CardTitle>
            <CardDescription>Customize the look and feel</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Theme</label>
          <div className="grid grid-cols-3 gap-2">
            {themes.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors ${
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
              <CardTitle className="text-base">Export & Import</CardTitle>
              <CardDescription>Move your vocabulary data in and out</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => setShowExport(true)} variant="outline" className="w-full">
            Export Vocabulary
          </Button>
          <Button onClick={() => setShowImport(true)} variant="outline" className="w-full">
            Import Vocabulary
          </Button>
        </CardContent>
      </Card>

      <ExportDialog open={showExport} onOpenChange={setShowExport} />
      <ImportDialog open={showImport} onOpenChange={setShowImport} />
    </>
  );
}

// --- Main Settings Page ---

export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    (searchParams.get('tab') as SettingsTab) || 'account',
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
              <CardTitle>Settings</CardTitle>
              <CardDescription>Configure your learning experience</CardDescription>
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
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tab Content */}
      {activeTab === 'account' && <AuthSection />}
      {activeTab === 'ai' && <AIProviderSection />}
      {activeTab === 'languages' && <LanguagesSection />}
      {activeTab === 'appearance' && <AppearanceSection />}
      {activeTab === 'shortcuts' && <ShortcutSettingsPage />}
      {activeTab === 'whisper' && <WhisperSetup />}
      {activeTab === 'sync' && <SyncSettings />}
      {activeTab === 'data' && <DataSection />}
    </div>
  );
}
