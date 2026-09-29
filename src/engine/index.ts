/** The engine's public surface. The UI imports from here; everything else in `src/engine/` is internal. */
export { EXPECTED_ABILITY_MIN_SHARE, IMMUNITY_ABILITIES } from './abilities';
export { contextFor } from './candidates';
export { COMBOS, SPREAD_MIN_BASE_POWER, TRICK_ROOM_MAX_BASE_SPEED } from './combos';
export { MISSING_WEIGHT_FACTOR } from './combine';
export { CAN_LEARN_FACTOR, ROLES, RUN_MIN_SHARE } from './roles';
export { DEFAULT_LIMIT, DEFAULT_WEIGHTS, LOW_USAGE, suggest } from './suggest';
export { SIGNAL_NAMES } from './types';
export type { ComboDef, ComboSide } from './combos';
export type { RoleDef } from './roles';
export type {
  ComboId,
  ComboSource,
  EngineSnapshot,
  Note,
  ProfileSource,
  Reason,
  RoleId,
  RoleSource,
  SignalName,
  SignalScore,
  Suggestion,
  SuggestContext,
  SuggestOptions,
  SuggestResult,
} from './types';
