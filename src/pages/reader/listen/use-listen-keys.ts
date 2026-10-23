import { useEffect, useRef } from 'react';

export type ListenKey = 'playPause' | 'prev' | 'next' | 'repeat';

/** The part of a key event the choice needs. */
export interface KeyLike {
  key: string;
  repeat?: boolean;
  defaultPrevented?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target: EventTarget | null;
}

/**
 * Which player key this is, or null when the key belongs to something else: typing (an input,
 * a text area, an editable box), a dialog (a word's dialog has its own keys), a browser combo,
 * or a key someone already handled.
 */
export function listenKeyOf(event: KeyLike): ListenKey | null {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return null;
  const target = event.target as HTMLElement | null;
  if (
    target &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT', 'VIDEO', 'AUDIO'].includes(target.tagName) ||
      target.closest?.('[role="dialog"]'))
  ) {
    return null;
  }
  switch (event.key) {
    case ' ':
      return 'playPause';
    case 'ArrowLeft':
      return 'prev';
    case 'ArrowRight':
      return 'next';
    case 'r':
    case 'R':
      return 'repeat';
    default:
      return null;
  }
}

/**
 * The player's keys while a book is being read aloud: Space plays and pauses, ← → step a
 * sentence, R repeats the sentence. Off while nothing is loaded. `only` takes just some of them
 * (the listen strip: Space starts the page, the arrows still scroll it).
 */
export function useListenKeys(
  enabled: boolean,
  act: Partial<Record<ListenKey, () => void>>,
  only?: ListenKey[],
) {
  const latest = useRef(act);
  latest.current = act;
  const taken = only?.join(',') ?? '';

  useEffect(() => {
    if (!enabled) return;
    let spaceTaken = false;
    const onKeyDown = (event: KeyboardEvent) => {
      const key = listenKeyOf(event);
      if (!key || (taken && !taken.split(',').includes(key)) || !latest.current[key]) return;
      event.preventDefault();
      // Holding a key down repeats only the steps; Space would flicker between play and pause.
      if (event.repeat && key !== 'prev' && key !== 'next') return;
      if (key === 'playPause') spaceTaken = true;
      latest.current[key]?.();
    };
    // A focused button clicks itself on Space's keyup: right after pressing play with the mouse,
    // that would pause and resume in one keystroke.
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== ' ' || !spaceTaken) return;
      spaceTaken = false;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [enabled, taken]);
}
