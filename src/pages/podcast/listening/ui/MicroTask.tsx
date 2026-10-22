/**
 * The between-step micro-task. Max ONE tap.
 *
 * No Next button — a Next button *is* the second tap. Every option is neutral
 * at rest because all answers are equally valid; there is no CTA here. Terra
 * exists only as the 250ms confirmation flash before auto-advance.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface MicroTaskOption {
  id: string;
  label: string;
  value: 1 | 2 | 3;
}

interface MicroTaskProps {
  question: string;
  options: MicroTaskOption[];
  onAnswer: (value: 1 | 2 | 3, id: string) => void;
}

export function MicroTask({ question, options, onAnswer }: MicroTaskProps) {
  const [flash, setFlash] = useState<string | null>(null);
  // Guards against a double-tap landing two answers inside the 250ms flash.
  // Written only from the handler, never during render.
  const lockedRef = useRef(false);

  const pick = useCallback(
    (option: MicroTaskOption) => {
      if (lockedRef.current) return;
      lockedRef.current = true;
      setFlash(option.id);
      window.setTimeout(() => onAnswer(option.value, option.id), 250);
    },
    [onAnswer],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const index = Number(e.key) - 1;
      const option = options[index];
      if (option) {
        e.preventDefault();
        e.stopPropagation();
        pick(option);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [options, pick]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-2.5">
      <p className="text-[13px] font-semibold text-foreground">{question}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {options.map((o, i) => (
          <button
            key={o.id}
            type="button"
            onClick={() => pick(o)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150 ${
              flash === o.id
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground hover:bg-muted'
            }`}
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-md bg-muted text-[10px] font-bold tabular-nums text-muted-foreground">
              {i + 1}
            </span>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
