import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Lock, MessageSquare, Pencil, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { SignInDialog } from '@/components/auth/SignInDialog';
import { useAuthStore } from '@/stores/authStore';
import {
  createComment,
  deleteComment,
  deleteTopic,
  getComments,
  getTopic,
} from '@/lib/account/api';
import { authorLabel, statusKey, timeAgo, topicRights } from '@/lib/account/community';
import { Markdown } from '@/lib/account/markdown';
import { useRemote } from '@/hooks/useRemote';
import { ErrorLine, Spinner, useAccountT } from '../components/AccountBits';
import { CreateTopicDialog } from './CreateTopicDialog';
import { MarkdownEditor } from './MarkdownEditor';
import { STATUS_STYLES } from './TopicCard';
import { VoteButtons } from './VoteButtons';

export function TopicPage() {
  const { id = '' } = useParams();
  const { t, i18n, errorText } = useAccountT();
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const authLoading = useAuthStore((s) => s.isLoading);
  const userId = session?.user_id;
  const topic = useRemote(() => getTopic(id), [id, userId]);
  const comments = useRemote(() => getComments(id), [id, userId]);
  const [edit, setEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);

  const back = (
    <Link
      to="/account/community"
      className="inline-flex items-center gap-2 text-[13px] font-semibold text-caption hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
      {t('community.backToCommunity')}
    </Link>
  );

  if ((topic.loading && !topic.data) || (!topic.data && authLoading)) return <Spinner />;

  const tp = topic.data;
  if (!tp) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Card>
          <EmptyState
            icon={MessageSquare}
            title={session ? t('community.topicNotFound') : t('community.loginToViewTopic')}
            body={topic.error ? errorText(topic.error) : undefined}
            action={
              !session ? (
                <Button variant="accent" onClick={() => setSignIn(true)}>
                  {t('desk.signedOut.button')}
                </Button>
              ) : undefined
            }
          />
        </Card>
        <SignInDialog open={signIn} onOpenChange={setSignIn} />
      </div>
    );
  }

  const r = topicRights(tp, userId);
  const list = comments.data?.comments ?? [];

  const remove = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteTopic(tp.id);
      setConfirmDelete(false);
      navigate('/account/community');
    } catch (e) {
      setDeleteError(errorText(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {back}
      {r.isPending && (
        <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/10 p-4">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
          <p className="text-sm text-foreground">{t('community.pendingDescription')}</p>
        </div>
      )}
      {r.isBeingBuilt && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted p-4">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-caption" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {t(r.canReopen ? 'community.completedReplyToReopen' : 'community.lockedForEditing')}
          </p>
        </div>
      )}
      {r.canManage && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setEdit(true)}>
            <Pencil />
            {t('community.editTopic')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-error hover:text-error"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 />
            {t('community.deleteTopic')}
          </Button>
        </div>
      )}

      <Card className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground" dir="auto">
                {tp.title}
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[tp.status] ?? STATUS_STYLES.open}`}
              >
                {r.isPending && <Clock className="h-4 w-4" aria-hidden />}
                {t(`community.${statusKey(tp.status)}`)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-caption">
              <span className="font-semibold text-muted-foreground">
                {authorLabel(tp.profiles) || t('community.anonymous')}
              </span>
              <span aria-hidden>·</span>
              <span>{timeAgo(tp.created_at, i18n.language)}</span>
              <span aria-hidden>·</span>
              <span>
                {tp.view_count} {t('community.views')}
              </span>
            </div>
          </div>
          {r.showVotes && <VoteButtons topic={tp} onNeedSignIn={() => setSignIn(true)} />}
        </div>
        <Markdown content={tp.description} />
        {tp.category && (
          <span className="mt-4 inline-flex rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
            {tp.category}
          </span>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-extrabold text-foreground">
          {t('community.comments')} ({list.length})
        </h2>
        {r.canComment ? (
          <CommentForm
            topicId={tp.id}
            onPosted={() => void comments.reload()}
            signedIn={!!session}
            onNeedSignIn={() => setSignIn(true)}
          />
        ) : (
          <div className="mb-4 rounded-lg border border-border bg-muted p-4">
            <p className="text-center text-[13px] text-caption">
              {t('community.topicClosedNoComments')}
            </p>
          </div>
        )}
        <ErrorLine
          message={comments.error ? errorText(comments.error) : null}
          onRetry={() => void comments.reload()}
          retryLabel={t('subscription.retry')}
        />
        <CommentList comments={list} userId={userId} onChanged={() => void comments.reload()} />
      </Card>

      <CreateTopicDialog
        open={edit}
        topic={tp}
        onClose={() => setEdit(false)}
        onSaved={() => void topic.reload()}
      />
      <Dialog open={confirmDelete} onOpenChange={(o) => !deleting && setConfirmDelete(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('community.deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('community.deleteConfirmDescription')}</DialogDescription>
          </DialogHeader>
          <ErrorLine message={deleteError} />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              {t('community.cancel')}
            </Button>
            <Button variant="destructive" loading={deleting} onClick={() => void remove()}>
              {t('community.deleteTopic')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SignInDialog
        open={signIn}
        onOpenChange={setSignIn}
        description={t('community.loginToComment')}
      />
    </div>
  );
}

function CommentForm({
  topicId,
  onPosted,
  signedIn,
  onNeedSignIn,
}: {
  topicId: string;
  onPosted: () => void;
  signedIn: boolean;
  onNeedSignIn: () => void;
}) {
  const { t, errorText } = useAccountT();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-lg border border-border bg-muted px-4 py-4 text-sm text-caption">
        {t('community.loginToComment')}
        <Button size="sm" variant="accent" onClick={onNeedSignIn}>
          {t('desk.signedOut.button')}
        </Button>
      </div>
    );
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setError(t('community.commentTooShort'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createComment(topicId, text.trim());
      setText('');
      onPosted();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <ErrorLine message={error} onDismiss={() => setError(null)} />
      <MarkdownEditor
        value={text}
        onChange={setText}
        placeholder={t('community.commentPlaceholder')}
        rows={4}
      />
      <div className="flex justify-end">
        <Button type="submit" variant="accent" loading={busy}>
          {!busy && <Send />}
          {busy ? t('community.posting') : t('community.postComment')}
        </Button>
      </div>
    </form>
  );
}

function CommentList({
  comments,
  userId,
  onChanged,
}: {
  comments: {
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    profiles?: import('@/lib/account/types').Author;
  }[];
  userId?: string;
  onChanged: () => void;
}) {
  const { t, i18n } = useAccountT();
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await deleteComment(pending);
      setPending(null);
      onChanged();
    } catch {
      setError(t('community.deleteError'));
    } finally {
      setBusy(false);
    }
  };
  if (comments.length === 0)
    return (
      <div className="mt-4">
        <EmptyState icon={MessageSquare} title={t('community.noComments')} />
      </div>
    );
  return (
    <div className="mt-4 flex flex-col gap-3">
      <ErrorLine message={error} onDismiss={() => setError(null)} />
      {comments.map((c) => (
        <div key={c.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-foreground">
                  {authorLabel(c.profiles) || t('community.anonymous')}
                </span>
                <span className="text-xs text-caption">{timeAgo(c.created_at, i18n.language)}</span>
              </div>
              <Markdown content={c.content} />
            </div>
            {userId === c.user_id && (
              <Button variant="destructive" size="sm" onClick={() => setPending(c.id)}>
                <Trash2 />
                {t('community.delete')}
              </Button>
            )}
          </div>
        </div>
      ))}
      <Dialog open={pending !== null} onOpenChange={(o) => !busy && !o && setPending(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('community.delete')}</DialogTitle>
            <DialogDescription>{t('community.confirmDeleteComment')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" loading={busy} onClick={() => void remove()}>
              {t('community.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
