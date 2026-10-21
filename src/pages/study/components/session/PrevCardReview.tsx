import { useTranslation } from 'react-i18next';
import { Check, Volume2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSpeak } from '../../hooks/useSpeak';
import { InsightsPanel } from './InsightsPanel';
import type { CardNotes } from '../../types';

export interface PrevCard {
  front: string;
  back: string;
  isCorrect: boolean | null;
  notes: CardNotes | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: PrevCard | null;
  onLookup: (word: string, sentence: string) => void;
}

/**
 * "What was the last card?" — lets the learner peek back at the card they just
 * answered without leaving the session (front's PrevCardReview pane).
 */
export function PrevCardReview({ open, onOpenChange, card, onLookup }: Props) {
  const { t } = useTranslation('study');
  const { speak } = useSpeak();
  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('runner.prevCard')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl font-semibold text-foreground">{card.front}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => speak(card.front)}
                title={t('runner.listen')}
              >
                <Volume2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-3 border-t border-border pt-3 text-lg text-muted-foreground">
              {card.back}
            </div>

            {card.isCorrect !== null && (
              <div
                className={cn(
                  'mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
                  card.isCorrect
                    ? 'border-success/50 bg-success/10 text-success'
                    : 'border-error/50 bg-error/10 text-error',
                )}
              >
                {card.isCorrect ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {card.isCorrect ? t('runner.correct') : t('runner.incorrect')}
              </div>
            )}
          </div>

          {card.notes && <InsightsPanel notes={card.notes} onLookup={onLookup} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('settings.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
