import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { useShortcutStore } from '@/stores/shortcutStore';

function normalizeBinding(binding: string): string {
  return binding
    .split('+')
    .map((p) => p.trim())
    .join('+');
}

export function useShortcuts() {
  const navigate = useNavigate();
  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const fetchShortcuts = useShortcutStore((s) => s.fetchShortcuts);

  // Load shortcuts on mount
  useEffect(() => {
    fetchShortcuts();
  }, [fetchShortcuts]);

  // Listen for global shortcut events from Rust
  useEffect(() => {
    const unlisten = listen<string>('shortcut-triggered', (event) => {
      handleAction(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // In-app keyboard listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const parts: string[] = [];
      if (e.metaKey || e.ctrlKey) parts.push('CmdOrCtrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');

      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      parts.push(key);
      const combo = parts.join('+');

      const match = shortcuts.find(
        (s) =>
          s.isEnabled && !s.isGlobal && normalizeBinding(s.keyBinding) === combo,
      );

      if (match) {
        e.preventDefault();
        handleAction(match.actionId);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);

  function handleAction(actionId: string) {
    switch (actionId) {
      case 'nav.dashboard':
        navigate('/');
        break;
      case 'nav.review':
        navigate('/review');
        break;
      case 'nav.reading':
        navigate('/reading');
        break;
      case 'nav.tutor':
        navigate('/tutor');
        break;
      case 'nav.caption':
        navigate('/caption');
        break;
      case 'nav.writing':
        navigate('/writing');
        break;
      case 'nav.pronunciation':
        navigate('/pronunciation');
        break;
      case 'nav.exam':
        navigate('/exam');
        break;
      case 'nav.podcast':
        navigate('/podcast');
        break;
      case 'nav.settings':
        navigate('/settings');
        break;
      default:
        // Emit custom event for module-specific actions
        window.dispatchEvent(
          new CustomEvent('flexidesk-shortcut', { detail: actionId }),
        );
    }
  }
}
