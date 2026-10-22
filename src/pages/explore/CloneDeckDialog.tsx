import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, CheckCircle2, Copy, Info, Languages, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import { AiSetupCard } from '@/components/ai/AiSetupCard';
import { useAiSource } from '@/stores/aiSourceStore';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';
import { cn } from '@/lib/utils';
import { useReviewStore } from '@/pages/review/stores/reviewStore';
import {
  errorCode,
  saveToLibrary,
  type SaveProgress,
  type SaveResult,
} from '@/pages/review/lib/deckCloud';
import {
  copiesOf,
  decideCloneMode,
  deckMeaningLang,
  deckSourceLang,
  ownedMeaningLanguages,
  publicDeckTitle,
  type PublicDeckSummary,
} from '@/pages/review/lib/deckLogic';
import { languageLabel } from '@/pages/review/lib/deckLanguages';
import { LanguagePicker } from '@/pages/review/components/parts/LanguagePicker';
import { useErrorText } from '@/pages/review/lib/useErrorText';

const FEATURED = ['en', 'fa', 'ar', 'fr', 'hi', 'zh', 'es', 'tr', 'de', 'ru'];

interface Props {
  deck:
    | (Pick<PublicDeckSummary, 'id' | 'title' | 'description' | 'card_count' | 'language_pair'> &
        Partial<PublicDeckSummary>)
    | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Add a public deck to the library in the language the learner picks. One question:
 * "in which language do you want the meanings?" — the deck's own language is an instant
 * copy, any other is translated on this computer for free (or by the website, signed in,
 * if there is no local model).
 */
export function CloneDeckDialog({ deck, open, onClose }: Props) {
  const { t } = useTranslation('decks');
  const errorText = useErrorText();
  const { cloudActive } = useAiSource();
  const [needsAi, setNeedsAi] = useState(false);
  const navigate = useNavigate();
  const { nativeLang } = useLanguageSettings();
  const { decks: library, fetchDecks } = useReviewStore();

  const cardsLang = deckSourceLang(deck?.language_pair);
  const deckMeaning = deckMeaningLang(deck?.language_pair) ?? cardsLang;
  const copies = useMemo(() => copiesOf(library, deck?.id), [library, deck?.id]);
  const owned = useMemo(() => ownedMeaningLanguages(copies, cardsLang), [copies, cardsLang]);

  const [target, setTarget] = useState(deckMeaning);
  const [quality, setQuality] = useState<'basic' | 'smart'>('basic');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<SaveProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  useEffect(() => {
    if (!open || !deck) return;
    // The learner's own language first, unless they already hold the deck in it.
    setTarget(nativeLang && !owned.has(nativeLang) ? nativeLang : deckMeaning);
    setQuality('basic');
    setError(null);
    setResult(null);
    setProgress(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deck?.id]);

  if (!deck) return null;

  const mode = decideCloneMode(deckMeaning, target);
  const alreadyHave = owned.has(target);
  const featured = Array.from(new Set([...FEATURED, deckMeaning, target]));

  const run = async () => {
    setBusy(true);
    setError(null);
    setNeedsAi(false);
    try {
      const res = await saveToLibrary({
        deck,
        targetLanguage: target,
        quality,
        allowCloud: cloudActive,
        onProgress: setProgress,
      });
      await fetchDecks();
      setResult(res);
    } catch (e) {
      // The learner's own AI is not ready: set it up right here, then continue.
      if (errorCode(e) === 'LOCAL_AI_UNAVAILABLE') setNeedsAi(true);
      else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const stageText = progress
    ? t(`clone.stage.${progress.stage}`, { done: progress.done, total: progress.total })
    : t('clone.working');

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {result ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-9 w-9 text-success" />
            </span>
            <div>
              <DialogTitle className="mb-1 text-lg text-success">
                {result.created ? t('clone.successTitle') : t('clone.updatedTitle')}
              </DialogTitle>
              <DialogDescription>
                {t('clone.successAdded', { title: result.deck.name })}
              </DialogDescription>
            </div>
            <ul className="w-full space-y-2 rounded-xl border border-border bg-muted/40 p-4 text-start text-sm">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                {result.mode === 'copy'
                  ? t('clone.exactCopy')
                  : t('clone.translatedTo', { language: languageLabel(target) })}
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                {t('clone.cardsAdded', { count: result.added })}
                {result.skipped > 0 && (
                  <span className="text-muted-foreground">
                    {' '}
                    · {t('clone.alreadyThere', { count: result.skipped })}
                  </span>
                )}
              </li>
              {result.usedCloud && (
                <li className="flex items-start gap-2 text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  {t('clone.usedCloud')}
                </li>
              )}
            </ul>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  onClose();
                  navigate(`/review/deck/${result.deck.id}`);
                }}
              >
                <BookOpen className="h-4 w-4" />
                {t('clone.viewDeck')}
              </Button>
              <Button variant="outline" onClick={onClose}>
                {t('clone.close')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Copy className="h-5 w-5 text-accent" />
                {t('clone.title')}
              </DialogTitle>
              <DialogDescription dir="auto" className="truncate">
                {publicDeckTitle(deck.title)} · {t('cardsCount', { count: deck.card_count })} ·{' '}
                {t('explore.cardsIn', { language: languageLabel(cardsLang) })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-1">
              {copies.length > 0 && (
                <div className="flex items-center gap-2.5 rounded-lg border border-primary-light/20 bg-primary-light/10 px-3.5 py-2.5 text-xs font-semibold text-primary-light">
                  <Info className="h-4 w-4 shrink-0" />
                  <span className="flex-1">
                    {t('explore.inLibrary')}
                    {copies.length > 1 ? ` (${copies.length})` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate(`/review/deck/${copies[0].id}`);
                    }}
                    className="underline"
                  >
                    {t('explore.viewMyCopy')}
                  </button>
                </div>
              )}

              <div>
                <p className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary-light">
                  <Languages className="h-3.5 w-3.5" />
                  {t('clone.yourLanguage')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {featured.map((code) => (
                    <button
                      key={code}
                      type="button"
                      disabled={busy}
                      aria-pressed={target === code}
                      onClick={() => setTarget(code)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                        target === code
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border hover:border-primary/50',
                      )}
                    >
                      <bdi>{languageLabel(code)}</bdi>
                      {owned.has(code) && <Check className="h-3 w-3" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
                <div className="mt-2 max-w-xs">
                  <LanguagePicker value={target} onSelect={setTarget} disabled={busy} />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {alreadyHave
                    ? t('clone.alreadyHave', { language: languageLabel(target) })
                    : mode === 'copy'
                      ? t('clone.copyHint', { language: languageLabel(target) })
                      : t('clone.translateHint', { language: languageLabel(target) })}
                </p>
              </div>

              {mode === 'translate' && (
                <div>
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-primary-light">
                    {t('clone.quality')}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {(['basic', 'smart'] as const).map((q) => (
                      <button
                        key={q}
                        type="button"
                        disabled={busy}
                        aria-pressed={quality === q}
                        onClick={() => setQuality(q)}
                        className={cn(
                          'rounded-lg border-2 p-4 text-start transition-colors',
                          quality === q
                            ? 'border-accent bg-accent/5'
                            : 'border-border hover:border-accent/40',
                        )}
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-sm font-semibold">{t(`clone.${q}`)}</span>
                          <span className="ms-auto rounded bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
                            {t('clone.free')}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {t(`clone.${q}Desc`)}
                        </p>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{t('clone.localNote')}</p>
                </div>
              )}

              {busy && (
                <div className="space-y-2" role="status">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                    {stageText}
                  </p>
                  {progress && progress.total > 0 && (
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{
                          width: `${Math.min(100, (progress.done / progress.total) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
              {needsAi && <AiSetupCard compact onReady={() => void run()} />}
              <InlineError message={error} onDismiss={() => setError(null)} />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                {t('cancel')}
              </Button>
              <Button onClick={run} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {alreadyHave ? t('clone.updateButton') : t('clone.addButton')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
