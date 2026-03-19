import { useState } from 'react';
import { Settings, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { useDashboardStore } from '../stores/dashboardStore';

const XP_PRESETS = [
  { label: 'Casual', value: 20 },
  { label: 'Regular', value: 50 },
  { label: 'Serious', value: 100 },
  { label: 'Intense', value: 150 },
];

export function GoalSettingsDialog() {
  const { xpProgress, setXPTarget, setFreezeConfig } = useDashboardStore();
  const [open, setOpen] = useState(false);
  const [xpTarget, setLocalTarget] = useState(xpProgress?.xpTarget ?? 50);
  const [freezePerWeek, setFreezePerWeek] = useState(1);
  const [saving, setSaving] = useState(false);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen && xpProgress) {
      setLocalTarget(xpProgress.xpTarget);
    }
    setOpen(isOpen);
  };

  const handleSave = async () => {
    setSaving(true);
    await setXPTarget(xpTarget);
    await setFreezeConfig(freezePerWeek);
    setSaving(false);
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpen}>
      <Dialog.Trigger asChild>
        <button className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted">
          <Settings className="h-4 w-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-foreground">
              Goal Settings
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {/* Daily XP Target */}
          <div className="mb-5">
            <label className="text-sm font-medium text-foreground mb-2 block">
              Daily XP Target
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {XP_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setLocalTarget(preset.value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
                    xpTarget === preset.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {preset.label} ({preset.value})
                </button>
              ))}
            </div>
            <input
              type="range"
              min={10}
              max={200}
              step={10}
              value={xpTarget}
              onChange={(e) => setLocalTarget(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">{xpTarget} XP per day</p>
          </div>

          {/* Streak Freeze */}
          <div className="mb-5">
            <label className="text-sm font-medium text-foreground mb-2 block">
              Streak Protection
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Freeze days protect your streak when you miss a day. They reset weekly.
            </p>
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => setFreezePerWeek(n)}
                  className={`rounded-md px-4 py-2 text-sm font-medium border transition-colors ${
                    freezePerWeek === n
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {n}
                </button>
              ))}
              <span className="self-center text-xs text-muted-foreground">per week</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="rounded-md px-4 py-2 text-sm border border-border text-muted-foreground hover:bg-muted">
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
