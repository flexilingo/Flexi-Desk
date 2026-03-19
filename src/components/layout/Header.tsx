import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useAppStore } from '@/stores/appStore';
import { SyncStatusIndicator } from '@/components/layout/SyncStatusIndicator';
import { cn } from '@/lib/utils';

const themeOptions = [
  { value: 'light' as const, icon: Sun, label: 'Light' },
  { value: 'dark' as const, icon: Moon, label: 'Dark' },
  { value: 'system' as const, icon: Monitor, label: 'System' },
];

export function Header() {
  const currentPage = useAppStore((s) => s.currentPage);
  const { theme, setTheme } = useTheme();

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <h1 className="text-lg font-semibold text-foreground">{currentPage}</h1>

      <div className="flex items-center gap-3">
        <SyncStatusIndicator />
        {/* Theme toggle */}
        <div className="flex items-center rounded-lg border border-border bg-muted p-0.5">
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            const isActive = theme === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={cn(
                  'rounded-md p-1.5 transition-colors',
                  isActive
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                title={opt.label}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
