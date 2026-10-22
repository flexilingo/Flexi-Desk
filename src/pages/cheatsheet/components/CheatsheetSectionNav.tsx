import { useEffect, useRef, useState } from 'react';

type Part = { id: string; title: string };

/**
 * A sticky row of the page's own parts — "The table", "Exceptions", "Common
 * mistakes" — so a long topic on a phone is a set of places to jump to, not a
 * scroll with no visible end.
 *
 * The parts are read from the rendered page (the `<section>`s rehypeReference
 * builds) rather than passed in, so the bar can never list a heading the body
 * does not have. It renders nothing until they are found: it is navigation on
 * top of a page that already reads fine without it.
 */
export default function CheatsheetSectionNav({ dir }: { dir: 'ltr' | 'rtl' }) {
  const [parts, setParts] = useState<Part[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  /** Which ends of the bar have chips scrolled out of view, to fade them. */
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>('section[data-section]')];
    setParts(sections.map((s) => ({ id: s.id, title: s.dataset.section ?? '' })));
    if (!sections.length) return;

    const pick = () => {
      // The part whose top has passed the band under the sticky bars is the
      // one being read; the last such part wins.
      const line = 120;
      let current = sections[0].id;
      for (const s of sections) if (s.getBoundingClientRect().top - line <= 0) current = s.id;
      setActive(current);
    };
    pick();
    window.addEventListener('scroll', pick, { passive: true, capture: true });

    return () => {
      window.removeEventListener('scroll', pick, true);
    };
  }, []);

  // Keep the active chip in view inside the bar, without moving the page.
  useEffect(() => {
    const bar = barRef.current;
    const chip = bar?.querySelector<HTMLElement>('[data-active]');
    if (!bar || !chip) return;
    const left = chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2;
    bar.scrollTo({ left, behavior: 'smooth' });
  }, [active]);

  /**
   * A finger swipes the bar natively; a mouse cannot, because the scrollbar is
   * hidden. So a mouse drags it, and a vertical wheel over it moves it
   * sideways while there is room. A drag that moved is not also a click on
   * the chip it started on.
   */
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const measure = () => {
      const max = bar.scrollWidth - bar.clientWidth;
      // `scrollLeft` runs negative in a right-to-left bar.
      const at = Math.abs(bar.scrollLeft);
      setEdges({ start: at > 2, end: at < max - 2 });
    };
    let startX = 0;
    let startLeft = 0;
    let dragging = false;
    let moved = false;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startLeft = bar.scrollLeft;
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      if (moved) bar.scrollLeft = startLeft - dx;
    };
    const up = () => {
      dragging = false;
    };
    const click = (e: MouseEvent) => {
      if (!moved) return;
      e.preventDefault();
      e.stopPropagation();
      moved = false;
    };
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = bar.scrollWidth - bar.clientWidth;
      const at = Math.abs(bar.scrollLeft);
      // At either end the wheel goes back to scrolling the page.
      if ((e.deltaY > 0 && at >= max - 1) || (e.deltaY < 0 && at <= 1)) return;
      e.preventDefault();
      bar.scrollLeft += getComputedStyle(bar).direction === 'rtl' ? -e.deltaY : e.deltaY;
    };
    measure();
    bar.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    bar.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    bar.addEventListener('click', click, true);
    bar.addEventListener('wheel', wheel, { passive: false });
    return () => {
      bar.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      bar.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      bar.removeEventListener('click', click, true);
      bar.removeEventListener('wheel', wheel);
    };
  }, [parts.length]);

  if (parts.length < 2) return null;

  return (
    <nav
      dir={dir}
      className={`sticky z-20 -mx-4 mb-3 bg-background/95 px-4 py-2.5 backdrop-blur transition-[top] duration-300 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 xl:hidden top-0`}
    >
      <div className="relative">
        <div
          ref={barRef}
          className="flex cursor-grab select-none gap-2 overflow-x-auto [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
        >
          {parts.map((p) => (
            <a
              key={p.id}
              href={`#${p.id}`}
              draggable={false}
              onClick={(e) => {
                e.preventDefault();
                const target = document.getElementById(p.id);
                target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                history.replaceState(null, '', `#${p.id}`);
              }}
              data-active={p.id === active || undefined}
              className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors ${
                p.id === active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-accent/40 hover:text-accent'
              }`}
            >
              {p.title}
            </a>
          ))}
        </div>
        {/* Fades over the ends that have more chips beyond them. */}
        {edges.start && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 start-0 w-8 bg-gradient-to-r from-background rtl:bg-gradient-to-l"
          />
        )}
        {edges.end && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 end-0 w-8 bg-gradient-to-l from-background rtl:bg-gradient-to-r"
          />
        )}
      </div>
    </nav>
  );
}
