import { cn } from '@/lib/utils';

/** CEFR level token colours: A green, B amber, C red (the app's own cefr tokens). */
const CEFR_CLASSES: Record<string, string> = {
  A1: 'bg-cefr-a1 text-white border-transparent',
  A2: 'bg-cefr-a2 text-white border-transparent',
  B1: 'bg-cefr-b1 text-white border-transparent',
  B2: 'bg-cefr-b2 text-white border-transparent',
  C1: 'bg-cefr-c1 text-white border-transparent',
  C2: 'bg-cefr-c2 text-white border-transparent',
};

export function cefrClassName(level: string): string {
  return CEFR_CLASSES[level.toUpperCase()] ?? 'bg-muted text-muted-foreground border-border';
}

export function CefrChip({ level, small }: { level: string; small?: boolean }) {
  return (
    <span
      className={cn(
        'rounded border font-bold',
        small ? 'px-2 py-1 text-[10px]' : 'rounded-full px-2.5 py-1 text-[11px]',
        cefrClassName(level),
      )}
    >
      {level}
    </span>
  );
}
