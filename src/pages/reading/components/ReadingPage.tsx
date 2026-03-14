import { useCallback } from 'react';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useReadingStore } from '../stores/readingStore';
import { DocumentLibrary } from './DocumentLibrary';
import { InteractiveReader } from './InteractiveReader';

export function ReadingPage() {
  const { activeDocument, isLoadingDocument, openDocument, closeDocument } = useReadingStore();

  const handleOpenDocument = useCallback(
    (id: string) => {
      openDocument(id);
    },
    [openDocument],
  );

  const handleBack = useCallback(() => {
    closeDocument();
  }, [closeDocument]);

  if (isLoadingDocument) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }

  if (activeDocument) {
    return <InteractiveReader onBack={handleBack} />;
  }

  return <DocumentLibrary onOpenDocument={handleOpenDocument} />;
}
