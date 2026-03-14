import { useState } from 'react';
import {
  ArrowLeft,
  Clock,
  Hash,
  Type,
  Mic,
  FileAudio,
  Play,
  Trash2,
  Copy,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useCaptionStore } from '../stores/captionStore';
import { SegmentTimeline } from './SegmentTimeline';
import { formatDuration } from '../types';

export function SessionDetail() {
  const {
    activeSession,
    activeSegments,
    isLoadingSegments,
    isTranscribing,
    goBack,
    transcribeSession,
    deleteSession,
  } = useCaptionStore();

  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!activeSession) return null;

  const session = activeSession;
  const isFile = session.sourceType === 'file';
  const needsTranscription =
    session.status === 'processing' || session.status === 'idle' || session.status === 'capturing';
  const isFailed = session.status === 'failed';
  const isCompleted = session.status === 'completed';

  const handleTranscribe = () => {
    transcribeSession(session.id);
  };

  const handleCopyText = async () => {
    const fullText = activeSegments.map((s) => s.text).join(' ');
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    await deleteSession(session.id);
    setIsDeleting(false);
  };

  const dateStr = new Date(session.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2">
              {isFile ? (
                <FileAudio className="h-5 w-5 text-muted-foreground shrink-0" />
              ) : (
                <Mic className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <span className="truncate">
                {isFile
                  ? (session.sourceFile?.split('/').pop() ?? 'Audio File')
                  : (session.deviceName ?? 'Microphone Recording')}
              </span>
            </CardTitle>
          </div>
        </div>

        {/* Session meta */}
        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatDuration(session.durationSeconds)}
          </span>
          {session.segmentCount > 0 && (
            <span className="flex items-center gap-1">
              <Hash className="h-3.5 w-3.5" />
              {session.segmentCount} segments
            </span>
          )}
          {session.wordCount > 0 && (
            <span className="flex items-center gap-1">
              <Type className="h-3.5 w-3.5" />
              {session.wordCount} words
            </span>
          )}
          <span>{dateStr}</span>
          <Badge className="text-xs">
            {session.language === 'auto' ? 'Auto' : session.language.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Error state */}
        {isFailed && (
          <div className="flex items-start gap-3 rounded-lg border border-error/30 bg-error/5 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-error" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-error">Transcription Failed</p>
              {session.errorMessage && (
                <p className="text-xs text-error/80">{session.errorMessage}</p>
              )}
            </div>
          </div>
        )}

        {/* Transcription needed */}
        {needsTranscription && !isTranscribing && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Play className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Ready to transcribe</p>
              <p className="text-sm text-muted-foreground">
                Run Whisper to generate the transcript for this recording
              </p>
            </div>
            <Button onClick={handleTranscribe}>Start Transcription</Button>
          </div>
        )}

        {/* Transcribing state */}
        {isTranscribing && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">Transcribing…</p>
              <p className="text-sm text-muted-foreground">
                Processing audio with Whisper. This may take a while.
              </p>
            </div>
          </div>
        )}

        {/* Segments */}
        {isCompleted &&
          (isLoadingSegments ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : activeSegments.length > 0 ? (
            <SegmentTimeline segments={activeSegments} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No transcript segments found.
            </p>
          ))}
      </CardContent>

      <CardFooter className="justify-between">
        <div className="flex gap-2">
          {isFailed && (
            <Button variant="outline" onClick={handleTranscribe} disabled={isTranscribing}>
              Retry Transcription
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {isCompleted && activeSegments.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleCopyText}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-[#8BB7A3]" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy Text
                </>
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-muted-foreground hover:text-error"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
