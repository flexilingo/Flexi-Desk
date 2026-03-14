import { useState } from 'react';
import { Mic2, ChevronRight, Trash2, Loader2, Trophy, Type, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { usePronunciationStore } from '../stores/pronunciationStore';
import { scoreColor } from '../types';
import type { PronunciationSession, PracticeMode } from '../types';

const MODE_LABELS: Record<PracticeMode, { label: string; icon: typeof Type }> = {
  word: { label: 'Word', icon: Type },
  sentence: { label: 'Sentence', icon: MessageSquare },
  shadowing: { label: 'Shadowing', icon: Mic2 },
};

export function SessionListView() {
  const {
    sessions,
    isLoadingSessions,
    practiceMode,
    practiceLanguage,
    targetText,
    progress,
    setPracticeMode,
    setPracticeLanguage,
    setTargetText,
    createSession,
    openSession,
    deleteSession,
  } = usePronunciationStore();

  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async () => {
    setIsCreating(true);
    await createSession();
    setIsCreating(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    await deleteSession(id);
    setDeletingId(null);
  };

  const currentProgress = progress.find((p) => p.language === practiceLanguage);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Mic2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Pronunciation Lab</CardTitle>
            <CardDescription>Practice speaking and get instant feedback</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Progress summary */}
        {currentProgress && (
          <div className="flex gap-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">{currentProgress.totalAttempts}</p>
              <p className="text-xs text-muted-foreground">Attempts</p>
            </div>
            <div className="text-center">
              <p className={`text-lg font-bold ${scoreColor(currentProgress.averageScore)}`}>
                {Math.round(currentProgress.averageScore)}%
              </p>
              <p className="text-xs text-muted-foreground">Average</p>
            </div>
            <div className="text-center">
              <p className={`text-lg font-bold ${scoreColor(currentProgress.bestScore)}`}>
                {Math.round(currentProgress.bestScore)}%
              </p>
              <p className="text-xs text-muted-foreground">Best</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">
                {currentProgress.practiceMinutes}m
              </p>
              <p className="text-xs text-muted-foreground">Practice</p>
            </div>
          </div>
        )}

        {/* New practice form */}
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Mode selector */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Mode</label>
              <div className="flex rounded-md border border-border overflow-hidden">
                {(['word', 'sentence', 'shadowing'] as PracticeMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setPracticeMode(mode)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      practiceMode === mode
                        ? 'bg-primary text-white'
                        : 'bg-card text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {MODE_LABELS[mode].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Language</label>
              <select
                value={practiceLanguage}
                onChange={(e) => setPracticeLanguage(e.target.value)}
                className="block h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="en">English</option>
                <option value="fa">Persian</option>
                <option value="ar">Arabic</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="es">Spanish</option>
                <option value="tr">Turkish</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
              placeholder={
                practiceMode === 'word'
                  ? 'Enter a word to practice…'
                  : 'Enter a sentence to practice…'
              }
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="flex-1"
            />
            <Button onClick={handleCreate} disabled={isCreating || !targetText.trim()}>
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mic2 className="h-4 w-4" />
              )}
              Practice
            </Button>
          </div>
        </div>

        {/* Sessions list */}
        {isLoadingSessions ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Mic2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No practice sessions yet. Enter text above to start.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Recent Sessions</h3>
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
        )}
      </CardContent>
    </Card>
  );
}

function SessionRow({
  session,
  isDeleting,
  onClick,
  onDelete,
}: {
  session: PronunciationSession;
  isDeleting: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const ModeIcon = MODE_LABELS[session.mode].icon;

  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-3 text-left transition-colors hover:bg-muted/50 hover:border-border"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <ModeIcon className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-foreground truncate">{session.targetText}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge className="text-xs">{MODE_LABELS[session.mode].label}</Badge>
          <span>{session.language.toUpperCase()}</span>
          <span>{session.attempts} attempts</span>
          {session.bestScore != null && (
            <span className={`flex items-center gap-0.5 ${scoreColor(session.bestScore)}`}>
              <Trophy className="h-3 w-3" />
              {Math.round(session.bestScore)}%
            </span>
          )}
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
