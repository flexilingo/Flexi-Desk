import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

/** Stops every call to the user's AI that is running now (Rust answers `AI_CANCELLED`). */
export const cancelAiRequests = () => invoke<void>('ai_cancel_requests').catch(() => undefined);

/** Seconds since `startedAt`, ticking once a second; 0 while nothing runs. */
export function useElapsedSeconds(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, Math.round((now - startedAt) / 1000));
}
