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
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { WhisperSetup } from '@/pages/caption/components/WhisperSetup';
import { getSetting, setSetting } from '@/lib/tauri-bridge';
import { useTranslation } from 'react-i18next';

type SettingsTab = 'account' | 'ai' | 'languages' | 'appearance' | 'shortcuts' | 'whisper';

const TABS: { id: SettingsTab; icon: typeof User; label: string }[] = [
  { id: 'account', icon: User, label: 'Account' },
  { id: 'ai', icon: Brain, label: 'AI Provider' },
  { id: 'languages', icon: Languages, label: 'Languages' },
  { id: 'appearance', icon: Palette, label: 'Appearance' },
  { id: 'shortcuts', icon: Keyboard, label: 'Shortcuts' },
  { id: 'whisper', icon: Mic, label: 'Whisper' },
];

const ALL_TAB_IDS = TABS.map((t) => t.id);

// --- Auth Section ---

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function AuthSection() {
  const session = useAuthStore((s) => s.session);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const loginWithApple = useAuthStore((s) => s.loginWithApple);
  const logout = useAuthStore((s) => s.logout);
  const clearError = useAuthStore((s) => s.clearError);

  const [signingIn, setSigningIn] = useState(false);

  const handleGoogle = async () => {
    setSigningIn(true);
    clearError();
    try {
      await loginWithGoogle();
    } catch {
      // Error is set in the store
    } finally {
      setSigningIn(false);
    }
  };

  const handleApple = async () => {
    setSigningIn(true);
    clearError();
    try {
      await loginWithApple();
    } catch {
      // Error is set in the store
    } finally {
      setSigningIn(false);
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
            <User className="h-5 w-5 text-primary" />
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

          <button
            onClick={handleGoogle}
            disabled={signingIn}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {signingIn ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <GoogleLogo />
            )}
            <span className="font-medium text-sm">Continue with Google</span>
          </button>

          <button
            onClick={handleApple}
            disabled={signingIn}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-black text-white hover:bg-black/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {signingIn ? <Loader2 className="h-5 w-5 animate-spin" /> : <AppleLogo />}
            <span className="font-medium text-sm">Continue with Apple</span>
          </button>

          {signingIn && (
            <p className="text-xs text-center text-muted-foreground">
              A browser window has been opened. Complete sign-in there.
            </p>
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
      const key = await getSetting('ai_api_key');
      if (key) setApiKey(key);
      const url = await getSetting('ai_base_url');
      if (url) setBaseUrl(url);
      const m = await getSetting('ai_model');
      if (m) setModel(m);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setSetting('ai_provider', provider);
      if (apiKey) await setSetting('ai_api_key', apiKey);
      await setSetting('ai_base_url', baseUrl);
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

        {/* Model */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Model</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={
              provider === 'ollama'
                ? 'llama3.1'
                : provider === 'openai'
                  ? 'gpt-4o'
                  : 'claude-sonnet-4-20250514'
            }
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

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

// --- Shortcuts Section ---

const DEFAULT_SHORTCUTS = [
  { id: 'toggle_sidebar', label: 'Toggle Sidebar', keys: 'Ctrl+B' },
  { id: 'quick_review', label: 'Start Quick Review', keys: 'Ctrl+R' },
  { id: 'search', label: 'Search', keys: 'Ctrl+K' },
  { id: 'toggle_theme', label: 'Toggle Theme', keys: 'Ctrl+Shift+T' },
  { id: 'toggle_caption', label: 'Start/Stop Caption', keys: 'Ctrl+Shift+C' },
  { id: 'new_conversation', label: 'New AI Conversation', keys: 'Ctrl+N' },
];

function ShortcutsSection() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Keyboard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Keyboard Shortcuts</CardTitle>
            <CardDescription>View and customize keyboard shortcuts</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {DEFAULT_SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.id}
              className="flex items-center justify-between py-2.5 px-1 border-b border-border last:border-0"
            >
              <span className="text-sm">{shortcut.label}</span>
              <kbd className="px-2 py-1 rounded bg-muted border border-border text-xs font-mono text-muted-foreground">
                {shortcut.keys}
              </kbd>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Custom key binding will be available in a future update.
        </p>
      </CardContent>
    </Card>
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
      {activeTab === 'shortcuts' && <ShortcutsSection />}
      {activeTab === 'whisper' && <WhisperSetup />}
    </div>
  );
}
