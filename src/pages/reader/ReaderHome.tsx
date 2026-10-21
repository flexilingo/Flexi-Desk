import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileUp, Library } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { SignInDialog } from '@/components/auth/SignInDialog';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';
import { getSetting } from '@/lib/tauri-bridge';
import { getReaderDocuments } from './services/readerService';
import {
  getLibraryCatalog,
  getLibraryShelf,
  type LibraryBook,
  type LibraryShelfItem,
} from './services/libraryService';
import type { ReaderDocument } from './types';
import { buildReadingQueue } from './lib/queue';
import { suggestBooks } from './lib/suggest';
import { useReaderErrorText } from './lib/use-error-text';
import { ReaderShell } from './components/ReaderShell';
import { ReaderQueue } from './components/ReaderQueue';
import { ReaderStartPanel } from './components/ReaderStartPanel';
import { ReaderSuggestions } from './components/ReaderSuggestions';

/**
 * Reading home.
 *
 * One question, answered top to bottom: where was I, what else do I have, what
 * should I read next. Local documents always show; the shelf and the ready-made
 * Library come from the cloud and only while signed in. Signed out, a gentle
 * hint takes the place of the books.
 *
 * A first visit gets the same shape with a book already picked: one story at
 * the reader's level with the page's only filled button, and the next few
 * beside it.
 */
export function ReaderHome() {
  const { t } = useTranslation('reader');
  const { t: tDesk } = useTranslation('readerDesk');
  const errorText = useReaderErrorText();
  const { targetLang } = useLanguageSettings();
  const session = useAuthStore((s) => s.session);
  const authLoading = useAuthStore((s) => s.isLoading);
  const signedIn = !!session;

  const [documents, setDocuments] = useState<ReaderDocument[] | null>(null);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [shelf, setShelf] = useState<LibraryShelfItem[] | null>(null);
  const [catalog, setCatalog] = useState<LibraryBook[] | null>(null);
  const [cloudFailed, setCloudFailed] = useState(false);
  const [level, setLevel] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      const result = await getReaderDocuments();
      setDocuments(result.items);
      setDocumentsError(null);
    } catch (cause) {
      setDocumentsError(errorText(cause));
    }
  }, [errorText]);

  const loadCloud = useCallback(async () => {
    setCloudFailed(false);
    const [shelfResult, catalogResult] = await Promise.allSettled([
      getLibraryShelf(),
      getLibraryCatalog({}),
    ]);
    if (shelfResult.status === 'fulfilled') setShelf(shelfResult.value.items);
    if (catalogResult.status === 'fulfilled') setCatalog(catalogResult.value.books);
    if (shelfResult.status === 'rejected' || catalogResult.status === 'rejected')
      setCloudFailed(true);
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    getSetting('current_cefr_level')
      .then(setLevel)
      .catch(() => setLevel(null));
  }, []);

  useEffect(() => {
    if (signedIn) void loadCloud();
    else {
      setShelf(null);
      setCatalog(null);
      setCloudFailed(false);
    }
  }, [signedIn, loadCloud]);

  const queue = useMemo(
    () => buildReadingQueue(documents ?? undefined, shelf ?? undefined),
    [documents, shelf],
  );

  const suggestions = useMemo(() => {
    const books = catalog ?? [];
    const has = (code: string | undefined) => !!code && books.some((b) => b.language === code);
    const language = has(targetLang) ? targetLang : has('en') ? 'en' : undefined;
    // Nine: on a first visit one leads in its own card and eight fill the row.
    return suggestBooks(books, shelf ?? [], language, level, 9);
  }, [catalog, shelf, targetLang, level]);

  const loading =
    (documents === null && !documentsError) ||
    authLoading ||
    (signedIn && shelf === null && !cloudFailed);
  const [first, ...more] = suggestions.books;

  // Just finished a book whose story goes on: its sequel leads, in the same
  // card a first visit gets, and the row below does not offer it twice.
  const latest = queue[0];
  const sequel = latest?.kind === 'book' && latest.finished ? suggestions.continueWith : null;
  const row = sequel
    ? suggestions.books.filter((b) => b.id !== sequel.id)
    : queue.length > 0
      ? suggestions.books
      : more;

  // Named by level only when the row really is one level.
  const rowLevel = row.every((b) => b.level === row[0]?.level) ? row[0]?.level : undefined;
  const heading = rowLevel ? t('home.nextAt', { level: rowLevel }) : t('home.next');

  // Where the books would be, for a reader who is not signed in.
  const signInHint = !signedIn && !authLoading && (
    <section className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
      <Library className="h-6 w-6 shrink-0 text-primary-dark" />
      <p className="min-w-0 flex-[1_1_16rem] text-sm leading-6 text-muted-foreground">
        {tDesk('home.signInHint')}
      </p>
      <Button variant="outline" onClick={() => setSignInOpen(true)}>
        {tDesk('home.signIn')}
      </Button>
    </section>
  );

  return (
    <ReaderShell>
      {documentsError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error"
        >
          <span className="min-w-0 flex-1">{documentsError}</span>
          <Button variant="outline" size="sm" onClick={() => void loadDocuments()}>
            {tDesk('home.retry')}
          </Button>
        </div>
      ) : loading ? (
        <div data-testid="reader-loading" className="h-36 animate-pulse rounded-2xl bg-muted" />
      ) : queue.length > 0 ? (
        <div className="space-y-8">
          <ReaderQueue
            items={queue}
            onChanged={() => {
              void loadDocuments();
              if (signedIn) void loadCloud();
            }}
            lead={
              sequel ? (
                <ReaderStartPanel
                  book={sequel}
                  eyebrow={t('home.finishedNext', { title: latest.title })}
                />
              ) : undefined
            }
          />
          {signInHint}
          <ReaderSuggestions heading={heading} books={row} />
        </div>
      ) : (
        <div className="space-y-8">
          {first ? (
            <ReaderStartPanel book={first} />
          ) : (
            <section className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <FileUp className="h-8 w-8 text-primary-dark" />
              <h2 className="text-base font-semibold text-foreground">{t('library.empty')}</h2>
              <p className="max-w-md text-sm text-muted-foreground">{t('library.emptyBody')}</p>
            </section>
          )}
          {signInHint}
          <ReaderSuggestions heading={heading} books={row} />
        </div>
      )}

      {signedIn && cloudFailed && !loading && (
        <p role="status" className="mt-6 text-xs text-muted-foreground">
          {tDesk('home.libraryFailed')}
        </p>
      )}

      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        onSignedIn={() => setSignInOpen(false)}
      />
    </ReaderShell>
  );
}
