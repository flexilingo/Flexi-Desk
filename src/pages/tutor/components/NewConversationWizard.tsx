import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Search, Mic, PenLine, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSearchSelect } from '@/pages/account/components/LanguageSearchSelect';
import { getLanguageName } from '@/config/languages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/common/InlineError';
import { useTutorStore } from '../stores/tutorStore';
import { useOllamaStore } from '@/stores/ollamaStore';
import { useSeedUserAi } from '@/hooks/useSeedUserAi';
import { useAiSource } from '@/stores/aiSourceStore';
import { AiSetupCard } from '@/components/ai/AiSetupCard';
import { ModeCard } from './ModeCard';
import type { ConversationMode } from '../types';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const PROVIDERS = ['ollama', 'openai', 'anthropic'];

const DEFAULT_MODELS: Record<string, string> = {
  ollama: 'llama3.2',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
};

const SUGGESTED_TOPICS = [
  'travel',
  'food',
  'movies',
  'music',
  'sports',
  'technology',
  'books',
  'work',
  'hobbies',
  'nature',
  'family',
  'health',
  'fashion',
  'art',
  'science',
  'history',
  'routines',
  'holidays',
  'childhood',
  'future',
];

const CUSTOM_SCENARIO_ID = '__custom__';

const selectClassName =
  'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary';

