import { useState, useCallback, useRef } from 'react';

interface ShortcutRecorderProps {
  currentBinding: string;
  onRecord: (binding: string) => void;
  onCancel: () => void;
}

export function ShortcutRecorder({
  currentBinding,
  onRecord,
  onCancel,
}: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState('');
  const inputRef = useRef<HTMLDivElement>(null);

  const startRecording = useCallback(() => {
    setRecording(true);
    setPreview('Press a key combination...');
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!recording) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRecording(false);
        setPreview('');
        onCancel();
        return;
      }

      // Skip modifier-only presses
      if (['Control', 'Meta', 'Shift', 'Alt'].includes(e.key)) {
        return;
      }

      const parts: string[] = [];
      if (e.metaKey || e.ctrlKey) parts.push('CmdOrCtrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');

      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      parts.push(key);
      const combo = parts.join('+');

      setPreview(combo);
      setRecording(false);
      onRecord(combo);
    },
    [recording, onRecord, onCancel],
  );

  return (
    <div
      ref={inputRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={startRecording}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-mono cursor-pointer transition-colors ${
        recording
          ? 'border-primary bg-primary/10 text-primary animate-pulse'
          : 'border-border bg-muted text-foreground hover:border-primary/50'
      }`}
    >
      {recording ? preview : preview || currentBinding}
    </div>
  );
}
