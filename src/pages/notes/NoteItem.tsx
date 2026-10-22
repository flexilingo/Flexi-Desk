import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Play, Star, Tag, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/common/InlineError';
import { cn } from '@/lib/utils';
import { errorCode } from './notesApi';
import { formatTime, type UnifiedNote } from './notesLogic';

export interface NotePatch {
  label?: string;
  note?: string;
  tags?: string[];
}

interface ItemProps {
  note: UnifiedNote;
  selected: boolean;
  onSelect: (key: string, checked: boolean) => void;
  onDelete: (key: string) => void;
  onOpen: (note: UnifiedNote, seconds?: number | null) => void;
  onSave: (note: UnifiedNote, patch: NotePatch) => Promise<void>;
  onToggleFavorite: (note: UnifiedNote) => Promise<void>;
}

/** A favourite with nothing of the user's own would be deleted by turning it off, so it stays on. */
const canUnfavorite = (n: UnifiedNote) => !!(n.note || n.label || n.tags.length > 0);

export function NoteItem({
  note,
  selected,
  onSelect,
  onDelete,
  onOpen,
  onSave,
  onToggleFavorite,
}: ItemProps) {
  const { t } = useTranslation('notes');
  const [editing, setEditing] = useState(false);
  const [starBusy, setStarBusy] = useState(false);
  const [starError, setStarError] = useState<string | null>(null);

  if (editing) {
    return (
      <div className="bg-accent/[0.04] p-4">
        <NoteEditor note={note} onSave={onSave} onClose={() => setEditing(false)} />
      </div>
    );
  }

  const toggleStar = async () => {
    setStarBusy(true);
    setStarError(null);
    try {
      await onToggleFavorite(note);
    } catch (err) {
      const code = errorCode(err);
      setStarError(t(`errors.${code}`, { defaultValue: t('errors.UNKNOWN_ERROR') }));
    } finally {
      setStarBusy(false);
    }
  };

  return (
    <div
      className={cn(
        'group p-4 transition-colors',
        selected ? 'bg-accent/[0.07]' : 'hover:bg-accent/[0.03]',
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={(c) => onSelect(note.key, c)}
          className="mt-1.5 shrink-0"
          aria-label={t('selectNote')}
        />

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {note.page != null ? (
              <button
                type="button"
                onClick={() => onOpen(note)}
                className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-[3px] text-[11.5px] font-bold tabular-nums text-accent hover:bg-accent/20"
              >
                {t('pageNumber', { n: note.page })}
              </button>
            ) : note.seconds != null ? (
              <button
                type="button"
                onClick={() => onOpen(note, note.seconds)}
                className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-[3px] text-[11.5px] font-bold tabular-nums text-accent hover:bg-accent/20"
              >
                <Play className="h-2.5 w-2.5 fill-accent" aria-hidden="true" />
                {formatTime(note.seconds)}
              </button>
            ) : null}
            {note.label && (
              <span className="inline-flex items-center rounded-md bg-primary-light/10 px-2 py-[3px] text-[11.5px] font-semibold text-primary-light">
                {note.label}
              </span>
            )}
            {note.favorite && (
              <Star className="h-3.5 w-3.5 fill-accent text-accent" aria-label={t('favorite')} />
            )}
          </div>

          {note.excerpt && (
            <p
              className="mb-1 break-words text-sm font-semibold leading-snug text-foreground"
              dir="auto"
            >
              {note.excerpt}
            </p>
          )}
          {note.translation && (
            <p
              className="break-words text-[12.5px] leading-relaxed text-muted-foreground"
              dir="auto"
            >
              {note.translation}
            </p>
          )}
          {note.note && (
            <div className="mt-2.5 border-s-2 border-accent ps-3">
              <p
                className="break-words text-[12.5px] italic leading-relaxed text-accent"
                dir="auto"
              >
                {note.note}
              </p>
            </div>
          )}
          {note.tags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {note.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-[2px] text-[10.5px] font-semibold text-muted-foreground"
                >
                  <Tag className="h-2.5 w-2.5" aria-hidden="true" />
                  {tag}
                </span>
              ))}
            </div>
          )}
          {starError && (
            <InlineError
              message={starError}
              onDismiss={() => setStarError(null)}
              className="mt-2"
            />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {note.origin === 'account' && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleStar}
              loading={starBusy}
              disabled={note.favorite && !canUnfavorite(note)}
              title={
                note.favorite
                  ? canUnfavorite(note)
                    ? t('unfavorite')
                    : t('favoriteLocked')
                  : t('favorite')
              }
              aria-label={note.favorite ? t('unfavorite') : t('favorite')}
            >
              {!starBusy && <Star className={note.favorite ? 'fill-accent text-accent' : ''} />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setEditing(true)}
            title={t('editNote')}
            aria-label={t('editNote')}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(note.key)}
            className="hover:bg-error/15 hover:text-error"
            title={t('delete')}
            aria-label={t('delete')}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </div>
  );
}

function NoteEditor({
  note,
  onSave,
  onClose,
}: {
  note: UnifiedNote;
  onSave: ItemProps['onSave'];
  onClose: () => void;
}) {
  const { t } = useTranslation('notes');
  const [label, setLabel] = useState(note.label ?? '');
  const [text, setText] = useState(note.note ?? '');
  const [tags, setTags] = useState<string[]>(note.tags);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A reader note is only its text; it has no label to edit.
  const hasLabel = note.source !== 'reader';

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setTagInput('');
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      // A tag typed but not yet confirmed with Enter still counts.
      const pending = tagInput.trim().toLowerCase();
      const finalTags = pending && !tags.includes(pending) ? [...tags, pending] : tags;
      await onSave(note, { ...(hasLabel ? { label } : {}), note: text, tags: finalTags });
      onClose();
    } catch (err) {
      setError(t(`errors.${errorCode(err)}`, { defaultValue: t('errors.UNKNOWN_ERROR') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      {hasLabel && (
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t('noteLabel')}</label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('noteLabel')}
            className="text-sm"
            dir="auto"
          />
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">{t('noteText')}</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('noteText')}
          dir="auto"
          className="min-h-[60px] w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-caption focus:border-accent"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">{t('tags')}</label>
        {tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => setTags(tags.filter((x) => x !== tag))}
                  aria-label={t('removeTag', { tag })}
                  className="hover:text-error"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <Input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={t('addTag')}
          className="text-sm"
          dir="auto"
        />
      </div>
      {error && <InlineError message={error} onDismiss={() => setError(null)} />}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
          {t('cancelEdit')}
        </Button>
        <Button variant="accent" size="sm" onClick={save} loading={saving}>
          {saving ? t('saving') : t('saveNote')}
        </Button>
      </div>
    </div>
  );
}
