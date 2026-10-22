/**
 * The cheatsheet's one surface: a card on the page ground, its heading set like
 * the topic page's `##` parts. Shared so the index, the verb pages and the
 * related list cannot drift from the topic page they sit beside. Semantic tokens
 * only, so light and dark both follow the app's theme.
 */
export const CARD = 'overflow-hidden rounded-[9px] border border-border bg-card';

export const CARD_TITLE =
  'text-[1.125rem] font-bold leading-snug tracking-[-0.01em] text-foreground rtl:tracking-normal';

/** The level marker, as on the topic page's header. */
export const LEVEL_PILL =
  'shrink-0 rounded-full border border-border bg-card px-2 py-0.5 text-[0.6875rem] font-semibold leading-none text-primary';

export const CHIP_BASE =
  'inline-flex items-center gap-1.5 px-[11px] py-[5px] rounded-lg text-xs font-semibold border-[1.5px] transition-all cursor-pointer';
export const CHIP_ACTIVE = 'bg-accent/10 border-accent/30 text-accent';
export const CHIP_IDLE =
  'bg-card border-border text-muted-foreground hover:border-accent/30 hover:text-accent';

/** A pill that picks one of several (tenses, tabs): the chosen one is state, so primary. */
export const PILL_BASE =
  'inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors';
export const PILL_ACTIVE = 'border-primary bg-primary text-primary-foreground';
export const PILL_IDLE =
  'border-border bg-card text-muted-foreground hover:border-accent/40 hover:text-primary';

/** Eyebrow link back one level (terra on the website). */
export const BACK_LINK =
  'inline-flex items-center gap-1 text-sm font-bold tracking-wide text-accent transition-colors hover:text-accent/80';
