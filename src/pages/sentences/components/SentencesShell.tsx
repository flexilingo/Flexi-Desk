import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquareText } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';

/** The page frame both screens share: the header, and the place the content sits. */
export function SentencesShell({
  title,
  subtitle,
  meta,
  children,
}: {
  title?: string;
  subtitle?: string;
  /** A quiet line under the header (the learner's numbers). */
  meta?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation('sentences');
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6" data-testid="sentences-page">
      <PageHeader
        icon={MessageSquareText}
        title={title ?? t('title')}
        subtitle={subtitle ?? t('tagline')}
      />
      {meta && (
        <div className="-mt-2 mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {meta}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
}
