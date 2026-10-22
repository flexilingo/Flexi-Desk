import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Cloud, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/common/InlineError';
import * as api from '../lib/api';
import { writingErrorText } from '../lib/errors';
import { routeOfId } from '../lib/session';
import { useWritingAi } from '../lib/useWritingAi';
import type { WritingSession } from '../lib/types';
import { ActiveWritingView } from './ActiveWritingView';
import { GradedFeedbackView } from './GradedFeedbackView';
import { GradingState } from './bits';

type Load =
  | { kind: 'loading' }
  | { kind: 'missing'; message: string }
  | { kind: 'ready'; session: WritingSession };

export function SessionScreen() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation('writingPractice');
  const { cloud, checking } = useWritingAi();
  const sessionRoute = routeOfId(sessionId);
  const [state, setState] = useState<Load>({ kind: 'loading' });

  const blockedCloud = sessionRoute === 'cloud' && !checking && !cloud;

  const load = useCallback(async () => {
    if (checking || blockedCloud) return;
    try {
      setState({ kind: 'ready', session: await api.getSession(sessionId) });
    } catch (err) {
      setState({ kind: 'missing', message: writingErrorText(t, err) });
    }
  }, [sessionId, checking, blockedCloud, t]);

  useEffect(() => {
    setState({ kind: 'loading' });
    void load();
  }, [load]);

  const back = (
    <Button variant="link" onClick={() => navigate('/writing-practice')} className="mt-2">
      <ArrowLeft className="rtl:rotate-180" />
      {t('backToList')}
    </Button>
  );

  if (blockedCloud) {
    return (
      <Centered icon={Cloud} title={t('cloudSessionOff.title')} body={t('cloudSessionOff.body')}>
        {back}
      </Centered>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-muted border-t-accent" />
          <p className="text-[13px] text-muted-foreground">{t('feedback.loading')}</p>
        </div>
      </div>
    );
  }

  if (state.kind === 'missing') {
    return (
      <Centered icon={FileText} title={state.message}>
        {back}
      </Centered>
    );
  }

  const { session } = state;
  if (session.status === 'graded') return <GradedFeedbackView session={session} />;
  if (session.status === 'active') {
    return (
      <ActiveWritingView
        key={session.id}
        session={session}
        onGraded={(graded) => setState({ kind: 'ready', session: graded })}
      />
    );
  }
  // Submitted (transient) or cancelled: the grading placeholder, as on the website.
  return (
    <div className="flex flex-col items-center">
      <GradingState title={t('submitting')} body={t('feedback.gradingDescription')} />
      {session.status === 'cancelled' && (
        <div className="-mt-16 flex flex-col items-center gap-2">
          <InlineError message={t('errors.WRITING_SESSION_CANCELLED')} />
          {back}
        </div>
      )}
    </div>
  );
}

function Centered({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: typeof FileText;
  title: string;
  body?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6 md:p-8">
      <div className="w-full max-w-md rounded-2xl border-[1.5px] border-dashed border-border bg-card px-8 py-12 text-center">
        <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] border border-accent/15 bg-accent/[0.08]">
          <Icon className="h-6 w-6 text-accent" />
        </div>
        <h3 className="mb-2 text-[15px] font-bold text-foreground">{title}</h3>
        {body && <p className="text-[13px] leading-relaxed text-muted-foreground">{body}</p>}
        {children}
      </div>
    </div>
  );
}
