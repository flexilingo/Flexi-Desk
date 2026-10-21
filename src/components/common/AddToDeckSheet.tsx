import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  FileText,
  Brain,
  Plus,
  Check,
  PartyPopper,
  BookOpen,
  Globe,
  ChevronDown,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useReviewStore } from '@/pages/review/stores/reviewStore';
import { targetLanguages, getLanguageByCode } from '@/config/languages';
import type { AIWordAnalysis } from '@/pages/podcast/components/WordDialog/types';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';

export interface AddToDeckItem {
  word: string;
  language: string;
  translation?: string;
  definition?: string;
  pos?: string;
  cefrLevel?: string;
  exampleSentence?: string;
}

type AddMode = 'basic' | 'smart';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: AddToDeckItem[];
  defaultLanguage?: string;
  /** Language the source words are written in (fed to the AI as sourceLanguage). Defaults to each item's `language`, else `defaultLanguage`, else 'en'. */
  sourceLanguage?: string;
  /** Called with the number of cards actually saved after a successful add. */
  onAdded?: (count: number) => void;
}

export function AddToDeckSheet({
  open,
  onOpenChange,
  items,
  defaultLanguage,
  sourceLanguage,
  onAdded,
}: Props) {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const { decks, fetchDecks } = useReviewStore();
  const { nativeLang } = useLanguageSettings();

  // The language the cards are written in — used for deck creation + card rows.
  const cardLanguage = sourceLanguage ?? items[0]?.language ?? defaultLanguage ?? 'en';

  const [mode, setMode] = useState<AddMode>('basic');
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [targetLanguage, setTargetLanguage] = useState<string>(defaultLanguage ?? 'en');

  // Create-deck sub-dialog
  const [showCreateDeck, setShowCreateDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const newDeckInputRef = useRef<HTMLInputElement>(null);

  // Language picker sub-dialog
  const [showLangPicker, setShowLangPicker] = useState(false);

  // Add flow
  const [processing, setProcessing] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressWord, setProgressWord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [enrichedCount, setEnrichedCount] = useState(0);

  const itemCount = items.length;

  // Full state reset on every open, then load decks + preferred target language.
  useEffect(() => {
    if (!open) return;
    setMode('basic');
    setSelectedDeckId('');
    setShowCreateDeck(false);
    setNewDeckName('');
    setIsCreatingDeck(false);
    setCreateError(null);
    setShowLangPicker(false);
    setProcessing(false);
    setProgressCurrent(0);
    setProgressWord('');
    setError(null);
    setSuccess(false);
    setAddedCount(0);
    setEnrichedCount(0);
    fetchDecks();
    // The user's translation language is one global choice, shared with the word
    // dictionary and the subtitle bar. An explicit `defaultLanguage` prop wins.
    setTargetLanguage(defaultLanguage ?? (getLanguageByCode(nativeLang) ? nativeLang : 'en'));
  }, [open, defaultLanguage, nativeLang, fetchDecks]);

  // Auto-select the first deck once the list loads.
  useEffect(() => {
    if (open && decks.length > 0 && !selectedDeckId) {
      setSelectedDeckId(decks[0].id);
    }
  }, [open, decks, selectedDeckId]);

  const resolveErrorCode = (e: unknown): string => {
    const s = String(e);
    if (s.includes('OLLAMA_NOT_RUNNING')) return 'OLLAMA_NOT_RUNNING';
    return 'UNKNOWN_ERROR';
  };

  const errorMessage = (code: string): string => {
    const key = `deck.errors.${code}`;
    const msg = t(key);
    return msg === key ? t('deck.errors.UNKNOWN_ERROR') : msg;
  };

  const handleCreateDeck = async () => {
    const name = newDeckName.trim();
    if (!name) {
      setCreateError(t('deck.newDeckRequired'));
      return;
    }
    setIsCreatingDeck(true);
    setCreateError(null);
    try {
      // Pass the REAL card language — never a hardcoded pair.
      const newDeck = await invoke<{ id: string }>('srs_create_deck', {
        name,
        language: cardLanguage,
        algorithm: 'fsrs',
        description: null,
      });
      await fetchDecks();
      setSelectedDeckId(newDeck.id);
      setNewDeckName('');
      setShowCreateDeck(false);
    } catch (e) {
      setCreateError(errorMessage(resolveErrorCode(e)));
    } finally {
      setIsCreatingDeck(false);
    }
  };

  const addCard = async (item: AddToDeckItem, enriched?: AIWordAnalysis | null) => {
    const example = enriched?.examples?.[0]?.source ?? item.exampleSentence ?? null;
    const notes = enriched?.ipa ? `IPA: ${enriched.ipa}` : null;
    await invoke('srs_add_card', {
      deckId: selectedDeckId,
      word: item.word,
      language: item.language || cardLanguage,
      translation: enriched?.contextualTranslation ?? item.translation ?? null,
      definition: enriched?.definition ?? item.definition ?? null,
      pos: enriched?.partOfSpeech ?? item.pos ?? null,
      cefrLevel: enriched?.difficulty ?? item.cefrLevel ?? null,
      exampleSentence: example,
      notes,
    });
  };

  const handleAdd = async () => {
    if (!selectedDeckId || itemCount === 0) return;
    setProcessing(true);
    setError(null);
    setProgressCurrent(0);
    setProgressWord('');

    let added = 0;
    let enriched = 0;

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setProgressCurrent(i + 1);
        setProgressWord(item.word);

        let analysis: AIWordAnalysis | null = null;
        if (mode === 'smart') {
          try {
            analysis = await invoke<AIWordAnalysis>('ai_word_analysis', {
              word: item.word,
              sentence: item.exampleSentence ?? '',
              targetLanguage,
              sourceLanguage: item.language || cardLanguage,
            });
            enriched++;
          } catch (e) {
            // Model unreachable dooms the whole batch — abort with a clear code.
            if (resolveErrorCode(e) === 'OLLAMA_NOT_RUNNING') throw e;
            // Any other single-word failure: fall back to basic fields, keep going.
            analysis = null;
          }
        }

        try {
          await addCard(item, analysis);
          added++;
        } catch {
          // Skip duplicates / row-level failures silently, keep the batch going.
        }
      }

      // Refresh deck stats so the success screen + Review page show new counts.
      await fetchDecks();

      setAddedCount(added);
      setEnrichedCount(enriched);
      setSuccess(true);
      setProcessing(false);
      onAdded?.(added);
    } catch (e) {
      setError(errorMessage(resolveErrorCode(e)));
      setProcessing(false);
    }
  };

  const handleViewDeck = useCallback(() => {
    navigate('/review');
    onOpenChange(false);
  }, [navigate, onOpenChange]);

  // Processing lock: block Escape / overlay / close-button dismissal mid-add.
  const handleDialogOpenChange = (o: boolean) => {
    if (!o && processing) return;
    onOpenChange(o);
  };

  const currentLang = getLanguageByCode(targetLanguage);
  const selectedDeck = decks.find((d) => d.id === selectedDeckId);

  const renderSuccess = () => (
    <div className="py-6 px-2 text-center">
      <div className="mx-auto mb-3 w-14 h-14 inline-flex items-center justify-center rounded-2xl bg-success/15 text-success">
        <PartyPopper className="w-7 h-7" strokeWidth={1.75} />
      </div>
      <div className="text-lg font-bold text-success mb-1">
        {t('deck.successTitle', { count: addedCount })}
      </div>
      <div className="text-sm text-muted-foreground mb-4">
        {t('deck.savedTo', { deck: selectedDeck?.name ?? '' })}
      </div>

      <div className="bg-muted/40 border border-border rounded-xl p-4 mb-5 mx-auto max-w-[360px] text-left">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-success/20 border border-success flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5 text-success" strokeWidth={3} />
          </div>
          <div className="text-sm text-foreground">
            {mode === 'smart' && enrichedCount > 0
              ? enrichedCount === addedCount
                ? t('deck.allEnriched', { count: addedCount })
                : t('deck.enrichedSummary', {
                    enriched: enrichedCount,
                    plain: addedCount - enrichedCount,
                  })
              : t('deck.addedBasic', { count: addedCount })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          {t('deck.close')}
        </Button>
        <Button variant="default" size="sm" onClick={handleViewDeck}>
          <BookOpen className="w-4 h-4" />
          {t('deck.viewDeck')}
        </Button>
      </div>
    </div>
  );

  const renderProcessing = () => (
    <div className="py-8 px-2 text-center">
      <div className="mx-auto mb-4 w-12 h-12 inline-flex items-center justify-center rounded-2xl bg-accent/15 text-accent">
        <Loader2 className="w-6 h-6 animate-spin" strokeWidth={2} />
      </div>
      <div className="text-base font-semibold text-foreground mb-1">
        {mode === 'smart'
          ? t('deck.analyzing', { current: progressCurrent, total: itemCount })
          : t('deck.saving', { current: progressCurrent, total: itemCount })}
      </div>
      {progressWord && (
        <div className="text-sm text-muted-foreground mb-4" dir="auto">
          {progressWord}
        </div>
      )}
      <div className="mx-auto max-w-[320px] h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-200"
          // The only inline style here: a continuous 0-100% width that no
          // Tailwind class can express. Bucketing it would make the bar jump.
          style={{
            width: `${itemCount ? (progressCurrent / itemCount) * 100 : 0}%`,
          }}
        />
      </div>
    </div>
  );

  const renderForm = () => (
    <div className="space-y-4">
      {/* Error banner (retryable) */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-error/10 border border-error/30 px-3 py-2.5">
          <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
          <p className="text-sm text-error flex-1">{error}</p>
        </div>
      )}

      {/* Mode selection */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('deck.mode')}
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('basic')}
            disabled={processing}
            className={`inline-flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg border-2 text-sm font-semibold transition-colors min-w-0 disabled:opacity-50 ${
              mode === 'basic'
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/40'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0 text-success" strokeWidth={2} />
            <span className="truncate">{t('deck.modeBasic')}</span>
            <span className="rounded bg-success/20 px-1.5 py-0.5 text-[10px] font-semibold text-success shrink-0">
              {t('deck.badgeFree')}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode('smart')}
            disabled={processing}
            className={`inline-flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg border-2 text-sm font-semibold transition-colors min-w-0 disabled:opacity-50 ${
              mode === 'smart'
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/40'
            }`}
          >
            <Brain className="w-4 h-4 shrink-0 text-accent" strokeWidth={2} />
            <span className="truncate">{t('deck.modeSmart')}</span>
            <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent shrink-0">
              {t('deck.badgeOnDevice')}
            </span>
          </button>
        </div>
        <p className="text-xs text-muted-foreground leading-snug px-0.5">
          {mode === 'basic' ? t('deck.modeBasicDesc') : t('deck.modeSmartDesc')}
        </p>
      </div>

      {/* Target language (only meaningful for Smart, but always visible) */}
      <button
        type="button"
        onClick={() => setShowLangPicker(true)}
        disabled={processing}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-muted/30 border border-border rounded-lg hover:border-primary/50 transition-colors text-left disabled:opacity-50"
      >
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
          <Globe className="w-4 h-4 text-accent shrink-0" strokeWidth={2} />
          <span className="truncate">{t('deck.translatingTo')}</span>
        </span>
        <span className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <span className="font-mono text-[10px] uppercase bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
            {currentLang?.code ?? targetLanguage}
          </span>
          <span className="truncate max-w-[120px]">
            {currentLang?.nativeName ?? currentLang?.name ?? targetLanguage}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </span>
      </button>

      {/* Deck selection */}
      <div className="space-y-2 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('deck.selectDeck')}
          </label>
          <button
            type="button"
            disabled={processing}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent/80 transition-colors shrink-0 disabled:opacity-50"
            onClick={() => {
              setCreateError(null);
              setNewDeckName('');
              setShowCreateDeck(true);
            }}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            {t('deck.createNewDeck')}
          </button>
        </div>

        {decks.length === 0 ? (
          <div className="py-8 text-center flex flex-col items-center gap-2">
            <div className="w-11 h-11 inline-flex items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <BookOpen className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <p className="text-sm text-muted-foreground">{t('deck.noDecks')}</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[220px] overflow-y-auto min-w-0">
            {decks.map((deck) => (
              <button
                key={deck.id}
                type="button"
                disabled={processing}
                onClick={() => setSelectedDeckId(deck.id)}
                className={`w-full min-w-0 flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors disabled:opacity-50 ${
                  selectedDeckId === deck.id
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-muted/30 hover:border-primary/50'
                }`}
              >
                <div className="flex flex-col items-start gap-0.5 min-w-0">
                  <span className="text-sm font-semibold truncate max-w-full text-foreground">
                    {deck.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t('deck.cardCount', { count: deck.cardCount ?? 0 })}
                  </span>
                </div>
                {selectedDeckId === deck.id && (
                  <Check className="w-4 h-4 text-primary shrink-0 ml-2" strokeWidth={3} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-row flex-wrap justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          {t('deck.cancel')}
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleAdd}
          disabled={processing || !selectedDeckId || itemCount === 0}
        >
          {processing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t('deck.adding')}
            </>
          ) : (
            <>
              {mode === 'smart' ? <Sparkles className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {t('deck.add', { count: itemCount })}
            </>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className="max-w-[460px] max-h-[88vh] overflow-y-auto"
          onPointerDownOutside={(e) => processing && e.preventDefault()}
          onEscapeKeyDown={(e) => processing && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <Sparkles className="w-5 h-5 text-accent shrink-0" strokeWidth={2} />
              {t('deck.addTitle')}
            </DialogTitle>
            <DialogDescription>{t('deck.wordCount', { count: itemCount })}</DialogDescription>
          </DialogHeader>

          {success ? renderSuccess() : processing ? renderProcessing() : renderForm()}
        </DialogContent>
      </Dialog>

      {/* Create-deck sub-dialog */}
      <Dialog
        open={showCreateDeck}
        onOpenChange={(o) => {
          if (isCreatingDeck) return;
          setShowCreateDeck(o);
          if (!o) {
            setNewDeckName('');
            setCreateError(null);
          }
        }}
      >
        <DialogContent
          className="max-w-[400px]"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            newDeckInputRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('deck.createNewDeck')}</DialogTitle>
          </DialogHeader>
          <Input
            ref={newDeckInputRef}
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            placeholder={t('deck.newDeckPlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newDeckName.trim()) handleCreateDeck();
            }}
          />
          {createError && (
            <div className="flex items-start gap-2 rounded-lg bg-error/10 border border-error/30 px-3 py-2">
              <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
              <p className="text-sm text-error flex-1">{createError}</p>
            </div>
          )}
          <div className="flex flex-row flex-wrap justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowCreateDeck(false);
                setNewDeckName('');
                setCreateError(null);
              }}
            >
              {t('deck.cancel')}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleCreateDeck}
              disabled={isCreatingDeck || !newDeckName.trim()}
            >
              {isCreatingDeck && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('deck.create')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Language picker sub-dialog */}
      <Dialog open={showLangPicker} onOpenChange={setShowLangPicker}>
        <DialogContent className="max-w-[420px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <Globe className="w-5 h-5 text-accent shrink-0" strokeWidth={2} />
              {t('deck.translatingTo')}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {targetLanguages.map((lang) => {
              const isActive = targetLanguage === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => {
                    setTargetLanguage(lang.code);
                    setShowLangPicker(false);
                  }}
                  className={`inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-colors text-left min-w-0 ${
                    isActive
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-muted/30 hover:border-primary/50'
                  }`}
                >
                  <span className="font-mono text-[10px] uppercase bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                    {lang.code}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-foreground truncate">
                      {lang.nativeName}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{lang.name}</div>
                  </div>
                  {isActive && <Check className="w-4 h-4 text-primary shrink-0" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
