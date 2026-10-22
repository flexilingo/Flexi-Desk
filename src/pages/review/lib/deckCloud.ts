// Everything the Decks and Explore screens say to the website. Cloud calls go through
// `supabaseCall` only; everything that touches the local library goes through the
// `deck_*` / `srs_*` commands. The orchestration (publish, save-to-library) lives here so
// it can be tested with both sides mocked.

import { invoke } from '@tauri-apps/api/core';
import { supabaseCall } from '@/lib/supabase';
import { isAuthError, parseCloudError } from '@/lib/cloudError';
import { isAiSetupError } from '@/lib/aiSource';
import { useAuthStore } from '@/stores/authStore';
import { useLanguageStore } from '@/hooks/useLanguageSettings';
import type { CardNotes, DeckWithStats, RawDeckWithStats } from '../types';
import { mapDeck } from '../types';
import {
  cloneTitle,
  decideCloneMode,
  deckMeaningLang,
  deckSourceLang,
  inAuthorOrder,
  parseCardNotes,
  publicDeckTitle,
  withoutMeaningLanguage,
  type CloneMode,
  type PublicDeckSummary,
} from './deckLogic';

// ── Errors ─────────────────────────────────────────────────

/** A failure the UI can translate: `code` is a SCREAMING_SNAKE_CASE key in `decks:errors`. */
export class DeckCloudError extends Error {
  constructor(
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'DeckCloudError';
  }
}

/** Reduce anything thrown by a cloud or local call to one translatable code. */
export function errorCode(err: unknown): string {
  if (err instanceof DeckCloudError) return err.code;
  const e = parseCloudError(err);
  if (isAuthError(e)) return 'SIGN_IN_REQUIRED';
  if (e.status === 404) return e.code || 'DECK_NOT_FOUND';
  if (e.status === 403 && !e.code) return 'FORBIDDEN';
  if (e.code) return e.code;
  const text = e.message;
  if (/OLLAMA_NOT_RUNNING|OLLAMA_MODEL_MISSING|AI_KEY_MISSING/.test(text))
    return 'LOCAL_AI_UNAVAILABLE';
  if (/CARD_DUPLICATE|UNIQUE|already|duplicate/i.test(text)) return 'CARD_DUPLICATE';
  if (/error sending request|Failed to send|network|timed? ?out|API request failed/i.test(text)) {
    return 'NETWORK_ERROR';
  }
  return 'UNKNOWN_ERROR';
}

export function isSignedIn(): boolean {
  return !!useAuthStore.getState().session;
}

function requireSession() {
  if (!isSignedIn()) throw new DeckCloudError('SIGN_IN_REQUIRED');
}

// ── Cloud shapes ───────────────────────────────────────────

export interface CloudCard {
  id: string;
  front_text: string;
  back_text: string;
  notes: string | null;
  tags?: string[] | null;
  order_index?: number | null;
  ai_processing_status?: string | null;
}

export interface CloudDeck {
  id: string;
  title: string;
  description: string | null;
  card_count: number;
  language_pair: string | null;
  is_public: boolean;
  user_id: string | null;
  created_at: string;
  total_clones?: number | null;
  tags?: string[] | null;
  source_url?: string | null;
  source_type?: string | null;
  source_public?: boolean | null;
  cover_url?: string | null;
}

export interface CloudDeckPage extends CloudDeck {
  cards?: CloudCard[];
  pagination?: { page: number; page_size: number; total_count: number; total_pages: number };
  ai_stats?: { queued: number; processing: number; failed: number };
}

// ── Explore ────────────────────────────────────────────────

export async function listPublicDecks(opts: {
  search?: string;
  sort?: 'recent' | 'popular';
}): Promise<PublicDeckSummary[]> {
  const q = new URLSearchParams();
  if (opts.search?.trim()) q.set('search', opts.search.trim());
  q.set('sort', opts.sort ?? 'recent');
  const data = await supabaseCall<PublicDeckSummary[]>('GET', `/decks-public?${q.toString()}`);
  return Array.isArray(data) ? data : [];
}

