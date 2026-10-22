import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Monitor } from 'lucide-react';
import { findNavItem } from '@/components/layout/sidebarConfig';
import { useTheme } from '@/hooks/useTheme';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';

const themeOptions = [
  { value: 'light' as const, icon: Sun, labelKey: 'nav.themeLight' },
  { value: 'dark' as const, icon: Moon, labelKey: 'nav.themeDark' },
  { value: 'system' as const, icon: Monitor, labelKey: 'nav.themeSystem' },
];

/**
 * The bar above every page: where you are (menu group › page) and the theme.
 * Quiet on purpose — each page carries its own heading, as on the website, so
 * this names the place without repeating the page's big title.
 */
export function Header() {
  const currentPage = useAppStore((s) => s.currentPage);
  const { theme, setTheme } = useTheme();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const hit = findNavItem(pathname);
  const title = hit ? t(hit.item.labelKey) : currentPage;
  const groupLabel = hit && !hit.group.hideLabel ? t(hit.group.labelKey) : null;
  // "Study / Study" says nothing twice: the group shows only when it adds a word.
  const group = groupLabel && groupLabel !== title ? groupLabel : null;

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/90 px-6 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        {group && (
          <>
            <span className="truncate text-muted-foreground">{group}</span>
            <span className="text-caption" aria-hidden="true">
              /
            </span>
          </>
        )}
        <h1 className="truncate font-semibold text-foreground">{title}</h1>
      </div>

      <div
        role="radiogroup"
        aria-label={t('nav.theme')}
        className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-muted/70 p-0.5"
      >
        {themeOptions.map((opt) => {
          const Icon = opt.icon;
          const isActive = theme === opt.value;
          const label = t(opt.labelKey);
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={label}
              title={label}
              onClick={() => setTheme(opt.value)}
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45',
                isActive
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </header>
  );
}
