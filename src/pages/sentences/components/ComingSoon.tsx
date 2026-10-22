import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CARD } from './cards';

/**
 * The server has not shipped the actions the app needs yet (see `lib/api.ts`).
 * A calm card, not an error: nothing is lost, nothing is wrong, and one press
 * checks again — so the app can ship before the server update and just start
 * working the day it lands.
 */
export function ComingSoon({ loading, onRetry }: { loading: boolean; onRetry: () => void }) {
  const { t } = useTranslation('sentences');
  return (
    <div className={`${CARD} mx-auto max-w-xl text-center`} data-testid="coming-soon">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2.5 py-0.5 text-sm font-semibold text-warning">
        <Clock className="h-3.5 w-3.5" />
        {t('desk.comingTitle')}
      </span>
      <p className="mx-auto mt-3 max-w-md text-base leading-7 text-muted-foreground">
        {t('desk.comingBody')}
      </p>
      <div className="mt-4 flex justify-center">
        <Button size="sm" variant="outline" onClick={onRetry} loading={loading}>
          {t('desk.checkAgain')}
        </Button>
      </div>
    </div>
  );
}