export async function getDeckPage(
  deckId: string,
  opts: {
    page?: number;
    pageSize?: number;
    search?: string;
    lite?: boolean;
    includeCards?: boolean;
  } = {},
): Promise<CloudDeckPage> {
  const q = new URLSearchParams({
    id: deckId,
    page: String(opts.page ?? 1),
    page_size: String(opts.pageSize ?? 20),
    include_cards: String(opts.includeCards ?? true),
  });
  if (opts.search?.trim()) q.set('search', opts.search.trim());
  if (opts.lite) q.set('fields', 'lite');
  return supabaseCall<CloudDeckPage>('GET', `/deck-details?${q.toString()}`);
}

/** Every card of a cloud deck, in the author's order. */
export async function fetchAllCards(deckId: string): Promise<CloudCard[]> {
  const out: CloudCard[] = [];
  for (let page = 1; page <= 200; page++) {
    const res = await getDeckPage(deckId, { page, pageSize: 100 });
    out.push(...(res.cards ?? []));
    if (page >= (res.pagination?.total_pages ?? 1)) break;
  }
  return inAuthorOrder(out);
}

/** The front texts a cloud deck already holds (word-list mode: one request per 1000). */
async function fetchFronts(deckId: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (let page = 1; page <= 50; page++) {
    const res = await getDeckPage(deckId, { page, pageSize: 1000, lite: true });
    for (const c of res.cards ?? []) out.add((c.front_text ?? '').trim().toLowerCase());
    if (page >= (res.pagination?.total_pages ?? 1)) break;
  }
  return out;
}

// ── Publish / share ────────────────────────────────────────

interface Snapshot {
  id: string;
  name: string;
  description: string | null;
  language: string;
  native_language: string | null;
  tags: string[];
  is_public: boolean;
  source_url: string | null;
  source_type: string | null;
  source_public: boolean;
  cloud_deck_id: string | null;
  cards: { front: string; back: string; notes: string | null }[];
}

export type PublishStep = 'preparing' | 'creating' | 'updating' | 'uploading' | 'done';

export interface PublishResult {
  deck: DeckWithStats;
  cloudDeckId: string;
  /** True when this push made a new website deck (the first publish, or the old one was deleted). */
  created: boolean;
  cardsAdded: number;
  totalClones: number;
  isPublic: boolean;
}

const BULK_CHUNK = 200;

/**
 * Push a local deck to the website — the first half of Publish / Share.
 *
 * - First time: create the website deck, upload the cards, remember its id.
 * - Again: update the website deck's details and upload only the cards whose front text
 *   it does not hold yet (so a second Publish never duplicates; edits to existing cards
 *   are not overwritten).
 * - The website deck was deleted online: make a new one and re-link.
 *
 * `visibility` (when given) is written to the website deck and mirrored locally, so the
 * badge on the deck always says what Explore shows.
 */
