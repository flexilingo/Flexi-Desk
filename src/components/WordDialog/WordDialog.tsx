import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Bot,
  Check,
  ChevronDown,
  Globe,
  Library,
  Plus,
  Settings,
  Share2,
  X,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '@/lib/utils';
import { DialogOverlay } from '@/components/ui/dialog';
import { AddToDeckSheet, type AddToDeckItem } from '@/components/common/AddToDeckSheet';
import { useAuthStore } from '@/stores/authStore';
import { useAiSource } from '@/stores/aiSourceStore';
import { routeOf } from '@/lib/aiSource';
import { useLanguageSettings, useLanguageStore } from '@/hooks/useLanguageSettings';
import { useReviewStore } from '@/pages/review/stores/reviewStore';
import { usePlayerStore } from '@/pages/podcast/stores/playerStore';
import {
  errorCodeOf,
  chooseLookupOrigin,
  dialogSpeakers,
  effectiveTab,
  isPhrase,
  lookupKeyFor,
  pairFor,
  resolveSourceLanguage,
  tabsFor,
} from './logic';
import { logLookup, lookupWord } from './api';
import { directionOf, sourceLanguages, targetLanguages } from './languages';
import { readLastTab, rememberTab } from './lastTab';
import { rememberDeck, useLastDeck } from './lastDeck';
import { bumpSeen } from './lookupCounts';
import { addErrorCode, useAddWordToDeck } from './useAddWordToDeck';
import { pronounce, usePronunciationSettings, voiceFor } from './pronounce';
import { PronounceButton } from './PronounceButton';
import { LanguagePickerSheet } from './LanguagePickerSheet';
import { LocaleBadge } from './LocaleBadge';
import { VoiceSettings } from './VoiceSettings';
import { CefrChip } from './CefrChip';
import { WordTrailNav, WordTrailProvider } from './WordTrail';
import WordGrammar, { grammarForms, useWordGrammar } from './WordGrammar';
import { TranslateTab } from './tabs/TranslateTab';
import { AITab } from './tabs/AITab';
import { DictionaryTab } from './tabs/DictionaryTab';
import { ActionButton, IconButton } from './ui';
import type {
  AIWordAnalysis,
  DeckCardData,
  DictionaryResponse,
  TrailLevel,
  WordDetails,
  WordDialogProps,
  WordDialogTab,
} from './types';

const TAB_ICON = {
  google: Globe,
  ai: Bot,
  dictionary: BookOpen,
  'merriam-webster': Library,
} as const;

/** The dialog is mounted fresh for every word the host opens (a new trail), and not at all while closed. */
export function WordDialog(props: WordDialogProps) {
  if (!props.open || !props.word.trim()) return null;
  return <WordDialogInner key={`${props.word}\u0000${props.sentenceContext ?? ''}`} {...props} />;
}

/** "Review now" needs the router; rendered only where there is one. */
function ReviewNow({ label, onGo }: { label: string; onGo: () => void }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        navigate('/review');
        onGo();
      }}
      className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
    </button>
  );
}

