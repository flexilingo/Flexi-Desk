import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowLeft, Clock, CheckCircle, XCircle, BarChart3, Plus, Star, Target,
  BookOpen, Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReviewStore } from '../stores/reviewStore';
import { CreateReviewDialog } from './CreateReviewDialog';

interface SessionItem {
  id: string;
  deck_id: string | null;
  deck_name: string;
  algorithm: string;
  status: string;
  total_cards: number;
  reviewed_cards: number;
  correct_count: number;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number;
}

type StatusFilter = 'all' | 'in_progress' | 'completed' | 'paused';

export function ReviewHistoryPage() {
  const navigate = useNavigate();
  const { startSession } = useReviewStore();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    invoke<SessionItem[]>('srs_list_sessions', {
      status: statusFilter === 'all' ? undefined : statusFilter,
      limit: 100,
    })
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setIsLoading(false));
  }, [statusFilter]);

  const stats = useMemo(() => {
    const completed = sessions.filter((s) => s.status === 'completed');
    const totalReviewed = completed.reduce((sum, s) => sum + s.reviewed_cards, 0);
    const totalCorrect = completed.reduce((sum, s) => sum + s.correct_count, 0);
    const avgAccuracy = totalReviewed > 0 ? Math.round((totalCorrect / totalReviewed) * 100) : 0;
    return {
      totalReviewed,
      completedSessions: completed.length,
      avgAccuracy,
      totalSessions: sessions.length,
    };
  }, [sessions]);

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 14) return '1 week ago';
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return d.toLocaleDateString();
  }

  const FILTER_TABS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All Sessions' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'paused', label: 'Paused' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/review')}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">History</h1>
            <p className="text-sm text-muted-foreground">Review and manage your learning sessions</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Start New Review
        </Button>
      </div>

      {/* Stats Grid */}
      {stats.totalSessions > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={<BarChart3 className="w-5 h-5" />}
            value={stats.totalReviewed}
            label="Cards Reviewed"
          />
          <StatCard
            icon={<Star className="w-5 h-5" />}
            value={stats.completedSessions}
            label="Sessions Completed"
          />
          <StatCard
            icon={<Target className="w-5 h-5" />}
            value={`${stats.avgAccuracy}%`}
            label="Accuracy Rate"
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            value={stats.totalSessions}
            label="Total Sessions"
          />
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              statusFilter === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sessions List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center space-y-4">
          <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/30" />
          <div>
            <p className="text-lg font-medium text-foreground">No review sessions yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Start your first review to begin tracking your progress
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Start First Review
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const accuracy = s.reviewed_cards > 0
              ? Math.round((s.correct_count / s.reviewed_cards) * 100)
              : 0;
            const incorrectCount = s.reviewed_cards - s.correct_count;
            const isActive = s.status === 'in_progress';
            const progress = s.total_cards > 0 ? (s.reviewed_cards / s.total_cards) * 100 : 0;

            return (
              <div
                key={s.id}
                className="bg-card border border-border rounded-xl p-5 space-y-3"
              >
                {/* Row 1: Name + Status + Date */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-semibold text-foreground truncate">{s.deck_name}</p>
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full shrink-0 ${
                      s.status === 'completed' ? 'bg-[#8BB7A3]/20 text-[#8BB7A3]' :
                      isActive ? 'bg-[#C58C6E]/20 text-[#C58C6E]' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {s.status === 'completed' ? 'Completed' :
                       isActive ? 'In Progress' :
                       s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {formatDate(s.started_at)}
                  </span>
                </div>

                {/* Row 2: Stats */}
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    {s.reviewed_cards}/{s.total_cards} cards
                  </span>
                  {s.reviewed_cards > 0 && (
                    <>
                      <span className="text-muted-foreground">{accuracy}% Accuracy</span>
                      <span className="flex items-center gap-1 text-[#8BB7A3]">
                        {s.correct_count} Correct
                      </span>
                      {incorrectCount > 0 && (
                        <span className="flex items-center gap-1 text-destructive">
                          {incorrectCount} Incorrect
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Progress bar (active sessions only) */}
                {s.status !== 'completed' && s.total_cards > 0 && (
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}

                {/* Row 3: Actions */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigate(`/review/session-detail/${s.id}`)}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Details
                  </button>
                  {isActive && (
                    <Button
                      size="sm"
                      onClick={() => {
                        // Start session from this deck
                        if (s.deck_id) {
                          startSession(s.deck_id).then(() => {
                            navigate(`/review/session/${s.id}`);
                          });
                        }
                      }}
                    >
                      <Play className="w-3.5 h-3.5 mr-1" />
                      Continue
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Review Dialog */}
      <CreateReviewDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSessionCreated={(sessionId) => {
          navigate(`/review/session/${sessionId}`);
        }}
      />
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="bg-[#F5F0E6] dark:bg-[#2a2520] border border-[#E8DFD0] dark:border-[#3a3530] rounded-xl p-5 flex items-center justify-between">
      <div>
        <p className="text-xs text-[#A3956B] dark:text-[#A3956B] font-medium">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
      </div>
      <div className="text-[#A3956B] dark:text-[#A3956B] opacity-60">
        {icon}
      </div>
    </div>
  );
}