export async function publishDeck(
  deckId: string,
  opts: {
    visibility?: { isPublic?: boolean; sourcePublic?: boolean };
    onStep?: (step: PublishStep) => void;
  } = {},
): Promise<PublishResult> {
  const step = opts.onStep ?? (() => {});
  requireSession();
  step('preparing');

  const snap = await invoke<Snapshot>('deck_cloud_snapshot', { deckId });
  if (snap.cards.length === 0) throw new DeckCloudError('DECK_EMPTY');

  const lang = useLanguageStore.getState();
  const pair = `${snap.language}-${snap.native_language ?? lang.nativeLang}`;
  const isPublic = opts.visibility?.isPublic ?? snap.is_public;
  const sourcePublic = opts.visibility?.sourcePublic ?? snap.source_public;
  const details = {
    title: snap.name,
    description: snap.description,
    tags: snap.tags,
    language_pair: pair,
    is_public: isPublic,
    source_public: sourcePublic,
    ...(snap.source_url ? { source_url: snap.source_url, source_type: snap.source_type } : {}),
  };

  let cloudId = snap.cloud_deck_id;
  let existingFronts: Set<string> | null = null;
  let totalClones = 0;
  if (cloudId) {
    try {
      const head = await getDeckPage(cloudId, { includeCards: false, pageSize: 1 });
      totalClones = head.total_clones ?? 0;
      step('updating');
      await supabaseCall('PATCH', `/decks?id=${encodeURIComponent(cloudId)}`, details);
      existingFronts = await fetchFronts(cloudId);
    } catch (err) {
      const parsed = parseCloudError(err);
      // Deleted online (or no longer ours): fall through and make a new one.
      if (parsed.status === 404 || parsed.status === 403) cloudId = null;
      else throw err;
    }
  }

  let created = false;
  if (!cloudId) {
    step('creating');
    const made = await supabaseCall<{ id?: string }>('POST', '/decks?action=create', details);
    if (!made?.id) throw new DeckCloudError('CLOUD_DECK_NOT_CREATED');
    cloudId = made.id;
    created = true;
    existingFronts = new Set();
  }

  step('uploading');
  const fresh = snap.cards.filter((c) => !existingFronts!.has(c.front.trim().toLowerCase()));
  for (let i = 0; i < fresh.length; i += BULK_CHUNK) {
    await supabaseCall('POST', '/decks?action=bulk-add-cards', {
      deck_id: cloudId,
      cards: fresh.slice(i, i + BULK_CHUNK).map((c) => ({
        front_text: c.front,
        back_text: c.back,
        notes: c.notes,
      })),
    });
  }

  // The link is saved only now: a push that failed half-way leaves the deck unlinked, so
  // the next Publish starts clean instead of trusting a half-filled website deck.
  let raw = await invoke<RawDeckWithStats>('deck_set_cloud_link', {
    deckId,
    cloudDeckId: cloudId,
    totalClones,
  });
  if (opts.visibility) {
    raw = await invoke<RawDeckWithStats>('srs_update_deck', {
      id: deckId,
      isPublic: opts.visibility.isPublic,
      sourcePublic: opts.visibility.sourcePublic,
    });
  }
  const deck = mapDeck(raw);
  step('done');
  return { deck, cloudDeckId: cloudId, created, cardsAdded: fresh.length, totalClones, isPublic };
}

export interface ShareLink {
  share_code: string;
  share_url: string;
  expires_at: string | null;
}

export async function createShareLink(
  cloudDeckId: string,
  opts: { includeSource?: boolean; expiresInDays?: number | null } = {},
): Promise<ShareLink> {
  requireSession();
  return supabaseCall<ShareLink>('POST', '/generate-share-link', {
    deck_id: cloudDeckId,
    include_source: !!opts.includeSource,
    ...(opts.expiresInDays ? { expires_in_days: opts.expiresInDays } : {}),
  });
}

export interface DeckShare {
  id: string;
  deck_id: string;
  share_code: string;
  is_active: boolean;
  view_count: number;
  clone_count: number;
  created_at: string;
  expires_at: string | null;
  deck: { id: string; title: string } | null;
}

export async function listShares(): Promise<DeckShare[]> {
  requireSession();
  const res = await supabaseCall<{ shares?: DeckShare[] }>('GET', '/list-deck-shares');
  return res?.shares ?? [];
}

export async function revokeShare(shareId: string): Promise<void> {
  requireSession();
  await supabaseCall('PATCH', '/list-deck-shares', { share_id: shareId });
}

/** A link is live while it is active and not past its expiry. */
export function isShareActive(
  share: Pick<DeckShare, 'is_active' | 'expires_at'>,
  now = Date.now(),
): boolean {
  const expired = share.expires_at ? new Date(share.expires_at).getTime() < now : false;
  return share.is_active && !expired;
}

