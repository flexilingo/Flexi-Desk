import { useState, useEffect } from 'react';
import { Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/common/InlineError';
import { useTutorStore } from '../stores/tutorStore';
import { useOllamaStore } from '@/stores/ollamaStore';
import { ModeCard } from './ModeCard';
import type { ConversationMode } from '../types';

const LANGUAGES = [
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

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const PROVIDERS = [
  { value: 'ollama', label: 'Ollama' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
];

const DEFAULT_MODELS: Record<string, string> = {
  ollama: 'llama3.2',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
};

const CUSTOM_SCENARIO_ID = '__custom__';

const selectClassName =
  'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary';

export function ConversationSetup() {
  const {
    startConversation,
    fetchModes,
    fetchScenarios,
    fetchDecks,
    modes,
    scenarios,
    decks,
    isLoadingDecks,
  } = useTutorStore();

  const {
    installedModels,
    isConnected: ollamaConnected,
    checkConnection: checkOllamaConnection,
  } = useOllamaStore();

  // Form state
  const [selectedMode, setSelectedMode] = useState<ConversationMode>('free');
  const [language, setLanguage] = useState('en');
  const [cefrLevel, setCefrLevel] = useState('B1');
  const [provider, setProvider] = useState('ollama');
  const [model, setModel] = useState(DEFAULT_MODELS.ollama);
  const [topic, setTopic] = useState('');
  const [scenarioId, setScenarioId] = useState('');
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

  // Fetch decks when deck_practice mode is selected
  useEffect(() => {
    if (selectedMode === 'deck_practice') {
      fetchDecks();
    }
  }, [selectedMode, fetchDecks]);

  // Auto-select first Ollama model when connected
  useEffect(() => {
    if (provider === 'ollama' && ollamaConnected && installedModels.length > 0 && !model) {
      setModel(installedModels[0].name);
    }
  }, [provider, ollamaConnected, installedModels, model]);

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    if (newProvider === 'ollama' && ollamaConnected && installedModels.length > 0) {
      setModel(installedModels[0].name);
    } else {
      setModel(DEFAULT_MODELS[newProvider] ?? '');
    }
  };

  const handleStart = async () => {
    if (!language) {
      setError('Please select a language.');
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      const title = `${LANGUAGES.find((l) => l.code === language)?.name ?? language} Practice`;

      // For custom scenarios, pass the custom text via customPrompt
      const isCustomScenario = scenarioId === CUSTOM_SCENARIO_ID;
      const effectiveScenarioId =
        selectedMode === 'role_play' && scenarioId && !isCustomScenario ? scenarioId : undefined;
      const effectiveCustomPrompt = [
        isCustomScenario && customScenario.trim()
          ? `SCENARIO: ${customScenario.trim()}`
          : '',
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

  // Group scenarios by category
  const scenariosByCategory = scenarios.reduce<Record<string, typeof scenarios>>(
    (acc, s) => {
      const cat = s.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(s);
      return acc;
    },
    {},
  );

  const categoryLabels: Record<string, string> = {
    daily_life: 'Daily Life',
    travel: 'Travel',
    social: 'Social',
    professional: 'Professional',
    academic: 'Academic',
    health: 'Health',
    emergency: 'Emergency',
    creative: 'Creative & Fun',
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-6 py-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Mic className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Conversation Practice</h1>
          <p className="text-sm text-muted-foreground">
            Choose a practice mode and configure your voice session.
          </p>
        </div>

        {error && <InlineError message={error} onDismiss={() => setError(null)} />}

        {/* Mode selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Practice Mode</label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {modes.map((mode) => (
              <ModeCard
                key={mode.id}
                mode={mode}
                isSelected={selectedMode === mode.id}
                onClick={() => setSelectedMode(mode.id as ConversationMode)}
              />
            ))}
          </div>
        </div>

        {/* Language selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Practice Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className={selectClassName}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        {/* CEFR level */}
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
            onChange={(e) => handleProviderChange(e.target.value)}
            className={selectClassName}
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Model selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Model</label>
          {provider === 'ollama' && ollamaConnected && installedModels.length > 0 ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className={selectClassName}
            >
              {installedModels.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} ({(m.size / 1e9).toFixed(1)}GB)
                </option>
              ))}
            </select>
          ) : provider === 'ollama' && !ollamaConnected ? (
            <div className="space-y-2">
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={DEFAULT_MODELS[provider]}
              />
              <p className="text-xs text-warning">
                Ollama is not connected. Start Ollama to see your downloaded models.
              </p>
            </div>
          ) : (
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={DEFAULT_MODELS[provider]}
            />
          )}
        </div>

        {/* Conditional fields based on mode */}
        {selectedMode === 'free' && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Topic <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What would you like to talk about?"
            />
          </div>
        )}

        {selectedMode === 'role_play' && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Scenario</label>
            <select
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
              className={selectClassName}
            >
              <option value="">Select a scenario...</option>
              {Object.entries(scenariosByCategory).map(([category, categoryScenarios]) => (
                <optgroup key={category} label={categoryLabels[category] ?? category}>
                  {categoryScenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.cefrMin}+)
                    </option>
                  ))}
                </optgroup>
              ))}
              <optgroup label="Custom">
                <option value={CUSTOM_SCENARIO_ID}>Write your own scenario...</option>
              </optgroup>
            </select>
            {scenarioId && scenarioId !== CUSTOM_SCENARIO_ID && (
              <p className="text-sm text-muted-foreground">
                {scenarios.find((s) => s.id === scenarioId)?.description}
              </p>
            )}
            {scenarioId === CUSTOM_SCENARIO_ID && (
              <textarea
                value={customScenario}
                onChange={(e) => setCustomScenario(e.target.value)}
                placeholder="Describe your scenario... e.g., You're at a flea market negotiating the price of a vintage lamp with a stubborn seller."
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                rows={3}
              />
            )}
          </div>
        )}

        {selectedMode === 'deck_practice' && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Deck</label>
            {isLoadingDecks ? (
              <p className="text-sm text-muted-foreground">Loading decks...</p>
            ) : decks.length > 0 ? (
              <select
                value={deckId}
                onChange={(e) => setDeckId(e.target.value)}
                className={selectClassName}
              >
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
            placeholder="E.g., Focus on business vocabulary, correct my pronunciation of 'th' sounds, speak slowly..."
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            rows={2}
          />
        </div>

        {/* Start button */}
        <Button className="w-full" disabled={isStarting} onClick={handleStart}>
          {isStarting ? 'Starting...' : 'Start Conversation'}
        </Button>
      </div>
    </div>
  );
}
