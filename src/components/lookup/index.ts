// `keepExtensionOut` is deliberately not ported: it keeps the FlexiLingo browser
// extension's selection icon off the reader, and the desk app has no extension.
export { LookupContext, useLookup, type LookupFn } from './lookup-context';
export { LookupProvider } from './LookupProvider';
export { SpeakButton } from './SpeakButton';
export { TappableText } from './TappableText';
export { useSelectionPhrase, type SelectionChip } from './useSelectionPhrase';
export {
  cleanWord,
  splitParagraphs,
  splitSentences,
  tokenize,
  uniqueWords,
  type Token,
} from './tokenize';
