import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchGrammar } from './api';
import { FormSpeaker, PlayTenseButton, useConjugationPlayer } from './conjugationPlayer';
import type { WordGrammarResponse, WordGrammarTense } from './types';

/** Languages the backend has conjugation tables and noun genders for. */
const GRAMMAR_LANGS = new Set(['fr']);

/** The grammar query for a word, or null where there is none to ask for. */
export function grammarQueryFor(word: string, lang: string): { word: string; lang: string } | null {
  const clean = word.trim();
  return GRAMMAR_LANGS.has(lang) && clean.length > 0 && !/\s/.test(clean)
    ? { word: clean, lang }
    : null;
}

/**
 * Strips what the stored form carries around the verb itself (que, the subject
 * pronoun, a reflexive pronoun) so "j'aime" can be matched against "aime".
 */
const PRONOUNS_RE =
  /^(que |qu')?(je |j'|tu |il |elle |on |nous |vous |ils |elles )?(me |m'|te |t'|se |s'|nous |vous )?/;
const bare = (form: string) => form.toLowerCase().replace(PRONOUNS_RE, '');

/** Every form the grammar knows for the word: "suis", "ete", "ai aime" for etre. */
export function grammarForms(data: WordGrammarResponse | null | undefined): string[] {
  if (!data) return [];
  const forms = new Set<string>();
  if (data.noun) forms.add(data.noun.lemma);
  if (data.verb) {
    forms.add(data.verb.lemma);
    for (const tense of data.verb.forms) for (const f of tense.forms) forms.add(bare(f.form));
  }
  return [...forms];
}

const startsWithVowel = (w: string) => /^[aeiouyhàâäéèêëîïôöùûü]/i.test(w);
type Noun = NonNullable<WordGrammarResponse['noun']>;

/** "la table, une table", "l'ami, un ami", "les vacances, des vacances". */
function withArticles({ lemma, gender, pluralOnly }: Noun): string {
  if (pluralOnly) return `les ${lemma} · des ${lemma}`;
  const definite = startsWithVowel(lemma)
    ? `l'${lemma}`
    : `${{ m: 'le', f: 'la', mf: 'le/la' }[gender]} ${lemma}`;
  return `${definite} · ${{ m: 'un', f: 'une', mf: 'un/une' }[gender]} ${lemma}`;
}

const cache = new Map<string, WordGrammarResponse | null>();

/**
 * The grammar of the word on screen. `currentOnly` semantics: the answer is kept
 * with the query it answers, so a new level never shows the previous level's forms.
 */
export function useWordGrammar(word: string, lang: string): WordGrammarResponse | null {
  const query = grammarQueryFor(word, lang);
  const qWord = query?.word;
  const qLang = query?.lang;
  const key = qWord && qLang ? `${qLang}\u0000${qWord}` : null;
  const [answer, setAnswer] = useState<{ key: string; data: WordGrammarResponse | null } | null>(
    null,
  );

  useEffect(() => {
    if (!qWord || !qLang || !key || cache.has(key)) return;
    let live = true;
    fetchGrammar(qWord, qLang)
      .then((data) => cache.set(key, data))
      .catch(() => cache.set(key, null))
      .finally(() => {
        if (live) setAnswer({ key, data: cache.get(key) ?? null });
      });
    return () => {
      live = false;
    };
  }, [qWord, qLang, key]);

  if (!key) return null;
  return cache.has(key) ? (cache.get(key) ?? null) : answer?.key === key ? answer.data : null;
}

/**
 * Grammar under the translation: a noun's gender, and the conjugation of the
 * verb a clicked form belongs to. No meanings, since the translation above gives
 * the meaning. Renders nothing for a word it knows nothing about.
 */
export default function WordGrammar({
  word,
  sourceLanguage,
  data,
}: {
  word: string;
  sourceLanguage: string;
  data: WordGrammarResponse | null;
}) {
  const { t, i18n } = useTranslation('wordDialog');
  const [showAll, setShowAll] = useState(false);
  const player = useConjugationPlayer(sourceLanguage);
  const target = bare(word.trim());
  const tenses = useMemo(() => data?.verb?.forms ?? [], [data]);

  // Present always; plus the tense the clicked form actually came from.
  const defaultTenses = useMemo(() => {
    const matched = tenses.find((g) => g.forms.some((f) => bare(f.form) === target));
    return tenses.filter((g, i) => i === 0 || g === matched);
  }, [tenses, target]);

  if (!data || (!data.noun && !data.verb)) return null;

  const visible: WordGrammarTense[] = showAll ? tenses : defaultTenses;
  const hidden = tenses.length - defaultTenses.length;
  const tenseLabel = (mood: string, tense: string) =>
    t(`tenses.${mood}|${tense}`, { defaultValue: tense });
  const rtl = i18n.dir?.() === 'rtl';

  return (
    <div className="mt-6 space-y-4" dir={rtl ? 'rtl' : 'ltr'}>
      {data.noun && (
        <div className="flex flex-wrap items-center gap-3 rounded-[9px] border border-border bg-card px-4 py-3">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-primary">
            {t('grammar.gender')}
          </span>
          <span className="rounded-full bg-primary/[0.12] px-2.5 py-0.5 text-[13px] font-semibold text-primary">
            {data.noun.gender === 'mf'
              ? `${t('grammar.masculine')} / ${t('grammar.feminine')}`
              : t(data.noun.gender === 'm' ? 'grammar.masculine' : 'grammar.feminine')}
          </span>
          <span className="text-[15px] text-foreground" dir="ltr">
            {withArticles(data.noun)}
          </span>
        </div>
      )}

      {data.verb && (
        <div className="overflow-hidden rounded-[9px] border border-border bg-card">
          <div className="flex items-baseline gap-2 border-b border-border px-4 py-3">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-primary">
              {t('grammar.conjugation')}
            </span>
            <span className="inline-flex items-center gap-1 self-center" dir="ltr">
              <span className="text-[15px] font-bold text-foreground">{data.verb.lemma}</span>
              <FormSpeaker
                active={player.activeKey === 'lemma'}
                loading={player.activeKey === 'lemma' && player.isLoading}
                onPlay={() => void player.playOne('lemma', data.verb!.lemma)}
                label={data.verb.lemma}
                size="md"
              />
            </span>
          </div>

          <div className="divide-y divide-border">
            {visible.map((g) => {
              const ti = tenses.indexOf(g);
              return (
                <section key={`${g.mood}|${g.tense}`} className="px-4 py-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <h4 className="flex items-baseline gap-2 text-[13px] font-semibold text-muted-foreground">
                      {tenseLabel(g.mood, g.tense)}
                      <span className="font-normal opacity-70" dir="ltr">
                        {g.tense}
                      </span>
                    </h4>
                    <PlayTenseButton
                      player={player}
                      index={ti}
                      forms={g.forms.map((f) => f.form)}
                    />
                  </div>
                  <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2" dir="ltr">
                    {g.forms.map((f, i) => {
                      const hit = bare(f.form) === target;
                      const key = `${ti}:${i}`;
                      const active = player.activeKey === key;
                      return (
                        <li
                          key={i}
                          className={`flex items-center gap-2 rounded-[7px] px-2 py-1 transition-colors ${
                            active ? 'bg-accent/10' : hit ? 'bg-success/30' : ''
                          }`}
                        >
                          <FormSpeaker
                            active={active}
                            loading={active && player.isLoading}
                            onPlay={() => void player.playOne(key, f.form)}
                            label={f.form}
                          />
                          <span
                            className={`text-[15px] text-foreground ${hit ? 'font-bold' : 'font-medium'}`}
                          >
                            {f.form}
                          </span>
                          <span className="truncate text-[12px] text-muted-foreground">
                            {f.ipa}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          {hidden > 0 && (
            <div className="border-t border-border px-4 py-2.5">
              <button
                type="button"
                onClick={() => {
                  player.cancel();
                  setShowAll((v) => !v);
                }}
                className="inline-flex items-center gap-1.5 rounded-[9px] border-[1.5px] border-border bg-card px-3.5 py-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                {showAll ? t('fewerTenses') : t('moreTenses', { count: hidden })}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
