import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Check,
  ChevronDown,
  Globe,
  Languages,
  Lightbulb,
  MessageSquare,
  Send,
  Sparkles,
  Type,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SimpleMarkdown } from '@/components/common/SimpleMarkdown';
import { AiSetupCard } from '@/components/ai/AiSetupCard';
import { useAiSource } from '@/stores/aiSourceStore';
import { isAiSetupError, routeOf } from '@/lib/aiSource';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';
import { supabaseCall } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const CHAT_LANGS = ['fa', 'ar', 'tr', 'es', 'fr', 'de', 'zh', 'hi', 'ru', 'en'];
const RTL_LANGS = new Set(['fa', 'ar', 'he', 'ur']);

type Action = 'translate' | 'grammar' | 'vocab' | 'tip';

interface GrammarPoint {
  pattern: string;
  explanation: string;
  example?: string;
}
interface SentenceAnalysisData {
  sentence: string;
  grammar: {
    structure: string;
    tense: string;
    voice: string;
    mood?: string;
    patterns: GrammarPoint[];
  };
  vocabulary: { word: string; cefr: string; definition: string }[];
  tips: string[];
  difficulty: string;
  translation: string;
}
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** "analysis": the structured card; "text": a chat bubble. */
  type: 'analysis' | 'text';
  content: string;
}

function parseAnalysis(content: string): SentenceAnalysisData | null {
  try {
    const d = JSON.parse(content) as SentenceAnalysisData;
    if (!d || typeof d !== 'object' || !d.grammar) return null;
    return {
      sentence: d.sentence ?? '',
      grammar: {
        structure: d.grammar.structure ?? '',
        tense: d.grammar.tense ?? '',
        voice: d.grammar.voice ?? '',
        mood: d.grammar.mood,
        patterns: Array.isArray(d.grammar.patterns) ? d.grammar.patterns : [],
      },
      vocabulary: Array.isArray(d.vocabulary) ? d.vocabulary : [],
      tips: Array.isArray(d.tips) ? d.tips : [],
      difficulty: d.difficulty ?? '',
      translation: d.translation ?? '',
    };
  } catch {
    return null;
  }
}

function analysisContext(d: SentenceAnalysisData, prev?: string, next?: string): string {
  const parts = [
    `Sentence: "${d.sentence}"`,
    `Tense: ${d.grammar.tense}`,
    `Structure: ${d.grammar.structure}`,
    `Voice: ${d.grammar.voice}`,
  ];
  if (d.grammar.patterns.length > 0) parts.push(`Key pattern: ${d.grammar.patterns[0].pattern}`);
  if (d.vocabulary.length > 0)
    parts.push(
      `Vocabulary: ${d.vocabulary.map((v) => `${v.word}(${v.cefr}): ${v.definition}`).join('; ')}`,
    );
  if (d.translation) parts.push(`Translation: ${d.translation}`);
  if (prev) parts.push(`Previous sentence: "${prev}"`);
  if (next) parts.push(`Next sentence: "${next}"`);
  return parts.join(' | ');
}

const CEFR_COLORS: Record<string, string> = {
  A1: 'bg-cefr-a1 text-white',
  A2: 'bg-cefr-a2 text-white',
  B1: 'bg-cefr-b1 text-white',
  B2: 'bg-cefr-b2 text-white',
  C1: 'bg-cefr-c1 text-white',
  C2: 'bg-cefr-c2 text-white',
};

function CefrBadge({ level }: { level: string }) {
  const upper = (level ?? '').toUpperCase();
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold',
        CEFR_COLORS[upper] ?? 'bg-muted text-foreground',
      )}
    >
      {upper || '?'}
    </span>
  );
}

