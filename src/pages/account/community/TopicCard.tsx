import { Clock, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { authorLabel, statusKey, stripMarkdown, timeAgo } from '@/lib/account/community';
import type { CommunityTopic } from '@/lib/account/types';
import { useAccountT } from '../components/AccountBits';
import { VoteButtons } from './VoteButtons';

export const STATUS_STYLES: Record<string, string> = {
  pending: 'border-accent/30 bg-accent/10 text-accent',
  open: 'border-success/30 bg-success/15 text-success',
  'in-progress': 'border-warning/30 bg-warning/15 text-warning',
  completed: 'border-primary/30 bg-primary/10 text-primary',
  rejected: 'border-error/30 bg-error/10 text-error',
};

export function TopicCard({
  topic,
  onNeedSignIn,
}: {
  topic: CommunityTopic;
  onNeedSignIn?: () => void;
}) {
  const { t, i18n } = useAccountT();
  const pending = topic.status === 'pending';
  const author = authorLabel(topic.profiles) || t('community.anonymous');
  return (
    <article className="flex items-stretch gap-3 rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:border-accent/40 sm:gap-4 sm:p-4">
      {!pending && (
        <div className="flex flex-col items-center justify-center rounded-lg bg-muted/60 px-1 py-1.5">
          <VoteButtons topic={topic} compact onNeedSignIn={onNeedSignIn} />
        </div>
      )}
      <Link
        to={`/account/community/${topic.id}`}
        className="min-w-0 flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <h3 className="line-clamp-1 text-[15px] font-bold text-foreground" dir="auto">
            {topic.title}
          </h3>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${STATUS_STYLES[topic.status] ?? STATUS_STYLES.open}`}
          >
            {pending && <Clock className="h-3 w-3" aria-hidden />}
            {t(`community.${statusKey(topic.status)}`)}
          </span>
        </div>
        <p
          className="mb-2.5 line-clamp-2 text-[13.5px] leading-relaxed text-muted-foreground"
          dir="auto"
        >
          {stripMarkdown(topic.description)}
        </p>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-caption">
          <span className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {author.charAt(0).toUpperCase()}
            </span>
            <span className="font-semibold text-muted-foreground">{author}</span>
          </span>
          <span aria-hidden>·</span>
          <span>{timeAgo(topic.created_at, i18n.language)}</span>
          <span aria-hidden>·</span>
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            {topic.comment_count}
          </span>
        </div>
      </Link>
    </article>
  );
}
