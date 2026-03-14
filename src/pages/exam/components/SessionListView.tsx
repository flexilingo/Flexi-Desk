import { useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  ChevronRight,
  Loader2,
  FileText,
  Clock,
  Check,
  Pause,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useExamStore } from '../stores/examStore';
import { EXAM_TYPE_LABELS, formatExamElapsed, examScoreColor } from '../types';
import type { ExamSession } from '../types';

export function SessionListView() {
  const {
    sessions,
    isLoadingSessions,
    isCreating,
    createSession,
    openSession,
    deleteSession,
    goBack,
  } = useExamStore();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('en');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Infer exam type from current sessions or default
  const examType = sessions[0]?.examType ?? 'custom';

  const handleCreate = async () => {
    if (!title.trim()) return;
    await createSession({
      examType,
      title: title.trim(),
      language,
      sectionsJson: '[]',
      totalSections: 0,
      totalQuestions: 0,
    });
    setTitle('');
    setShowForm(false);
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
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <CardTitle>{EXAM_TYPE_LABELS[examType]} Sessions</CardTitle>
          </div>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
            New Exam
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {showForm && (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Exam session title..."
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="flex gap-2">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-24 rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="en">EN</option>
                <option value="fr">FR</option>
                <option value="de">DE</option>
                <option value="es">ES</option>
                <option value="zh">ZH</option>
                <option value="ja">JA</option>
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

        {isLoadingSessions ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No exam sessions yet</p>
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
  session: ExamSession;
  isDeleting: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const statusIcon = (() => {
    switch (session.status) {
      case 'completed':
        return <Check className="h-4 w-4 text-[#8BB7A3]" />;
      case 'in_progress':
        return <Play className="h-4 w-4 text-primary" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-[#C58C6E]" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  })();

  const dateStr = new Date(session.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

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
          <Badge variant="secondary" className="text-xs capitalize">
            {session.status.replace('_', ' ')}
          </Badge>
          <span>
            {session.answeredCount}/{session.totalQuestions} answered
          </span>
          {session.elapsedSeconds > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatExamElapsed(session.elapsedSeconds)}
            </span>
          )}
          <span>{dateStr}</span>
          {session.overallScore != null && (
            <span className={`font-medium ${examScoreColor(session.overallScore)}`}>
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
