import { useState } from 'react';
import {
  Captions,
  Plus,
  Mic,
  FileAudio,
  Clock,
  Hash,
  Type,
  Trash2,
  ChevronRight,
  Loader2,
  Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useCaptionStore } from '../stores/captionStore';
import { TranscribeFileDialog } from './TranscribeFileDialog';
import { DeviceSelector } from './DeviceSelector';
import { ModelSelector } from './ModelSelector';
import type { CaptionSession, CaptionSessionStatus } from '../types';
import { formatDuration } from '../types';

const STATUS_CONFIG: Record<CaptionSessionStatus, { label: string; className: string }> = {
  idle: { label: 'Idle', className: 'bg-muted text-muted-foreground' },
  capturing: { label: 'Capturing', className: 'bg-[#C58C6E]/15 text-[#C58C6E]' },
  'live-capturing': { label: 'Live', className: 'bg-[#8BB7A3]/15 text-[#8BB7A3]' },
  processing: { label: 'Processing', className: 'bg-primary/10 text-primary' },
  completed: { label: 'Completed', className: 'bg-[#8BB7A3]/15 text-[#8BB7A3]' },
  failed: { label: 'Failed', className: 'bg-error/15 text-error' },
};

export function SessionList() {
  const {
    sessions,
    isLoadingSessions,
    selectedDeviceId,
    captureLanguage,
    startCapture,
    startLiveCapture,
    openSession,
    deleteSession,
    setCaptureLanguage,
    setView,
  } = useCaptionStore();

  const [showFileDialog, setShowFileDialog] = useState(false);
  const [isStartingLive, setIsStartingLive] = useState(false);
  const [isStartingBatch, setIsStartingBatch] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleStartLiveCapture = async () => {
    setIsStartingLive(true);
    await startLiveCapture(selectedDeviceId ?? undefined, captureLanguage);
    setIsStartingLive(false);
  };

  const handleStartBatchCapture = async () => {
    setIsStartingBatch(true);
    await startCapture(selectedDeviceId ?? undefined, captureLanguage);
    setIsStartingBatch(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    await deleteSession(id);
    setDeletingId(null);
  };

  const handleManageModels = () => {
    // Navigate to whisper setup — for now just show setup view
    // The WhisperSetup component is shown when whisperInfo is unavailable,
    // but we can also use setView if we add a 'setup' view
    // For simplicity, open settings page in a new approach
    // TODO: could open a dialog or navigate to settings
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Captions className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Live Caption</CardTitle>
                <CardDescription>
                  Capture audio and generate transcriptions with Whisper
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Capture Controls */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <DeviceSelector />

              {/* Language selector */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Language</label>
                <select
                  value={captureLanguage}
                  onChange={(e) => setCaptureLanguage(e.target.value)}
                  className="block h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
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

              {/* Model selector */}
              <ModelSelector onManageModels={handleManageModels} />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleStartLiveCapture} disabled={isStartingLive || isStartingBatch}>
                {isStartingLive ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Radio className="h-4 w-4" />
                )}
                {isStartingLive ? 'Starting…' : 'Start Live Caption'}
              </Button>

              <Button
                variant="outline"
                onClick={handleStartBatchCapture}
                disabled={isStartingLive || isStartingBatch}
              >
                {isStartingBatch ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
                {isStartingBatch ? 'Starting…' : 'Record & Transcribe'}
              </Button>

              <Button variant="outline" onClick={() => setShowFileDialog(true)}>
                <FileAudio className="h-4 w-4" />
                Transcribe File
              </Button>
            </div>
          </div>

          {/* Sessions List */}
          {isLoadingSessions ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Plus className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No sessions yet</p>
                <p className="text-sm text-muted-foreground">
                  Start a live caption or transcribe an audio file to begin
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Recent Sessions ({sessions.length})
              </h3>
              <div className="space-y-1">
                {sessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    isDeleting={deletingId === session.id}
                    onClick={() => openSession(session)}
                    onDelete={(e) => handleDelete(e, session.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <TranscribeFileDialog open={showFileDialog} onClose={() => setShowFileDialog(false)} />
    </>
  );
}

// ── Session Row ─────────────────────────────────────────────

function SessionRow({
  session,
  isDeleting,
  onClick,
  onDelete,
}: {
  session: CaptionSession;
  isDeleting: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const statusCfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.idle;
  const sourceIcon = session.sourceType === 'file' ? FileAudio : Mic;
  const SourceIcon = sourceIcon;

  const dateStr = new Date(session.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-3 text-left transition-colors hover:bg-muted/50 hover:border-border"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <SourceIcon className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {session.sourceType === 'file'
              ? (session.sourceFile?.split('/').pop() ?? 'Audio File')
              : (session.deviceName ?? 'Microphone')}
          </span>
          <Badge className={statusCfg.className}>{statusCfg.label}</Badge>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(session.durationSeconds)}
          </span>
          {session.segmentCount > 0 && (
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {session.segmentCount} segments
            </span>
          )}
          {session.wordCount > 0 && (
            <span className="flex items-center gap-1">
              <Type className="h-3 w-3" />
              {session.wordCount} words
            </span>
          )}
          <span>{dateStr}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="rounded-md p-1.5 text-muted-foreground hover:text-error hover:bg-error/10 transition-colors"
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  );
}
