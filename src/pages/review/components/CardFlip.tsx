import { CefrBadge } from '@/components/common/CefrBadge';
import type { CardFull } from '../types';

interface Props {
  card: CardFull;
  isFlipped: boolean;
  onFlip: () => void;
}

export function CardFlip({ card, isFlipped, onFlip }: Props) {
  return (
    <div className="perspective-1000 mx-auto w-full max-w-lg">
      <div
        className={`relative min-h-[320px] transition-transform duration-500 ${
          isFlipped ? '[transform:rotateY(180deg)]' : ''
        }`}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center rounded-xl border border-border bg-card p-8 shadow-sm"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="text-3xl font-bold text-foreground">{card.front}</div>
          {card.cefrLevel && (
            <div className="mt-4">
              <CefrBadge level={card.cefrLevel} />
            </div>
          )}
          {card.pos && <div className="mt-2 text-sm text-muted-foreground">{card.pos}</div>}
          {!isFlipped && (
            <button
              onClick={onFlip}
              className="mt-8 rounded-lg bg-primary/10 px-6 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
            >
              Show Answer (Space)
            </button>
          )}
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center rounded-xl border border-border bg-card p-8 shadow-sm [transform:rotateY(180deg)]"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="text-2xl font-bold text-foreground">{card.front}</div>
          <div className="my-3 h-px w-16 bg-border" />

          {card.translation && <div className="text-lg text-foreground">{card.translation}</div>}
          {card.definition && (
            <div className="mt-2 text-center text-sm text-muted-foreground">{card.definition}</div>
          )}
          {card.pos && (
            <div className="mt-2 text-xs font-medium uppercase text-accent">{card.pos}</div>
          )}
          {card.cefrLevel && (
            <div className="mt-2">
              <CefrBadge level={card.cefrLevel} />
            </div>
          )}
          {card.exampleSentence && (
            <div className="mt-4 rounded-lg bg-muted/50 px-4 py-2 text-center text-sm italic text-muted-foreground">
              {card.exampleSentence}
            </div>
          )}
          <div className="mt-3 text-xs text-muted-foreground">
            {card.reviewCount} reviews · interval: {card.intervalDays}d
          </div>
        </div>
      </div>
    </div>
  );
}
