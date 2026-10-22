import { Link } from 'react-router-dom';
import { Link2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { RequireSession, useAccountT } from './components/AccountBits';

/** Shared decks and share links live with the decks; this tab names them and opens them. */
export function LinksTab({ kind }: { kind: 'shared' | 'links' }) {
  const { t } = useAccountT();
  const Icon = kind === 'shared' ? Share2 : Link2;
  return (
    <RequireSession icon={Icon}>
      <div className="flex flex-col gap-4">
        <PageHeader
          icon={Icon}
          title={t(kind === 'shared' ? 'navigation.shared' : 'navigation.shareLinks')}
        />
        <Card>
          <EmptyState
            icon={Icon}
            title={t(`desk.${kind}.title`)}
            body={t(`desk.${kind}.body`)}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild variant="accent">
                  <Link to="/review">{t('desk.openDecks')}</Link>
                </Button>
                {kind === 'shared' && (
                  <Button asChild variant="outline">
                    <Link to="/account/friends">{t('navigation.friends')}</Link>
                  </Button>
                )}
              </div>
            }
          />
        </Card>
      </div>
    </RequireSession>
  );
}