/** The link the website serves for a share code. */
export const SHARE_ORIGIN = 'https://www.flexilingo.com';
export function shareUrlFor(code: string, locale = 'en'): string {
  return `${SHARE_ORIGIN}/${locale}/share/${code}`;
}

// ── Shared reviews (friends) ───────────────────────────────

export interface SharedReview {
  share_id: string;
  session: {
    id: string;
    session_name: string | null;
    total_cards: number;
    completed_cards: number;
    correct_count: number;
    incorrect_count: number;
    started_at: string;
    status: string;
  };
  shared_by: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  shared_at: string;
}

export async function listSharedReviews(): Promise<SharedReview[]> {
  requireSession();
  const res = await supabaseCall<{ reviews?: SharedReview[] }>(
    'GET',
    '/review-session?action=list-shared&limit=50&offset=0',
  );
  return res?.reviews ?? [];
}

export interface SharedReviewDetail {
  session: SharedReview['session'];
  shared_by: SharedReview['shared_by'];
  shared_at: string;
  cards: {
    id: string;
    front_text: string;
    back_text: string;
    notes: string | null;
    session_result?: { was_correct: boolean; response_time_ms: number } | null;
  }[];
}

export async function getSharedReview(sessionId: string): Promise<SharedReviewDetail> {
  requireSession();
  return supabaseCall<SharedReviewDetail>(
    'GET',
    `/review-session?action=get-shared&session_id=${encodeURIComponent(sessionId)}`,
  );
}

export interface FriendProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio?: string | null;
  follow_status?: string | null;
}

export type FriendTab = 'mutual' | 'followers' | 'following';

export async function listFriends(type: FriendTab): Promise<FriendProfile[]> {
  requireSession();
  const res = await supabaseCall<{ users?: FriendProfile[] }>('GET', `/list-follows?type=${type}`);
  return res?.users ?? [];
}

export async function searchUsers(q: string): Promise<FriendProfile[]> {
  requireSession();
  const res = await supabaseCall<{ users?: FriendProfile[] }>(
    'GET',
    `/search-users?q=${encodeURIComponent(q)}&limit=50`,
  );
  return res?.users ?? [];
}

export async function shareReview(
  sessionId: string,
  userIds: string[],
): Promise<{ alreadyShared: boolean; count: number }> {
  requireSession();
  const res = await supabaseCall<{
    already_shared?: boolean;
    newly_shared?: number;
    shares?: unknown[];
  }>('POST', '/review-session?action=share', {
    session_id: sessionId,
    shared_with_user_ids: userIds,
  });
  return {
    alreadyShared: !!res?.already_shared,
    count: res?.newly_shared ?? res?.shares?.length ?? userIds.length,
  };
}

// ── Saving a public deck into the library ──────────────────

interface WordResult {
  word?: string;
  translation?: string | null;
  definition?: string | null;
  partOfSpeech?: string | null;
  difficulty?: string | null;
  ipa?: string | null;
  tip?: string | null;
  synonyms?: string[] | null;
  examples?: { source?: string; target?: string }[] | null;
}

export type SaveStage = 'fetching' | 'translating' | 'cloud-translating' | 'saving';
export interface SaveProgress {
  stage: SaveStage;
  done: number;
  total: number;
}

export interface SaveRequest {
  deck: Pick<
    PublicDeckSummary,
    | 'id'
    | 'title'
    | 'description'
    | 'language_pair'
    | 'tags'
    | 'source_url'
    | 'source_type'
    | 'source_public'
    | 'cover_url'
    | 'card_count'
  >;
  /** Language the learner wants the meanings in. */
  targetLanguage: string;
  /** Translation quality: basic = word for word, smart = definitions, IPA and examples too. */
  quality: 'basic' | 'smart';
  algorithm?: string;
  /**
   * The learner switched FlexiLingo's cloud AI on (and is signed in and paid): translate on the
   * website. Otherwise the cloud is never used; the learner's own AI translates.
   */
  allowCloud?: boolean;
  onProgress?: (p: SaveProgress) => void;
}

