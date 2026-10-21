import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Sparkles, Target } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { FocusChips } from './FocusChips';
import type { DeckStatus, StudyScope } from '../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = study across all decks. */
  deck: DeckStatus | null;
  onStart: (args: { deckId?: string; scope: StudyScope; force: boolean }) => void;
  starting: boolean;
  errorText: string | null;
  /** Opens Settings → Activities from the Custom focus chip. */
  onCustomize?: () => void;
}

const SCOPE_ICON: Record<StudyScope, React.ElementType> = {
  due: CalendarClock,
  new: Sparkles,
  weak: Target,
};

export function StudyScopeSheet({
  open,
  onOpenChange,
  deck,
  onStart,
  starting,
  errorText,
  onCustomize,
}: Props) {
  const { t } = useTranslation('study');

  const [scope, setScope] = useState<StudyScope>('due');
  const [force, setForce] = useState(false);

  // Which scopes have cards, based on the picked deck's status (all-decks = always on).
  const availability = useMemo(() => {
    if (!deck) return { due: true, new: true, weak: true };
    return {
      due: deck.due_count > 0 || deck.untouched_count > 0,
      new: deck.untouched_count > 0,
      weak: deck.total_cards - deck.untouched_count > 0,
    };
  }, [deck]);

  const SCOPES: { key: StudyScope; label: string; desc: string }[] = [
    { key: 'due', label: t('scope.due'), desc: t('scope.dueDesc') },
    { key: 'new', label: t('scope.new'), desc: t('scope.newDesc') },
    { key: 'weak', label: t('scope.weak'), desc: t('scope.weakDesc') },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {deck ? t('scope.title', { deck: deck.deck_title }) : t('scope.titleAll')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Scope */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('scope.pickScope')}
            </div>
            <div className="grid gap-2">
              {SCOPES.map((s) => {
                const Icon = SCOPE_ICON[s.key];
                const enabled = availability[s.key];
                const selected = scope === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    disabled={!enabled}
                    onClick={() => setScope(s.key)}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-3 text-start transition-colors',
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50',
                      !enabled && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4 mt-0.5 shrink-0',
                        selected ? 'text-primary' : 'text-muted-foreground',
                      )}
                    />
                    <div>
                      <div className="text-sm font-medium text-foreground">{s.label}</div>
                      <div className="text-xs text-muted-foreground">{s.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Focus */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('scope.focus')}
            </div>
            <FocusChips disabled={starting} onCustomize={onCustomize} />
          </div>

          {/* Force / cram */}
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={force} onChange={(e) => setForce(e.target.checked)} />
            <span className="text-sm text-foreground">{t('scope.force')}</span>
          </label>

          {errorText && <div className="text-sm text-error">{errorText}</div>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('scope.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => onStart({ deckId: deck?.deck_id, scope, force })}
            disabled={starting}
          >
            {t('scope.start')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
