import type { ID } from '../domain/id';
import type { PokemonSet } from '../domain/set';
import type { Snapshot } from '../domain/types';
import type { TypeName } from './typechart';

/**
 * The slice of the snapshot the engine reads. A full `Snapshot` satisfies it. `learnsets` is optional: without it a
 * species is never credited for a role it merely can learn.
 */
export type EngineSnapshot = Pick<Snapshot, 'species' | 'moves' | 'usage'> & { learnsets?: Snapshot['learnsets'] };

/** A job a team needs done. The role table (`roles.ts`) says which moves and abilities fill each one. */
export type RoleId =
  | 'fakeOut'
  | 'redirection'
  | 'speedControl'
  | 'intimidate'
  | 'weatherTerrain'
  | 'pivot'
  | 'screens'
  | 'support'
  | 'priority'
  | 'disruption';

/** Where a role tag comes from: a move the species runs, its expected ability, or a signature move it can learn. */
export type RoleSource = 'runs' | 'ability' | 'can-learn';

/** Where a profile fact came from: the user's entered set, or ladder usage and species data. */
export type ProfileSource = 'set' | 'ladder';

/** A partner combo. The combo table (`combos.ts`) says what enables each one and what benefits from it. */
export type ComboId = 'trickRoom' | 'redirectSetup' | 'rain' | 'sun' | 'sand' | 'snow' | 'electricTerrain' | 'helpingHand';

/** How a roster member's half of a combo was known: its set, ladder usage, or its species data (base Speed). */
export type ComboSource = 'set' | 'ladder' | 'species';

export type SignalName = 'usageLift' | 'typeSynergy' | 'roleFit' | 'comboFit';

/** All signals, in the order they appear in every `Suggestion.signals`. */
export const SIGNAL_NAMES: readonly SignalName[] = ['usageLift', 'typeSynergy', 'roleFit', 'comboFit'];

/** The draft as the engine sees it. `contextFor` builds one from a derived `DraftState`. */
export interface SuggestContext {
  /** The user's roster so far. */
  roster: ID[];
  /** Species still available (`DraftState.pool`). */
  pool: ID[];
  prices: Record<ID, number>;
  /** Points the user has left. */
  remaining: number;
  /** Roster slots still to fill, including the one this pick will fill. */
  openSlots: number;
  /** The user's entered sets, keyed by species id (`DraftFile.sets`). Optional; malformed entries are ignored. */
  sets?: Record<ID, PokemonSet>;
}

export interface SuggestOptions {
  /** Only candidates whose usage fraction is at most / at least this. A species with no usage entry counts as 0. */
  maxUsage?: number;
  minUsage?: number;
  /** Positive integer; default 20. */
  limit?: number;
  /** Per-signal weight overrides; each must be finite and >= 0, otherwise it is ignored. */
  weights?: Partial<Record<SignalName, number>>;
}

export type Reason =
  | { kind: 'pairs-often-with'; with: ID; lift: number }
  | { kind: 'pairs-rarely-with'; with: ID; lift: number }
  | { kind: 'lift-coverage'; covered: number; of: number }
  /** `ability` is present exactly when `by` is `'ability'`: the candidate's expected ability makes it immune. */
  | { kind: 'covers-weakness'; type: TypeName; by: 'resists' | 'immune' | 'ability'; weakMembers: ID[]; ability?: string }
  | { kind: 'adds-weakness'; type: TypeName; weakMembers: ID[] }
  | { kind: 'adds-coverage'; types: TypeName[] }
  /** `via` is the move id (`runs`, `can-learn`) or the ability name (`ability`); `from` is where that fact came from. */
  | { kind: 'fills-role'; role: RoleId; source: RoleSource; via: string; from: ProfileSource }
  /** `side` is the candidate's side; `with` is the roster member on the other side and `from` how its half was known. */
  | { kind: 'completes-combo'; combo: ComboId; side: 'enabler' | 'beneficiary'; with: ID; from: ComboSource }
  | { kind: 'low-usage'; usage: number }
  | { kind: 'no-ladder-usage' };

export type Note =
  | { kind: 'invalid-context' }
  | { kind: 'invalid-snapshot' }
  | { kind: 'roster-full' }
  | { kind: 'empty-roster' }
  /**
   * The priced pool is smaller than the open slots. Not the same as `DrafterState.cannotFillRoster` in the domain,
   * which is also true when the budget is short.
   */
  | { kind: 'cannot-fill-roster'; poolSize: number; openSlots: number }
  /** Species that pass every rule except the budget existed, but none fits it. */
  | { kind: 'no-affordable-candidates' }
  | { kind: 'no-usage-data' }
  /** The roles no roster member covers by a move it runs or its expected ability (table order). */
  | { kind: 'roster-lacks-roles'; roles: RoleId[] }
  | { kind: 'unscored-candidates'; count: number };

/** What one signal says about one candidate. `score` is null when the signal has no data. */
export interface SignalOutput {
  score: number | null;
  reasons: Reason[];
}

export interface SignalScore {
  signal: SignalName;
  /** The signal's absolute score in [0, 1], or null when it has no data for this candidate. */
  score: number | null;
  /** The value that was combined: the candidate's percentile rank for this signal, or 0.5 when the signal has no data. */
  rank: number;
  /** The effective (re-normalized) weight, including the reduced weight of a missing signal. */
  weight: number;
  reasons: Reason[];
}

export interface Suggestion {
  species: ID;
  price: number;
  /** In [0, 1]: fit compared with the rest of the candidate pool (the weighted sum of the signals' percentile ranks). */
  score: number;
  /** One entry per signal in `SIGNAL_NAMES` order (index by `signal`, not by position). */
  signals: SignalScore[];
  /** The signals' reasons in that order, then the informational usage reason. */
  reasons: Reason[];
}

export interface SuggestResult {
  suggestions: Suggestion[];
  /** Candidates that passed the budget and filters, before scoring and `limit`. */
  considered: number;
  notes: Note[];
}