export function NewConversationWizard() {
  const { t } = useTranslation('tutor');
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
  // Start on the AI the user set up; never a hard-coded default or the cloud.
  useSeedUserAi(setProvider, setModel);
  const { own: ownAi } = useAiSource();

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
      setModel((current) =>
        installedModels.some((m) => m.name === current) ? current : installedModels[0].name,
      );
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
      const title = t('wizard.practiceTitle', { language: getLanguageName(language) });

      const isCustomScenario = scenarioId === CUSTOM_SCENARIO_ID;
      const effectiveScenarioId =
        selectedMode === 'role_play' && scenarioId && !isCustomScenario ? scenarioId : undefined;
      const effectiveCustomPrompt =
        [
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

  const canGoNext = step === 1 ? !!selectedMode : step === 2 ? !!language && !!model.trim() : true;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <button
          type="button"
          onClick={() => (step === 1 ? setView('landing') : setStep(step - 1))}
          aria-label={t('wizard.backAria')}
          className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted/50 text-muted-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-foreground">{t('wizard.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('wizard.stepOf', { step, total: 3 })}</p>
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
            <StepMode modes={modes} selectedMode={selectedMode} onSelectMode={setSelectedMode} />
          )}

          {step === 2 && ownAi.kind === 'unconfigured' && provider === 'ollama' && (
            <AiSetupCard className="mb-4" compact />
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
          {t('wizard.back')}
        </Button>

        {step < 3 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canGoNext}>
            {t('wizard.next')}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={handleStart} disabled={isStarting || !canGoNext}>
            {isStarting ? t('wizard.starting') : t('wizard.start')}
            {isStarting ? (
              <Loader2 className="h-4 w-4 ml-2 animate-spin" />
            ) : (
              <Mic className="h-4 w-4 ml-2" />
            )}
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
  const { t } = useTranslation('tutor');
  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold text-foreground">{t('wizard.step1Title')}</h3>
        <p className="text-sm text-muted-foreground">{t('wizard.step1Subtitle')}</p>
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
  const { t } = useTranslation('tutor');
  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold text-foreground">{t('wizard.step2Title')}</h3>
        <p className="text-sm text-muted-foreground">{t('wizard.step2Subtitle')}</p>
      </div>

      {/* Language */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          {t('wizard.practiceLanguage')}
        </label>
        <LanguageSearchSelect
          value={language}
          onSelect={setLanguage}
          label={t('wizard.practiceLanguage')}
          searchPlaceholder={t('wizard.languageSearch')}
          noResults={t('wizard.languageNoResults')}
        />
      </div>

      {/* CEFR Level */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">{t('wizard.cefrLevel')}</label>
        <div className="flex gap-2">
          {CEFR_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setCefrLevel(level)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
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
        <label className="text-sm font-medium text-foreground">{t('wizard.aiProvider')}</label>
        <select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value)}
          className={selectClassName}
        >
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {t(`providers.${p}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Model */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">{t('wizard.model')}</label>
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
          <div className="space-y-1">
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={DEFAULT_MODELS[provider]}
            />
            <p className="text-xs text-warning">{t('wizard.ollamaOffline')}</p>
          </div>
        ) : (
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={DEFAULT_MODELS[provider]}
          />
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
  scenariosByCategory: Record<
    string,
    { id: string; title: string; description: string; category: string; cefrMin: string }[]
  >;
  customScenario: string;
  setCustomScenario: (v: string) => void;
  deckId: string;
  setDeckId: (v: string) => void;
  decks: { id: string; name: string; cardCount: number }[];
  isLoadingDecks: boolean;
  customPrompt: string;
  setCustomPrompt: (v: string) => void;
}) {
  const { t } = useTranslation('tutor');
  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold text-foreground">
          {mode === 'free' && t('wizard.topicTitle')}
          {mode === 'role_play' && t('wizard.scenarioTitle')}
          {mode === 'deck_practice' && t('wizard.deckTitle')}
          {(mode === 'vocab_challenge' || mode === 'escape_room') && t('wizard.extraTitle')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {mode === 'free' && t('wizard.topicSubtitle')}
          {mode === 'role_play' && t('wizard.scenarioSubtitle')}
          {mode === 'deck_practice' && t('wizard.deckSubtitle')}
          {(mode === 'vocab_challenge' || mode === 'escape_room') && t('wizard.extraSubtitle')}
        </p>
      </div>

      {/* Free mode: topic chips + custom input */}
      {mode === 'free' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {t('wizard.ownTopic')}{' '}
              <span className="text-muted-foreground font-normal">{t('wizard.optional')}</span>
            </label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t('wizard.topicPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              {t('wizard.suggestedTopic')}
            </label>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_TOPICS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTopic(t(`topics.${key}`))}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    topic === t(`topics.${key}`)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-foreground hover:bg-muted/50 hover:border-primary/50'
                  }`}
                >
                  {t(`topics.${key}`)}
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
              placeholder={t('wizard.searchScenarios')}
              className="pl-9"
            />
          </div>

          {/* Scrollable scenario list */}
          <div className="max-h-[350px] overflow-y-auto space-y-4 pr-1">
            {Object.entries(scenariosByCategory).map(([category, categoryScenarios]) => (
              <div key={category} className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t(`categories.${category}`, { defaultValue: category })}
                </h4>
                <div className="space-y-1.5">
                  {categoryScenarios.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setScenarioId(s.id === scenarioId ? '' : s.id)}
                      className={`block text-start rounded-lg p-3 transition-colors ${
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
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {s.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Custom scenario option */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t('wizard.customGroup')}
              </h4>
              <button
                type="button"
                onClick={() =>
                  setScenarioId(scenarioId === CUSTOM_SCENARIO_ID ? '' : CUSTOM_SCENARIO_ID)
                }
                className={`block text-start rounded-lg p-3 transition-colors ${
                  scenarioId === CUSTOM_SCENARIO_ID
                    ? 'border-2 border-primary bg-primary/5'
                    : 'border border-border bg-card hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <PenLine className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {t('wizard.customScenario')}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('wizard.customScenarioHint')}
                </p>
              </button>
              {scenarioId === CUSTOM_SCENARIO_ID && (
                <textarea
                  value={customScenario}
                  onChange={(e) => setCustomScenario(e.target.value)}
                  placeholder={t('wizard.customScenarioPlaceholder')}
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
          <label className="text-sm font-medium text-foreground">{t('wizard.deck')}</label>
          {isLoadingDecks ? (
            <p className="text-sm text-muted-foreground">{t('wizard.loadingDecks')}</p>
          ) : decks.length > 0 ? (
            <select
              value={deckId}
              onChange={(e) => setDeckId(e.target.value)}
              className={selectClassName}
            >
              <option value="">{t('wizard.selectDeck')}</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {t('wizard.deckCards', { name: d.name, count: d.cardCount })}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-muted-foreground">{t('wizard.noDecks')}</p>
          )}
        </div>
      )}

      {/* Custom instructions (all modes) */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          {t('wizard.customInstructions')}{' '}
          <span className="text-muted-foreground font-normal">{t('wizard.optional')}</span>
        </label>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder={t('wizard.customInstructionsPlaceholder')}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
          rows={2}
        />
      </div>
    </div>
  );
}
