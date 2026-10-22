import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Plus, Sparkles, Tag, X } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import type { CardFull } from '../types';
import type { CardDraft } from '../lib/deckLocal';
import {
  buildNotesForSave,
  cardExamples,
  isAIGeneratedCard,
  parseCardNotes,
  type CardExample,
} from '../lib/deckLogic';
import { TagInput } from './parts/TagInput';

interface Props {
  open: boolean;
  /** The card being edited, or null for a new one. */
  card: CardFull | null;
  /** Saves; rejects with the sentence to show. The dialog closes only when it resolves. */
  onSave: (draft: CardDraft) => Promise<void>;
  onClose: () => void;
}

const AI_KEYS = [
  'definition',
  'ipa',
  'difficulty',
  'cefr_level',
  'part_of_speech',
  'register',
  'memory_hook',
] as const;
const MAX_EXAMPLES = 5;

/** Add or edit a card: front, back, examples (source/target), tags, notes. */
export function CardEditorDialog({ open, card, onSave, onClose }: Props) {
  const { t } = useTranslation('decks');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [examples, setExamples] = useState<CardExample[]>([]);
  const [personal, setPersonal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parsed = parseCardNotes(card?.notes);
  const aiNotes = isAIGeneratedCard(parsed) ? parsed : null;
  // A plain-text note (not JSON) is the card's note; JSON notes keep a personal_note inside.
  const plainNote = card?.notes && !parsed ? card.notes : '';

  useEffect(() => {
    if (!open) return;
    setFront(card?.front ?? '');
    setBack(card?.back ?? '');
    setTags(card?.tags ?? []);
    setExamples(cardExamples(parseCardNotes(card?.notes)));
    setPersonal(parseCardNotes(card?.notes)?.personal_note ?? plainNote);
    setError(null);
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, card?.id]);

  const save = async () => {
    if (!front.trim() || !back.trim()) {
      setError(t('card.fillBoth'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let notes = buildNotesForSave(plainNote ? null : card?.notes, examples);
      const note = personal.trim();
      if (note || parsed?.personal_note) {
        const obj = notes ? (JSON.parse(notes) as Record<string, unknown>) : {};
        if (note) obj.personal_note = note;
        else delete obj.personal_note;
        notes = Object.keys(obj).length ? JSON.stringify(obj) : '';
      }
      await onSave({ front, back, notes, tags });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const setExample = (i: number, patch: Partial<CardExample>) =>
    setExamples((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{card ? t('card.editTitle') : t('card.newTitle')}</DialogTitle>
          <DialogDescription>
            {card ? t('card.editDescription') : t('card.newDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <label htmlFor="card-front" className="block text-sm font-semibold">
              {t('card.front')} <span className="text-error">*</span>
            </label>
            <textarea
              id="card-front"
              rows={2}
              value={front}
              disabled={busy}
              onChange={(e) => setFront(e.target.value)}
              placeholder={t('card.frontPlaceholder')}
              dir="auto"
              className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="card-back" className="block text-sm font-semibold">
              {t('card.back')} <span className="text-error">*</span>
            </label>
            <textarea
              id="card-back"
              rows={2}
              value={back}
              disabled={busy}
              onChange={(e) => setBack(e.target.value)}
              placeholder={t('card.backPlaceholder')}
              dir="auto"
              className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold">
              <Tag className="h-3.5 w-3.5 text-accent" />
              {t('card.tagsOptional')}
            </label>
            <TagInput
              tags={tags}
              onChange={setTags}
              placeholder={t('card.tagsPlaceholder')}
              maxTags={10}
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold">{t('card.examplesOptional')}</label>
            {examples.map((ex, i) => (
              <div key={i} className="flex gap-2">
                <div className="flex flex-1 flex-col gap-1">
                  <Input
                    value={ex.source}
                    disabled={busy}
                    onChange={(e) => setExample(i, { source: e.target.value })}
                    placeholder={t('card.exampleSentence')}
                    dir="auto"
                  />
                  <Input
                    value={ex.target}
                    disabled={busy}
                    onChange={(e) => setExample(i, { target: e.target.value })}
                    placeholder={t('card.exampleTranslation')}
                    dir="auto"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setExamples((p) => p.filter((_, idx) => idx !== i))}
                  aria-label={t('card.removeExample')}
                  className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-error"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {examples.length < MAX_EXAMPLES && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setExamples((p) => [...p, { source: '', target: '' }])}
              >
                <Plus className="h-4 w-4" />
                {t('card.addExample')}
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="card-note" className="block text-sm font-semibold">
              {t('card.noteOptional')}
            </label>
            <textarea
              id="card-note"
              rows={2}
              value={personal}
              disabled={busy}
              onChange={(e) => setPersonal(e.target.value)}
              placeholder={t('card.notePlaceholder')}
              dir="auto"
              className="w-full resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {aiNotes && (
            <div className="space-y-2 rounded-xl border border-success/40 bg-success/10 p-4">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-success">
                <Sparkles className="h-3.5 w-3.5" />
                {t('card.aiReadOnly')}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {AI_KEYS.map((k) => {
                  const v = aiNotes[k];
                  if (v === undefined || v === null || v === '') return null;
                  return (
                    <div key={k} className="text-xs">
                      <span className="capitalize text-muted-foreground">
                        {k.replace(/_/g, ' ')}:{' '}
                      </span>
                      <span className="font-semibold">{String(v)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-error"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </Button>
          <Button type="button" onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {card ? t('save') : t('card.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
