/**
 * Listening Practice Program (the website's `features/listening-program`): three-pass, loop until
 * cracked and dictation over a stretch of the episode, with word pre-teach, LCS-graded dictation, a
 * spaced re-listen queue and a summary that adds missed words to a deck. Public surface for the player.
 */
export {
  ProgramProvider,
  useProgramActions,
  useProgramGate,
  useProgramState,
} from './engine/ProgramProvider';
export { ProgramLayer } from './ui/ProgramLayer';
export { ProgramLauncher } from './ui/ProgramLauncher';
export type { TranscriptSegment } from './lib/clip-math';
