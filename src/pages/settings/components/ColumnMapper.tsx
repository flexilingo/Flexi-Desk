import { useTranslation } from 'react-i18next';

interface ColumnMapping {
  word_column: number;
  translation_column: number | null;
  definition_column: number | null;
  pos_column: number | null;
  cefr_column: number | null;
  phonetic_column: number | null;
  examples_column: number | null;
  context_column: number | null;
}

interface ColumnMapperProps {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
}

const FIELDS: { key: keyof ColumnMapping; labelKey: string; required?: boolean }[] = [
  { key: 'word_column', labelKey: 'mapper.fields.word', required: true },
  { key: 'translation_column', labelKey: 'mapper.fields.translation' },
  { key: 'definition_column', labelKey: 'mapper.fields.definition' },
  { key: 'pos_column', labelKey: 'mapper.fields.pos' },
  { key: 'cefr_column', labelKey: 'mapper.fields.cefr' },
  { key: 'phonetic_column', labelKey: 'mapper.fields.phonetic' },
  { key: 'examples_column', labelKey: 'mapper.fields.examples' },
  { key: 'context_column', labelKey: 'mapper.fields.context' },
];

export function ColumnMapper({ headers, mapping, onChange }: ColumnMapperProps) {
  const { t } = useTranslation('settingsDesk');
  const handleChange = (key: keyof ColumnMapping, value: string) => {
    const numVal = value === '' ? null : parseInt(value, 10);
    onChange({
      ...mapping,
      [key]: numVal,
    } as ColumnMapping);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">{t('mapper.title')}</p>
      <p className="text-xs text-muted-foreground">{t('mapper.hint')}</p>
      <div className="space-y-2">
        {FIELDS.map(({ key, labelKey, required }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="text-xs text-foreground w-28 shrink-0">
              {t(labelKey)}
              {required && <span className="text-destructive ml-0.5">*</span>}
            </span>
            <select
              value={mapping[key]?.toString() ?? ''}
              onChange={(e) => handleChange(key, e.target.value)}
              className="min-w-0 grow rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            >
              {!required && <option value="">{t('mapper.skip')}</option>}
              {headers.map((h, i) => (
                <option key={i} value={i}>
                  {t('mapper.column', { name: h, n: i + 1 })}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
