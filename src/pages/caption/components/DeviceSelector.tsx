import { Mic, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useCaptionStore } from '../stores/captionStore';

export function DeviceSelector() {
  const { t } = useTranslation('caption');
  const { devices, isLoadingDevices, selectedDeviceId, fetchDevices, setSelectedDevice } =
    useCaptionStore();

  if (isLoadingDevices) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('device.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{t('device.label')}</label>
      <div className="flex items-center gap-2">
        <div className="relative">
          <Mic className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <select
            value={selectedDeviceId ?? ''}
            onChange={(e) => setSelectedDevice(e.target.value || null)}
            className="block h-9 rounded-md border border-border bg-card ps-8 pe-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {devices.length === 0 && <option value="">{t('device.none')}</option>}
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
                {device.isDefault ? ` ${t('device.default')}` : ''}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchDevices}
          className="h-9 w-9"
          title={t('device.refresh')}
          aria-label={t('device.refresh')}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
