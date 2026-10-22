import { useState } from 'react';
import {
  FormSpeaker,
  PlayTenseButton,
  useConjugationPlayer,
} from '@/components/WordDialog/conjugationPlayer';
import type { VerbDetail } from '../lib/types';
import { dirFor } from '../lib/types';
import { CARD, CARD_TITLE, PILL_ACTIVE, PILL_BASE, PILL_IDLE } from '../ui';
import { useCsLocale } from './shared';

/**
 * The conjugation, one tense at a time. A row of tense chips picks the table;
 * the present is the one shown first, because someone looking a verb up nine
 * times out of ten wants it. Opening every tense at once was ten tables — a
 * dozen screens on a phone — for the one the reader came for.
 *
 * Tense and pronoun LABELS come from this app's messages, not from the data.
 * They used to be baked into every row of every paradigm — which meant a
 * second explain-language would have had to copy 2.4 MB of conjugations just
 * to change the words beside them. There are ~17 such labels; they belong in
 * a message file.
 */
export default function VerbConjugation({
  verb,
  lang,
  locale,
}: {
  verb: VerbDetail;
  lang: string;
  /** The language the page explains in — decides reading direction. */
  locale: string;
}) {
  const { t, i18n } = useCsLocale();
  const [shown, setShown] = useState(0);
  // One voice for the page: "play all" on a tense and a tap on a single form
  // replace each other instead of talking over each other.
  const player = useConjugationPlayer(lang);

  const g = verb.forms[shown];

  // A label the messages do not carry yet falls back to the French tense name,
  // which is still useful — better than an empty heading while a translation
  // is in progress.
  const label = (mood: string, tense: string) => {
    const key = `verbs.tenses.${mood}|${tense}`;
    return i18n.exists(`cheatsheet:${key}`) ? t(key) : tense;
  };
  const pronoun = (pr: string) => {
    if (!pr) return '';
    const key = `verbs.pronouns.${pr}`;
    return i18n.exists(`cheatsheet:${key}`) ? t(key) : pr;
  };

  if (!g) return null;

  return (
    <section dir={dirFor(locale)} className={CARD}>
      <h2 className={`${CARD_TITLE} px-4 pt-5 sm:px-6`}>{t('verbs.conjugation')}</h2>

      {verb.predicted && (
        <p className="mx-4 mt-3 rounded-[7px] border border-warning/35 bg-warning/10 px-3 py-2 text-sm text-foreground sm:mx-6">
          {t('verbs.predicted')}
        </p>
      )}

      {/* The tense picker: a row that scrolls sideways on a phone rather than
          wrapping into a block of chips. The chosen tense is state, so olive —
          the same chips as the topic page's section bar. */}
      {verb.forms.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:flex-wrap sm:px-6 [&::-webkit-scrollbar]:hidden">
          {verb.forms.map((f, i) => (
            <button
              key={`${f.mood}-${f.tense}`}
              type="button"
              onClick={() => {
                player.cancel();
                setShown(i);
              }}
              aria-pressed={i === shown}
              className={`${PILL_BASE} ${i === shown ? PILL_ACTIVE : PILL_IDLE}`}
            >
              {label(f.mood, f.tense)}
            </button>
          ))}
        </div>
      )}

      {/* The chosen chip already names the tense; this row only adds its
          French name and the button that reads the whole table aloud. */}
      <div className="mt-4 flex items-center gap-2 px-4 sm:px-6">
        {/* Not when the chip already reads in French ("Passé composé"). */}
        {label(g.mood, g.tense).toLowerCase() !== g.tense.toLowerCase() && (
          <bdi className="text-[0.8125rem] text-caption">{g.tense}</bdi>
        )}
        <PlayTenseButton player={player} index={shown} forms={g.forms.map((f) => f.form)} />
      </div>

      {/* Edge to edge inside the card, like the topic page's tables. On a phone
          the pronunciation and the meaning sit under the form instead of in
          columns of their own, which on 360px broke every row onto three
          lines. Padding is logical so the RTL page keeps it on the right side. */}
      <table className="mt-3 w-full border-t border-border text-[0.9375rem] sm:text-base [&_td:first-child]:ps-4 [&_td:last-child]:pe-4 sm:[&_td:first-child]:ps-6 sm:[&_td:last-child]:pe-6">
        <tbody className="divide-y divide-border">
          {g.forms.map((f, i) => {
            const key = `${shown}:${i}`;
            const active = player.activeKey === key;
            const gloss = verb.form_glosses?.[`${g.mood}|${g.tense}|${f.pr}`] ?? '';
            return (
              <tr key={i} className={`transition-colors ${active ? 'bg-olive-500/[0.08]' : ''}`}>
                <td className="w-14 py-2.5 pe-3 align-top text-muted-foreground">
                  {pronoun(f.pr)}
                </td>
                {/* The last cell drawn on a phone, so it carries the edge padding.
                    The speaker sits right after the form: in a column of its own
                    it drifted half a table away from it on a wide screen. */}
                <td className="py-2 pe-2 align-top max-sm:pe-4">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      <bdi>{f.form}</bdi>
                    </span>
                    <FormSpeaker
                      active={active}
                      loading={active && player.isLoading}
                      onPlay={() => player.playOne(key, f.form)}
                      label={f.form}
                      size="md"
                    />
                  </span>
                  <span className="block text-[0.8125rem] text-caption sm:hidden">
                    <bdi>{f.ipa}</bdi>
                  </span>
                  {gloss && (
                    <span className="block text-[0.8125rem] text-muted-foreground md:hidden">
                      {gloss}
                    </span>
                  )}
                </td>
                <td className="hidden py-2.5 pe-3 ps-2 align-top text-caption sm:table-cell">
                  <bdi>{f.ipa}</bdi>
                </td>
                <td className="hidden py-2.5 align-top text-muted-foreground md:table-cell">
                  {gloss}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
