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

const FIELDS: { key: keyof ColumnMapping; label: string; required?: boolean }[] = [
  { key: 'word_column', label: 'Word', required: true },
  { key: 'translation_column', label: 'Translation' },
  { key: 'definition_column', label: 'Definition' },
  { key: 'pos_column', label: 'Part of Speech' },
  { key: 'cefr_column', label: 'CEFR Level' },
  { key: 'phonetic_column', label: 'Phonetic/IPA' },
  { key: 'examples_column', label: 'Examples' },
  { key: 'context_column', label: 'Context Sentence' },
];

export function ColumnMapper({ headers, mapping, onChange }: ColumnMapperProps) {
  const handleChange = (key: keyof ColumnMapping, value: string) => {
    const numVal = value === '' ? null : parseInt(value, 10);
    onChange({
      ...mapping,
      [key]: numVal,
    } as ColumnMapping);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">Map columns</p>
      <p className="text-xs text-muted-foreground">
        Match your file columns to FlexiLingo fields.
      </p>
      <div className="space-y-2">
        {FIELDS.map(({ key, label, required }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="text-xs text-foreground w-28 shrink-0">
              {label}
              {required && <span className="text-destructive ml-0.5">*</span>}
            </span>
            <select
              value={mapping[key]?.toString() ?? ''}
              onChange={(e) => handleChange(key, e.target.value)}
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            >
              {!required && <option value="">Skip</option>}
              {headers.map((h, i) => (
                <option key={i} value={i}>
                  {h} (col {i + 1})
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
