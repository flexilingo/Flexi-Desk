import { useEffect, useRef } from 'react';
import { useAiSourceStore } from '@/stores/aiSourceStore';

/**
 * Starts a per-conversation provider/model choice (Tutor) on the AI the user set up,
 * once, instead of a hard-coded default. After that the user's own picks win.
 */
export function useSeedUserAi(setProvider: (p: string) => void, setModel: (m: string) => void) {
  const ensureLoaded = useAiSourceStore((s) => s.ensureLoaded);
  const loaded = useAiSourceStore((s) => s.loaded);
  const provider = useAiSourceStore((s) => s.provider);
  const model = useAiSourceStore((s) => s.model);
  const seeded = useRef(false);

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  useEffect(() => {
    if (!loaded || seeded.current) return;
    seeded.current = true;
    setProvider(provider);
    if (model) setModel(model);
  }, [loaded, provider, model, setProvider, setModel]);
}
