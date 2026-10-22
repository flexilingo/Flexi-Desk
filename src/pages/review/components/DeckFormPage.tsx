import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Globe, Languages, Loader2, Lock, Save, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/common/InlineError';
import { useAuthStore } from '@/stores/authStore';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';
import { cn } from '@/lib/utils';
import { useReviewStore } from '../stores/reviewStore';
import type { Algorithm } from '../types';
import { publishDeck } from '../lib/deckCloud';
import { splitLanguagePair } from '../lib/deckLogic';
import { useErrorText } from '../lib/useErrorText';
import { LanguagePicker } from './parts/LanguagePicker';
import { PageBack } from './parts/PageBack';
import { TagInput } from './parts/TagInput';
import { Toggle } from './parts/Toggle';

const TITLE_MAX = 100;
const ALGORITHMS: Algorithm[] = ['fsrs', 'sm2', 'leitner'];

/** One page for both "new deck" and "edit deck", like the website's create/edit pair. */
export function DeckFormPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const editing = !!deckId;
  const { t } = useTranslation('decks');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const signedIn = useAuthStore((s) => !!s.session);
  const { nativeLang, targetLang } = useLanguageSettings();
  const { decks, fetchDecks, createDeck, updateDeck } = useReviewStore();

  const deck = useMemo(() => decks.find((d) => d.id === deckId), [decks, deckId]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // `null` = not touched yet; settings arrive asynchronously, and a state seeded before
  // they load would pin the wrong default for good.
  const [learningPick, setLearningPick] = useState<string | null>(null);
  const [nativePick, setNativePick] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [algorithm, setAlgorithm] = useState<Algorithm>('fsrs');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishFailed, setPublishFailed] = useState(false);

  useEffect(() => {
    if (editing && decks.length === 0) void fetchDecks();
  }, [editing, decks.length, fetchDecks]);

  useEffect(() => {
    if (!deck || loadedFor === deck.id) return;
    setLoadedFor(deck.id);
    setName(deck.name);
    setDescription(deck.description ?? '');
    setTags(deck.tags);
    setIsPublic(deck.isPublic);
    setAlgorithm(deck.algorithm);
    // Decks made before the pair existed carry only their cards' language.
    const pair = splitLanguagePair(`${deck.language}-${deck.nativeLanguage ?? ''}`, {
      learning: deck.language,
      native: nativeLang,
    });
    setLearningPick(pair.learning);
    setNativePick(pair.native);
  }, [deck, loadedFor, nativeLang]);

  const learning = learningPick ?? targetLang;
  const native = nativePick ?? nativeLang;
  const atLimit = name.length >= TITLE_MAX;

  const goToDeck = (id: string, created = false) =>
    navigate(`/review/deck/${id}${created ? '?created=1' : ''}`);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      let saved = deck;
      if (!publishFailed || !saved) {
        if (editing && deckId) {
          saved = await updateDeck(deckId, {
            name: name.trim(),
            description: description.trim(),
            language: learning,
            nativeLanguage: native,
            tags,
            isPublic,
          });
        } else {
          saved = await createDeck({
            name: name.trim(),
            description: description.trim() || undefined,
            language: learning,
            nativeLanguage: native,
            algorithm,
            tags,
            isPublic,
          });
        }
      }
      // Public decks live on Explore: push the change, as Share does. A brand-new deck has
      // no cards yet, so its first publish happens from the deck page.
      const wasPublic = deck?.isPublic ?? false;
      const needsPush =
        editing &&
        signedIn &&
        saved.cardCount > 0 &&
        ((isPublic && !wasPublic) || !!saved.cloudDeckId);
      if (needsPush) {
        try {
          await publishDeck(saved.id, { visibility: { isPublic } });
        } catch (err) {
          setPublishFailed(true);
          setError(`${t('form.savedButNotPublished')} ${errorText(err)}`);
          return;
        }
      }
      goToDeck(saved.id, !editing);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (editing && !deck) {
    return (
      <div className="space-y-4">
        <PageBack to="/review" label={t('backToDecks')} />
        <p className="text-sm text-muted-foreground">
          {decks.length === 0 ? t('loading') : t('deckNotFound')}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageBack
        to={editing && deckId ? `/review/deck/${deckId}` : '/review'}
        label={t('backToDecks')}
      />
      <div>
        <h1 className="text-2xl font-bold">
          {editing ? t('form.editTitle') : t('form.createTitle')}
        </h1>
        {!editing && (
          <p className="mt-1 text-sm text-muted-foreground">{t('form.createSubtitle')}</p>
        )}
      </div>

      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-border bg-card p-6">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="deck-name" className="text-sm font-semibold">
              {t('form.deckTitle')} <span className="text-error">*</span>
            </label>
            <span
              className={cn(
                'text-xs tabular-nums',
                atLimit ? 'text-accent' : 'text-muted-foreground',
              )}
            >
              {name.length}/{TITLE_MAX}
            </span>
          </div>
          <Input
            id="deck-name"
            required
            maxLength={TITLE_MAX}
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('form.titlePlaceholder')}
          />
        </div>

        <div>
          <label htmlFor="deck-desc" className="mb-1.5 block text-sm font-semibold">
            {t('form.description')}
          </label>
          <textarea
            id="deck-desc"
            rows={3}
            value={description}
            disabled={busy}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('form.descriptionPlaceholder')}
            className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
            <Languages className="h-4 w-4 text-accent" />
            {t('form.languages')}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('form.cardsAreIn')}
              </span>
              <LanguagePicker value={learning} onSelect={setLearningPick} disabled={busy} />
            </div>
            <ArrowRight className="mb-2 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block rtl:rotate-180" />
            <div className="min-w-0 flex-1">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('form.meaningsIn')}
              </span>
              <LanguagePicker value={native} onSelect={setNativePick} disabled={busy} />
            </div>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{t('form.languagesHelp')}</p>
        </div>

        <div>
          <label
            htmlFor="deck-tags"
            className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"
          >
            <Tag className="h-4 w-4 text-accent" />
            {t('form.tags')}
            <span className="text-xs font-normal text-muted-foreground">
              ({t('form.optional')})
            </span>
          </label>
          <TagInput
            id="deck-tags"
            tags={tags}
            onChange={setTags}
            placeholder={t('form.tagsPlaceholder')}
            maxTags={5}
            disabled={busy}
          />
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold">{t('form.algorithm')}</p>
          <div className="space-y-2">
            {ALGORITHMS.map((a) => (
              <label
                key={a}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                  algorithm === a ? 'border-primary bg-primary/5' : 'border-border',
                  editing
                    ? 'cursor-not-allowed opacity-70'
                    : 'cursor-pointer hover:border-primary/50',
                )}
              >
                <input
                  type="radio"
                  name="algorithm"
                  value={a}
                  checked={algorithm === a}
                  disabled={editing || busy}
                  onChange={() => setAlgorithm(a)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">{t(`form.algo.${a}.label`)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`form.algo.${a}.desc`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {editing && (
            <p className="mt-1.5 text-xs text-muted-foreground">{t('form.algorithmLocked')}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/50 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card">
              {isPublic ? (
                <Globe className="h-4 w-4 text-success" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
            <div className="min-w-0">
              <label htmlFor="deck-public" className="block cursor-pointer text-sm font-semibold">
                {t('form.makePublic')}
              </label>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('form.publicDescription')}</p>
              {isPublic && !signedIn && (
                <p className="mt-1 text-xs text-accent">{t('form.publicNeedsSignIn')}</p>
              )}
              {isPublic && signedIn && !editing && (
                <p className="mt-1 text-xs text-accent">{t('form.publicOnShare')}</p>
              )}
            </div>
          </div>
          <Toggle
            id="deck-public"
            checked={isPublic}
            onCheckedChange={setIsPublic}
            disabled={busy}
            label={t('form.makePublic')}
          />
        </div>

        <InlineError message={error} onDismiss={() => setError(null)} />

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button type="submit" disabled={!name.trim() || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {publishFailed
              ? t('form.retryPublish')
              : editing
                ? t('form.saveChanges')
                : t('form.create')}
          </Button>
          {publishFailed && deck && (
            <Button
              type="button"
              variant="outline"
              onClick={() => goToDeck(deck.id)}
              disabled={busy}
            >
              {t('form.openDeck')}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => navigate(editing && deckId ? `/review/deck/${deckId}` : '/review')}
          >
            {t('cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}
