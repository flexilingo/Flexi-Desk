import { useEffect, useState } from 'react';
import { useCsLocale } from './shared';

type Part = { id: string; title: string };

/**
 * "On this page" — the topic's own parts, in the right-hand column of a wide
 * screen, with the one being read marked. It is the section bar's wide-screen
 * form: a column of links fills the space a centred reading column leaves
 * beside it, where a row of chips above the text only added to the stack.
 *
 * Like the bar, it reads the parts from the rendered `<section>`s, so it can
 * never list a heading the body does not have.
 */
export default function CheatsheetToc({ dir }: { dir: 'ltr' | 'rtl' }) {
  const { t } = useCsLocale();
  const [parts, setParts] = useState<Part[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>('section[data-section]')];
    setParts(sections.map((s) => ({ id: s.id, title: s.dataset.section ?? '' })));
    if (!sections.length) return;
    // The part whose top has passed a line under the site header is the one
    // being read; the last such part wins.
    const pick = () => {
      let current = sections[0].id;
      for (const s of sections) if (s.getBoundingClientRect().top - 120 <= 0) current = s.id;
      setActive(current);
    };
    pick();
    window.addEventListener('scroll', pick, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', pick, true);
  }, []);

  if (parts.length < 2) return null;

  return (
    <nav dir={dir} className="sticky top-4">
      <p className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-caption rtl:text-xs rtl:tracking-normal">
        {t('onThisPage')}
      </p>
      <ul className="border-s border-border">
        {parts.map((p) => (
          <li key={p.id}>
            <a
              href={`#${p.id}`}
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(p.id)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                history.replaceState(null, '', `#${p.id}`);
              }}
              className={`-ms-px block border-s-2 py-1.5 ps-3 text-[0.8125rem] leading-snug transition-colors ${
                p.id === active
                  ? 'border-primary font-medium text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
