import { isPresetColor, type PresetColor, type TextColor } from './text-box-store';

/**
 * Turning an ink into something to render with.
 *
 * A preset is a PALETTE CLASS, never a hex literal — the design owns what
 * "orange" looks like. A colour the learner picked is their own value and can
 * only be applied inline; it has been checked against `#rrggbb` before it gets
 * here (see `isValidColor`), so nothing arbitrary reaches a style attribute.
 *
 * Literal class names, so the content scanner emits them. On the desk the four
 * presets are the theme's own tokens: terra -> accent, ink -> foreground,
 * olive -> success, danger -> error.
 */
const PRESET_TEXT: Record<PresetColor, string> = {
  terra: 'text-accent',
  ink: 'text-foreground',
  olive: 'text-success',
  danger: 'text-error',
};

const PRESET_BG: Record<PresetColor, string> = {
  terra: 'bg-accent',
  ink: 'bg-foreground',
  olive: 'bg-success',
  danger: 'bg-error',
};

export const inkTextClass = (color: TextColor): string =>
  isPresetColor(color) ? PRESET_TEXT[color] : '';

export const inkTextStyle = (color: TextColor): { color?: string } =>
  isPresetColor(color) ? {} : { color };

export const inkBgClass = (color: TextColor): string =>
  isPresetColor(color) ? PRESET_BG[color] : '';

export const inkBgStyle = (color: TextColor): { backgroundColor?: string } =>
  isPresetColor(color) ? {} : { backgroundColor: color };
