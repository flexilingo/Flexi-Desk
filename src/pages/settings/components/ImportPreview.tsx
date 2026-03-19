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

interface ImportPreviewProps {
  headers: string[];
  sampleRows: string[][];
  mapping: ColumnMapping;
  totalRows: number;
}

export function ImportPreview({
  headers,
  sampleRows,
  mapping,
  totalRows,
}: ImportPreviewProps) {
  const getCell = (row: string[], col: number | null) =>
    col !== null ? row[col] ?? '' : '';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Preview</p>
        <span className="text-xs text-muted-foreground">{totalRows} rows total</span>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-2 py-1.5 text-left font-medium text-foreground">Word</th>
              <th className="px-2 py-1.5 text-left font-medium text-foreground">Translation</th>
              <th className="px-2 py-1.5 text-left font-medium text-foreground">CEFR</th>
              <th className="px-2 py-1.5 text-left font-medium text-foreground">POS</th>
            </tr>
          </thead>
          <tbody>
            {sampleRows.slice(0, 5).map((row, i) => {
              const word = getCell(row, mapping.word_column);
              const hasWord = word.length > 0;

              return (
                <tr
                  key={i}
                  className={`border-b border-border last:border-0 ${
                    !hasWord ? 'bg-destructive/5' : ''
                  }`}
                >
                  <td className="px-2 py-1.5 text-foreground">
                    {word || <span className="text-destructive italic">missing</span>}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {getCell(row, mapping.translation_column) || '-'}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {getCell(row, mapping.cefr_column) || '-'}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {getCell(row, mapping.pos_column) || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sampleRows.length > 5 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing 5 of {sampleRows.length} preview rows
        </p>
      )}
    </div>
  );
}
