/** The engine's public surface. The UI imports from here; everything else in `src/engine/` is internal. */
export { contextFor } from './candidates';
export { DEFAULT_LIMIT, DEFAULT_WEIGHTS, LOW_USAGE, suggest } from './suggest';
export { SIGNAL_NAMES } from './types';
export type {
  EngineSnapshot,
  Note,
  Reason,
  SignalName,
  SignalScore,
  Suggestion,
  SuggestContext,
  SuggestOptions,
  SuggestResult,
} from './types';
