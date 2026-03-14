import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, NotebookPen, Loader2 } from 'lucide-react';
import { usePodcastStore } from '../stores/podcastStore';

interface QuickAddNoteDialogProps {
  open: boolean;
  onClose: () => void;
  episodeId: string;
  currentTime: number;
  subtitleText?: string;
}

function formatTimeMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function QuickAddNoteDialog({
  open,
  onClose,
  episodeId,
  currentTime,
  subtitleText,
}: QuickAddNoteDialogProps) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capturedTime = useRef(currentTime);
  const addBookmark = usePodcastStore((s) => s.addBookmark);

  useEffect(() => {
    if (open) {
      capturedTime.current = currentTime;
      setNote('');
      setSuccess(false);
      setError(null);
    }
  }, [open, currentTime]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const posMs = Math.round(capturedTime.current * 1000);
      await addBookmark(episodeId, posMs, subtitleText || undefined, note || undefined);
      setSuccess(true);
      setTimeout(onClose, 600);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [episodeId, note, subtitleText, addBookmark, onClose]);

  if (!open) return null;

  const timeStr = formatTimeMs(capturedTime.current * 1000);

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <NotebookPen className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Add Note</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Subtitle context */}
          {subtitleText && (
            <div className="p-3 rounded-lg bg-muted/50 border border-border">
              <p className="text-sm text-foreground">{subtitleText}</p>
              <p className="text-xs text-muted-foreground mt-1">{timeStr}</p>
            </div>
          )}

          {/* Note input */}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note about this moment..."
            className="w-full h-24 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />

          {/* Error */}
          {error && (
            <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs">
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="p-2 rounded-lg bg-success/10 border border-success/30 text-success text-xs">
              Note saved!
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-foreground text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? 'Saving...' : 'Save Note'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
