import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Pin } from 'lucide-react';
import { FormSpeaker, useConjugationPlayer } from '@/components/WordDialog/conjugationPlayer';
import { buildVerbPattern, type PatternNode } from '../lib/verbPattern';
import type { VerbDetail } from '../lib/types';
import { dirFor, formatCount } from '../lib/types';
import { CARD, CARD_TITLE, PILL_ACTIVE, PILL_BASE, PILL_IDLE } from '../ui';
import { useCsLocale } from './shared';
import Ticks from './Ticks';

/**
 * The verb as a build map: three pieces to memorise, and a branch for every
 * tense that is produced from one of them.
 *
 * The conjugation tables below this answer "what are the forms". A learner who
 * has to hold 389 verbs needs the other answer — "what do I actually have to
 * remember, and what comes out of it by rule" — which is the cheatsheet's own
 * claim (learn a verb as its infinitive plus `nous`) made concrete for the verb
 * in front of them. Every branch is computed against this verb's real forms, so
 * where the rule does not hold the branch says so instead of lying quietly.
 */
export default function VerbPatternTree({
  verb,
  lang,
  locale,
}: {
  verb: VerbDetail;
  lang: string;
  locale: string;
}) {
  const { t } = useCsLocale();
  const pattern = useMemo(() => buildVerbPattern(verb), [verb]);
  const player = useConjugationPlayer(lang);
  /** Which seed a phone shows; from `md` up the three stand side by side. */
  const [picked, setPicked] = useState<PatternNode['seed'] | null>(null);

  if (!pattern) return null;

  const { seeds, nodes } = pattern;
  const seedOf = (seed: PatternNode['seed']) => nodes.filter((n) => n.seed === seed);

  const columns = (
    [
      { seed: 'nous', label: t('verbs.pattern.seedNous'), form: seeds.nous },
      { seed: 'infinitive', label: t('verbs.pattern.seedInfinitive'), form: seeds.infinitive },
      {
        seed: 'participle',
        label: t('verbs.pattern.seedParticiple'),
        form: seeds.participle,
        hint: seeds.auxiliary
          ? t(seeds.auxiliary === 'être' ? 'verbs.pattern.auxEtre' : 'verbs.pattern.auxAvoir')
          : undefined,
      },
    ] as { seed: PatternNode['seed']; label: string; form: string | null; hint?: string }[]
  ).filter((col) => col.form && seedOf(col.seed).length > 0);
  if (!columns.length) return null;
  const current = picked ?? columns[0].seed;

  return (
    <section className={CARD} dir={dirFor(locale)}>
      <div className="px-4 pt-5 sm:px-6">
        <h2 className={CARD_TITLE}>{t('verbs.pattern.title')}</h2>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted-foreground">
          {t('verbs.pattern.intro')}
        </p>
      </div>

      {/* On a phone the three seeds were three stacked trees, several screens
          long; here they are tabs, one tree at a time. */}
      {columns.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:px-6 md:hidden [&::-webkit-scrollbar]:hidden">
          {columns.map((col) => (
            <button
              key={col.seed}
              type="button"
              onClick={() => setPicked(col.seed)}
              aria-pressed={col.seed === current}
              className={`${PILL_BASE} ${col.seed === current ? PILL_ACTIVE : PILL_IDLE}`}
            >
              <Ticks text={col.label} />
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 grid border-t border-border md:grid-cols-3">
        {columns.map((col) => (
          <div
            key={col.seed}
            className={`px-4 py-4 sm:px-6 md:border-s md:border-border md:first:border-s-0 ${
              col.seed === current ? '' : 'max-md:hidden'
            }`}
          >
            {/* The seed: the piece that cannot be derived, so it is the piece
                to learn — named, spelled, and speakable. */}
            <div className="flex items-center gap-1.5 text-[0.75rem] font-semibold uppercase tracking-wide text-primary rtl:tracking-normal">
              <Pin className="h-3.5 w-3.5" />
              <Ticks text={col.label} />
            </div>
            <div className="mt-1 flex w-fit items-center gap-1.5" dir="ltr">
              <span className="text-[1.0625rem] font-extrabold text-foreground">{col.form}</span>
              <FormSpeaker
                active={player.activeKey === `seed:${col.seed}`}
                loading={player.activeKey === `seed:${col.seed}` && player.isLoading}
                onPlay={() => player.playOne(`seed:${col.seed}`, col.form!)}
                label={col.form!}
                size="md"
              />
            </div>
            {col.hint && (
              <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
                <Ticks text={col.hint} />
              </p>
            )}

            {/* The branches, hanging off it. The rail is logical, so the tree
                grows from the right in Persian and Arabic. */}
            <div className="ms-1.5 mt-3 space-y-4 border-s-2 border-border ps-4">
              {seedOf(col.seed).map((n) => (
                <Branch key={n.key} node={n} locale={locale} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** One tense: the rule that makes it, and whether this verb obeys it. */
function Branch({ node, locale }: { node: PatternNode; locale: string }) {
  const { t, i18n } = useCsLocale();
  const [open, setOpen] = useState(false);

  const tenseKey = `verbs.tenses.${node.mood}|${node.tense}`;
  const tenseLabel = i18n.exists(`cheatsheet:${tenseKey}`) ? t(tenseKey) : node.tense;
  const noteKey = node.noteKey ? `verbs.pattern.notes.${node.noteKey}` : '';
  const note = noteKey && i18n.exists(`cheatsheet:${noteKey}`) ? t(noteKey) : '';
  const broken = node.rows.filter((r) => !r.ok);
  // A person quoted whole rather than built (the subjunctive's `nous`/`vous`,
  // an auxiliary) carries no ending — it must not print as a bare dash.
  const endings = node.endings.filter(Boolean);

  return (
    // No box of its own: it sits inside the card, on the rail.
    <div className="relative">
      <span className="absolute top-2.5 h-0.5 w-3 bg-muted start-[-1rem]" />

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[14px] font-bold text-foreground">{tenseLabel}</span>
        <span className="text-[12px] text-caption" dir="ltr">
          {node.tense}
        </span>
        <span className="ms-auto">
          {node.memorise ? (
            <Verdict tone="neutral" text={t('verbs.pattern.memorise')} />
          ) : broken.length ? (
            <Verdict
              tone="warning"
              text={t('verbs.pattern.exceptions', { count: formatCount(broken.length, locale) })}
            />
          ) : node.realStem ? (
            <Verdict tone="neutral" text={t('verbs.pattern.stemChanges')} />
          ) : (
            <Verdict tone="success" text={t('verbs.pattern.follows')} />
          )}
        </span>
      </div>

      {note && (
        <p className="mt-0.5 text-[13px] text-primary">
          <Ticks text={note} />
        </p>
      )}

      {/* The rule itself: stem + endings. This is the line worth memorising. */}
      {!node.memorise && (
        <p
          className="mt-1.5 flex w-fit flex-wrap items-center gap-x-1.5 gap-y-1 text-[14px]"
          dir="ltr"
        >
          <span className="rounded-[7px] bg-primary/10 px-1.5 py-0.5 font-bold text-primary">
            {node.stem}
            {endings.length ? '-' : ''}
          </span>
          {endings.length > 0 && <span className="text-caption">+</span>}
          <span className="font-mono text-[13px] text-primary">
            {endings.map((e) => `-${e}`).join(' ')}
          </span>
        </p>
      )}

      {/* An exception is never hidden behind a toggle — it is the one thing on
          this card a learner will get wrong. */}
      {broken.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {broken.map((r, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-1.5 text-[13px]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
              <span className="font-semibold text-foreground" dir="ltr">
                {r.pr} {r.actual}
              </span>
              <span className="text-caption" dir="auto">
                {t('verbs.pattern.ruleWas', { form: `${r.stem}${r.ending}` })}
              </span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1.5 inline-flex items-center text-[13px] font-semibold text-primary transition-colors hover:text-accent"
      >
        {open ? t('verbs.pattern.hideForms') : t('verbs.pattern.showForms')}
      </button>

      {open && (
        <ul className="mt-1.5 w-fit space-y-0.5" dir="ltr">
          {node.rows.map((r, i) => (
            <li key={i} className="flex items-baseline gap-1.5 text-[14px]">
              <span className="w-10 shrink-0 text-[12px] text-caption">{r.pr}</span>
              {r.ok && r.ending ? (
                <span>
                  <span className="font-semibold text-foreground">{r.stem}</span>
                  <span className="font-bold text-primary">{r.ending}</span>
                </span>
              ) : (
                <span className={r.ok ? 'text-foreground' : 'font-semibold text-warning'}>
                  {r.actual}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Verdict({ tone, text }: { tone: 'success' | 'warning' | 'neutral'; text: string }) {
  const styles = {
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    neutral: 'bg-primary/10 text-primary',
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${styles}`}
    >
      {tone === 'success' && <Check className="h-3 w-3" />}
      {text}
    </span>
  );
}
