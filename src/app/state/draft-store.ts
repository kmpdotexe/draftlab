import { applyPick, checkPick, undoPick } from '../../domain/draft';
import type { DraftFile } from '../../domain/file';
import type { ID } from '../../domain/id';
import { validateLeague, type LeagueConfig, type LegalSpeciesSource } from '../../domain/league';
import type { Problem } from '../../domain/problem';

export interface DraftStoreState {
  /** The one draft file, or null before a league is set up. Never invalid. */
  file: DraftFile | null;
  /** Why the last action was refused; empty after a successful action. */
  errors: Problem[];
}

export type DraftAction =
  | { type: 'set-league'; league: LeagueConfig }
  | { type: 'pick'; species: ID }
  | { type: 'undo' }
  | { type: 'replace'; file: DraftFile }
  | { type: 'clear' };

/** Fields that cannot change once a pick is recorded: they decide who picked what. */
const LOCKED = ['drafters', 'order', 'rounds', 'me'] as const;

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Why `league` cannot replace the league of `file`, or an empty list when it can. */
function leagueProblems(file: DraftFile | null, league: LeagueConfig, snapshot: LegalSpeciesSource): Problem[] {
  const invalid = validateLeague(league, 'league');
  if (invalid.length > 0) return invalid;
  if (file === null || file.picks.length === 0) return [];

  const locked = LOCKED.filter((key) => !sameValue(file.league[key], league[key]));
  if (locked.length > 0) {
    return locked.map((key) => ({ path: `league.${key}`, message: `${key} cannot change once picks are recorded` }));
  }
  for (let i = 0; i < file.picks.length; i++) {
    const problem = checkPick(league, file.picks.slice(0, i), file.picks[i], snapshot);
    if (problem !== null) return [{ path: `picks[${i}]`, message: `this would break pick ${i + 1}: ${problem.message}` }];
  }
  return [];
}

/**
 * The reducer over the one draft file. It never throws, never modifies its inputs, and never stores an invalid
 * file: a refused action returns the same file with `errors` set.
 */
export function makeDraftReducer(snapshot: LegalSpeciesSource) {
  return function draftReducer(state: DraftStoreState, action: DraftAction): DraftStoreState {
    switch (action.type) {
      case 'set-league': {
        const errors = leagueProblems(state.file, action.league, snapshot);
        if (errors.length > 0) return { file: state.file, errors };
        const file: DraftFile =
          state.file === null
            ? { schemaVersion: 2, league: action.league, picks: [], sets: {}, teams: [] }
            : { ...state.file, league: action.league };
        return { file, errors: [] };
      }
      case 'pick': {
        if (state.file === null) return { file: null, errors: [{ path: 'picks', message: 'set up a league first' }] };
        const result = applyPick(state.file.league, state.file.picks, action.species, snapshot);
        if (!result.ok) return { file: state.file, errors: [result.problem] };
        return { file: { ...state.file, picks: result.picks }, errors: [] };
      }
      case 'undo':
        if (state.file === null || state.file.picks.length === 0) return { file: state.file, errors: [] };
        return { file: { ...state.file, picks: undoPick(state.file.picks) }, errors: [] };
      case 'replace':
        return { file: action.file, errors: [] };
      case 'clear':
        return { file: null, errors: [] };
      default:
        return state;
    }
  };
}
