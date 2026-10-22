/**
 * The picture the floating video shows where the browser can only float a
 * <video> (Safari, Android): the episode on top, the line being spoken large
 * in the middle, the next one under it, and how far along the episode is.
 */

export interface PipFrame {
  title: string;
  subtitle: string | null;
  /** The line being spoken; null between lines, before the first, with subtitles off. */
  line: string | null;
  nextLine: string | null;
  /** Said instead when there is no line. */
  idle: string;
  /** 0–1 */
  progress: number;
}

export interface PipPalette {
  ground: string;
  ink: string;
  subtext: string;
  caption: string;
  accent: string;
  track: string;
  font: string;
}

/**
 * The theme colours as the page's own CSS has them: a canvas cannot take a Tailwind class, and the
 * values must not be copied into code, so a hidden probe element resolves the semantic tokens.
 */
export function readPipPalette(): PipPalette {
  const probe = document.createElement('div');
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const read = (className: string, prop: 'color' | 'backgroundColor') => {
    probe.className = className;
    return getComputedStyle(probe)[prop];
  };
  const palette: PipPalette = {
    ground: read('bg-background', 'backgroundColor'),
    ink: read('text-foreground', 'color'),
    subtext: read('text-muted-foreground', 'color'),
    caption: read('text-muted-foreground', 'color'),
    accent: read('bg-primary', 'backgroundColor'),
    track: read('bg-muted', 'backgroundColor'),
    font: getComputedStyle(document.body).fontFamily || 'sans-serif',
  };
  probe.remove();
  return palette;
}

const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

/** Breaks text into lines no wider than `width`; a word wider than that (Chinese has no spaces) breaks by character. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  const push = (piece: string, sep: string) => {
    const candidate = current ? current + sep + piece : piece;
    if (ctx.measureText(candidate).width <= width) {
      current = candidate;
      return;
    }
    if (current) lines.push(current);
    current = piece;
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (ctx.measureText(word).width <= width) {
      push(word, ' ');
      continue;
    }
    for (const char of Array.from(word)) push(char, '');
  }
  if (current) lines.push(current);
  return lines;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  const chars = Array.from(text);
  while (chars.length > 0 && ctx.measureText(chars.join('') + '…').width > width) chars.pop();
  return chars.join('') + '…';
}

/** Exported for the tests: the pure line breaking. */
export { wrap as wrapPipText, ellipsize as ellipsizePipText };

export function drawPipFrame(canvas: HTMLCanvasElement, frame: PipFrame, p: PipPalette) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const pad = 48;
  const width = W - pad * 2;

  ctx.fillStyle = p.ground;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'top';

  // The episode.
  ctx.direction = RTL.test(frame.title) ? 'rtl' : 'ltr';
  ctx.textAlign = 'center';
  ctx.fillStyle = p.subtext;
  ctx.font = `600 28px ${p.font}`;
  ctx.fillText(ellipsize(ctx, frame.title, width), W / 2, 34);
  if (frame.subtitle) {
    ctx.fillStyle = p.caption;
    ctx.font = `400 24px ${p.font}`;
    ctx.fillText(ellipsize(ctx, frame.subtitle, width), W / 2, 72);
  }

  // The line: as large as fits between the header and the progress bar.
  const top = 124;
  const bottom = H - 72;
  const text = frame.line ?? frame.idle;
  const weight = frame.line ? 700 : 500;
  const nextSize = 28;
  const nextRoom = frame.line && frame.nextLine ? nextSize * 1.3 + 18 : 0;
  // A status (no line now) is said quietly; the line itself is the headline.
  let size = frame.line ? 64 : 40;
  let lines: string[] = [];
  for (; size >= 28; size -= 4) {
    ctx.font = `${weight} ${size}px ${p.font}`;
    lines = wrap(ctx, text, width);
    if (lines.length * size * 1.25 + nextRoom <= bottom - top) break;
  }
  size = Math.max(size, 28);
  const lineHeight = size * 1.25;
  const fits = Math.max(1, Math.floor((bottom - top - nextRoom) / lineHeight));
  if (lines.length > fits) {
    lines = lines.slice(0, fits);
    lines[fits - 1] = ellipsize(ctx, lines[fits - 1] + ' …', width);
  }
  const block = lines.length * lineHeight + nextRoom;
  let y = top + (bottom - top - block) / 2;
  ctx.direction = RTL.test(text) ? 'rtl' : 'ltr';
  ctx.fillStyle = frame.line ? p.ink : p.subtext;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += lineHeight;
  }
  if (nextRoom && frame.nextLine) {
    ctx.direction = RTL.test(frame.nextLine) ? 'rtl' : 'ltr';
    ctx.fillStyle = p.caption;
    ctx.font = `500 ${nextSize}px ${p.font}`;
    ctx.fillText(ellipsize(ctx, frame.nextLine, width), W / 2, y + 18);
  }

  // How far along.
  const barY = H - 40;
  ctx.fillStyle = p.track;
  ctx.fillRect(pad, barY, width, 8);
  ctx.fillStyle = p.accent;
  ctx.fillRect(pad, barY, width * Math.min(1, Math.max(0, frame.progress)), 8);
}
