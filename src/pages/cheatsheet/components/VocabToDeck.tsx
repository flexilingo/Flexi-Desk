import { useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddToDeckSheet, type AddToDeckItem } from '@/components/common/AddToDeckSheet';
import type { VocabCard } from '../lib/vocab';
import { formatCount } from '../lib/types';
import { useCsLocale } from './shared';

/**
 * Turns a cheatsheet page into a deck.
 *
 * The cards are read off the page's own tables, so what lands in the deck is
 * exactly what the reader can see. The meaning is already written on the page, so
 * the sheet's basic mode saves them as they are, with nothing to translate.
 */
export default function VocabToDeck({
  cards,
  title,
  lang,
}: {
  cards: VocabCard[];
  /** Seeds the deck name, so the deck is recognisable a month later. */
  title: string;
  lang: string;
}) {
  const { t, locale } = useCsLocale();
  const [open, setOpen] = useState(false);

  const items = useMemo<AddToDeckItem[]>(
    () =>
      cards.map((c) => ({
        word: c.front,
        language: lang,
        translation: c.back,
        definition: c.notes,
      })),
    [cards, lang],
  );

  if (cards.length < 5) return null;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[9px] border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-primary/10 text-primary">
            <Layers className="h-4 w-4" />
          </span>
          <span>
            <span className="block font-semibold text-foreground">{t('deck.title')}</span>
            <span className="block text-caption">
              {t('deck.subtitle', { count: formatCount(cards.length, locale) })}
            </span>
          </span>
        </div>
        <Button variant="accent" onClick={() => setOpen(true)}>
          <Layers />
          {t('deck.action')}
        </Button>
      </div>

      <AddToDeckSheet
        open={open}
        onOpenChange={setOpen}
        items={items}
        sourceLanguage={lang}
        defaultLanguage={lang}
        defaultDeckName={title}
      />
    </>
  );
}
