/**
 * The build map of a French verb: which forms have to be memorised, and which
 * are produced from them by a rule.
 *
 * This is the cheatsheet's own claim ("verbes-cinq-familles": *every conjugated
 * form = stem + ending; learn a verb as two pieces, the infinitive and `nous`*)
 * turned into something a reader can see for the verb in front of them. Nothing
 * here is stored per verb: each rule is APPLIED to the real paradigm and the
 * result compared against it, so a verb that breaks a rule is reported as an
 * exception instead of quietly being described wrongly. That is the part a
 * learner needs most — "this one follows the pattern except in `il`".
 *
 * Deliberately pure and free of React: the page renders it, and a test can run
 * it over the whole catalogue to see which verbs break which rule.
 */

import type { VerbDetail, VerbTense } from './types';

/** Subject pronoun, `que`, and a reflexive pronoun — what the stored form
 *  carries around the verb itself. Mirrors the word dialog's `bare`. */
const PRONOUNS_RE =
  /^(que |qu')?(je |j'|tu |il |elle |on |nous |vous |ils |elles )?(me |m'|te |t'|se |s'|nous |vous )?/;

/** "que nous revenions" → "revenions"; "qu'ils reviennent" → "reviennent". */
export const bareForm = (form: string) => form.toLowerCase().replace(PRONOUNS_RE, '').trim();

const PERSONS = ['je', 'tu', 'il', 'nous', 'vous', 'ils'] as const;
export type Person = (typeof PERSONS)[number];

/**
 * Spelling that is pronunciation, not conjugation: `g` needs its `e` before
 * `a`/`o` and loses it elsewhere (`nous mangeons` but `ils mangent`), and `ç`
 * is `c` before `e`/`i`. Without this the `-ger` and `-cer` verbs would be
 * reported as exceptions six times each, which is exactly backwards — their
 * endings are perfectly regular and only the stem is spelled for the ear.
 */
function join(stem: string, ending: string, infinitive = ''): string {
  const soft = /^[eiy]/.test(ending);
  if (soft && /ge$/.test(stem)) return stem.slice(0, -1) + ending;
  if (soft && /ç$/.test(stem)) return stem.slice(0, -1) + 'c' + ending;
  // `il` adds no `t` to a stem that already ends in one — `il prend`, `il met`.
  if (ending === 't' && /[dt]$/.test(stem)) return stem;
  // `-aître`/`-oître` keep the circumflex on the `i` before that `t`:
  // `il connaît`, `il naît`, `il croît`. It is the accent, not a new stem.
  if (ending === 't' && /i$/.test(stem) && /[ao]ître$/.test(infinitive)) {
    return `${stem.slice(0, -1)}î${ending}`;
  }
  return stem + ending;
}

type Endings = Partial<Record<Person, string>>;

const ENDINGS = {
  /** Every -er verb, and the closed `-frir`/`-vrir` list: "form A". */
  presentA: { je: 'e', tu: 'es', il: 'e' } as Endings,
  /** Everything else in the singular: "form B". */
  presentB: { je: 's', tu: 's', il: 't' } as Endings,
  /** -ir verbs of family 1, where `iss` belongs to the ending. */
  presentIss: { je: 'is', tu: 'is', il: 'it' } as Endings,
  plural: { nous: 'ons', vous: 'ez', ils: 'ent' } as Endings,
  imparfait: {
    je: 'ais',
    tu: 'ais',
    il: 'ait',
    nous: 'ions',
    vous: 'iez',
    ils: 'aient',
  } as Endings,
  futur: { je: 'ai', tu: 'as', il: 'a', nous: 'ons', vous: 'ez', ils: 'ont' } as Endings,
  subjonctif: { je: 'e', tu: 'es', il: 'e', ils: 'ent' } as Endings,
};

/** One person's line: what the rule produces, and what the verb actually does. */
export type PatternRow = {
  pr: Person | '';
  /** The part the rule keeps constant. */
  stem: string;
  /** The part the rule adds. Empty for a form quoted whole (an auxiliary). */
  ending: string;
  /** What the verb really is, pronoun stripped. */
  actual: string;
  /** False when the rule and the verb disagree — the thing worth learning. */
  ok: boolean;
};

export type PatternNode = {
  key: string;
  /** Which seed it hangs off: the infinitive, the `nous` form, or the participle. */
  seed: 'infinitive' | 'nous' | 'participle';
  /** Mood+tense, for the page's own tense labels. */
  mood: string;
  tense: string;
  /** Stem the rule uses, shown as `connaiss-`. */
  stem: string;
  /** Endings in person order, shown as `-ais -ais -ait …`. */
  endings: string[];
  rows: PatternRow[];
  /** How many persons break the rule. 0 = the pattern holds all the way. */
  exceptions: number;
  /** Set when the rule cannot be applied at all (a boot or wholly irregular
   *  stem): the forms are shown, but as something to memorise. */
  memorise?: boolean;
  /** A stem the verb really uses where the rule predicted another one, e.g.
   *  `reviendr-` against the infinitive `revenir`. */
  realStem?: string;
  /** Extra note key, resolved by the page from its messages. */
  noteKey?: string;
};

export type VerbPattern = {
  /** The pieces that cannot be derived and must be learnt. */
  seeds: {
    infinitive: string;
    nous: string | null;
    /** The past participle — the third piece every compound tense needs. */
    participle: string | null;
    /** `avoir` or `être`, read off the verb's own passé composé. */
    auxiliary: 'avoir' | 'être' | null;
  };
  nodes: PatternNode[];
};

const group = (verb: VerbDetail, tense: string): VerbTense | undefined =>
  verb.forms.find((g) => g.tense === tense);

const formOf = (g: VerbTense | undefined, pr: string): string | null => {
  const f = g?.forms.find((x) => x.pr === pr);
  return f ? bareForm(f.form) : null;
};

/** Builds the rows of one node by applying `endings` to `stem`. */
function applyRule(
  stem: string,
  endings: Endings,
  actualGroup: VerbTense | undefined,
  infinitive = '',
): PatternRow[] {
  const rows: PatternRow[] = [];
  for (const pr of PERSONS) {
    const ending = endings[pr];
    if (ending === undefined) continue;
    const actual = formOf(actualGroup, pr);
    if (actual === null) continue;
    rows.push({ pr, stem, ending, actual, ok: join(stem, ending, infinitive) === actual });
  }
  return rows;
}

/**
 * A tense whose endings are perfectly regular on a stem that is NOT the one the
 * rule predicted — `revenir` → `reviendr-ai`, `acheter` → `achèt-e`.
 *
 * This is the difference between "this verb is irregular" and the far more
 * useful "learn ONE more stem and the six forms fall out of it". So before a
 * node is reported as N broken persons, the real stem is read off the first
 * form and the whole rule re-run on it; if everything then lines up, the node
 * says *the stem changes* instead of listing exceptions that are all the same
 * exception.
 */
function withRealStem(
  rows: PatternRow[],
  infinitive: string,
): { rows: PatternRow[]; realStem?: string } {
  if (!rows.length || rows.every((r) => r.ok)) return { rows };
  const first = rows[0];
  if (!first.ending || !first.actual.endsWith(first.ending)) return { rows };
  const candidate = first.actual.slice(0, -first.ending.length);
  if (!candidate || candidate === first.stem) return { rows };
  const retried = rows.map((r) => ({
    ...r,
    stem: candidate,
    ok: join(candidate, r.ending, infinitive) === r.actual,
  }));
  if (retried.some((r) => !r.ok)) return { rows };
  return { rows: retried, realStem: candidate };
}

const node = (
  n: Omit<PatternNode, 'exceptions' | 'endings'> & { endings?: string[] },
): PatternNode => ({
  ...n,
  endings: n.endings ?? n.rows.map((r) => r.ending),
  exceptions: n.rows.filter((r) => !r.ok).length,
});

/**
 * The singular of the present, which is where the five families differ.
 *
 * `nous` shows the full stem; the singular may drop the last consonant of it
 * (`nous partons` → `je pars`), keep it (`-er`, `-frir`), or hide it behind
 * `iss` (`finir`). Boot verbs and the wholly irregular ones change the stem
 * outright, so for those the rule is not applied at all — claiming a pattern
 * that isn't there teaches the wrong thing.
 */
function singularStem(
  verb: VerbDetail,
  nousStem: string,
): { stem: string; endings: Endings } | null {
  const inf = bareForm(verb.lemma);
  switch (verb.family) {
    case 'group-1-er':
      return { stem: inf.replace(/er$/, ''), endings: ENDINGS.presentA };
    case 'family-4-frir':
      return { stem: inf.replace(/ir$/, ''), endings: ENDINGS.presentA };
    case 'family-1-iss':
      return { stem: inf.replace(/ir$/, ''), endings: ENDINGS.presentIss };
    case 'family-2-ir':
    case 'family-3-re':
      return { stem: shortStem(inf, nousStem), endings: ENDINGS.presentB };
    default:
      // family-5-boot, irregular, other — memorised, not derived.
      return null;
  }
}

/**
 * The short stem of families 2 and 3: `nous` minus the consonant the singular
 * drops (`connaiss-` → `connai-`, `mett-` → `me-`). The `-dre` verbs are the
 * one group that keeps it, since `d` is the stem's own last letter
 * (`je prends`, not ~~`je prens`~~) — except `-indre`, which drops `dre`.
 */
function shortStem(infinitive: string, nousStem: string): string {
  if (/indre$/.test(infinitive)) return infinitive.replace(/dre$/, '');
  if (/dre$/.test(infinitive)) return infinitive.replace(/re$/, '');
  // `battre`, `mettre`: one `t` belongs to the stem (`je bats`, `il met`), so
  // only the doubling goes — unlike `connaître`, where both `s` of `connaiss-`
  // do (`je connais`).
  if (/ttre$/.test(infinitive)) return infinitive.replace(/tre$/, '');
  const doubled = nousStem.match(/(.)\1$/);
  if (doubled) return nousStem.slice(0, -2);
  return nousStem.replace(/[bcdfghjklmnpqrstvwxz]$/, '');
}

/** Past participle agreement, so `être` verbs are checked against what they
 *  really write: `nous sommes revenus`, not ~~`revenu`~~. */
function agreed(participle: string, pr: Person, auxiliary: 'avoir' | 'être'): string {
  if (auxiliary === 'avoir') return participle;
  return ['nous', 'vous', 'ils'].includes(pr) ? `${participle}s` : participle;
}

const AUX_PRESENT: Record<'avoir' | 'être', Record<Person, string>> = {
  avoir: { je: 'ai', tu: 'as', il: 'a', nous: 'avons', vous: 'avez', ils: 'ont' },
  être: { je: 'suis', tu: 'es', il: 'est', nous: 'sommes', vous: 'êtes', ils: 'sont' },
};
const AUX_IMPARFAIT: Record<'avoir' | 'être', Record<Person, string>> = {
  avoir: { je: 'avais', tu: 'avais', il: 'avait', nous: 'avions', vous: 'aviez', ils: 'avaient' },
  être: { je: 'étais', tu: 'étais', il: 'était', nous: 'étions', vous: 'étiez', ils: 'étaient' },
};

/** A compound tense: auxiliary (quoted whole) + the participle. */
function compoundRows(
  table: Record<'avoir' | 'être', Record<Person, string>>,
  auxiliary: 'avoir' | 'être',
  participle: string,
  actualGroup: VerbTense | undefined,
): PatternRow[] {
  const rows: PatternRow[] = [];
  for (const pr of PERSONS) {
    const actual = formOf(actualGroup, pr);
    if (actual === null) continue;
    const expected = `${table[auxiliary][pr]} ${agreed(participle, pr, auxiliary)}`;
    rows.push({ pr, stem: table[auxiliary][pr], ending: '', actual, ok: expected === actual });
  }
  return rows;
}

/**
 * Reads a verb's paradigm and returns the map: three seeds, and every tense
 * that can be built off one of them, each marked as following its rule or not.
 */
export function buildVerbPattern(verb: VerbDetail): VerbPattern | null {
  const infinitive = bareForm(verb.lemma);
  const present = group(verb, 'présent');
  const nous = formOf(present, 'nous');
  // Only a `nous` that really is stem+`ons` yields a stem. `être`'s `sommes`
  // does not, and pretending otherwise produced "sommes-ant" for its participle.
  const nousStem = nous && /ons$/.test(nous) ? nous.replace(/ons$/, '') : null;
  const participleGroup = group(verb, 'participe-passé');
  const participle = participleGroup?.forms[0] ? bareForm(participleGroup.forms[0].form) : null;

  const passeCompose = group(verb, 'passé-composé');
  const pcJe = formOf(passeCompose, 'je') ?? '';
  const auxiliary: 'avoir' | 'être' | null = pcJe.startsWith('suis ')
    ? 'être'
    : pcJe.startsWith('ai ')
      ? 'avoir'
      : null;

  const nodes: PatternNode[] = [];
  /** The singular stem the verb really uses, once known — a boot verb brings it
   *  back in `ils`, which is what makes the shape a boot. */
  let singularRealStem: string | null = null;

  // ---- off `nous`: the present plural, and everything built on the long stem.
  if (nousStem && present) {
    const singular = singularStem(verb, nousStem);
    if (singular) {
      const applied = withRealStem(
        applyRule(singular.stem, singular.endings, present, infinitive),
        infinitive,
      );
      nodes.push(
        node({
          key: 'present-singular',
          seed: 'nous',
          mood: 'indicatif',
          tense: 'présent',
          stem: applied.realStem ?? singular.stem,
          rows: applied.rows,
          realStem: applied.realStem,
          noteKey: 'singular',
        }),
      );
      singularRealStem = applied.realStem ?? null;
    } else {
      // A boot verb: show the singular, say plainly that it is learnt.
      const rows = PERSONS.slice(0, 3)
        .map((pr) => ({ pr, stem: '', ending: '', actual: formOf(present, pr) ?? '', ok: true }))
        .filter((r) => r.actual);
      if (rows.length) {
        nodes.push(
          node({
            key: 'present-singular',
            seed: 'nous',
            mood: 'indicatif',
            tense: 'présent',
            stem: '',
            rows,
            endings: [],
            memorise: true,
            noteKey: 'singular',
          }),
        );
      }
    }

    const pluralRows = applyRule(nousStem, ENDINGS.plural, present, infinitive);
    // A boot verb's `ils` takes the singular's stem back, not this one — that
    // IS the boot, and naming it beats reporting a broken rule. True of the
    // `-eter`/`-eler` verbs too (`nous achetons` but `ils achètent`).
    const boots =
      verb.family === 'family-5-boot' ||
      (!!singularRealStem &&
        pluralRows.some(
          (r) => r.pr === 'ils' && !r.ok && join(singularRealStem!, 'ent', infinitive) === r.actual,
        ));
    nodes.push(
      node({
        key: 'present-plural',
        seed: 'nous',
        mood: 'indicatif',
        tense: 'présent',
        stem: nousStem,
        rows: pluralRows,
        noteKey: boots ? 'boot' : 'plural',
      }),
    );

    const imparfait = group(verb, 'imparfait');
    if (imparfait) {
      nodes.push(
        node({
          key: 'imparfait',
          seed: 'nous',
          mood: 'indicatif',
          tense: 'imparfait',
          stem: nousStem,
          rows: applyRule(nousStem, ENDINGS.imparfait, imparfait, infinitive),
        }),
      );
    }

    const participePresent = group(verb, 'participe-présent');
    const actualPP = participePresent?.forms[0] ? bareForm(participePresent.forms[0].form) : null;
    if (actualPP) {
      nodes.push(
        node({
          key: 'participe-présent',
          seed: 'nous',
          mood: 'participe',
          tense: 'participe-présent',
          stem: nousStem,
          rows: [
            {
              pr: '',
              stem: nousStem,
              ending: 'ant',
              actual: actualPP,
              ok: join(nousStem, 'ant') === actualPP,
            },
          ],
        }),
      );
    }

    // The subjunctive hangs off `ils`, not off `nous` — that is the whole
    // trick of it, and why a boot verb's subjunctive is boot-shaped too.
    const subjonctif = group(verb, 'subjonctif-présent');
    const ils = formOf(present, 'ils');
    const ilsStem = ils?.replace(/ent$/, '') ?? null;
    const imparfaitGroup = group(verb, 'imparfait');
    if (subjonctif && ilsStem) {
      const rows = applyRule(ilsStem, ENDINGS.subjonctif, subjonctif, infinitive);
      // `nous`/`vous` are the imparfait forms, spelled exactly the same.
      for (const pr of ['nous', 'vous'] as const) {
        const actual = formOf(subjonctif, pr);
        const fromImparfait = formOf(imparfaitGroup, pr);
        if (actual && fromImparfait) {
          rows.push({ pr, stem: fromImparfait, ending: '', actual, ok: fromImparfait === actual });
        }
      }
      nodes.push(
        node({
          key: 'subjonctif-présent',
          seed: 'nous',
          mood: 'subjonctif',
          tense: 'subjonctif-présent',
          stem: ilsStem,
          rows: rows.sort(
            (a, b) => PERSONS.indexOf(a.pr as Person) - PERSONS.indexOf(b.pr as Person),
          ),
          noteKey: 'subjonctif',
        }),
      );
    }
  }

  if (!nousStem && present) {
    // `être` — no stem to take, so the présent is shown for what it is: six
    // forms to learn whole.
    const rows = PERSONS.map((pr) => ({
      pr,
      stem: '',
      ending: '',
      actual: formOf(present, pr) ?? '',
      ok: true,
    })).filter((r) => r.actual);
    if (rows.length) {
      nodes.push(
        node({
          key: 'present-singular',
          seed: 'nous',
          mood: 'indicatif',
          tense: 'présent',
          stem: '',
          rows,
          endings: [],
          memorise: true,
        }),
      );
    }
  }

  // ---- off the infinitive: the futur, and the conditionnel on the same stem.
  const futur = group(verb, 'futur-simple');
  if (futur) {
    const predicted = infinitive.replace(/re$/, 'r');
    const applied = withRealStem(
      applyRule(predicted, ENDINGS.futur, futur, infinitive),
      infinitive,
    );
    const real = formOf(futur, 'je')?.replace(/ai$/, '') ?? null;
    nodes.push(
      node({
        key: 'futur-simple',
        seed: 'infinitive',
        mood: 'indicatif',
        tense: 'futur-simple',
        stem: applied.realStem ?? predicted,
        rows: applied.rows,
        realStem: applied.realStem,
      }),
    );

    // The conditionnel is the one tense with no stem of its own: it is the
    // futur's stem — the verb's real one — with the imparfait's endings.
    const conditionnel = group(verb, 'conditionnel-présent');
    if (conditionnel && real) {
      nodes.push(
        node({
          key: 'conditionnel-présent',
          seed: 'infinitive',
          mood: 'conditionnel',
          tense: 'conditionnel-présent',
          stem: real,
          rows: applyRule(real, ENDINGS.imparfait, conditionnel, infinitive),
          noteKey: 'conditionnel',
        }),
      );
    }
  }

  const futurProche = group(verb, 'futur-proche');
  if (futurProche) {
    const aller: Record<Person, string> = {
      je: 'vais',
      tu: 'vas',
      il: 'va',
      nous: 'allons',
      vous: 'allez',
      ils: 'vont',
    };
    const rows: PatternRow[] = [];
    for (const pr of PERSONS) {
      const actual = formOf(futurProche, pr);
      if (!actual) continue;
      rows.push({
        pr,
        stem: aller[pr],
        ending: '',
        actual,
        ok: `${aller[pr]} ${infinitive}` === actual,
      });
    }
    nodes.push(
      node({
        key: 'futur-proche',
        seed: 'infinitive',
        mood: 'indicatif',
        tense: 'futur-proche',
        stem: infinitive,
        rows,
        endings: [],
        noteKey: 'futurProche',
      }),
    );
  }

  // ---- off the participle: every compound tense, which is auxiliary + it.
  if (participle && auxiliary) {
    if (passeCompose) {
      nodes.push(
        node({
          key: 'passé-composé',
          seed: 'participle',
          mood: 'indicatif',
          tense: 'passé-composé',
          stem: participle,
          rows: compoundRows(AUX_PRESENT, auxiliary, participle, passeCompose),
          endings: [],
          noteKey: auxiliary === 'être' ? 'compoundEtre' : 'compoundAvoir',
        }),
      );
    }
    const pqp = group(verb, 'plus-que-parfait');
    if (pqp) {
      nodes.push(
        node({
          key: 'plus-que-parfait',
          seed: 'participle',
          mood: 'indicatif',
          tense: 'plus-que-parfait',
          stem: participle,
          rows: compoundRows(AUX_IMPARFAIT, auxiliary, participle, pqp),
          endings: [],
          noteKey: 'compoundImparfait',
        }),
      );
    }
  }

  if (!nodes.length) return null;

  return {
    seeds: { infinitive: verb.lemma, nous: nous ?? null, participle, auxiliary },
    nodes,
  };
}
