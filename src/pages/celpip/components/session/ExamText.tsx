import type { CSSProperties, ElementType, ReactNode } from 'react';
import { useExamFontScale } from './ExamSettingsContext';

interface Props {
  /** Unscaled size in px, i.e. what the text measures at scale 1. */
  base: number;
  lineFactor?: number;
  className?: string;
  /** Defaults to `<p>`; pass `span` for inline runs, `div` for blocks. */
  as?: ElementType;
  dir?: 'ltr' | 'rtl' | 'auto';
  children: ReactNode;
}

/**
 * Content text inside the exam that responds to the user's text-size setting.
 *
 * Use for questions, options, passages, prompts and transcripts — NOT for chrome
 * (timers, badges, section labels), which must stay fixed so a 1.5× scale can't
 * break the layout.
 *
 * The size is applied inline rather than through a Tailwind class. That is
 * deliberate and is the third documented exception in this codebase (alongside the
 * translate chip's pointer coordinates and the add-to-deck progress bar): the
 * value is a continuous product of a user setting, it must beat the variant's own
 * `text-[13px]`, and nested `<LookupText>` tokens inherit the scaled size for free.
 */
export function ExamText({
  base,
  lineFactor = 1.5,
  className,
  as: Tag = 'p',
  dir,
  children,
}: Props) {
  const scale = useExamFontScale();
  const fontSize = Math.round(base * scale * 10) / 10;

  const style: CSSProperties = {
    fontSize: `${fontSize}px`,
    lineHeight: `${Math.round(fontSize * lineFactor)}px`,
  };

  return (
    <Tag className={className} style={style} dir={dir}>
      {children}
    </Tag>
  );
}