function WordDialogInner({
  word: rootWord,
  sentenceContext: rootContext,
  sourceLang,
  targetLang: targetProp,
  onTargetLanguageChange,
  initialTab,
  onOpenChange,
  episodeId,
  positionMs,
}: WordDialogProps) {
  const { t } = useTranslation('wordDialog');
  const inRouter = useInRouterContext();
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const contentRef = useRef<HTMLDivElement>(null);

  // ── who is asking, and which language pair ──────────────────────────────
  const signedIn = useAuthStore((s) => !!s.session);
  const {
    nativeLang,
    setNativeLang,
    targetLang: learningLang,
    setTargetLang: setLearningLang,
  } = useLanguageSettings();
  const languagesReady = useLanguageStore((s) => s.hydrated);
  // The user's own AI answers by default; FlexiLingo's cloud only when they switched it on.
  const { source: aiSource } = useAiSource();

  const [sourcePick, setSourcePick] = useState<string | null>(null);
  const dialogSource =
    sourcePick ??
    resolveSourceLanguage({ explicit: sourceLang, learning: languagesReady ? learningLang : null });
  // Null until the reader's language is known: every fetch below waits for it, so no
  // lookup is spent on a language they are not reading.
  const dialogTarget: string | null = targetProp ?? (languagesReady ? nativeLang : null);

  // ── the word trail ──────────────────────────────────────────────────────
  const [levels, setLevels] = useState<TrailLevel[]>(() => [
    { word: rootWord.trim(), context: rootContext },
  ]);
  const level = levels[levels.length - 1];
  const { word, context: sourceContext } = level;
  const sourceLanguage = level.source ?? dialogSource;
  const targetLanguage = level.target ?? dialogTarget;
  // Answers already fetched in this dialog, so a level the reader comes back to is shown at once.
  const [lookupCache] = useState(() => new Map<string, WordDetails>());
  const [aiCache] = useState(() => new Map<string, AIWordAnalysis>());
  const [dictCache] = useState(() => new Map<string, DictionaryResponse | null>());

  const [activeTab, setActiveTab] = useState<WordDialogTab>(
    () => initialTab ?? readLastTab() ?? 'google',
  );
  const tab = effectiveTab(activeTab, sourceLanguage);

  // ── the lookup ──────────────────────────────────────────────────────────
  const lookupKey = lookupKeyFor({
    word,
    context: sourceContext,
    source: sourceLanguage,
    target: targetLanguage,
  });
  const [attempt, setAttempt] = useState(0);
  const [lookup, setLookup] = useState<{
    key: string;
    attempt: number;
    details: WordDetails | null;
    error: string | null;
  } | null>(null);
  const answered = lookup && lookup.key === lookupKey && lookup.attempt === attempt ? lookup : null;
  const cachedDetails = lookupKey ? lookupCache.get(lookupKey) : undefined;
  const wordDetails = answered?.details ?? cachedDetails ?? null;
  const errorCode = answered?.error ?? null;
  const loading = !answered && !cachedDetails;
  // Tagged with its word: the next level must not show this one's count.
  const [seen, setSeen] = useState<{ word: string; count: number } | null>(null);

  const recordWordClick = usePlayerStore((s) => s.recordWordClick);
  const recordWordAddedToDeck = usePlayerStore((s) => s.recordWordAddedToDeck);
  useEffect(() => {
    if (episodeId) recordWordClick();
  }, [episodeId, recordWordClick]);

  useEffect(() => {
    if (!lookupKey || !targetLanguage || lookupCache.has(lookupKey)) return;
    let live = true;
    const origin = chooseLookupOrigin({ signedIn, source: sourceLanguage, target: targetLanguage });
    lookupWord({
      word,
      source: sourceLanguage,
      target: targetLanguage,
      context: sourceContext,
      origin,
    })
      .then((details) => {
        lookupCache.set(lookupKey, details);
        void logLookup({ word, source: sourceLanguage, details, context: sourceContext });
        if (!live) return;
        setSeen({ word, count: bumpSeen(sourceLanguage, word) });
        setLookup({ key: lookupKey, attempt, details, error: null });
      })
      .catch((err) => {
        if (live) setLookup({ key: lookupKey, attempt, details: null, error: errorCodeOf(err) });
      });
    return () => {
      live = false;
    };
  }, [
    lookupKey,
    attempt,
    lookupCache,
    signedIn,
    word,
    sourceLanguage,
    targetLanguage,
    sourceContext,
  ]);

  // ── grammar (French): one request shared by the strip and the example highlighting ──
  const grammar = useWordGrammar(word, sourceLanguage);
  const knownForms = useMemo(() => [word, ...grammarForms(grammar)], [word, grammar]);

  // ── header surfaces: language pickers, settings ─────────────────────────
  const [openPanel, setOpenPanel] = useState<'settings' | 'source' | 'target' | null>(null);
  const togglePanel = (panel: 'settings' | 'source' | 'target') =>
    setOpenPanel((p) => (p === panel ? null : panel));
  const canChangeTarget = !!level.target || !targetProp || !!onTargetLanguageChange;

  const scrollFrame = useRef<number | null>(null);
  const scrollContentTo = useCallback((top: number) => {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = null;
    const el = contentRef.current;
    if (!el) return;
    el.scrollTop = top;
    if (top === 0) return;
    const until = performance.now() + 800;
    const step = () => {
      el.scrollTop = top;
      scrollFrame.current =
        el.scrollTop < top - 1 && performance.now() < until ? requestAnimationFrame(step) : null;
    };
    scrollFrame.current = requestAnimationFrame(step);
  }, []);
  useEffect(
    () => () => {
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    },
    [],
  );

  const pairForLang = useCallback(
    (lang: string) => pairFor(lang, { source: sourceLanguage, target: targetLanguage }),
    [sourceLanguage, targetLanguage],
  );

  /** One level deeper: any word the tabs show, or a whole chip. */
  const lookUp = useCallback(
    (next: string, sentence: string | undefined, lang: string) => {
      const clean = next.trim();
      const pair = pairForLang(lang);
      if (!clean || !pair) return;
      if (pair.source === sourceLanguage && clean.toLowerCase() === word.trim().toLowerCase())
        return;
      // The dialog's own pair is not stored, so the level follows a language the reader
      // changes later; only a different pair is pinned to it.
      const own = pair.source === dialogSource && pair.target === dialogTarget;
      const scrollTop = contentRef.current?.scrollTop ?? 0;
      setLevels((prev) => [
        ...prev.slice(0, -1),
        { ...prev[prev.length - 1], tab, scrollTop },
        {
          word: clean,
          context: sentence?.trim() || undefined,
          ...(own ? {} : { source: pair.source, target: pair.target }),
        },
      ]);
      setOpenPanel(null);
      scrollContentTo(0);
    },
    [pairForLang, sourceLanguage, word, dialogSource, dialogTarget, tab, scrollContentTo],
  );

  const trail = useMemo(
    () => ({
      lookUp,
      canLookUp: (lang: string) => pairForLang(lang) !== null,
      current: { lang: sourceLanguage, forms: knownForms },
    }),
    [lookUp, pairForLang, sourceLanguage, knownForms],
  );

  /** Back to a level on the trail, with the tab and scroll it was left at. */
  const goToLevel = useCallback(
    (index: number) => {
      const target = levels[index];
      if (!target || index >= levels.length - 1) return;
      setLevels(levels.slice(0, index + 1));
      if (target.tab) setActiveTab(target.tab);
      setOpenPanel(null);
      scrollContentTo(target.scrollTop ?? 0);
    },
    [levels, scrollContentTo],
  );
  const goBack = useCallback(() => goToLevel(levels.length - 2), [goToLevel, levels.length]);

  const handleSourceChange = (code: string) => {
    setOpenPanel(null);
    if (code === sourceLanguage) return;
    // A level with its own pair keeps the pick to itself.
    if (level.source) {
      setLevels((prev) => [...prev.slice(0, -1), { ...prev[prev.length - 1], source: code }]);
      return;
    }
    setSourcePick(code);
    // Also the reader's learning language, unless the host pinned the text's language.
    if (!sourceLang) void setLearningLang(code);
  };

  const handleTargetChange = (code: string) => {
    if (level.target) {
      setLevels((prev) => [...prev.slice(0, -1), { ...prev[prev.length - 1], target: code }]);
      return;
    }
    // Saved as the reader's own language, so every page that follows the setting picks it up.
    void setNativeLang(code);
    onTargetLanguageChange?.(code);
  };

  // ── keyboard: Escape closes the innermost thing first; P pronounces ─────
  const [showAddToDeck, setShowAddToDeck] = useState(false);
  const handleEscape = (event: KeyboardEvent) => {
    if (showAddToDeck) return;
    event.preventDefault();
    if (openPanel) setOpenPanel(null);
    else if (levels.length > 1) goBack();
    else close();
  };
  const pronounceRef = useRef<() => void>(() => {});
  useEffect(() => {
    pronounceRef.current = () => void pronounce(word, sourceLanguage);
  }, [word, sourceLanguage]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'p' && event.key !== 'P') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (
        (event.target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"]')
      )
        return;
      pronounceRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ── auto-pronounce: only on a new word / source language, not when the setting is toggled ──
  // Subscribed, so the speakers below follow a region picked in settings.
  const { autoPronounce } = usePronunciationSettings();
  const autoRef = useRef(autoPronounce);
  useEffect(() => {
    autoRef.current = autoPronounce;
  }, [autoPronounce]);
  useEffect(() => {
    if (!word.trim() || !autoRef.current) return;
    const timer = setTimeout(() => void pronounce(word, sourceLanguage), 250);
    return () => clearTimeout(timer);
  }, [word, sourceLanguage]);

  // ── saving: one tap to the last deck, or the full sheet ────────────────
  const tabDeckData = useRef<Record<WordDialogTab, DeckCardData | null>>({
    google: null,
    ai: null,
    dictionary: null,
    'merriam-webster': null,
  });
  const onGoogleDeck = useCallback(
    (d: DeckCardData | null) => void (tabDeckData.current.google = d),
    [],
  );
  const onAiDeck = useCallback((d: DeckCardData | null) => void (tabDeckData.current.ai = d), []);
  const onDictDeck = useCallback(
    (d: DeckCardData | null) => void (tabDeckData.current.dictionary = d),
    [],
  );
  const onMwDeck = useCallback(
    (d: DeckCardData | null) => void (tabDeckData.current['merriam-webster'] = d),
    [],
  );

  const decks = useReviewStore((s) => s.decks);
  const fetchDecks = useReviewStore((s) => s.fetchDecks);
  useEffect(() => {
    void fetchDecks();
  }, [fetchDecks]);
  const lastDeck = useLastDeck();
  const quickDeck = lastDeck ? (decks.find((d) => d.id === lastDeck.deckId) ?? null) : null;
  const addWord = useAddWordToDeck();
  // Frozen when the sheet is first needed: remembering a save must not reset the open sheet.
  const [sheetDefaults] = useState(() => ({ deckId: lastDeck?.deckId, mode: lastDeck?.mode }));

  const [quick, setQuick] = useState<{
    word: string;
    state: 'idle' | 'saving' | 'saved';
    error: string | null;
  }>({
    word,
    state: 'idle',
    error: null,
  });
  const quickState = quick.word === word ? quick : { word, state: 'idle' as const, error: null };
  const [addToDeckData, setAddToDeckData] = useState<DeckCardData | null>(null);

  const openAddToDeck = () => {
    setAddToDeckData(tabDeckData.current[tab]);
    setShowAddToDeck(true);
  };

  const handleQuickSave = async () => {
    if (!quickDeck || !lastDeck || quickState.state !== 'idle') return;
    const data = tabDeckData.current[tab];
    setQuick({ word, state: 'saving', error: null });
    try {
      await addWord({
        deckId: quickDeck.id,
        mode: lastDeck.mode,
        word: data?.word ?? wordDetails?.word ?? word,
        translation: data?.back ?? wordDetails?.translation ?? '',
        cefr: wordDetails?.cefr,
        pos: wordDetails?.pos,
        context: sourceContext,
        examples: data?.examples ?? wordDetails?.examples,
        source: sourceLanguage,
        target: targetLanguage ?? 'en',
      });
      setQuick({ word, state: 'saved', error: null });
      if (episodeId) recordWordAddedToDeck();
      void fetchDecks();
    } catch (err) {
      const code = addErrorCode(err);
      setQuick({
        word,
        state: 'idle',
        error: t(`errors.${code}`, { defaultValue: t('saveFailed') }),
      });
    }
  };

  const sheetItem: AddToDeckItem = {
    word: addToDeckData?.word ?? wordDetails?.word ?? word,
    language: sourceLanguage,
    translation: addToDeckData?.back ?? wordDetails?.translation,
    pos: wordDetails?.pos,
    cefrLevel: wordDetails?.cefr,
    exampleSentence:
      addToDeckData?.examples[0]?.source ?? wordDetails?.examples[0]?.source ?? sourceContext,
  };

  // ── share (copy) and bookmark ───────────────────────────────────────────
  const [shareNote, setShareNote] = useState<{ ok: boolean } | null>(null);
  useEffect(() => {
    if (!shareNote) return;
    const timer = setTimeout(() => setShareNote(null), 2200);
    return () => clearTimeout(timer);
  }, [shareNote]);
  const handleShare = async () => {
    const lines = [word, wordDetails?.translation, wordDetails?.examples[0]?.source].filter(
      Boolean,
    );
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setShareNote({ ok: true });
    } catch {
      setShareNote({ ok: false });
    }
  };

  const [bookmark, setBookmark] = useState<{ state: 'idle' | 'saving' | 'saved'; error: boolean }>({
    state: 'idle',
    error: false,
  });
  const canBookmark = !!episodeId && positionMs !== undefined;
  const handleBookmark = async () => {
    if (!canBookmark || bookmark.state !== 'idle') return;
    setBookmark({ state: 'saving', error: false });
    try {
      await invoke('podcast_add_bookmark', {
        episodeId,
        positionMs,
        label: word,
        note: wordDetails?.translation ?? null,
      });
      setBookmark({ state: 'saved', error: false });
    } catch {
      setBookmark({ state: 'idle', error: true });
    }
  };

  // ── pieces of the header ────────────────────────────────────────────────
  const speakers = dialogSpeakers(sourceLanguage, voiceFor(sourceLanguage));
  const phrase = isPhrase(word);
  const targetShown = targetLanguage ?? nativeLang;
  const tabs = tabsFor(sourceLanguage);
  const tabLabel = (id: WordDialogTab) =>
    id === 'google'
      ? t('tabTranslate')
      : id === 'ai'
        ? 'AI'
        : id === 'dictionary'
          ? t('tabDictionary')
          : 'M-W';
  const errorText = errorCode
    ? t(`errors.${errorCode}`, { defaultValue: t('errors.UNKNOWN_ERROR') })
    : null;

  const deckActions =
    quickDeck && lastDeck ? (
      <>
        <ActionButton
          loading={quickState.state === 'saving'}
          onClick={handleQuickSave}
          title={quickDeck.name}
          className="max-w-[15rem]"
        >
          {quickState.state === 'saved' ? (
            <Check className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <span className="truncate">
            {quickState.state === 'saved'
              ? t('savedToDeck', { deck: quickDeck.name })
              : t('saveToDeck', { deck: quickDeck.name })}
          </span>
        </ActionButton>
        <button
          type="button"
          onClick={openAddToDeck}
          aria-label={t('chooseAnotherDeck')}
          title={t('chooseAnotherDeck')}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border border-border bg-card text-foreground transition-colors hover:bg-muted"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </>
    ) : (
      <ActionButton onClick={openAddToDeck}>
        <Plus className="h-4 w-4" />
        {t('addToDeck')}
      </ActionButton>
    );

  return (
    <WordTrailProvider value={trail}>
      <DialogPrimitive.Root open onOpenChange={(o) => !o && close()}>
        <DialogPrimitive.Portal>
          <DialogOverlay className="bg-black/30 backdrop-blur-sm" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            onEscapeKeyDown={handleEscape}
            onInteractOutside={(e) => {
              if (showAddToDeck) e.preventDefault();
            }}
            className="fixed left-1/2 top-1/2 z-50 flex h-[650px] max-h-[90vh] w-[760px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          >
            {/* Word header: the controls take their own row on a narrow window, beside the title otherwise. */}
            <div className="flex shrink-0 flex-col-reverse gap-2 border-b border-border bg-background px-5 pb-4 pt-3 md:flex-row md:items-start md:justify-between md:px-6 md:pt-5">
              <div className="w-full min-w-0 md:w-auto md:flex-1">
                <WordTrailNav
                  words={levels.map((l) => l.word)}
                  dir={directionOf(sourceLanguage)}
                  onGoTo={goToLevel}
                />
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <DialogPrimitive.Title
                    dir="auto"
                    className={cn(
                      'm-0 me-1 min-w-0 break-words text-foreground',
                      phrase
                        ? 'max-h-[60px] basis-full overflow-y-auto text-[15px] font-semibold leading-[20px] md:max-h-[80px]'
                        : 'text-[22px] font-bold md:text-2xl',
                    )}
                  >
                    {word}
                  </DialogPrimitive.Title>
                  <div className="flex items-center gap-2">
                    {speakers.map((speaker) => (
                      <PronounceButton
                        key={speaker.voice}
                        text={word}
                        language={sourceLanguage}
                        voice={speaker.voice}
                        label={speaker.label}
                        title={
                          speaker.voice.includes('-')
                            ? t(`voiceRegions.${speaker.voice.replace('-', '_')}`)
                            : t('playPronunciationShortcut')
                        }
                      />
                    ))}
                    {wordDetails?.cefr && <CefrChip level={wordDetails.cefr} small />}
                    {wordDetails?.pos && (
                      <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                        {wordDetails.pos}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {wordDetails?.phonetic && (
                    <span className="font-serif text-[13px] text-muted-foreground">
                      {wordDetails.phonetic}
                    </span>
                  )}
                  {seen?.word === word && seen.count > 1 && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {t('seenTimes', { count: seen.count })}
                    </span>
                  )}
                </div>
              </div>

              <div className="relative flex items-center gap-1.5 self-end md:self-auto">
                {/* Language pair: always visible, so the direction is never a guess. Two halves, two pickers. */}
                <div
                  title={t('languagePairHint')}
                  className={cn(
                    'inline-flex h-8 items-center rounded-full border bg-background transition-colors',
                    openPanel === 'source' || openPanel === 'target'
                      ? 'border-primary'
                      : 'border-border',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => togglePanel('source')}
                    aria-label={t('sourceLanguage')}
                    aria-expanded={openPanel === 'source'}
                    className={cn(
                      'inline-flex h-full items-center gap-0.5 rounded-s-full ps-1.5 pe-1 transition-colors hover:bg-muted',
                      openPanel === 'source' && 'bg-primary/10',
                    )}
                  >
                    <LocaleBadge code={sourceLanguage} size={18} />
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                  <ArrowRight
                    className="mx-0.5 h-3 w-3 shrink-0 text-muted-foreground [&:dir(rtl)]:rotate-180"
                    aria-hidden="true"
                  />
                  {canChangeTarget ? (
                    <button
                      type="button"
                      onClick={() => togglePanel('target')}
                      aria-label={t('translateTo')}
                      aria-expanded={openPanel === 'target'}
                      className={cn(
                        'inline-flex h-full items-center gap-0.5 rounded-e-full ps-1 pe-1.5 transition-colors hover:bg-muted',
                        openPanel === 'target' && 'bg-primary/10',
                      )}
                    >
                      <LocaleBadge code={targetShown} size={18} />
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </button>
                  ) : (
                    <span className="inline-flex h-full items-center ps-1 pe-2">
                      <LocaleBadge code={targetShown} size={20} />
                    </span>
                  )}
                </div>
                <IconButton
                  onClick={() => togglePanel('settings')}
                  label={t('settings')}
                  pressed={openPanel === 'settings'}
                >
                  <Settings />
                </IconButton>
                <IconButton onClick={() => void handleShare()} label={t('share')}>
                  <Share2 />
                </IconButton>
                {canBookmark && (
                  <IconButton
                    onClick={() => void handleBookmark()}
                    label={bookmark.state === 'saved' ? t('bookmarked') : t('bookmark')}
                    pressed={bookmark.state === 'saved'}
                  >
                    <Bookmark />
                  </IconButton>
                )}
                <IconButton onClick={close} label={t('close')}>
                  <X />
                </IconButton>

                {shareNote && (
                  <p
                    role="status"
                    className={cn(
                      'absolute end-0 top-full z-[62] mt-1 rounded-md border px-2.5 py-1 text-[12px] shadow-md',
                      shareNote.ok
                        ? 'border-success/40 bg-popover text-success'
                        : 'border-error/40 bg-popover text-error',
                    )}
                  >
                    {shareNote.ok ? t('shareCopied') : t('shareFailed')}
                  </p>
                )}

                {openPanel === 'source' && (
                  <LanguagePickerSheet
                    title={t('sourceLanguage')}
                    languages={sourceLanguages}
                    value={sourceLanguage}
                    onSelect={handleSourceChange}
                    onClose={() => setOpenPanel(null)}
                  />
                )}
                {openPanel === 'target' && (
                  <LanguagePickerSheet
                    title={t('translateTo')}
                    languages={targetLanguages}
                    value={targetShown}
                    onSelect={handleTargetChange}
                    onClose={() => setOpenPanel(null)}
                  />
                )}
                {openPanel === 'settings' && (
                  <>
                    <button
                      type="button"
                      aria-hidden="true"
                      tabIndex={-1}
                      onClick={() => setOpenPanel(null)}
                      className="fixed inset-0 z-[60] cursor-default"
                    />
                    <div className="absolute end-0 top-full z-[61] mt-2 max-h-[75vh] w-[340px] max-w-[calc(100vw-2rem)] space-y-4 overflow-y-auto rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl">
                      <VoiceSettings language={sourceLanguage} sampleText={word} />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Tabs, with the deck actions beside them from md up. */}
            <div className="flex shrink-0 items-center border-b border-border bg-background px-4">
              <div role="tablist" className="flex flex-1 overflow-x-auto">
                {tabs.map((id) => {
                  const Icon = TAB_ICON[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={tab === id}
                      onClick={() => {
                        setActiveTab(id);
                        rememberTab(id);
                        scrollContentTo(0);
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-[13px] transition-colors md:px-4',
                        tab === id
                          ? 'border-primary font-semibold text-primary'
                          : 'border-transparent font-normal text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tabLabel(id)}
                    </button>
                  );
                })}
              </div>
              <div className="ms-3 hidden shrink-0 items-center gap-1 md:inline-flex">
                {deckActions}
              </div>
            </div>

            {quickDeck && quickState.state === 'saved' && (
              <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-success/20 bg-success/[0.08] px-4 py-2 text-[12.5px] font-semibold text-success">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  {t('savedToDeck', { deck: quickDeck.name })}
                </span>
                {inRouter && <ReviewNow label={t('reviewNow')} onGo={close} />}
              </div>
            )}
            {(quickState.error || bookmark.error) && (
              <p
                role="alert"
                className="m-0 shrink-0 border-b border-error/20 bg-error/10 px-4 py-2 text-[12.5px] text-error"
              >
                {quickState.error ?? t('saveFailed')}
              </p>
            )}

            <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5">
              {tab === 'google' && (
                <TranslateTab
                  wordDetails={wordDetails}
                  loading={loading}
                  error={errorText}
                  targetLanguage={targetLanguage}
                  sourceLanguage={sourceLanguage}
                  onDeckDataChange={onGoogleDeck}
                  onAskAI={() => setActiveTab('ai')}
                  onRetry={() => setAttempt((n) => n + 1)}
                />
              )}
              {tab === 'ai' && (
                <AITab
                  word={word}
                  sentenceContext={sourceContext}
                  targetLanguage={targetLanguage}
                  sourceLanguage={sourceLanguage}
                  isActive={aiSource.kind !== 'checking'}
                  route={routeOf(aiSource)}
                  onDeckDataChange={onAiDeck}
                  cache={aiCache}
                />
              )}
              {/* The conjugation and gender sit under Translate and AI alike. */}
              {(tab === 'google' || tab === 'ai') && !phrase && (
                <WordGrammar word={word} sourceLanguage={sourceLanguage} data={grammar} />
              )}
              {tab === 'dictionary' && (
                <DictionaryTab
                  kind="freedict"
                  word={word}
                  isActive
                  signedIn={signedIn}
                  onDeckDataChange={onDictDeck}
                  cache={dictCache}
                />
              )}
              {tab === 'merriam-webster' && (
                <DictionaryTab
                  kind="merriam-webster"
                  word={word}
                  isActive
                  signedIn={signedIn}
                  onDeckDataChange={onMwDeck}
                  cache={dictCache}
                />
              )}
            </div>

            {/* Under a narrow window the deck button lives here instead of squeezing the tab row. */}
            <div className="flex shrink-0 items-center justify-end gap-1 border-t border-border bg-background px-4 pb-3 pt-3 md:hidden">
              {deckActions}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {showAddToDeck && (
        <AddToDeckSheet
          open
          onOpenChange={(o) => !o && setShowAddToDeck(false)}
          items={[sheetItem]}
          defaultLanguage={targetLanguage ?? undefined}
          sourceLanguage={sourceLanguage}
          preferredDeckId={sheetDefaults.deckId}
          defaultMode={sheetDefaults.mode}
          onSaved={rememberDeck}
          onAdded={() => {
            if (episodeId) recordWordAddedToDeck();
          }}
        />
      )}
    </WordTrailProvider>
  );
}