/** Lena's structured answer (website: `AnalysisCard`): difficulty, grammar, patterns, words, tips, translation. */
function AnalysisCard({ data, isRtl }: { data: SentenceAnalysisData; isRtl: boolean }) {
  const { t } = useTranslation('podcastUi');
  const label = 'mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground';
  const cell = 'rounded-lg bg-muted/60 px-2 py-1.5';
  return (
    <div className="space-y-2.5 text-xs">
      <div>
        <p className="mb-1.5 italic text-foreground/80" dir="auto">
          &ldquo;{data.sentence}&rdquo;
        </p>
        <div className="flex items-center gap-2">
          <CefrBadge level={data.difficulty} />
          <span className="text-muted-foreground">{t('np.sentenceDifficulty')}</span>
        </div>
      </div>
      <div>
        <p className={label}>{t('np.sentenceGrammarLabel')}</p>
        <div className="grid grid-cols-2 gap-1">
          <div className={cell}>
            <span className="block text-[10px] text-muted-foreground">{t('np.sentenceTense')}</span>
            <span className="font-medium text-foreground">{data.grammar.tense}</span>
          </div>
          <div className={cell}>
            <span className="block text-[10px] text-muted-foreground">{t('np.sentenceVoice')}</span>
            <span className="font-medium text-foreground">{data.grammar.voice}</span>
          </div>
          <div className={cn(cell, 'col-span-2')}>
            <span className="block text-[10px] text-muted-foreground">
              {t('np.sentenceStructure')}
            </span>
            <span className="font-medium text-foreground">{data.grammar.structure}</span>
          </div>
        </div>
      </div>
      {data.grammar.patterns.length > 0 && (
        <div>
          <p className={label}>{t('np.sentenceKeyPatterns')}</p>
          <div className="space-y-1">
            {data.grammar.patterns.map((p, i) => (
              <div key={i} className="rounded-lg border border-accent/20 bg-accent/8 px-2 py-1.5">
                <span className="font-semibold text-accent">{p.pattern}</span>
                <span className="ms-1 text-foreground/80">— {p.explanation}</span>
                {p.example && (
                  <p className="mt-0.5 italic text-muted-foreground" dir="auto">
                    {p.example}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {data.vocabulary.length > 0 && (
        <div>
          <p className={label}>{t('np.sentenceVocabulary')}</p>
          <div className="space-y-1">
            {data.vocabulary.map((v, i) => (
              <div key={i} className="flex items-start gap-2">
                <CefrBadge level={v.cefr ?? '?'} />
                <div>
                  <span className="font-medium text-foreground" dir="auto">
                    {v.word}
                  </span>
                  {v.definition && (
                    <span className="ms-1 text-muted-foreground" dir={isRtl ? 'rtl' : 'ltr'}>
                      — {v.definition}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.tips.length > 0 && (
        <div>
          <p className={label}>{t('np.sentenceTips')}</p>
          <ul className="space-y-0.5">
            {data.tips.map((tip, i) => (
              <li key={i} className="flex gap-1.5 leading-relaxed" dir={isRtl ? 'rtl' : 'ltr'}>
                <span className="shrink-0 font-semibold text-primary">{i + 1}.</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.translation && (
        <div>
          <p className={label}>{t('np.sentenceTranslate')}</p>
          <p className={cell} dir={isRtl ? 'rtl' : 'ltr'}>
            {data.translation}
          </p>
        </div>
      )}
    </div>
  );
}

function LenaAvatar() {
  return (
    <div className="me-2 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-light/15 text-xs font-bold text-primary">
      L
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      <span className="h-2 w-2 animate-bounce rounded-full bg-caption/60 [animation-delay:0ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-caption/60 [animation-delay:150ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-caption/60 [animation-delay:300ms]" />
    </div>
  );
}

interface SentenceChatSheetProps {
  open: boolean;
  onClose: () => void;
  sentence: string;
  prevSentence?: string;
  nextSentence?: string;
  /** Local episode id: Lena's conversation about it is kept on this computer. */
  episodeId: string;
  /** The catalogue's id for the episode, when it has one (FlexiLingo's cloud AI needs it). */
  cloudVideoId?: string;
  /** Opens with one of Lena's actions already asked (T: translate, G: grammar). */
  autoAction?: 'translate' | 'grammar' | null;
}

/**
 * Lena on the current line (website: `SentenceChatSheet`): a side sheet with her opening choices
 * (Analyze, Translate, Explain grammar, Key vocabulary, Tip), the structured analysis card, and a
 * chat. The answers come from the user's own AI (aiSource); FlexiLingo's cloud AI only when they
 * switched it on and the episode is in the catalogue.
 */
export function SentenceChatSheet(props: SentenceChatSheetProps) {
  if (!props.open) return null;
  return <SheetInner key={`${props.episodeId}|${props.sentence}`} {...props} />;
}

function SheetInner({
  onClose,
  sentence,
  prevSentence,
  nextSentence,
  episodeId,
  cloudVideoId,
  autoAction,
}: SentenceChatSheetProps) {
  const { t, i18n } = useTranslation('podcastUi');
  const { nativeLang } = useLanguageSettings();
  const [targetLang, setTargetLang] = useState(() =>
    nativeLang && nativeLang !== 'en' ? nativeLang : 'fa',
  );
  const isRtl = RTL_LANGS.has(targetLang);
  const langName = (code: string) =>
    new Intl.DisplayNames([i18n.language], { type: 'language' }).of(code) ?? code;

  const { source, own } = useAiSource();
  const cloud = routeOf(source) === 'cloud' && !!cloudVideoId;

  const [visible, setVisible] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [needsAnalysis, setNeedsAnalysis] = useState(false);
  const [context, setContext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [setupFailed, setSetupFailed] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const autoDone = useRef(false);

  const fallbackContext = () => {
    let ctx = `Sentence: "${sentence}"`;
    if (prevSentence) ctx += ` | Previous sentence: "${prevSentence}"`;
    if (nextSentence) ctx += ` | Next sentence: "${nextSentence}"`;
    return ctx;
  };

  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(id);
  }, []);

  // History first; then either the analysis already made for this sentence, or the opening choices.
  useEffect(() => {
    let live = true;
    const load = cloud
      ? supabaseCall<{
          messages?: { id: string; role: string; content: string; message_type?: string }[];
        }>('GET', `/sentence-chat?video_id=${encodeURIComponent(cloudVideoId as string)}`).then(
          (r) =>
            (r.messages ?? []).map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              type: m.message_type === 'analysis' ? 'analysis' : 'text',
            })),
        )
      : invoke<{ id: string; role: string; content: string }[]>('ai_sentence_chat_history', {
          episodeId,
        }).then((rows) =>
          rows.map((m) => ({
            id: m.id,
            role: m.role === 'analysis' ? 'assistant' : m.role,
            content: m.content,
            type: m.role === 'analysis' ? 'analysis' : 'text',
          })),
        );
    load
      .then((rows) => {
        if (!live) return;
        const list = rows as ChatMessage[];
        setMessages(list);
        const existing = list
          .filter((m) => m.type === 'analysis')
          .map((m) => parseAnalysis(m.content))
          .find((d) => d && d.sentence.toLowerCase().trim() === sentence.toLowerCase().trim());
        if (existing) setContext(analysisContext(existing, prevSentence, nextSentence));
        else if (!autoAction && sentence) setNeedsAnalysis(true);
      })
      .catch(() => {
        if (live && !autoAction && sentence) setNeedsAnalysis(true);
      })
      .finally(() => {
        if (live) setHistoryReady(true);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per sheet
  }, []);

  useEffect(() => {
    // Scroll the chat itself (scrollIntoView also moved the page under the sheet).
    const box = chatRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages, isThinking, isAnalyzing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showLangPicker) return;
    const onDown = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setShowLangPicker(false);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [showLangPicker]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  /** The user's own AI is not ready: keep the request, show the setup card, never fall back to the cloud. */
  function onFailure(e: unknown, retry: () => void) {
    if (!cloud && isAiSetupError(e)) {
      pendingRef.current = retry;
      setSetupFailed(true);
      return;
    }
    setError(t('np.lenaError'));
  }

  async function handleAnalyze() {
    if (isAnalyzing || !sentence) return;
    setIsAnalyzing(true);
    setNeedsAnalysis(false);
    setError(null);
    try {
      const raw = cloud
        ? (
            await supabaseCall<{ data?: SentenceAnalysisData }>('POST', '/analyze-sentence', {
              sentence,
              prevSentence,
              nextSentence,
              targetLanguage: targetLang,
              video_id: cloudVideoId,
            })
          ).data
        : await invoke<SentenceAnalysisData>('ai_sentence_analysis', {
            episodeId,
            sentence,
            prevSentence: prevSentence ?? null,
            nextSentence: nextSentence ?? null,
            targetLanguage: targetLang,
          });
      const data = raw ? parseAnalysis(JSON.stringify(raw)) : null;
      if (!data) throw new Error('EMPTY_ANALYSIS');
      setContext(analysisContext(data, prevSentence, nextSentence));
      setMessages((prev) => [
        ...prev,
        {
          id: `analysis-${Date.now()}`,
          role: 'assistant',
          type: 'analysis',
          content: JSON.stringify(data),
        },
      ]);
    } catch (e) {
      onFailure(e, () => void handleAnalyze());
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function ask(text: string, display: string, action?: Action) {
    if (isThinking || isAnalyzing) return;
    setError(null);
    const tmpId = `local-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tmpId, role: 'user', type: 'text', content: display }]);
    setNeedsAnalysis(false);
    setIsThinking(true);
    try {
      const reply = cloud
        ? (
            await supabaseCall<{ reply: string }>('POST', '/sentence-chat', {
              video_id: cloudVideoId,
              message: text,
              analysis_context: context || fallbackContext(),
              target_language: targetLang,
              action: action === 'vocab' ? 'vocabulary' : action,
            })
          ).reply
        : await invoke<string>('ai_sentence_chat', {
            episodeId,
            message: text,
            sentenceContext: context || fallbackContext(),
            targetLanguage: targetLang,
            action: action ?? null,
            displayText: display,
          });
      setMessages((prev) => [
        ...prev,
        { id: `reply-${Date.now()}`, role: 'assistant', type: 'text', content: reply },
      ]);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tmpId));
      onFailure(e, () => void ask(text, display, action));
    } finally {
      setIsThinking(false);
    }
  }

  const fireAction = (action: Action, label: string) => void ask(sentence, label, action);

  // Opened with T or G: that action, once the history is in.
  useEffect(() => {
    if (!historyReady || !autoAction || autoDone.current || !sentence) return;
    autoDone.current = true;
    fireAction(
      autoAction,
      autoAction === 'translate' ? t('np.sentenceTranslate') : t('np.sentenceGrammar'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyReady]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    if (inputRef.current) inputRef.current.textContent = '';
    void ask(text, text);
  };

  const quickPrompts: { label: string; action: Action; Icon: typeof BookOpen }[] = [
    { label: t('np.sentenceGrammar'), action: 'grammar', Icon: BookOpen },
    { label: t('np.sentenceKeyVocab'), action: 'vocab', Icon: Type },
    { label: t('np.lenaSheet.tip'), action: 'tip', Icon: Lightbulb },
  ];
  const userCount = messages.filter((m) => m.role === 'user').length;
  const showQuick =
    historyReady && userCount === 0 && !isThinking && !isAnalyzing && !needsAnalysis;
  const choice =
    'inline-flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-start text-sm text-foreground transition-colors hover:border-primary-light/40 hover:bg-primary-light/10 hover:text-primary';
  const shortSentence = sentence.length > 50 ? `${sentence.slice(0, 47)}...` : sentence;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[2147483646] bg-black/40" onClick={handleClose} />
      <div
        className={cn(
          'fixed top-0 z-[2147483647] flex h-dvh w-full max-w-[420px] flex-col bg-background shadow-2xl transition-transform duration-300',
          isRtl
            ? cn('left-0 border-r border-border', visible ? 'translate-x-0' : '-translate-x-full')
            : cn('right-0 border-l border-border', visible ? 'translate-x-0' : 'translate-x-full'),
        )}
      >
        <div className="h-1 shrink-0 bg-gradient-to-r from-olive-700 to-olive-500" />
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-primary/[0.05] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light/20 text-sm font-bold text-primary">
              L
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{t('np.lenaSheet.title')}</p>
              <p className="truncate text-xs text-muted-foreground" dir="auto">
                {shortSentence ? `"${shortSentence}"` : t('np.lenaSheet.subtitle')}
              </p>
            </div>
          </div>
          <div className="ms-2 flex shrink-0 items-center gap-1.5">
            <div ref={langRef} className="relative">
              <button
                type="button"
                onClick={() => setShowLangPicker((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Globe size={12} />
                <span>{langName(targetLang)}</span>
                <ChevronDown
                  size={10}
                  className={cn(
                    'transition-transform duration-200',
                    showLangPicker && 'rotate-180',
                  )}
                />
              </button>
              {showLangPicker && (
                <div className="absolute end-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-2xl border border-border bg-card shadow-md">
                  <div className="max-h-[240px] overflow-y-auto py-1">
                    {CHAT_LANGS.map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => {
                          setTargetLang(code);
                          setShowLangPicker(false);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between border-0 px-3 py-2 text-xs transition-colors',
                          code === targetLang
                            ? 'bg-primary-light/15 font-semibold text-primary'
                            : 'bg-transparent text-foreground hover:bg-muted',
                        )}
                      >
                        <span>{langName(code)}</span>
                        {code === targetLang && <Check size={12} className="text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-9 w-9 shrink-0 border border-border"
              onClick={handleClose}
              aria-label={t('shared.close')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div ref={chatRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-2 pt-3">
          {!historyReady ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-input border-t-primary" />
            </div>
          ) : (
            <div className="flex-1">
              {messages.map((msg) => {
                if (msg.type === 'analysis') {
                  const data = parseAnalysis(msg.content);
                  return (
                    <div key={msg.id} className="mb-3 flex justify-start">
                      <LenaAvatar />
                      <div className="max-w-[88%] rounded-2xl rounded-bl-sm border border-border bg-muted px-3 py-2.5">
                        {data ? (
                          <AnalysisCard data={data} isRtl={isRtl} />
                        ) : (
                          <p className="text-sm text-foreground">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  );
                }
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="mb-3 flex justify-end">
                      <div
                        className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-base leading-relaxed text-accent-foreground shadow-xs"
                        dir="auto"
                      >
                        {msg.content}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={msg.id} className="mb-3 flex justify-start">
                    <LenaAvatar />
                    <div
                      className="max-w-[80%] rounded-2xl rounded-bl-sm border border-border bg-muted px-3 py-2 text-base leading-relaxed"
                      dir={isRtl ? 'rtl' : 'ltr'}
                    >
                      <SimpleMarkdown content={msg.content} />
                    </div>
                  </div>
                );
              })}

              {needsAnalysis && !isAnalyzing && !isThinking && (
                <div className="mb-3 flex justify-start">
                  <LenaAvatar />
                  <div className="rounded-2xl rounded-bl-sm border border-border bg-muted px-3 py-2.5">
                    <p className="mb-2.5 text-xs text-muted-foreground">
                      {t('np.lenaSheet.intro')}
                    </p>
                    <div className="flex flex-col gap-1.5">
                      <button type="button" onClick={() => void handleAnalyze()} className={choice}>
                        <Sparkles
                          className="h-3.5 w-3.5 shrink-0 text-primary"
                          strokeWidth={2.25}
                        />
                        <span>{t('np.sentenceAnalyze')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fireAction('translate', t('np.sentenceTranslate'))}
                        className={choice}
                      >
                        <Languages className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>{t('np.sentenceTranslate')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fireAction('grammar', t('np.sentenceGrammar'))}
                        className={choice}
                      >
                        <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>{t('np.sentenceGrammar')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fireAction('vocab', t('np.sentenceKeyVocab'))}
                        className={choice}
                      >
                        <Type className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>{t('np.sentenceKeyVocab')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fireAction('tip', t('np.lenaSheet.tip'))}
                        className={choice}
                      >
                        <Lightbulb className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>{t('np.lenaSheet.tip')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {(isAnalyzing || isThinking) && (
                <div className="mb-3 flex justify-start">
                  <LenaAvatar />
                  <div className="rounded-2xl rounded-bl-sm border border-border bg-muted px-3 py-2">
                    <ThinkingDots />
                  </div>
                </div>
              )}

              {showQuick && (
                <div className="mb-4">
                  <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <MessageSquare className="h-3 w-3" strokeWidth={2.25} />
                    {t('np.lenaSheet.askMore')}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {quickPrompts.map((p) => (
                      <button
                        key={p.action}
                        type="button"
                        onClick={() => fireAction(p.action, p.label)}
                        className={choice}
                      >
                        <p.Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!cloud && (setupFailed || own.kind === 'unconfigured') && (
                <div className="mb-3">
                  <AiSetupCard
                    compact
                    onReady={() => {
                      setSetupFailed(false);
                      const retry = pendingRef.current;
                      pendingRef.current = null;
                      retry?.();
                    }}
                  />
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="mb-3 rounded-lg border border-error/30 bg-error/10 p-2 text-xs text-error"
                >
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-background px-3 py-3">
          <div className="flex items-end gap-2">
            <div className="relative flex-1">
              {!input && (
                <span className="pointer-events-none absolute end-3 start-3 top-2 truncate text-base text-caption">
                  {t('np.lenaSheet.placeholder')}
                </span>
              )}
              <div
                ref={inputRef}
                role="textbox"
                aria-label={t('np.lenaSheet.placeholder')}
                contentEditable={!(isThinking || isAnalyzing)}
                onInput={() => setInput(inputRef.current?.innerText ?? '')}
                onPaste={(e) => {
                  e.preventDefault();
                  document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                dir={isRtl ? 'rtl' : 'ltr'}
                className={cn(
                  'max-h-32 min-h-[40px] overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-input bg-card px-3 py-2 text-base text-foreground transition-colors focus:border-primary-light focus:outline-none focus:ring-2 focus:ring-primary-light/20',
                  (isThinking || isAnalyzing) && 'pointer-events-none opacity-50',
                )}
              />
            </div>
            <Button
              type="button"
              size="icon"
              onClick={send}
              disabled={!input.trim() || isThinking || isAnalyzing}
              aria-label={t('np.lenaSheet.placeholder')}
              className="shrink-0"
            >
              <Send className="h-4 w-4" strokeWidth={2.25} />
            </Button>
          </div>
          <p className="mt-1.5 text-center text-xs text-muted-foreground">
            {t('np.lenaSheet.sendHint')}
          </p>
        </div>
      </div>
    </>,
    document.body,
  );
}
