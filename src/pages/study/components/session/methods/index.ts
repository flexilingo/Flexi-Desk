import type { ComponentType } from 'react';
import type { ActivityType } from '../../../types';
import type { MethodProps } from '../types';
import { RecallMethod } from './RecallMethod';
import { TypeTestMethod } from './TypeTestMethod';
import { ClozeMethod } from './ClozeMethod';
import { SynonymMethod } from './SynonymMethod';
import { MiniReadingMethod } from './MiniReadingMethod';
import { UseInSentenceMethod } from './UseInSentenceMethod';
import { ListenAgainMethod } from './ListenAgainMethod';
import { SpeakTestMethod } from './SpeakTestMethod';

/** activity_type → component. The runner degrades to recall for anything absent. */
export const METHOD_REGISTRY: Record<ActivityType, ComponentType<MethodProps>> = {
  recall: RecallMethod,
  type_test: TypeTestMethod,
  cloze: ClozeMethod,
  synonym_discrim: SynonymMethod,
  mini_reading: MiniReadingMethod,
  use_in_sentence: UseInSentenceMethod,
  listen_again: ListenAgainMethod,
  speak_test: SpeakTestMethod,
};
