import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { open as pickFile } from '@tauri-apps/plugin-dialog';
import { BookOpen, FileText, FileUp, ImageIcon, Loader2, Lock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { targetLanguages } from '@/config/languages';
import { useLanguageSettings } from '@/hooks/useLanguageSettings';
import {
  checkReaderDuplicate,
  importReaderBytes,
  importReaderPath,
  inspectReaderPath,
} from '../services/readerService';
import { imageToPdf } from '../lib/image-to-pdf';
import { sameFile } from '../lib/duplicate';
import {
  ADD_EXTENSIONS,
  addKindOf,
  baseName,
  imageMimeOf,
  type ChosenFile,
} from '../lib/add-document';
import { buildReadingQueue } from '../lib/queue';
import { progressLine } from '../lib/reading-copy';
import { useReaderErrorText } from '../lib/use-error-text';
import type { ReaderDocument } from '../types';

/** A file the picker chose lives outside the app's folder; its dialog grant lets the fs plugin read it. */
async function readPicked(path: string): Promise<Uint8Array> {
  const data = await invoke<ArrayBuffer | number[]>('plugin:fs|read_file', { path });
  return data instanceof ArrayBuffer ? new Uint8Array(data) : Uint8Array.from(data);
}

/** The chosen file's kind, or an error code when it is neither a PDF nor a supported photo. */
function choose(file: File): ChosenFile | string {
  const kind = addKindOf(file.name, file.type);
  return kind ? { name: file.name, size: file.size, kind, file } : 'UNSUPPORTED_FILE_TYPE';
}

/**
 * Bringing a file in, as a task rather than as furniture — the same flow as the
 * website's upload dialog, minus the upload: the file is copied into this
 * computer's reader folder and never leaves it. No size cap, no Pro gate.
 *
 * `incoming` is a file dropped on the page behind the dialog; each drop has its
 * own `key`, so dropping the same file twice still reaches the dialog.
 */
export function AddDocumentDialog({
  open,
  onOpenChange,
  incoming,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incoming: { file: File; key: number } | null;
}) {
  const { t } = useTranslation('reader');
  const { t: tl } = useTranslation('readingLibrary');
  const { t: tDesk } = useTranslation('readerDesk');
  const errorText = useReaderErrorText();
  const navigate = useNavigate();
  const { targetLang } = useLanguageSettings();

  const [chosen, setChosen] = useState<ChosenFile | null>(null);
  const [language, setLanguage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [duplicates, setDuplicates] = useState<ReaderDocument[]>([]);
  // The reader saw "you already have this" and still asked for a second copy.
  const [addAgain, setAddAgain] = useState(false);
  const [over, setOver] = useState(false);
  // Synchronous guard: a second tap lands before `busy` has re-rendered.
  const submitting = useRef(false);
  const handled = useRef<number | null>(null);

  const chosenLanguage = language || targetLang;
  const existing = useMemo(() => {
    if (!chosen || chosen.kind !== 'pdf') return null;
    const match = sameFile(duplicates, chosen.size);
    return match ? buildReadingQueue([match], undefined)[0] : null;
  }, [chosen, duplicates]);
  const offerExisting = !!existing && !addAgain;

  // A dialog that reopens holding the last attempt's file and error looks
  // broken. Closing it is the reset.
  useEffect(() => {
    if (!open) {
      setChosen(null);
      setError(null);
      setBusy(false);
      setOpening(false);
      setDuplicates([]);
      setAddAgain(false);
      setOver(false);
      submitting.current = false;
    }
  }, [open]);

  const take = useCallback(
    async (next: ChosenFile) => {
      setError(null);
      setAddAgain(false);
      setDuplicates([]);
      setChosen(next);
      if (next.kind !== 'pdf') return;
      try {
        if (next.path) {
          const inspected = await inspectReaderPath(next.path);
          setChosen({ ...next, size: inspected.byte_size });
          setDuplicates(inspected.duplicates);
        } else {
          setDuplicates(await checkReaderDuplicate(next.size));
        }
      } catch (cause) {
        // A list that cannot be read must not block adding; a file that cannot
        // be read at all says so now rather than after the press.
        if (next.path) setError(errorText(cause));
      }
    },
    [errorText],
  );

  const takeFile = useCallback(
    (file: File) => {
      const result = choose(file);
      if (typeof result === 'string') setError(errorText(result));
      else void take(result);
    },
    [errorText, take],
  );

  // A drop on the page behind the dialog.
  useEffect(() => {
    if (!open || !incoming || handled.current === incoming.key) return;
    handled.current = incoming.key;
    takeFile(incoming.file);
  }, [open, incoming, takeFile]);

  const pick = async () => {
    if (busy) return;
    setError(null);
    try {
      const picked = await pickFile({
        multiple: false,
        filters: [{ name: tDesk('upload.filterName'), extensions: [...ADD_EXTENSIONS] }],
      });
      if (typeof picked !== 'string') return;
      const name = baseName(picked);
      const kind = addKindOf(name);
      if (!kind) {
        setError(errorText('UNSUPPORTED_FILE_TYPE'));
        return;
      }
      await take({ name, size: 0, kind, path: picked });
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    // The page behind also listens for drops; this one is the dialog's own.
    event.stopPropagation();
    setOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !busy) takeFile(file);
  };

  // `busy` is released only on failure. On success the dialog stays locked until
  // the document page replaces it: releasing it would re-enable the button while
  // that page loads, and a second press would add the same book again.
  const submit = async () => {
    if (!chosen || submitting.current) return;
    submitting.current = true;
    setError(null);
    setBusy(true);
    try {
      let created: ReaderDocument;
      if (chosen.kind === 'image') {
        let bytes: Uint8Array;
        let pdf: File;
        try {
          const source = chosen.file
            ? chosen.file
            : new File(
                [(await readPicked(chosen.path ?? '')) as Uint8Array<ArrayBuffer>],
                chosen.name,
                {
                  type: imageMimeOf(chosen.name),
                },
              );
          pdf = await imageToPdf(source);
          bytes = new Uint8Array(await pdf.arrayBuffer());
        } catch {
          throw 'INVALID_FILE';
        }
        created = await importReaderBytes(bytes, {
          fileName: pdf.name,
          kind: 'image',
          language: chosenLanguage,
        });
      } else {
        if (!addAgain) {
          // A quick press can beat the check. Ask again before copying anything;
          // if the file is there already, the dialog offers it instead.
          let found: ReaderDocument[];
          let size = chosen.size;
          if (chosen.path) {
            const inspected = await inspectReaderPath(chosen.path);
            found = inspected.duplicates;
            size = inspected.byte_size;
          } else {
            found = await checkReaderDuplicate(chosen.size).catch(() => []);
          }
          if (sameFile(found, size)) {
            setChosen({ ...chosen, size });
            setDuplicates(found);
            submitting.current = false;
            setBusy(false);
            return;
          }
        }
        created = chosen.path
          ? await importReaderPath({ path: chosen.path, language: chosenLanguage })
          : await importReaderBytes(new Uint8Array(await (chosen.file as File).arrayBuffer()), {
              fileName: chosen.name,
              kind: 'pdf',
              language: chosenLanguage,
            });
      }
      setOpening(true);
      navigate(`/reader/pdf/${created.id}`);
    } catch (cause) {
      setError(errorText(cause));
      submitting.current = false;
      setBusy(false);
      setOpening(false);
    }
  };

  const KindIcon = chosen?.kind === 'image' ? ImageIcon : FileText;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-w-xl p-5 sm:p-6"
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onInteractOutside={(e) => busy && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t('upload.heading')}</DialogTitle>
          <DialogDescription>{tDesk('upload.hint')}</DialogDescription>
        </DialogHeader>

        {chosen ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-3.5 py-3">
            <KindIcon className="h-5 w-5 shrink-0 text-primary-dark" />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              <bdi>{chosen.name}</bdi>
            </p>
            <button
              type="button"
              onClick={() => {
                setChosen(null);
                setDuplicates([]);
                setAddAgain(false);
                setError(null);
              }}
              disabled={busy}
              aria-label={tDesk('upload.clear')}
              title={tDesk('upload.clear')}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void pick()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
            className={cn(
              'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm transition-colors',
              over ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
            )}
          >
            <FileUp className="h-6 w-6 text-primary-dark" />
            <span className="font-semibold text-foreground">{t('upload.dropzone')}</span>
          </button>
        )}

        {chosen && offerExisting && existing && (
          <div className="rounded-lg border border-border bg-card px-3.5 py-3">
            <p className="text-sm font-semibold text-foreground">{t('upload.duplicate.title')}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <bdi className="font-semibold">{existing.title}</bdi>
              {progressLine(existing, t, tl) && (
                <>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">{progressLine(existing, t, tl)}</span>
                </>
              )}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              {t('upload.duplicate.body')}
            </p>
          </div>
        )}

        {/* Nothing below means anything until there is a file to ask about. */}
        {chosen && !offerExisting && (
          <div>
            <label
              htmlFor="reader-language"
              className="mb-1.5 block text-xs font-semibold text-muted-foreground"
            >
              {t('upload.language')}
            </label>
            <select
              id="reader-language"
              value={chosenLanguage}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={busy}
              className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            >
              {targetLanguages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name} ({lang.nativeName})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">{t('upload.languageHint')}</p>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-error"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex max-w-[34ch] items-start gap-1.5 text-xs leading-5 text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {tDesk('upload.privacy')}
          </p>
          {offerExisting && existing ? (
            <div className="inline-flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setAddAgain(true)}>
                <FileUp className="h-4 w-4" />
                {tDesk('upload.duplicate.again')}
              </Button>
              <Button
                onClick={() => {
                  navigate(existing.href);
                  onOpenChange(false);
                }}
              >
                <BookOpen className="h-4 w-4" />
                {t('upload.duplicate.open')}
              </Button>
            </div>
          ) : (
            <Button onClick={() => void submit()} disabled={!chosen || busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BookOpen className="h-4 w-4" />
              )}
              {opening
                ? t('upload.opening')
                : busy
                  ? tDesk('upload.submitting')
                  : t('upload.submit')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
