// Turns a catalogue video's transcript into what the shared player reads, and builds the little
// vocabulary analysis the sidebar's Stats / Vocab / Analysis tabs show for it.

import { invoke } from '@tauri-apps/api/core';
import type { NlpAnalysis, PodcastTranscriptSegment } from '@/pages/podcast/types';
import type { VideoTranscriptSegment } from './videosApi';

/**
 * YouTube's auto-captions roll: every cue runs past the next one's start, so at any instant TWO cues
 * match. The subtitle bar takes the FIRST match — the line already finishing, ~2 s behind the audio.
 * The line actually spoken is the LAST cue that has started, so each cue ends where the next begins:
 * exactly one cue matches at any time. Cues without words get none; the bar splits the text itself
 * and looks every word's CEFR level up (">>" speaker marks are not words, so they stay unclickable).
 */
export function toPodcastSegments(
  episodeId: string,
  language: string,
  segments: VideoTranscriptSegment[],
): PodcastTranscriptSegment[] {
  const sorted = [...segments]
    .filter((s) => s.text && s.text.trim() && Number.isFinite(s.start))
    .sort((a, b) => a.start - b.start);
  return sorted.map((seg, i) => {
    const next = sorted[i + 1];
    let end = Number.isFinite(seg.end) ? seg.end : seg.start + 2;
    if (next && next.start > seg.start && next.start < end) end = next.start;
    end = Math.max(end, seg.start + 0.05);
    return {
      id: `video-${episodeId}-${i}`,
      episodeId,
      text: seg.text.replace(/\s+/g, ' ').trim(),
      startMs: Math.round(seg.start * 1000),
      endMs: Math.round(end * 1000),
      confidence: 1,
      language,
      words: [],
    };
  });
}

// ── Vocabulary analysis ─────────────────────────────────────────────────────

const WORD_RE = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu;
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const MAX_LOOKUP = 2400;
const CHUNK = 400;
const TOP_WORDS = 200;

export function countWords(texts: string[]): { total: number; counts: Map<string, number> } {
  const counts = new Map<string, number>();
  let total = 0;
  for (const text of texts) {
    for (const m of text.matchAll(WORD_RE)) {
      const w = m[0].toLowerCase().replace(/^['’-]+|['’-]+$/g, '');
      if (w.length < 2) continue;
      total += 1;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return { total, counts };
}

/** The level that covers 80% of the leveled words — a learner at that level meets most of this video. */
export function overallLevel(distribution: Record<string, number>): string | undefined {
  const sum = LEVELS.reduce((n, l) => n + (distribution[l] ?? 0), 0);
  if (sum === 0) return undefined;
  let run = 0;
  for (const l of LEVELS) {
    run += distribution[l] ?? 0;
    if (run / sum >= 0.8) return l;
  }
  return 'C2';
}

export interface LeveledWords {
  distribution: Record<string, number>;
  top: { word: string; count: number; cefr: string }[];
}

export function levelWords(counts: Map<string, number>, levels: Map<string, string>): LeveledWords {
  const distribution: Record<string, number> = {};
  const rows: { word: string; count: number; cefr: string }[] = [];
  for (const [word, count] of counts) {
    const cefr = levels.get(word);
    if (cefr) distribution[cefr] = (distribution[cefr] ?? 0) + 1;
    rows.push({ word, count, cefr: cefr ?? 'unknown' });
  }
  rows.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
  return { distribution, top: rows.filter((r) => r.word.length >= 3).slice(0, TOP_WORDS) };
}

/** Counts the transcript's words and asks the app's word-level table for each one's CEFR level. */
export async function analyseTranscript(
  episodeId: string,
  lang: string,
  segments: PodcastTranscriptSegment[],
): Promise<NlpAnalysis | null> {
  const { total, counts } = countWords(segments.map((s) => s.text));
  if (total === 0) return null;
  const frequent = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_LOOKUP)
    .map(([w]) => w);
  const levels = new Map<string, string>();
  for (let i = 0; i < frequent.length; i += CHUNK) {
    try {
      const rows = await invoke<[string, string][]>('podcast_get_words_cefr', {
        words: frequent.slice(i, i + CHUNK),
        lang,
      });
      for (const [w, l] of rows) levels.set(w.toLowerCase(), l);
    } catch {
      break; // unsupported language: the words stay unleveled
    }
  }
  const leveled = levelWords(counts, levels);
  const sentences = Math.max(1, segments.length);
  return {
    id: `video-${episodeId}`,
    episodeId,
    totalWords: total,
    uniqueWords: counts.size,
    cefrLevel: overallLevel(leveled.distribution),
    cefrDistribution: JSON.stringify(leveled.distribution),
    avgSentenceLength: total / sentences,
    vocabularyRichness: counts.size / total,
    topWords: JSON.stringify(leveled.top),
    createdAt: new Date().toISOString(),
  };
}
