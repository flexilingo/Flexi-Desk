import { Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LanguageSearchSelect } from '@/pages/account/components/LanguageSearchSelect';

/** Whisper language choice: full searchable list plus an "auto-detect" toggle. */
export function CaptionLanguage({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const { t } = useTranslation('caption');
  const isAuto = value === 'auto';
  return (
    <div className="flex items-center gap-2">
      <LanguageSearchSelect
        value={isAuto ? 'en' : value}
        onSelect={onChange}
        label={t('common.language')}
        searchPlaceholder={t('common.searchLanguages')}
        noResults={t('common.noLanguage')}
      />
      <Button
        type="button"
        variant={isAuto ? 'default' : 'outline'}
        size="sm"
        onClick={() => onChange('auto')}
        aria-pressed={isAuto}
      >
        <Wand2 className="h-4 w-4" />
        {t('common.autoDetect')}
      </Button>
    </div>
  );
}
