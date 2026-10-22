import { useEffect } from 'react';
import { Plus, MessageCircle, Drama, Layers, Brain, LockKeyhole, Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/button';
import { useTutorStore } from '../stores/tutorStore';

const MODE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  free: MessageCircle,
  role_play: Drama,
  deck_practice: Layers,
  vocab_challenge: Brain,
  escape_room: LockKeyhole,
};

function timeAgo(dateStr: string, t: TFunction<'tutor'>): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('time.justNow');
  if (mins < 60) return t('time.minutesAgo', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('time.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('time.daysAgo', { count: days });
  return new Date(dateStr).toLocaleDateString();
}

export function TutorLanding() {
  const { t } = useTranslation('tutor');
  const { conversations, isLoadingConversations, fetchConversations, viewConversation, setView } =
    useTutorStore();

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const sortedConversations = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('landing.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('landing.subtitle')}</p>
          </div>
          <Button onClick={() => setView('new_conversation')} className="gap-2">
            <Plus className="h-4 w-4" />
            {t('landing.newConversation')}
          </Button>
        </div>

        {/* Conversation list */}
        {isLoadingConversations ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {t('landing.loading')}
          </div>
        ) : sortedConversations.length === 0 ? (
          <EmptyState t={t} onStart={() => setView('new_conversation')} />
        ) : (
          <div className="space-y-3">
            {sortedConversations.map((conv) => {
              const ModeIcon = MODE_ICONS[conv.mode] ?? MessageCircle;

              return (
                <div
                  key={conv.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => viewConversation(conv.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      viewConversation(conv.id);
                    }
                  }}
                  className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 text-start transition-colors hover:bg-muted/50 cursor-pointer"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <ModeIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{conv.title}</p>
                      {conv.status === 'active' && (
                        <span className="shrink-0 rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-medium text-success">
                          {t('landing.active')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono uppercase">
                        {conv.language}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                        {conv.cefrLevel}
                      </span>
                      <span>{t(`modes.${conv.mode}.name`, { defaultValue: conv.mode })}</span>
                      <span>·</span>
                      <span>{t('landing.messages', { count: conv.messageCount })}</span>
                      {conv.correctionsCount > 0 && (
                        <>
                          <span>·</span>
                          <span>{t('landing.corrections', { count: conv.correctionsCount })}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {timeAgo(conv.updatedAt, t)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onStart, t }: { onStart: () => void; t: TFunction<'tutor'> }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Mic className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{t('landing.emptyTitle')}</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{t('landing.emptyBody')}</p>
      </div>
      <Button onClick={onStart} className="gap-2">
        <Plus className="h-4 w-4" />
        {t('landing.startFirst')}
      </Button>
    </div>
  );
}
