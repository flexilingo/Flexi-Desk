import { useState } from 'react';
import { FileAudio, FolderOpen, Loader2 } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useCaptionStore } from '../stores/captionStore';

interface TranscribeFileDialogProps {
  open: boolean;
  onClose: () => void;
}

export function TranscribeFileDialog({ open: isOpen, onClose }: TranscribeFileDialogProps) {
  const { isTranscribing, transcribeFile } = useCaptionStore();

  const [filePath, setFilePath] = useState('');
  const [language, setLanguage] = useState('auto');
  const [error, setError] = useState<string | null>(null);

  const handleBrowse = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: 'Select audio file',
        filters: [
          { name: 'Audio Files', extensions: ['wav', 'mp3', 'flac', 'ogg', 'm4a', 'mp4', 'webm'] },
        ],
      });
      if (selected) {
        setFilePath(selected as string);
        setError(null);
      }
    } catch {
      // User cancelled
    }
  };

  const handleSubmit = async () => {
    if (!filePath.trim()) {
      setError('Please select an audio file');
      return;
    }
    setError(null);
    const result = await transcribeFile(
      filePath.trim(),
      language === 'auto' ? undefined : language,
    );
    if (result) {
      setFilePath('');
      setLanguage('auto');
      onClose();
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isTranscribing) {
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileAudio className="h-5 w-5 text-primary" />
            Transcribe Audio File
          </DialogTitle>
          <DialogDescription>
            Select an audio file to transcribe with Whisper. Supported formats: WAV, MP3, FLAC, OGG,
            M4A, MP4, WebM.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File path */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Audio File</label>
            <div className="flex gap-2">
              <Input
                value={filePath}
                onChange={(e) => {
                  setFilePath(e.target.value);
                  setError(null);
                }}
                placeholder="/path/to/audio.wav"
                className="flex-1 font-mono text-sm"
              />
              <Button variant="outline" size="icon" onClick={handleBrowse}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Language */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="block h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="auto">Auto-detect</option>
              <option value="en">English</option>
              <option value="fa">Persian</option>
              <option value="ar">Arabic</option>
              <option value="tr">Turkish</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="zh">Chinese</option>
              <option value="hi">Hindi</option>
              <option value="ru">Russian</option>
            </select>
          </div>

          {/* Error */}
          {error && <p className="text-sm text-error">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isTranscribing}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isTranscribing || !filePath.trim()}>
            {isTranscribing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Transcribing…
              </>
            ) : (
              'Start Transcription'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