export interface SaveResult {
  deck: DeckWithStats;
  mode: CloneMode;
  /** True when the learner's opt-in cloud AI did the translation. */
  usedCloud: boolean;
  created: boolean;
  added: number;
  skipped: number;
}

interface ImportCard {
  front: string;
  back: string;
  notes: string | null;
  tags: string[];
}

/** An exact copy: the author's meanings and notes as published (origin fields already stripped). */
export function copyCards(cards: CloudCard[]): ImportCard[] {
  return inAuthorOrder(cards).map((c) => ({
    front: c.front_text,
    back: c.back_text ?? '',
    notes: c.notes,
    tags: c.tags ?? [],
  }));
}

function notesWithMeaning(
  original: string | null,
  front: string,
  fromLang: string,
  w: WordResult | undefined,
  smart: boolean,
): string | null {
  const base: CardNotes = (() => {
    const parsed = parseCardNotes(original);
    // The author's meaning-language fields are useless in another language.
    return parsed ? withoutMeaningLanguage(parsed, front) : {};
  })();
  const notes: Record<string, unknown> = { ...base, learning_lang: base.learning_lang ?? fromLang };
  if (smart && w) {
    notes.generated_by = 'smart_ai';
    if (w.definition) notes.definition = w.definition;
    if (w.ipa && !notes.ipa) notes.ipa = w.ipa;
    if (w.partOfSpeech && !notes.part_of_speech) notes.part_of_speech = w.partOfSpeech;
    if (w.difficulty && !notes.cefr_level) notes.cefr_level = w.difficulty;
    if (w.synonyms?.length) notes.synonyms = w.synonyms;
    if (w.tip) notes.tip = w.tip;
    if (w.examples?.length) {
      notes.examples = w.examples.map((e) => ({ source: e.source ?? '', target: e.target ?? '' }));
    }
  } else if (w) {
    notes.generated_by = 'basic_ai';
  }
  return JSON.stringify(notes);
}

const TRANSLATE_CHUNK = 20;

/**
 * Translate a deck's words on the on-device model (free). Throws if the model is not
 * available, so the caller can fall back to the website's translation; a word the model
 * returns nothing for keeps an empty meaning rather than aborting the whole deck.
 */
export async function translateCardsLocally(
  cards: CloudCard[],
  fromLang: string,
  toLang: string,
  quality: 'basic' | 'smart',
  onProgress?: (done: number, total: number) => void,
): Promise<ImportCard[]> {
  const ordered = inAuthorOrder(cards);
  const out: ImportCard[] = [];
  for (let i = 0; i < ordered.length; i += TRANSLATE_CHUNK) {
    const chunk = ordered.slice(i, i + TRANSLATE_CHUNK);
    const results = await invoke<WordResult[]>('ai_translate_words', {
      words: chunk.map((c) => c.front_text),
      mode: quality,
      nativeLang: toLang,
      targetLang: fromLang,
      sentenceContext: '',
    });
    const byWord = new Map<string, WordResult>();
    results.forEach((r) => r.word && byWord.set(r.word.trim().toLowerCase(), r));
    chunk.forEach((card, idx) => {
      const w = byWord.get(card.front_text.trim().toLowerCase()) ?? results[idx];
      out.push({
        front: card.front_text,
        back: (w?.translation ?? '').trim(),
        notes: notesWithMeaning(card.notes, card.front_text, fromLang, w, quality === 'smart'),
        tags: card.tags ?? [],
      });
    });
    onProgress?.(Math.min(i + chunk.length, ordered.length), ordered.length);
  }
  return out;
}

