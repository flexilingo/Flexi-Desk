import { useTranslation } from 'react-i18next';
import { ExternalLink, FileText, Headphones, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NoteItem, type NotePatch } from './NoteItem';
import { groupTitle } from './groupTitle';
import type { NoteGroup, UnifiedNote } from './notesLogic';

interface Props {
  group: NoteGroup;
  selected: Set<string>;
  onSelect: (key: string, checked: boolean) => void;
  onSelectMany: (keys: string[], checked: boolean) => void;
  onDelete: (key: string) => void;
  onOpen: (note: UnifiedNote, seconds?: number | null) => void;
  onOpenSource: (group: NoteGroup) => void;
  onSave: (note: UnifiedNote, patch: NotePatch) => Promise<void>;
  onToggleFavorite: (note: UnifiedNote) => Promise<void>;
}

export function NoteGroupCard({
  group,
  selected,
  onSelect,
  onSelectMany,
  onDelete,
  onOpen,
  onOpenSource,
  onSave,
  onToggleFavorite,
}: Props) {
  const { t } = useTranslation('notes');
  const allSelected = group.notes.every((n) => selected.has(n.key));
  const someSelected = group.notes.some((n) => selected.has(n.key));
  const Icon =
    group.source === 'reader' ? FileText : group.source === 'podcast' ? Headphones : Play;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-accent/[0.04] px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(c) =>
              onSelectMany(
                group.notes.map((n) => n.key),
                c,
              )
            }
            className={someSelected && !allSelected ? 'border-accent' : ''}
            aria-label={t('selectGroup')}
          />
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10">
            <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-[13.5px] font-bold leading-tight text-foreground"
              dir="auto"
            >
              {groupTitle(group, t)}
            </div>
            <p className="flex flex-wrap items-center gap-x-2 text-[11.5px] tabular-nums text-muted-foreground">
              <span>{t('noteCount', { count: group.notes.length })}</span>
              <span className="rounded bg-muted px-1.5 py-px text-[10.5px] font-semibold">
                {group.origin === 'device' ? t('where.device') : t('where.account')}
              </span>
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onOpenSource(group)}
          className="shrink-0"
        >
          <ExternalLink />
          {t(
            group.source === 'reader'
              ? 'openDocument'
              : group.source === 'podcast'
                ? 'openEpisode'
                : 'openVideo',
          )}
        </Button>
      </header>
      <div className="divide-y divide-border">
        {group.notes.map((n) => (
          <NoteItem
            key={n.key}
            note={n}
            selected={selected.has(n.key)}
            onSelect={onSelect}
            onDelete={onDelete}
            onOpen={onOpen}
            onSave={onSave}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
    </section>
  );
}
