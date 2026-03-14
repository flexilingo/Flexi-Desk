import { useEffect, useState } from 'react';
import { Plus, BookOpen, Trash2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { InlineError } from '@/components/common/InlineError';
import { useReadingStore } from '../stores/readingStore';
import { ImportTextDialog } from './ImportTextDialog';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  fa: 'Persian',
  ar: 'Arabic',
  tr: 'Turkish',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  zh: 'Chinese',
  hi: 'Hindi',
  ru: 'Russian',
};

interface Props {
  onOpenDocument: (id: string) => void;
}

export function DocumentLibrary({ onOpenDocument }: Props) {
  const { documents, isLoadingDocuments, error, fetchDocuments, deleteDocument, clearError } =
    useReadingStore();
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Reading Mode</h2>
          <p className="text-sm text-muted-foreground">
            {documents.length > 0
              ? `${documents.length} document${documents.length === 1 ? '' : 's'} in library`
              : 'Import texts for interactive reading'}
          </p>
        </div>
        <Button onClick={() => setShowImport(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Import Text
        </Button>
      </div>

      {error && <InlineError message={error} onDismiss={clearError} />}

      {isLoadingDocuments ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground/40" />
            <div className="text-center">
              <p className="font-medium text-foreground">No documents yet</p>
              <p className="text-sm text-muted-foreground">
                Import a text to start reading and learning vocabulary
              </p>
            </div>
            <Button onClick={() => setShowImport(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Import Text
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc) => (
            <Card
              key={doc.id}
              className="cursor-pointer transition-colors hover:border-primary/50"
              onClick={() => onOpenDocument(doc.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{doc.title}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this document?')) {
                          deleteDocument(doc.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-error" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{LANGUAGE_NAMES[doc.language] ?? doc.language}</span>
                  <span className="text-foreground/30">|</span>
                  <span>{doc.wordCount} words</span>
                  {doc.highlightCount > 0 && (
                    <>
                      <span className="text-foreground/30">|</span>
                      <span className="text-accent font-medium">{doc.highlightCount} saved</span>
                    </>
                  )}
                  {doc.progress > 0 && (
                    <>
                      <span className="text-foreground/30">|</span>
                      <Badge variant="outline" className="text-xs">
                        {Math.round(doc.progress * 100)}% read
                      </Badge>
                    </>
                  )}
                </div>
                {/* Progress bar */}
                {doc.progress > 0 && (
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-success transition-all"
                      style={{ width: `${Math.round(doc.progress * 100)}%` }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ImportTextDialog
        open={showImport}
        onOpenChange={setShowImport}
        onImported={(id) => onOpenDocument(id)}
      />
    </div>
  );
}
