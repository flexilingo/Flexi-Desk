import { useState, useEffect } from 'react';
import { Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/common/InlineError';
import { useTutorStore } from '../stores/tutorStore';
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

export function ConversationSetup() {
  const { startConversation, fetchModes, fetchScenarios, modes, scenarios } = useTutorStore();

  // Form state
  const [selectedMode, setSelectedMode] = useState<ConversationMode>('free');
  const [language, setLanguage] = useState('en');
  const [cefrLevel, setCefrLevel] = useState('B1');
  const [provider, setProvider] = useState('ollama');
  const [model, setModel] = useState(DEFAULT_MODELS.ollama);
  const [topic, setTopic] = useState('');
  const [scenarioId, setScenarioId] = useState('');
  const [deckId, setDeckId] = useState('');

  // UI state
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchModes();
    fetchScenarios();
  }, [fetchModes, fetchScenarios]);

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    setModel(DEFAULT_MODELS[newProvider] ?? '');
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

      await startConversation({
        title,
        language,
        cefrLevel,
        provider,
        model: model.trim() || DEFAULT_MODELS[provider],
        mode: selectedMode,
        topic: selectedMode === 'free' && topic.trim() ? topic.trim() : undefined,
        scenarioId: selectedMode === 'role_play' && scenarioId ? scenarioId : undefined,
        deckId: selectedMode === 'deck_practice' && deckId.trim() ? deckId.trim() : undefined,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setIsStarting(false);
    }
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
            className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
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
            className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Model input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Model</label>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={DEFAULT_MODELS[provider]}
          />
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
              className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select a scenario...</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            {scenarioId && (
              <p className="text-sm text-muted-foreground">
                {scenarios.find((s) => s.id === scenarioId)?.description}
              </p>
            )}
          </div>
        )}

        {selectedMode === 'deck_practice' && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Deck ID</label>
            <Input
              value={deckId}
              onChange={(e) => setDeckId(e.target.value)}
              placeholder="Enter deck ID"
            />
          </div>
        )}

        {/* Start button */}
        <Button className="w-full" disabled={isStarting} onClick={handleStart}>
          {isStarting ? 'Starting...' : 'Start Conversation'}
        </Button>
      </div>
    </div>
  );
}
