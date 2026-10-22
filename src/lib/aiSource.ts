/**
 * Where an AI feature runs. One policy for the whole app.
 *
 * Desk's promise: AI work uses the user's OWN AI by default - the model on their
 * computer, or their own key - so their machine does the work. FlexiLingo's cloud
 * AI is used only when the user switched it on themselves, is signed in, and has a
 * paid plan. Nothing ever falls back to the cloud silently: if the user's AI is not
 * set up, the answer is "unconfigured" and the UI shows the setup card.
 *
 * Pure on purpose: the store/hook gather the facts, this decides.
 */

export type AiProviderId = 'ollama' | 'openai' | 'anthropic';

/** Why the user's own AI cannot answer yet. */
export type AiNotReadyReason =
  | 'local_not_installed'
  | 'local_not_running'
  | 'local_no_model'
  | 'local_model_missing'
  | 'key_missing';

/** Where a given answer came from, for the small badge next to it. */
export type AiOrigin = 'device' | 'own_key' | 'cloud';

export type AiSource =
  /** Facts are still loading. Do not call anything yet. */
  | { kind: 'checking' }
  /** The user's own AI is set up and reachable. */
  | { kind: 'own'; origin: 'device' | 'own_key'; provider: AiProviderId; model: string | null }
  /** The user opted into FlexiLingo's cloud AI and is entitled to it. */
  | { kind: 'cloud'; origin: 'cloud' }
  /** The user's own AI is not ready. Show the setup card. */
  | { kind: 'unconfigured'; provider: AiProviderId; reason: AiNotReadyReason };

/** Tiers front treats as paid - keep in lockstep with `PAID_TIERS` in the subscription store. */
export const CLOUD_AI_TIERS = ['pro', 'lifetime', 'pro_max', 'trial'] as const;

export function isCloudTier(tier: string | undefined | null): boolean {
  return (CLOUD_AI_TIERS as readonly string[]).includes(tier ?? '');
}

export interface AiFacts {
  /** Settings have been read. */
  loaded: boolean;
  /** `ai_provider`; an unset value means the on-device model. */
  provider: AiProviderId;
  model: string | null;
  /** A key is stored for the chosen provider (or a custom address that needs none). */
  hasCredentials: boolean;
  /** On-device model facts. `null` while unknown. */
  local: {
    installed: boolean;
    running: boolean;
    models: string[];
  } | null;
  /** The "Use FlexiLingo cloud AI" switch. Off by default. */
  cloudOptIn: boolean;
  signedIn: boolean;
  tier: string | null | undefined;
  /** The subscription answer has arrived (only matters when the switch is on). */
  tierKnown: boolean;
}

const stripLatest = (name: string) => name.replace(/:latest$/, '');

/** Is the cloud route open to this user right now? All three conditions, never fewer. */
export function cloudAiAllowed(f: Pick<AiFacts, 'cloudOptIn' | 'signedIn' | 'tier'>): boolean {
  return f.cloudOptIn && f.signedIn && isCloudTier(f.tier);
}

export function resolveAiSource(f: AiFacts): AiSource {
  if (!f.loaded) return { kind: 'checking' };

  if (f.cloudOptIn && f.signedIn && !f.tierKnown) return { kind: 'checking' };
  if (cloudAiAllowed(f)) return { kind: 'cloud', origin: 'cloud' };

  if (f.provider !== 'ollama') {
    return f.hasCredentials
      ? { kind: 'own', origin: 'own_key', provider: f.provider, model: f.model }
      : { kind: 'unconfigured', provider: f.provider, reason: 'key_missing' };
  }

  if (!f.local) return { kind: 'checking' };
  const { installed, running, models } = f.local;
  if (!running) {
    return {
      kind: 'unconfigured',
      provider: 'ollama',
      reason: installed ? 'local_not_running' : 'local_not_installed',
    };
  }
  if (models.length === 0)
    return { kind: 'unconfigured', provider: 'ollama', reason: 'local_no_model' };
  if (f.model && !models.map(stripLatest).includes(stripLatest(f.model))) {
    return { kind: 'unconfigured', provider: 'ollama', reason: 'local_model_missing' };
  }
  return {
    kind: 'own',
    origin: 'device',
    provider: 'ollama',
    model: f.model ?? stripLatest(models[0]),
  };
}

/** Codes the backend raises when the user's AI cannot answer. */
const SETUP_ERRORS = ['OLLAMA_NOT_RUNNING', 'OLLAMA_MODEL_MISSING', 'AI_KEY_MISSING'] as const;

/** True when a thrown error means "the user's AI is not set up / not running". */
export function isAiSetupError(err: unknown): boolean {
  const text = String(err);
  return SETUP_ERRORS.some((code) => text.includes(code)) || text.includes('AI_NOT_READY');
}

/** The route a feature with both a cloud and an on-device path should take. */
export function routeOf(source: AiSource): 'cloud' | 'local' {
  return source.kind === 'cloud' ? 'cloud' : 'local';
}

/** Provider names the Settings and setup UI offer. */
export const OWN_KEY_DEFAULT_MODEL: Record<Exclude<AiProviderId, 'ollama'>, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
};

/** The local model the one-click setup downloads: small, multilingual, fits most machines. */
export const RECOMMENDED_LOCAL_MODEL = 'llama3.2';

// ── Time limit and Cancel (every call to the user's own AI) ─────────────────
//
// Rust stops a call to the user's AI after a time limit (`AI_TIMEOUT`) or when
// Cancel is pressed (`AI_CANCELLED`): a small model on a slow computer must never
// leave an endless spinner.

/** Settings key of the per-call limit, in seconds (Settings -> My AI). */
export const AI_TIMEOUT_SETTING = 'ai_request_timeout_sec';
export const DEFAULT_AI_TIMEOUT_SEC = 180;
/** The choices Settings offers. */
export const AI_TIMEOUT_OPTIONS_SEC = [60, 180, 300, 600, 1200] as const;

export type AiStopKind = 'timeout' | 'cancelled';

/** Did this AI call end because it took too long, or because the user cancelled it? */
export function aiStopKind(err: unknown): AiStopKind | null {
  const text =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : String(err);
  if (text.includes('AI_TIMEOUT')) return 'timeout';
  if (text.includes('AI_CANCELLED')) return 'cancelled';
  return null;
}

/** "1:05" for 65 seconds - the elapsed time beside a running AI answer. */
export function formatElapsed(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
