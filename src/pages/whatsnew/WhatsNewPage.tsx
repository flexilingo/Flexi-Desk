import { useEffect, useMemo, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { CheckCircle2, ChevronDown, ExternalLink, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Spinner, useAccountT } from '@/pages/account/components/AccountBits';
import { renderInline } from '@/lib/account/markdown';
import {
  REGISTRY,
  byDate,
  filterByCategory,
  isNew,
  loadCopy,
  loadLabels,
  webUrl,
  type Block,
  type FeatureCopy,
  type Labels,
} from '@/features/whatsNew/catalogue';
import { cn } from '@/lib/utils';

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground" dir="auto">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return (
              <p key={i} className="font-bold text-foreground">
                {b.text}
              </p>
            );
          case 'paragraph':
            return <p key={i}>{renderInline(b.text)}</p>;
          case 'list':
            return (
              <ul key={i} className="flex flex-col gap-1.5">
                {b.items.map((it, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                    <span>{renderInline(it)}</span>
                  </li>
                ))}
              </ul>
            );
          case 'steps':
            return (
              <ol key={i} className="flex flex-col gap-2">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {j + 1}
                    </span>
                    <span>
                      <span className="block font-semibold text-foreground">{it.title}</span>
                      {it.text}
                    </span>
                  </li>
                ))}
              </ol>
            );
          case 'note':
            return (
              <div key={i} className="rounded-lg border border-border bg-muted px-3 py-2">
                {b.title && <p className="font-semibold text-foreground">{b.title}</p>}
                <p>{b.text}</p>
              </div>
            );
          case 'where':
            return (
              <p
                key={i}
                className="rounded-md bg-muted px-3 py-1.5 font-mono text-xs text-foreground"
              >
                {b.text}
              </p>
            );
        }
      })}
    </div>
  );
}

/** The website's feature catalogue, in the app: what exists and what is new. */
export function WhatsNewPage() {
  const { t, i18n } = useAccountT();
  const [copy, setCopy] = useState<Record<string, FeatureCopy> | null>(null);
  const [labels, setLabels] = useState<Labels | null>(null);
  const [category, setCategory] = useState('all');
  const [open, setOpen] = useState<string | null>(null);
  const lang = i18n.language;

  useEffect(() => {
    let live = true;
    void Promise.all([loadCopy(lang), loadLabels(lang)]).then(([c, l]) => {
      if (live) {
        setCopy(c);
        setLabels(l);
      }
    });
    return () => {
      live = false;
    };
  }, [lang]);

  const cats = useMemo(() => ['all', ...new Set(REGISTRY.map((f) => f.category))], []);
  const list = useMemo(() => byDate(filterByCategory(REGISTRY, category)), [category]);

  if (!copy || !labels) return <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={Sparkles}
        title={t('desk.whatsNew.title')}
        subtitle={t('desk.whatsNew.subtitle')}
      />
      <div className="flex flex-wrap gap-1.5">
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            aria-pressed={category === c}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors',
              category === c
                ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/30'
                : 'border border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {c === 'all' ? t('desk.whatsNew.all') : (labels.categories[c] ?? c)}
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-3">
        {list.map((f) => {
          const c = copy[f.slug];
          if (!c) return null;
          const expanded = open === f.slug;
          const url = webUrl(f.href, lang);
          return (
            <li key={f.slug}>
              <Card className="overflow-hidden">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : f.slug)}
                  className="flex w-full items-start gap-3 px-5 py-4 text-start hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-bold text-foreground">{c.title}</h3>
                      {isNew(f.addedAt) && (
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase text-accent">
                          {labels.features.newBadge}
                        </span>
                      )}
                      {f.featured && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                          {labels.features.featuredBadge}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted-foreground" dir="auto">
                      {c.tagline}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {labels.categories[f.category] ?? f.category}
                      </span>
                      {f.platforms.map((p) => (
                        <span
                          key={p}
                          className="rounded-md border border-border px-2 py-0.5 text-[11px] text-caption"
                        >
                          {labels.platforms[p] ?? p}
                        </span>
                      ))}
                      <span className="text-[11px] text-caption">
                        {new Date(f.addedAt).toLocaleDateString(lang, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                  <ChevronDown
                    className={cn(
                      'mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      expanded && 'rotate-180',
                    )}
                  />
                </button>
                {expanded && (
                  <div className="flex flex-col gap-4 border-t border-border px-5 py-4">
                    {c.subtitle && (
                      <p className="text-sm text-foreground" dir="auto">
                        {c.subtitle}
                      </p>
                    )}
                    <Blocks blocks={c.blocks} />
                    {c.specs.length > 0 && (
                      <dl className="grid gap-2 sm:grid-cols-2">
                        {c.specs.map((s) => (
                          <div key={s.label} className="rounded-lg border border-border px-3 py-2">
                            <dt className="text-[11px] font-semibold uppercase tracking-wider text-caption">
                              {s.label}
                            </dt>
                            <dd className="text-sm text-foreground">{s.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {c.faq.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm font-bold text-foreground">{labels.detail.faq}</p>
                        {c.faq.map((q) => (
                          <details key={q.q} className="rounded-lg border border-border px-3 py-2">
                            <summary className="cursor-pointer text-[13px] font-semibold text-foreground">
                              {q.q}
                            </summary>
                            <p className="mt-1.5 text-[13px] text-muted-foreground">{q.a}</p>
                          </details>
                        ))}
                      </div>
                    )}
                    {url && (
                      <div>
                        <Button variant="outline" onClick={() => void openUrl(url)}>
                          <ExternalLink />
                          {t('desk.whatsNew.openOnWeb')}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
