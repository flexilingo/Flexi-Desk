/**
 * What the shared player offers for a catalogue VIDEO. A video's transcript is FlexiLingo's (machine
 * aligned to the source), so there is nothing to transcribe, no timing to correct, no per-episode
 * feedback form, and nothing to download — the picture streams from YouTube.
 */
export const VIDEO_PLAYER_CAPABILITIES = {
  transcribe: false,
  sync: false,
  feedback: false,
  download: false,
} as const;
