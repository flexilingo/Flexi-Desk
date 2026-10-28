import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { setUsageEnabled, usageEnabled } from '@/lib/usage';

/** The one switch for the app's anonymous usage counts (`lib/usage.ts`). */
export function UsageSection() {
  const { t } = useTranslation('settingsDesk');
  const [on, setOn] = useState(usageEnabled);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">{t('usage.title')}</CardTitle>
            <CardDescription>{t('usage.subtitle')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">{t('usage.toggle')}</span>
          <Switch
            checked={on}
            onCheckedChange={(next) => {
              setUsageEnabled(next);
              setOn(next);
            }}
          />
        </label>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('usage.what')}</p>
      </CardContent>
    </Card>
  );
}
