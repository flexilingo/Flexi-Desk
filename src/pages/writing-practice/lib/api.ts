import { invoke } from '@tauri-apps/api/core';
import { supabaseCall } from '@/lib/supabase';
import { routeOfId } from './session';
import type {
  SessionRoute,
  UsageInfo,
  WritingExamType,
  WritingPrompt,
  WritingSession,
} from './types';

/**
 * Writing practice on this app. `local` = the model on this computer or the user's own key
 * (Rust commands, SQLite). `cloud` = FlexiLingo's `writing-practice` function, used only
 * when the user switched cloud AI on. Same shapes either way, so the screens never branch.
 */
const FN = '/writing-practice';

export interface CreatedSession {
  session_id: string;
  session: WritingSession;
  prompt: WritingPrompt;
}

export async function startSession(
  route: SessionRoute,
  examType: WritingExamType,
  timerEnabled: boolean,
  difficulty?: string,
): Promise<CreatedSession> {
  if (route === 'local') {
    const prompt = await invoke<WritingPrompt>('wp_generate_prompt', {
      examType,
      difficulty: difficulty ?? null,
    });
    return invoke<CreatedSession>('wp_create_session', { examType, prompt, timerEnabled });
  }
  const diff = difficulty ? `&difficulty=${encodeURIComponent(difficulty)}` : '';
  const prompt = await supabaseCall<WritingPrompt>(
    'GET',
    `${FN}?action=generate-prompt&exam_type=${examType}${diff}`,
  );
  return supabaseCall<CreatedSession>('POST', `${FN}?action=create-session`, {
    prompt_id: prompt.id,
    exam_type: examType,
    timer_enabled: timerEnabled,
  });
}

export function getSession(id: string): Promise<WritingSession> {
  return routeOfId(id) === 'local'
    ? invoke<WritingSession>('wp_get_session', { id })
    : supabaseCall<WritingSession>('GET', `${FN}?action=get-session&id=${encodeURIComponent(id)}`);
}

export async function getActive(route: SessionRoute): Promise<WritingSession | null> {
  const s =
    route === 'local'
      ? await invoke<WritingSession | null>('wp_get_active')
      : await supabaseCall<WritingSession | null>('GET', `${FN}?action=get-active`);
  return s && s.status === 'active' ? s : null;
}

export interface Draft {
  session_id: string;
  essay_text: string;
  word_count: number;
  time_spent_seconds: number;
}

export async function saveDraft(d: Draft): Promise<void> {
  if (routeOfId(d.session_id) === 'local') {
    await invoke('wp_save_draft', {
      sessionId: d.session_id,
      essayText: d.essay_text,
      wordCount: d.word_count,
      timeSpentSeconds: d.time_spent_seconds,
    });
  } else {
    await supabaseCall('POST', `${FN}?action=save-draft`, { ...d });
  }
}

export function submitEssay(d: Draft): Promise<WritingSession> {
  return routeOfId(d.session_id) === 'local'
    ? invoke<WritingSession>('wp_submit', {
        sessionId: d.session_id,
        essayText: d.essay_text,
        wordCount: d.word_count,
        timeSpentSeconds: d.time_spent_seconds,
      })
    : supabaseCall<WritingSession>('POST', `${FN}?action=submit`, { ...d });
}

export async function cancelSession(sessionId: string): Promise<void> {
  if (routeOfId(sessionId) === 'local') await invoke('wp_cancel_session', { sessionId });
  else await supabaseCall('POST', `${FN}?action=cancel`, { session_id: sessionId });
}

export interface HistoryPage {
  sessions: WritingSession[];
  total: number;
  /** Local only: every session of any status. */
  all_total?: number;
}

export function getHistory(route: SessionRoute, limit: number, offset = 0): Promise<HistoryPage> {
  return route === 'local'
    ? invoke<HistoryPage>('wp_history', { limit, offset, examType: null })
    : supabaseCall<HistoryPage>('GET', `${FN}?action=history&limit=${limit}&offset=${offset}`);
}

export function checkUsage(): Promise<UsageInfo> {
  return supabaseCall<UsageInfo>('GET', `${FN}?action=check-usage`);
}
