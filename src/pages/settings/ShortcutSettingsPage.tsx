import { useEffect, useState } from 'react';
import { RotateCcw, Keyboard } from 'lucide-react';
import { useShortcutStore, type KeyboardShortcut } from '@/stores/shortcutStore';
import { ShortcutRecorder } from './components/ShortcutRecorder';

const CATEGORY_LABELS: Record<string, string> = {
  global: 'Global Shortcuts',
  navigation: 'Navigation',
  review: 'Review',
  podcast: 'Podcast / Audio',
  general: 'General',
};

export function ShortcutSettingsPage() {
  const { shortcuts, isLoading, fetchShortcuts, updateBinding, resetShortcut, resetAll, toggleShortcut } =
    useShortcutStore();
  const [conflict, setConflict] = useState<string | null>(null);

  useEffect(() => {
    fetchShortcuts();
  }, [fetchShortcuts]);

  const grouped = shortcuts.reduce<Record<string, KeyboardShortcut[]>>((acc, sc) => {
    (acc[sc.category] ??= []).push(sc);
    return acc;
  }, {});

  const handleUpdateBinding = async (actionId: string, newBinding: string) => {
    const result = await updateBinding(actionId, newBinding);
    if (result) {
      setConflict(`"${newBinding}" is already used by "${result.existingLabel}"`);
      setTimeout(() => setConflict(null), 4000);
    }
  };

  if (isLoading && shortcuts.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading shortcuts...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Keyboard className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Keyboard Shortcuts</h2>
        </div>
        <button
          onClick={() => resetAll()}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset All
        </button>
      </div>

      {conflict && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {conflict}
        </div>
      )}

      {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
        const items = grouped[cat];
        if (!items?.length) return null;

        return (
          <div key={cat} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
            <div className="rounded-lg border border-border divide-y divide-border">
              {items.map((sc) => (
                <div
                  key={sc.actionId}
                  className="flex items-center justify-between px-4 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{sc.label}</p>
                    {sc.description && (
                      <p className="text-xs text-muted-foreground truncate">{sc.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <ShortcutRecorder
                      currentBinding={sc.keyBinding}
                      onRecord={(binding) => handleUpdateBinding(sc.actionId, binding)}
                      onCancel={() => {}}
                    />
                    {sc.keyBinding !== sc.defaultBinding && (
                      <button
                        onClick={() => resetShortcut(sc.actionId)}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                        title="Reset to default"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    )}
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={sc.isEnabled}
                        onChange={(e) => toggleShortcut(sc.actionId, e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="h-5 w-9 rounded-full bg-muted peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
