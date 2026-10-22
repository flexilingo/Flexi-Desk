/**
 * "Download for offline": the whole index and every topic of a language, plus the
 * verb list. Individual verb pages (7,300 of them) are stored when first opened.
 *
 * Runs through the same client the screens use with `force`, so a download is also
 * a refresh. Topics are fetched a few at a time; one failure does not stop the
 * rest, it is counted and reported so the button can say "retry".
 */
import { indexWithFallback, type CheatsheetClient } from './client';

export type DownloadPhase = 'index' | 'topics' | 'verbs' | 'done';

export type DownloadProgress = {
  phase: DownloadPhase;
  done: number;
  total: number;
  failed: number;
  /** The explain locale actually downloaded (English when the reader's has no content). */
  locale: string;
};

const CONCURRENCY = 4;

export async function downloadForOffline(
  client: CheatsheetClient,
  lang: string,
  locale: string,
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<DownloadProgress> {
  const p: DownloadProgress = { phase: 'index', done: 0, total: 1, failed: 0, locale };
  const report = () => onProgress({ ...p });
  const aborted = () => signal?.aborted === true;
  report();

  // 1. The index decides which locale there is to download, and what the topics are.
  // The coverage list and the stats ride along so the landing page works offline too.
  const found = await indexWithFallback(client, lang, locale);
  p.locale = found.locale;
  // A forced re-read, so the stored index is the server's current one.
  const fresh = await client.getIndex(lang, found.locale, { force: true });
  const topics = fresh?.data ?? found.data;
  await client.getCoverage(lang);
  await client.getStats(lang, found.locale);
  p.done = 1;
  report();
  if (aborted()) return p;

  // 2. Every topic.
  p.phase = 'topics';
  p.done = 0;
  p.total = topics.length;
  report();
  let next = 0;
  const worker = async () => {
    while (!aborted()) {
      const t = topics[next++];
      if (!t) return;
      try {
        const res = await client.getTopic(lang, found.locale, t.slug, { force: true });
        if (!res) p.failed++;
      } catch {
        p.failed++;
      }
      p.done++;
      report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, topics.length) }, worker));
  if (aborted()) return p;

  // 3. The verb lists (glossed, and the whole catalogue).
  p.phase = 'verbs';
  p.done = 0;
  p.total = 2;
  report();
  for (const all of [false, true]) {
    try {
      await client.getVerbList(lang, found.locale, all, { force: true });
    } catch {
      p.failed++;
    }
    p.done++;
    report();
    if (aborted()) return p;
  }

  p.phase = 'done';
  report();
  return p;
}
