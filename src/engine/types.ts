import type { ID } from '../domain/id';
import type { Snapshot } from '../domain/types';
import type { TypeName } from './typechart';

/** The slice of the snapshot the engine reads. A full `Snapshot` satisfies it. */
export type EngineSnapshot = Pick<Snapshot, 'species' | 'moves' | 'usage'>;

export type SignalName = 'usageLift' | 'typeSynergy';

/** Both signals, in the order they appear in every `Suggestion.signals`. */
export const SIGNAL_NAMES: readonly SignalName[] = ['usageLift', 'typeSynergy'];

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
  | { kind: 'covers-weakness'; type: TypeName; by: 'resists' | 'immune'; weakMembers: ID[] }
  | { kind: 'adds-weakness'; type: TypeName; weakMembers: ID[] }
  | { kind: 'adds-coverage'; types: TypeName[] }
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
  | { kind: 'unscored-candidates'; count: number };

/** What one signal says about one candidate. `score` is null when the signal has no data. */
export interface SignalOutput {
  score: number | null;
  reasons: Reason[];
}

export interface SignalScore {
  signal: SignalName;
  /** In [0, 1], or null when the signal has no data for this candidate. */
  score: number | null;
  /** The effective (re-normalized) weight; 0 when score is null. */
  weight: number;
  reasons: Reason[];
}

export interface Suggestion {
  species: ID;
  price: number;
  /** In [0, 1]: the weighted sum of the signals that had data. */
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
