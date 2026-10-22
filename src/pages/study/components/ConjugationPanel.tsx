import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Rows3 } from 'lucide-react';
import { cheatsheet } from '@/pages/cheatsheet/lib/service';
import {
  FormSpeaker,
  PlayTenseButton,
  useConjugationPlayer,
} from '@/components/WordDialog/conjugationPlayer';
import { cn } from '@/lib/utils';
import type { CardNotes } from '../types';
import {
  defaultGroups,
  groupsFromNotes,
  groupsFromVerb,
  isFrenchVerbCard,
  verbQuery,
  type ConjGroup,
} from '../lib/conjugation';
import { hasRtl } from '../lib/cardLang';

/** What was already asked, so flipping back to a verb never asks the cheatsheet twice. */
const cache = new Map<string, ConjGroup[] | null>();

/**
 * Where the groups come from: the card's own notes, else (a French verb) the
 * cheatsheet — read-only, served from its offline copy when there is no connection.
 * `null` while the answer is on its way, `[]` when there is none.
 */
function useConjugations(notes: CardNotes | null, front: string, language: string, locale: string) {
  const own = useMemo(() => groupsFromNotes(notes), [notes]);
  const wantsLookup = own.length === 0 && isFrenchVerbCard(notes, language, front);
  const key = wantsLookup ? `${locale}:${verbQuery(front)}` : null;
  const [fetched, setFetched] = useState<{ key: string; groups: ConjGroup[] } | null>(null);

  useEffect(() => {
    if (!key || cache.has(key)) return;
    let live = true;
    cheatsheet
      .getVerb('fr', locale, verbQuery(front))
      .then((res) => cache.set(key, res ? groupsFromVerb(res.data) : []))
      .catch(() => cache.set(key, []))
      .finally(() => {
        if (live) setFetched({ key, groups: cache.get(key) ?? [] });
      });
    return () => {
      live = false;
    };
  }, [key, locale, front]);

  if (own.length > 0) return own;
  if (!key) return [];
  if (cache.has(key)) return cache.get(key) ?? [];
  return fetched?.key === key ? fetched.groups : null;
}

/**
 * The verb conjugation panel of a revealed card: Présent by default, the other tenses
 * behind "more tenses", every person speakable and a whole tense playable in one press
 * (the voice finishes a person before the next begins). Each form's meaning shows only
 * when `showGlosses` — it gives the meaning away just as plainly as the definition does,
 * so it hides behind the same eye.
 */
export function ConjugationPanel({
  notes,
  front,
  language,
  showGlosses = true,
}: {
  notes: CardNotes | null;
  front: string;
  language: string;
  showGlosses?: boolean;
}) {
  const { t, i18n } = useTranslation('wordDialog');
  const { t: tStudy } = useTranslation('study');
  const locale = (i18n.language || 'en').split('-')[0];
  const groups = useConjugations(notes, front, language, locale);
  const [showAll, setShowAll] = useState(false);
  const player = useConjugationPlayer(language.split('-')[0] || 'fr');

  if (!groups || groups.length === 0) return null;
  const base = defaultGroups(groups);
  const shown = showAll ? groups : base;
  const rest = groups.length - base.length;
  const tenseLabel = (g: ConjGroup) => t(`tenses.${g.mood}|${g.tense}`, { defaultValue: g.tense });

  return (
    <div
      className="space-y-3 rounded-xl border border-border bg-card p-3.5"
      data-testid="conjugation-panel"
    >
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-primary/15 text-primary">
          <Rows3 className="h-3.5 w-3.5" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-caption">
          {tStudy('conjugation.title')}
        </span>
      </div>
      {shown.map((g) => {
        const index = groups.indexOf(g);
        return (
          <div key={`${g.mood}|${g.tense}`}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[11px] font-bold text-foreground" dir="ltr">
                {tenseLabel(g)}
              </span>
              <PlayTenseButton player={player} index={index} forms={g.forms.map((f) => f.form)} />
            </div>
            <div className="divide-y divide-border rounded-lg bg-muted/60">
              {g.forms.map((f, i) => {
                const k = `${index}:${i}`;
                const active = player.activeKey === k;
                return (
                  <div
                    key={k}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-1 transition-colors',
                      active && 'bg-accent/10',
                    )}
                  >
                    <span className="flex-1 text-xs font-medium text-foreground" dir="ltr">
                      {f.form}
                    </span>
                    {f.ipa && (
                      <span
                        className="hidden font-mono text-[10px] italic text-caption sm:inline"
                        dir="ltr"
                      >
                        {f.ipa}
                      </span>
                    )}
                    {showGlosses && f.gloss && (
                      <span
                        className="min-w-[68px] shrink-0 text-end text-[11px] text-muted-foreground"
                        dir={hasRtl(f.gloss) ? 'rtl' : 'auto'}
                      >
                        {f.gloss}
                      </span>
                    )}
                    <FormSpeaker
                      active={active}
                      loading={active && player.isLoading}
                      onPlay={() => void player.playOne(k, f.form)}
                      label={f.form}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {rest > 0 && (
        <button
          type="button"
          onClick={() => {
            player.cancel();
            setShowAll((v) => !v);
          }}
          className="text-[11px] font-semibold text-accent transition-colors hover:opacity-80"
        >
          {showAll ? t('fewerTenses') : t('moreTenses', { count: rest })}
        </button>
      )}
    </div>
  );
}
