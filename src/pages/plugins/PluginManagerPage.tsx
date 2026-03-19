import { useEffect } from 'react';
import { Puzzle, FolderOpen } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { usePluginStore } from './stores/pluginStore';
import { PluginCard } from './components/PluginCard';

export function PluginManagerPage() {
  const { plugins, isLoading, fetchPlugins, installLocal } = usePluginStore();

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  const handleInstallLocal = async () => {
    const dir = await open({ directory: true });
    if (dir && typeof dir === 'string') {
      await installLocal(dir);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Puzzle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Plugins</h1>
            <p className="text-xs text-muted-foreground">
              Extend FlexiDesk with community plugins
            </p>
          </div>
        </div>
        <button
          onClick={handleInstallLocal}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm border border-border text-foreground hover:bg-muted"
        >
          <FolderOpen className="h-4 w-4" />
          Install from folder
        </button>
      </div>

      {isLoading && plugins.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Loading plugins...
        </p>
      ) : plugins.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Puzzle className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No plugins installed</p>
          <p className="text-xs text-muted-foreground mt-1">
            Install plugins from a local folder or the marketplace
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {plugins.map((plugin) => (
            <PluginCard key={plugin.id} plugin={plugin} />
          ))}
        </div>
      )}
    </div>
  );
}
