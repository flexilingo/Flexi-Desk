import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Mic, Shuffle, Sparkles, Target } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FocusChips } from './FocusChips';
import { StudyModePicker } from './StudyModePicker';
import { useStudyMode } from '../lib/viewPrefs';
import type { DeckStatus, StudyScope } from '../types';
import { defaultScope, scopeAvailability, SCOPES } from '../lib/scopes';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = study across all decks ("today's mix"). */
  deck: DeckStatus | null;
  onStart: (args: { deckId?: string; scope: StudyScope; force: boolean }) => void;
  starting: boolean;
  errorText: string | null;
  /** Opens Settings → Activities from the Custom focus chip. */
  onCustomize?: () => void;
  /** The guided tour is driving this sheet: no overlay, no focus trap, and clicks outside do not close it. */
  tourLocked?: boolean;
}

const SCOPE_ICON: Record<StudyScope, React.ElementType> = {
  due: CalendarClock,
  new: Sparkles,
  weak: Target,
  random: Shuffle,
  leech: Target,
};

export function StudyScopeSheet({
  open,
  onOpenChange,
  deck,
  onStart,
  starting,
  errorText,
  onCustomize,
  tourLocked = false,
}: Props) {
  const { t } = useTranslation('study');
  // The same pick as on the landing card: a deck's Start opens the session in whatever mode is set.
  const [mode, setMode] = useStudyMode();
  const shadowing = mode === 'shadowing';

  const [scope, setScope] = useState<StudyScope>(() => defaultScope(deck));
  const [force, setForce] = useState(false);
  const meta = useMemo(() => scopeAvailability(deck, force), [deck, force]);

  // Reopened, or a different deck chosen: start from the smart default, with the box clear.
  const key = open ? `open:${deck?.deck_id ?? 'mix'}` : 'closed';
  const prevKey = useRef(key);
  useEffect(() => {
    if (key === prevKey.current) return;
    prevKey.current = key;
    if (open) {
      setScope(defaultScope(deck));
      setForce(false);
    }
  }, [key, open, deck]);

  // With nothing due, ticking the box moves the selection onto "Due" — the only scope it changes. Before, "Due"
  // stayed greyed out and the checkbox looked like it did nothing.
  const handleForceChange = (next: boolean) => {
    setForce(next);
    if (!deck || deck.due_count !== 0) return;
    const seen = Math.max(0, deck.total_cards - deck.untouched_count);
    if (next && seen > 0) setScope('due');
    else if (!next && scope === 'due')
      setScope(
        SCOPES.find((s) => s !== 'due' && scopeAvailability(deck, false)[s].available) ?? 'due',
      );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={!tourLocked}>
      <DialogContent
        className="sm:max-w-lg"
        data-testid="scope-sheet"
        onInteractOutside={tourLocked ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={tourLocked ? (e) => e.preventDefault() : undefined}
        onOpenAutoFocus={tourLocked ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle>
            {deck ? t('scope.title', { deck: deck.deck_title }) : t('scope.titleAll')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <StudyModePicker mode={mode} onChange={setMode} disabled={starting} />

          {/* Scope */}
          <div className="space-y-2" data-tour="scope-options">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('scope.pickScope')}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {SCOPES.map((key) => {
                const Icon = SCOPE_ICON[key];
                const { count, available } = meta[key];
                const selected = scope === key;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={starting || !available}
                    aria-pressed={selected}
                    onClick={() => setScope(key)}
                    className={cn(
                      'flex flex-col gap-1 rounded-lg border p-3 text-start transition-colors',
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50',
                      !available && 'cursor-not-allowed opacity-40',
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-1.5">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Icon
                          className={cn(
                            'h-4 w-4 shrink-0',
                            selected ? 'text-primary' : 'text-muted-foreground',
                          )}
                        />
                        {t(`scope.${key}`)}
                      </span>
                      {count != null && (
                        <span className="text-[11px] font-bold tabular-nums text-caption">
                          {count}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">{t(`scope.${key}Desc`)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Focus weighs the exercise mix, which only normal study has. */}
          {!shadowing && (
            <div className="space-y-2" data-tour="scope-focus">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('scope.focus')}
              </div>
              <FocusChips disabled={starting} onCustomize={onCustomize} />
            </div>
          )}

          {/* Force / cram: review even if nothing is due yet. */}
          <label
            data-tour="scope-force"
            className={cn(
              'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3.5 py-2.5 transition-colors',
              starting ? 'cursor-not-allowed opacity-60' : 'hover:border-accent/50',
              force ? 'border-accent/60 bg-accent/5' : 'border-border bg-background',
            )}
          >
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => handleForceChange(e.target.checked)}
              disabled={starting}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-foreground">
                {t('scope.force')}
              </span>
              <span className="block text-[11px] leading-snug text-caption">
                {t('scope.forceHint')}
              </span>
            </span>
          </label>

          {errorText && <div className="text-sm text-error">{errorText}</div>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('scope.cancel')}
          </Button>
          <Button
            type="button"
            variant="accent"
            data-tour="scope-start"
            onClick={() => onStart({ deckId: deck?.deck_id, scope, force })}
            loading={starting}
            disabled={!meta[scope].available}
          >
            {shadowing ? <Mic className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {starting
              ? t('landing.preparing')
              : shadowing
                ? t('landing.startShadowing')
                : t('scope.start')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