/** The website's own translation: it makes a deck in the learner's account, which is then read back. */
async function cloudTranslate(
  deckId: string,
  toLang: string,
  quality: 'basic' | 'smart',
  onProgress?: (p: SaveProgress) => void,
): Promise<{ cards: CloudCard[]; cloudDeckId: string }> {
  requireSession();
  onProgress?.({ stage: 'cloud-translating', done: 0, total: 1 });
  const res = await supabaseCall<{ new_deck_id?: string; deck?: { id?: string } }>(
    'POST',
    '/clone-deck?action=translate',
    { deck_id: deckId, target_language: toLang, mode: quality },
  );
  const cloudDeckId = res?.new_deck_id ?? res?.deck?.id;
  if (!cloudDeckId) throw new DeckCloudError('CLOUD_DECK_NOT_CREATED');

  // The website translates in the background; wait until nothing is queued any more.
  for (let attempt = 0; attempt < 40; attempt++) {
    const head = await getDeckPage(cloudDeckId, { includeCards: true, pageSize: 1 });
    const s = head.ai_stats ?? { queued: 0, processing: 0, failed: 0 };
    const pending = s.queued + s.processing;
    const total = head.pagination?.total_count ?? 0;
    onProgress?.({
      stage: 'cloud-translating',
      done: Math.max(total - pending, 0),
      total: Math.max(total, 1),
    });
    if (pending === 0) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { cards: await fetchAllCards(cloudDeckId), cloudDeckId };
}

/**
 * Add a public deck to the local library in the language the learner picked.
 *
 * Same meaning language as the deck → an instant copy. Another language → a translated
 * copy: on the learner's own AI (basic or smart); the website translates only when the
 * learner switched cloud AI on (`allowCloud`). A missing own AI is an error, never a silent fallback. Saving again tops up the copy
 * that is already there (see `deck_import_public`) — it never duplicates the deck.
 */
export async function saveToLibrary(req: SaveRequest): Promise<SaveResult> {
  const { deck, targetLanguage, quality, onProgress } = req;
  const cardsLang = deckSourceLang(deck.language_pair);
  const deckMeaning = deckMeaningLang(deck.language_pair) ?? cardsLang;
  const mode = decideCloneMode(deckMeaning, targetLanguage);

  onProgress?.({ stage: 'fetching', done: 0, total: deck.card_count });
  const source = await fetchAllCards(deck.id);
  if (source.length === 0) throw new DeckCloudError('DECK_EMPTY');

  let cards: ImportCard[];
  let usedCloud = false;
  let cloudDeckId: string | null = null;
  if (mode === 'copy') {
    cards = copyCards(source);
  } else {
    if (req.allowCloud) {
      requireSession();
      const viaCloud = await cloudTranslate(deck.id, targetLanguage, quality, onProgress);
      cards = copyCards(viaCloud.cards);
      cloudDeckId = viaCloud.cloudDeckId;
      usedCloud = true;
    } else {
      try {
        cards = await translateCardsLocally(
          source,
          cardsLang,
          targetLanguage,
          quality,
          (done, total) => onProgress?.({ stage: 'translating', done, total }),
        );
      } catch (err) {
        if (isAiSetupError(err)) throw new DeckCloudError('LOCAL_AI_UNAVAILABLE', String(err));
        throw err;
      }
    }
  }

  onProgress?.({ stage: 'saving', done: cards.length, total: cards.length });
  const result = await invoke<{
    deck: RawDeckWithStats;
    created: boolean;
    added: number;
    skipped: number;
  }>('deck_import_public', {
    input: {
      original_deck_id: deck.id,
      title: cloneTitle(deck.title, mode, targetLanguage),
      description: deck.description,
      language: cardsLang,
      native_language: targetLanguage,
      tags: deck.tags ?? [],
      source_url: deck.source_public ? deck.source_url : null,
      source_type: deck.source_public ? deck.source_type : null,
      cover_url: deck.cover_url ?? null,
      algorithm: req.algorithm ?? null,
      cloud_deck_id: cloudDeckId,
      cards,
    },
  });
  return {
    deck: mapDeck(result.deck),
    mode,
    usedCloud,
    created: result.created,
    added: result.added,
    skipped: result.skipped,
  };
}

export { publicDeckTitle };
