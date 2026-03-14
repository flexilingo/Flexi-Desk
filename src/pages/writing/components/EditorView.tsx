import { useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Save, Send, Clock, Target, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWritingStore } from '../stores/writingStore';
import { TASK_TYPE_LABELS, formatElapsed } from '../types';

export function EditorView() {
  const {
    activeSession,
    editorText,
    isSaving,
    isSubmitting,
    setEditorText,
    saveText,
    submitWriting,
    updateElapsed,
    goBack,
  } = useWritingStore();

  const elapsedRef = useRef(activeSession?.elapsedSeconds ?? 0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Word count from current editor text
  const wordCount = editorText.trim() ? editorText.trim().split(/\s+/).length : 0;

  // Timer logic
  useEffect(() => {
    if (!activeSession) return;
    if (activeSession.status !== 'draft' && activeSession.status !== 'writing') return;

    elapsedRef.current = activeSession.elapsedSeconds;

    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      // Save elapsed every 30 seconds
      if (elapsedRef.current % 30 === 0) {
        updateElapsed(elapsedRef.current);
      }
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // Save final elapsed on unmount
      updateElapsed(elapsedRef.current);
    };
  }, [activeSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save debounce
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextChange = useCallback(
    (text: string) => {
      setEditorText(text);

      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        saveText();
      }, 3000);
    },
    [setEditorText, saveText],
  );

  // Cleanup auto-save timer
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  if (!activeSession) return null;

  const isEditable = activeSession.status === 'draft' || activeSession.status === 'writing';
  const timeExpired = activeSession.timeLimitMin
    ? elapsedRef.current >= activeSession.timeLimitMin * 60
    : false;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <CardTitle className="truncate">{activeSession.title}</CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <Badge variant="secondary" className="text-xs">
                {TASK_TYPE_LABELS[activeSession.taskType]}
              </Badge>
              <span>{activeSession.language.toUpperCase()}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            {/* Word count */}
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Target className="h-4 w-4" />
              <span className={wordCount > 0 ? 'text-foreground font-medium' : ''}>
                {wordCount}
              </span>
              {activeSession.targetWords && <span>/ {activeSession.targetWords}</span>}
            </div>

            {/* Timer */}
            <div
              className={`flex items-center gap-1.5 ${timeExpired ? 'text-error' : 'text-muted-foreground'}`}
            >
              <Clock className="h-4 w-4" />
              <span className="font-mono tabular-nums">{formatElapsed(elapsedRef.current)}</span>
              {activeSession.timeLimitMin && <span>/ {activeSession.timeLimitMin}m</span>}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={saveText}
              disabled={isSaving || !isEditable}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </Button>
            <Button
              size="sm"
              onClick={submitWriting}
              disabled={isSubmitting || !isEditable || wordCount === 0}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Submit
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Prompt display */}
        {activeSession.promptText && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">Prompt</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {activeSession.promptText}
            </p>
          </div>
        )}

        {/* Time expired warning */}
        {timeExpired && (
          <div className="flex items-center gap-2 rounded-lg border border-[#C58C6E]/30 bg-[#C58C6E]/5 px-4 py-2">
            <AlertCircle className="h-4 w-4 text-[#C58C6E]" />
            <p className="text-sm text-[#C58C6E]">
              Time limit reached. You can still continue or submit.
            </p>
          </div>
        )}

        {/* Text editor */}
        <textarea
          value={editorText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={isEditable ? 'Start writing here...' : 'This session has been submitted.'}
          disabled={!isEditable}
          className="min-h-[400px] w-full resize-y rounded-lg border border-border bg-background p-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
          spellCheck
          autoFocus
        />

        {/* Status bar */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {isSaving
              ? 'Saving...'
              : isEditable
                ? 'Auto-saves every 3 seconds'
                : `Status: ${activeSession.status}`}
          </span>
          <span>
            {wordCount} word{wordCount !== 1 ? 's' : ''}
            {activeSession.targetWords
              ? ` (${Math.round((wordCount / activeSession.targetWords) * 100)}% of target)`
              : ''}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
