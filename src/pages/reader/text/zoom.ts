/**
 * Discrete stops rather than a continuous slider: every change re-rasterises
 * every visible page, so a drag would queue dozens of renders to land on one.
 * 1 is fit-to-width, which is why the ladder is not symmetric around it.
 */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

export const ZOOM_MIN = ZOOM_STEPS[0];
export const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];

/** The next stop up or down from wherever the zoom is now. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((stop) => stop > zoom + 1e-6) ?? ZOOM_MAX;
  return [...ZOOM_STEPS].reverse().find((stop) => stop < zoom - 1e-6) ?? ZOOM_MIN;
}
