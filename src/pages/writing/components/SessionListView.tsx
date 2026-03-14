import { useState } from 'react';
import {
  PenLine,
  Plus,
  Trash2,
  ChevronRight,
  Loader2,
  BookOpen,
  FileText,
  Check,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useWritingStore } from '../stores/writingStore';
import { TASK_TYPE_LABELS, formatElapsed, scoreColor } from '../types';
import type { WritingSession, WritingTaskType } from '../types';

const TASK_TYPES: WritingTaskType[] = [
  'free',
  'essay',
  'email',
  'ielts_task1',
  'ielts_task2',
  'toefl_integrated',
  'toefl_independent',
  'delf',
  'goethe',
];

export function SessionListView() {
  const {
    sessions,
    isLoadingSessions,
    isCreating,
    stats,
    createSession,
    openSession,
    deleteSession,
    setView,
  } = useWritingStore();

  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState<WritingTaskType>('free');
  const [language, setLanguage] = useState('en');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    await createSession(title.trim(), language, taskType);
    setTitle('');
    setShowNewForm(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    await deleteSession(id);
    setDeletingId(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <PenLine className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Writing Coach</CardTitle>
              <CardDescription>
                Practice writing with AI-powered correction and scoring
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setView('prompts')}>
              <BookOpen className="h-4 w-4" />
              Prompts
            </Button>
            <Button size="sm" onClick={() => setShowNewForm(!showNewForm)}>
              <Plus className="h-4 w-4" />
              New
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Stats summary */}
        {stats && stats.totalSessions > 0 && (
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-lg font-semibold text-foreground">{stats.totalSessions}</p>
              <p className="text-xs text-muted-foreground">Sessions</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-lg font-semibold text-foreground">
                {stats.totalWordsWritten.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Words Written</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <p className={`text-lg font-semibold ${scoreColor(stats.averageScore)}`}>
                {stats.averageScore.toFixed(0)}%
              </p>
              <p className="text-xs text-muted-foreground">Avg Score</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-lg font-semibold text-foreground">{stats.totalCorrections}</p>
              <p className="text-xs text-muted-foreground">Corrections</p>
            </div>
          </div>
        )}

        {/* New session form */}
        {showNewForm && (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title for your writing..."
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="flex gap-2">
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as WritingTaskType)}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {TASK_TYPES.map((tt) => (
                  <option key={tt} value={tt}>
                    {TASK_TYPE_LABELS[tt]}
                  </option>
                ))}
              </select>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-24 rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="en">EN</option>
                <option value="fr">FR</option>
                <option value="de">DE</option>
                <option value="es">ES</option>
                <option value="fa">FA</option>
                <option value="ar">AR</option>
                <option value="tr">TR</option>
                <option value="zh">ZH</option>
                <option value="ru">RU</option>
              </select>
              <Button onClick={handleCreate} disabled={isCreating || !title.trim()}>
                {isCreating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create
              </Button>
            </div>
          </div>
        )}

        {/* Session list */}
        {isLoadingSessions ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No writing sessions yet</p>
              <p className="text-sm text-muted-foreground">
                Create a new session or pick a prompt to get started
              </p>
            </div>
          </div>
        ) : (
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
  session: WritingSession;
  isDeleting: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const dateStr = new Date(session.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  const statusIcon =
    session.status === 'scored' || session.status === 'corrected' ? (
      <Check className="h-4 w-4 text-[#8BB7A3]" />
    ) : (
      <PenLine className="h-4 w-4 text-muted-foreground" />
    );

  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-3 text-left transition-colors hover:bg-muted/50 hover:border-border"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        {statusIcon}
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-foreground truncate">{session.title}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-xs">
            {TASK_TYPE_LABELS[session.taskType]}
          </Badge>
          <span>{session.wordCount} words</span>
          {session.elapsedSeconds > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatElapsed(session.elapsedSeconds)}
            </span>
          )}
          <span>{dateStr}</span>
          {session.overallScore != null && (
            <span className={`font-medium ${scoreColor(session.overallScore)}`}>
              {session.overallScore.toFixed(0)}%
            </span>
          )}
          {session.bandScore && <Badge className="text-xs">{session.bandScore}</Badge>}
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
