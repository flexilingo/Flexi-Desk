/**
 * The one <audio> element that plays a library page's pre-generated narration (an https file:
 * the desk's CSP allows `media-src https:`). Its own module so tests can hand the player a fake.
 */
export function createPageAudio(): HTMLAudioElement {
  const audio = new Audio();
  audio.preload = 'auto';
  return audio;
}
