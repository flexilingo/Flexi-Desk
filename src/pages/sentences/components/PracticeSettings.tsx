import { useTranslation } from 'react-i18next';
import { Loader2, SlidersHorizontal, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { PanelSection } from '../lib/types';

/**
 * Every setting the practice loop has, behind one button — drawn from data.
 *
 * Which rows exist, their titles, options, order and when each shows are resolved by
 * the backend (`meta.sections`); this component knows no row by name. A new path, a
 * renamed row or a reordered option is a content import, never an app release. A
 * pick applies at once and the dialog stays open, so rows that depend on it appear
 * or go in front of the learner.
 *
 * The pill groups follow one law: every option is neutral and the SELECTION is the
 * accent, so a group of six spends one colour, not six.
 */
const CHOICE =
  'inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40';
const ON = 'bg-primary text-primary-foreground';
const OFF = 'bg-muted text-muted-foreground hover:bg-border hover:text-foreground';

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold uppercase tracking-widest text-caption">{label}</span>
        {value && <span className="truncate text-sm font-bold text-primary">{value}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function PracticeSettings({
  sections,
  ui,
  autoPlay,
  loading,
  trailing,
  onPick,
  onNavigate,
  onAutoPlay,
}: {
  sections: PanelSection[];
  /** Served strings for the panel's own chrome; bundled messages are the fallback. */
  ui: Record<string, string>;
  autoPlay: boolean;
  loading: boolean;
  /** Sits at the far end of the bar — the progress readout. */
  trailing?: React.ReactNode;
  onPick: (section: PanelSection, value: string) => void;
  /** A `navigate` row is the page itself (the language), not a filter. */
  onNavigate: (section: PanelSection, value: string) => void;
  onAutoPlay: (on: boolean) => void;
}) {
  const { t, i18n } = useTranslation('sentences');
  const text = (key: string, fallback: string) =>
    ui[key] || (i18n.exists(`sentences:${fallback}`) ? t(fallback) : key);

  // What is set, and nothing else: a row left on «all» has nothing to report.
  const badges = sections.flatMap((s) => {
    if (s.kind === 'switch') return s.value === '1' ? [s.short ?? s.title] : [];
    if (s.value === '') return [];
    const o = s.options.find((x) => x.value === s.value);
    if (!o) return [];
    return [o.hint ? `${o.label}. ${o.hint}` : o.label];
  });
  if (autoPlay) badges.push(text('autoPlayShort', 'settings.autoPlayShort'));

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2.5"
      data-testid="settings-bar"
    >
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" data-testid="settings-open">
            <SlidersHorizontal className="h-4 w-4" />
            {text('settings', 'settings.title')}
          </Button>
        </DialogTrigger>
        <DialogContent
          className="max-h-[88vh] gap-5 overflow-y-auto sm:max-w-xl"
          data-testid="settings-dialog"
        >
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle className="text-lg font-bold text-foreground">
                {text('settings', 'settings.title')}
              </DialogTitle>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            </div>
            <DialogDescription className="sr-only">
              {text('settings', 'settings.title')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {sections.map((s, index) => {
              if (s.kind === 'switch') {
                return (
                  <label
                    key={`${s.key}-${index}`}
                    className="flex cursor-pointer items-start justify-between gap-3 border-t border-border pt-4"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-bold uppercase tracking-widest text-caption">
                        {s.title}
                      </span>
                      {s.hint && (
                        <span className="mt-1 block text-sm leading-6 text-caption">{s.hint}</span>
                      )}
                    </span>
                    <Switch
                      checked={s.value === '1'}
                      disabled={loading}
                      onCheckedChange={(v) => onPick(s, v ? '1' : '')}
                    />
                  </label>
                );
              }

              const picked = s.options.find((o) => o.value === s.value);
              return (
                <Row key={`${s.key}-${index}`} label={s.title} value={picked?.hint}>
                  {s.options.map((o) => {
                    const on = o.value === s.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        title={o.hint}
                        data-testid={`pick-${s.key}-${o.value || 'all'}`}
                        aria-pressed={on}
                        disabled={loading || o.disabled}
                        onClick={() =>
                          !on &&
                          (s.kind === 'navigate' ? onNavigate(s, o.value) : onPick(s, o.value))
                        }
                        className={cn(CHOICE, on ? ON : OFF)}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </Row>
              );
            })}

            {/* A preference of this computer, not a filter of the round. */}
            <label className="flex cursor-pointer items-start justify-between gap-3 border-t border-border pt-4">
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-widest text-caption">
                  <Volume2 className="h-3 w-3" />
                  {text('autoPlay', 'settings.autoPlay')}
                </span>
                <span className="mt-1 block text-sm leading-6 text-caption">
                  {text('autoPlayHint', 'settings.autoPlayHint')}
                </span>
              </span>
              <Switch
                checked={autoPlay}
                onCheckedChange={onAutoPlay}
                data-testid="autoplay-switch"
              />
            </label>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {badges.map((b, i) => (
          <span key={i} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm text-primary">
            {b}
          </span>
        ))}
      </div>

      {trailing && <div className="ms-auto shrink-0">{trailing}</div>}
    </div>
  );
}
