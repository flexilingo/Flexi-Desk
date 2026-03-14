import { useEffect } from 'react';
import { Check, Download, HardDrive, Settings, Loader2 } from 'lucide-react';
import { useCaptionStore } from '../stores/captionStore';

interface ModelSelectorProps {
  disabled?: boolean;
  onManageModels?: () => void;
}

export function ModelSelector({ disabled, onManageModels }: ModelSelectorProps) {
  const {
    availableModels,
    activeModelId,
    isLoadingModels,
    isDownloading,
    fetchAvailableModels,
    setActiveModel,
  } = useCaptionStore();

  useEffect(() => {
    if (availableModels.length === 0) {
      fetchAvailableModels();
    }
  }, [availableModels.length, fetchAvailableModels]);

  const downloadedModels = availableModels.filter((m) => m.isDownloaded);
  const activeModel = availableModels.find((m) => m.id === activeModelId);

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === '__manage__') {
      onManageModels?.();
      return;
    }
    setActiveModel(value);
  };

  if (isLoadingModels) {
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Model</label>
        <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading…
        </div>
      </div>
    );
  }

  if (downloadedModels.length === 0) {
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Model</label>
        <button
          onClick={onManageModels}
          className="flex h-9 items-center gap-2 rounded-md border border-dashed border-warning bg-warning/5 px-3 text-sm text-warning hover:bg-warning/10 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Download a model
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">Model</label>
      <div className="flex items-center gap-1.5">
        <select
          value={activeModelId ?? ''}
          onChange={handleModelChange}
          disabled={disabled || isDownloading}
          className="block h-9 rounded-md border border-border bg-card px-3 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
          title={disabled ? 'Stop capture to change model' : undefined}
        >
          {downloadedModels.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} (
              {model.sizeMb >= 1000 ? `${(model.sizeMb / 1000).toFixed(1)}GB` : `${model.sizeMb}MB`}
              ) — {model.speed}
            </option>
          ))}
          <option disabled>──────────</option>
          <option value="__manage__">⚙ Manage Models…</option>
        </select>

        {activeModel && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <HardDrive className="h-3 w-3" />
            <span>{activeModel.accuracy}</span>
          </div>
        )}
      </div>
    </div>
  );
}
