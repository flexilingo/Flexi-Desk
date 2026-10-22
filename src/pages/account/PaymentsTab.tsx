import { CheckCircle, Clock, Receipt, RefreshCw, XCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { useAuthStore } from '@/stores/authStore';
import { getPaymentHistory } from '@/lib/account/api';
import { formatAmountAdded } from '@/lib/account/subscription';
import { useRemote } from '@/hooks/useRemote';
import { ErrorLine, RequireSession, Spinner, useAccountT } from './components/AccountBits';

const STATUS: Record<string, { Icon: typeof Clock; cls: string }> = {
  completed: { Icon: CheckCircle, cls: 'bg-success/15 text-success' },
  failed: { Icon: XCircle, cls: 'bg-error/15 text-error' },
  refunded: { Icon: RefreshCw, cls: 'bg-warning/15 text-warning' },
};

export function PaymentsTab() {
  return (
    <RequireSession icon={Receipt}>
      <Payments />
    </RequireSession>
  );
}

function Payments() {
  const { t, i18n } = useAccountT();
  const session = useAuthStore((s) => s.session);
  const { data, loading, error, reload } = useRemote(() => getPaymentHistory(), [session?.user_id]);
  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  const fmtMoney = (n: number, c: string) =>
    new Intl.NumberFormat(i18n.language, { style: 'currency', currency: c.toUpperCase() }).format(
      n,
    );
  const typeLabel = (type: string) =>
    type === 'topup' || type === 'transcription_minutes'
      ? t('subscription.transcriptionMinutes')
      : type === 'content_analysis'
        ? t('subscription.contentAnalysis')
        : type;

  if (loading && !data) return <Spinner />;
  if (error && !data)
    return (
      <ErrorLine
        message={t('subscription.error')}
        onRetry={() => void reload()}
        retryLabel={t('subscription.retry')}
      />
    );
  const rows = data?.transactions ?? [];
  return (
    <div className="flex flex-col gap-4">
      <PageHeader icon={Receipt} title={t('subscription.paymentsTitle')} />
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={Receipt}
            title={t('subscription.noPayments')}
            body={t('subscription.noPaymentsDescription')}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  {(
                    [
                      'paymentDate',
                      'package',
                      'amountAdded',
                      'amount',
                      'paymentStatusLabel',
                    ] as const
                  ).map((k) => (
                    <th
                      key={k}
                      className="px-4 py-3 text-start text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      {t(`subscription.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((tx) => {
                  const st = STATUS[tx.status] ?? {
                    Icon: Clock,
                    cls: 'bg-muted text-muted-foreground',
                  };
                  return (
                    <tr key={tx.id}>
                      <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                        {fmtDate(tx.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">
                          {tx.packageName || t('subscription.topupPurchase')}
                        </p>
                        <p className="text-xs text-muted-foreground">{typeLabel(tx.creditType)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-accent">
                          +{formatAmountAdded(tx.creditsAdded, tx.creditType)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold tabular-nums text-foreground">
                        {fmtMoney(tx.amountPaid, tx.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${st.cls}`}
                        >
                          <st.Icon className="h-3 w-3" />
                          {t(
                            `subscription.paymentStatus.${['completed', 'failed', 'refunded'].includes(tx.status) ? tx.status : 'pending'}`,
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
