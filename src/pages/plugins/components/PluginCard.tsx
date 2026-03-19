import { Puzzle, Trash2, ExternalLink } from 'lucide-react';
import type { PluginInfo } from '../stores/pluginStore';
import { usePluginStore } from '../stores/pluginStore';

interface PluginCardProps {
  plugin: PluginInfo;
}

export function PluginCard({ plugin }: PluginCardProps) {
  const { enablePlugin, disablePlugin, uninstallPlugin } = usePluginStore();

  const isEnabled = plugin.status === 'enabled';
  const hasError = plugin.status === 'error';

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Puzzle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">{plugin.name}</h3>
            <p className="text-xs text-muted-foreground">
              v{plugin.version}
              {plugin.author && ` by ${plugin.author}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {plugin.homepageUrl && (
            <a
              href={plugin.homepageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            onClick={() => uninstallPlugin(plugin.id)}
            className="rounded p-1 text-muted-foreground hover:text-destructive"
            title="Uninstall"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {plugin.description && (
        <p className="text-xs text-muted-foreground">{plugin.description}</p>
      )}

      {hasError && plugin.errorMessage && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          {plugin.errorMessage}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {plugin.permissions.slice(0, 3).map((perm) => (
            <span
              key={perm}
              className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {perm}
            </span>
          ))}
          {plugin.permissions.length > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{plugin.permissions.length - 3} more
            </span>
          )}
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={() =>
              isEnabled ? disablePlugin(plugin.id) : enablePlugin(plugin.id)
            }
            className="sr-only peer"
          />
          <div className="h-5 w-9 rounded-full bg-muted peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
        </label>
      </div>
    </div>
  );
}
