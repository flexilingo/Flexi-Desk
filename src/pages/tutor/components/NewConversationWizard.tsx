import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Search, Mic, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/common/InlineError';
import { useTutorStore } from '../stores/tutorStore';
import { useOllamaStore } from '@/stores/ollamaStore';
import { ModeCard } from './ModeCard';
import type { ConversationMode } from '../types';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'fa', name: 'Persian', flag: '🇮🇷' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
];

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const PROVIDERS = [
  { value: 'ollama', label: 'Ollama (Local)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
];

const DEFAULT_MODELS: Record<string, string> = {
  ollama: 'llama3.2',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
};

const SUGGESTED_TOPICS = [
  'Travel & Adventures',
  'Food & Cooking',
  'Movies & TV Shows',
  'Music & Concerts',
  'Sports & Fitness',
  'Technology',
  'Books & Reading',
  'Work & Career',
  'Hobbies & Crafts',
  'Nature & Environment',
  'Family & Relationships',
  'Health & Wellness',
  'Fashion & Style',
  'Art & Culture',
  'Science & Discoveries',
  'History & Traditions',
  'Daily Routines',
  'Holidays & Celebrations',
  'Childhood Memories',
  'Future Plans & Dreams',
];

const CATEGORY_LABELS: Record<string, string> = {
  daily_life: 'Daily Life',
  travel: 'Travel',
  social: 'Social',
  professional: 'Professional',
  academic: 'Academic',
  health: 'Health',
  emergency: 'Emergency',
  creative: 'Creative & Fun',
};

const CUSTOM_SCENARIO_ID = '__custom__';

const selectClassName =
  'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary';

export function NewConversationWizard() {
  const {
    startConversation,
    fetchModes,
    fetchScenarios,
    fetchDecks,
    modes,
    scenarios,
    decks,
    isLoadingDecks,
    setView,
  } = useTutorStore();

  const {
    installedModels,
    isConnected: ollamaConnected,
    checkConnection: checkOllamaConnection,
  } = useOllamaStore();

  // Wizard step
  const [step, setStep] = useState(1);

  // Step 1 state
  const [selectedMode, setSelectedMode] = useState<ConversationMode | null>(null);

  // Step 2 state
  const [language, setLanguage] = useState('en');
  const [cefrLevel, setCefrLevel] = useState('B1');
  const [provider, setProvider] = useState('ollama');
  const [model, setModel] = useState(DEFAULT_MODELS.ollama);

  // Step 3 state
  const [topic, setTopic] = useState('');
  const [scenarioId, setScenarioId] = useState('');
  const [scenarioSearch, setScenarioSearch] = useState('');
  const [customScenario, setCustomScenario] = useState('');
  const [deckId, setDeckId] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');

  // UI state
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchModes();
    fetchScenarios();
    checkOllamaConnection();
  }, [fetchModes, fetchScenarios, checkOllamaConnection]);

  useEffect(() => {
    if (selectedMode === 'deck_practice') {
      fetchDecks();
    }
  }, [selectedMode, fetchDecks]);

  // Auto-select Ollama model
  useEffect(() => {
    if (provider === 'ollama' && ollamaConnected && installedModels.length > 0) {
      setModel(installedModels[0].name);
    }
  }, [provider, ollamaConnected, installedModels]);

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    if (newProvider === 'ollama' && ollamaConnected && installedModels.length > 0) {
      setModel(installedModels[0].name);
    } else {
      setModel(DEFAULT_MODELS[newProvider] ?? '');
    }
  };

  // Filtered scenarios for search
  const filteredScenarios = useMemo(() => {
    if (!scenarioSearch.trim()) return scenarios;
    const q = scenarioSearch.toLowerCase();
    return scenarios.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    );
  }, [scenarios, scenarioSearch]);

  // Group filtered scenarios by category
  const scenariosByCategory = useMemo(() => {
    const groups: Record<string, typeof scenarios> = {};
    for (const s of filteredScenarios) {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    }
    return groups;
  }, [filteredScenarios]);

  const handleStart = async () => {
    if (!selectedMode || !language) return;

    setIsStarting(true);
    setError(null);

    try {
      const title = `${LANGUAGES.find((l) => l.code === language)?.name ?? language} Practice`;

      const isCustomScenario = scenarioId === CUSTOM_SCENARIO_ID;
      const effectiveScenarioId =
        selectedMode === 'role_play' && scenarioId && !isCustomScenario ? scenarioId : undefined;
      const effectiveCustomPrompt = [
        isCustomScenario && customScenario.trim() ? `SCENARIO: ${customScenario.trim()}` : '',
        customPrompt.trim(),
      ]
        .filter(Boolean)
        .join('\n\n') || undefined;

      await startConversation({
        title,
        language,
        cefrLevel,
        provider,
        model: model.trim() || DEFAULT_MODELS[provider],
        mode: selectedMode,
        topic: selectedMode === 'free' && topic.trim() ? topic.trim() : undefined,
        scenarioId: effectiveScenarioId,
        deckId: selectedMode === 'deck_practice' && deckId ? deckId : undefined,
        customPrompt: effectiveCustomPrompt,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setIsStarting(false);
    }
  };

  const canGoNext =
    step === 1 ? !!selectedMode : step === 2 ? !!language && !!model.trim() : true;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <button
          type="button"
          onClick={() => (step === 1 ? setView('landing') : setStep(step - 1))}
          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-foreground">New Conversation</h2>
          <p className="text-xs text-muted-foreground">Step {step} of 3</p>
        </div>
        {/* Step indicators */}
        <div className="flex gap-1.5">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 w-8 rounded-full transition-colors ${
                s <= step ? 'bg-primary' : 'bg-border'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-6 py-6 space-y-6">
          {error && <InlineError message={error} onDismiss={() => setError(null)} />}

          {step === 1 && (
            <StepMode
              modes={modes}
              selectedMode={selectedMode}
              onSelectMode={setSelectedMode}
            />
          )}

          {step === 2 && (
            <StepLevelModel
              language={language}
              setLanguage={setLanguage}
              cefrLevel={cefrLevel}
              setCefrLevel={setCefrLevel}
              provider={provider}
              onProviderChange={handleProviderChange}
              model={model}
              setModel={setModel}
              ollamaConnected={ollamaConnected}
              installedModels={installedModels}
            />
          )}

          {step === 3 && (
            <StepTopic
              mode={selectedMode!}
              topic={topic}
              setTopic={setTopic}
              scenarioId={scenarioId}
              setScenarioId={setScenarioId}
              scenarioSearch={scenarioSearch}
              setScenarioSearch={setScenarioSearch}
              scenariosByCategory={scenariosByCategory}
              customScenario={customScenario}
              setCustomScenario={setCustomScenario}
              deckId={deckId}
              setDeckId={setDeckId}
              decks={decks}
              isLoadingDecks={isLoadingDecks}
              customPrompt={customPrompt}
              setCustomPrompt={setCustomPrompt}
            />
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border px-6 py-4 flex justify-between">
        <Button
          variant="outline"
          onClick={() => (step === 1 ? setView('landing') : setStep(step - 1))}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {step < 3 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canGoNext}>
            Next
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={handleStart} disabled={isStarting || !canGoNext}>
            {isStarting ? 'Starting...' : 'Start Conversation'}
            <Mic className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Step 1: Practice Mode ───────────────────────────────

function StepMode({
  modes,
  selectedMode,
  onSelectMode,
}: {
  modes: ReturnType<typeof useTutorStore>['modes'];
  selectedMode: ConversationMode | null;
  onSelectMode: (mode: ConversationMode) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold text-foreground">Choose Practice Mode</h3>
        <p className="text-sm text-muted-foreground">How would you like to practice?</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {modes.map((mode) => (
          <ModeCard
            key={mode.id}
            mode={mode}
            isSelected={selectedMode === mode.id}
            onClick={() => onSelectMode(mode.id as ConversationMode)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Step 2: Language, Level, Model ──────────────────────

function StepLevelModel({
  language,
  setLanguage,
  cefrLevel,
  setCefrLevel,
  provider,
  onProviderChange,
  model,
  setModel,
  ollamaConnected,
  installedModels,
}: {
  language: string;
  setLanguage: (v: string) => void;
  cefrLevel: string;
  setCefrLevel: (v: string) => void;
  provider: string;
  onProviderChange: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  ollamaConnected: boolean;
  installedModels: { name: string; size: number }[];
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold text-foreground">Language & Level</h3>
        <p className="text-sm text-muted-foreground">Configure your practice settings</p>
      </div>

      {/* Language */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Practice Language</label>
        <div className="grid grid-cols-5 gap-2">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => setLanguage(lang.code)}
              className={`flex flex-col items-center gap-1 rounded-lg p-2.5 text-center transition-colors ${
                language === lang.code
                  ? 'border-2 border-primary bg-primary/5'
                  : 'border border-border bg-card hover:bg-muted/50'
              }`}
            >
              <span className="text-lg">{lang.flag}</span>
              <span className="text-[11px] font-medium text-foreground">{lang.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* CEFR Level */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">CEFR Level</label>
        <div className="flex gap-2">
          {CEFR_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setCefrLevel(level)}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                cefrLevel === level
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card text-foreground hover:bg-muted/50'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* AI Provider */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">AI Provider</label>
        <select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value)}
          className={selectClassName}
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Model */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Model</label>
        {provider === 'ollama' && ollamaConnected && installedModels.length > 0 ? (
          <select value={model} onChange={(e) => setModel(e.target.value)} className={selectClassName}>
            {installedModels.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} ({(m.size / 1e9).toFixed(1)}GB)
              </option>
            ))}
          </select>
        ) : provider === 'ollama' && !ollamaConnected ? (
          <div className="space-y-1">
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODELS[provider]} />
            <p className="text-xs text-warning">Ollama is not connected. Start Ollama to see downloaded models.</p>
          </div>
        ) : (
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODELS[provider]} />
        )}
      </div>
    </div>
  );
}

// ── Step 3: Topic / Scenario ────────────────────────────

function StepTopic({
  mode,
  topic,
  setTopic,
  scenarioId,
  setScenarioId,
  scenarioSearch,
  setScenarioSearch,
  scenariosByCategory,
  customScenario,
  setCustomScenario,
  deckId,
  setDeckId,
  decks,
  isLoadingDecks,
  customPrompt,
  setCustomPrompt,
}: {
  mode: ConversationMode;
  topic: string;
  setTopic: (v: string) => void;
  scenarioId: string;
  setScenarioId: (v: string) => void;
  scenarioSearch: string;
  setScenarioSearch: (v: string) => void;
  scenariosByCategory: Record<string, { id: string; title: string; description: string; category: string; cefrMin: string }[]>;
  customScenario: string;
  setCustomScenario: (v: string) => void;
  deckId: string;
  setDeckId: (v: string) => void;
  decks: { id: string; name: string; cardCount: number }[];
  isLoadingDecks: boolean;
  customPrompt: string;
  setCustomPrompt: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold text-foreground">
          {mode === 'free' && 'Choose a Topic'}
          {mode === 'role_play' && 'Choose a Scenario'}
          {mode === 'deck_practice' && 'Select a Deck'}
          {(mode === 'vocab_challenge' || mode === 'escape_room') && 'Additional Settings'}
        </h3>
        <p className="text-sm text-muted-foreground">
          {mode === 'free' && 'Pick a topic or write your own'}
          {mode === 'role_play' && 'Search and select a role-play scenario'}
          {mode === 'deck_practice' && 'Practice vocabulary from your flashcard decks'}
          {(mode === 'vocab_challenge' || mode === 'escape_room') && 'Add custom instructions if you want'}
        </p>
      </div>

      {/* Free mode: topic chips + custom input */}
      {mode === 'free' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Write your own topic <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What would you like to talk about?"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Or pick a suggested topic</label>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_TOPICS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTopic(t)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    topic === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-foreground hover:bg-muted/50 hover:border-primary/50'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Role Play: searchable scenario list */}
      {mode === 'role_play' && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={scenarioSearch}
              onChange={(e) => setScenarioSearch(e.target.value)}
              placeholder="Search scenarios..."
              className="pl-9"
            />
          </div>

          {/* Scrollable scenario list */}
          <div className="max-h-[350px] overflow-y-auto space-y-4 pr-1">
            {Object.entries(scenariosByCategory).map(([category, categoryScenarios]) => (
              <div key={category} className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {CATEGORY_LABELS[category] ?? category}
                </h4>
                <div className="space-y-1.5">
                  {categoryScenarios.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setScenarioId(s.id === scenarioId ? '' : s.id)}
                      className={`w-full text-left rounded-lg p-3 transition-colors ${
                        scenarioId === s.id
                          ? 'border-2 border-primary bg-primary/5'
                          : 'border border-border bg-card hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{s.title}</span>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {s.cefrMin}+
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Custom scenario option */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custom</h4>
              <button
                type="button"
                onClick={() => setScenarioId(scenarioId === CUSTOM_SCENARIO_ID ? '' : CUSTOM_SCENARIO_ID)}
                className={`w-full text-left rounded-lg p-3 transition-colors ${
                  scenarioId === CUSTOM_SCENARIO_ID
                    ? 'border-2 border-primary bg-primary/5'
                    : 'border border-border bg-card hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <PenLine className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Write your own scenario</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Describe any situation you want to practice</p>
              </button>
              {scenarioId === CUSTOM_SCENARIO_ID && (
                <textarea
                  value={customScenario}
                  onChange={(e) => setCustomScenario(e.target.value)}
                  placeholder="E.g., You're at a flea market negotiating the price of a vintage lamp with a stubborn seller..."
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={3}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Deck Practice */}
      {mode === 'deck_practice' && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Deck</label>
          {isLoadingDecks ? (
            <p className="text-sm text-muted-foreground">Loading decks...</p>
          ) : decks.length > 0 ? (
            <select value={deckId} onChange={(e) => setDeckId(e.target.value)} className={selectClassName}>
              <option value="">Select a deck...</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.cardCount} cards)
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-muted-foreground">
              No decks found. Create a deck in the Review section first.
            </p>
          )}
        </div>
      )}

      {/* Custom instructions (all modes) */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Custom Instructions <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="E.g., Focus on business vocabulary, speak slowly, correct me more strictly..."
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
          rows={2}
        />
      </div>
    </div>
  );
}
