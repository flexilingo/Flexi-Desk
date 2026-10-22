import { useAiSource } from '@/stores/aiSourceStore';
import { routeOf } from '@/lib/aiSource';
import type { SessionRoute } from './types';

/**
 * Where Writing practice runs for this user right now: their own AI (`local`) unless they
 * opted into FlexiLingo's cloud AI (`cloud`, which is when the monthly limit applies).
 */
export function useWritingAi() {
  const ai = useAiSource();
  const route: SessionRoute = routeOf(ai.source);
  return { ...ai, route, cloud: route === 'cloud' };
}
