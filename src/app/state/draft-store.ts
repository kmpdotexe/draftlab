import { deriveDraft } from '../../domain/derive';
import { applyPick, checkPick, undoPick } from '../../domain/draft';
import type { DraftFile } from '../../domain/file';
import type { ID } from '../../domain/id';
import { validateLeague, type LeagueConfig, type LegalSpeciesSource } from '../../domain/league';
import type { Problem } from '../../domain/problem';
import { validateSet, type PokemonSet } from '../../domain/set';

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
  | { type: 'clear' }
  | { type: 'set-set'; species: ID; set: PokemonSet }
  | { type: 'clear-set'; species: ID }
  | { type: 'add-team'; name: string }
  | { type: 'rename-team'; index: number; name: string }
  | { type: 'set-team-members'; index: number; members: ID[] }
  | { type: 'delete-team'; index: number };

/** The team size of the shipped format (`meta.showdown.rules.minTeamSize`). */
export const DEFAULT_TEAM_SIZE = 6;

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
 * file: a refused action returns the same file with `errors` set. `teamSize` caps a match team's members.
 */
export function makeDraftReducer(snapshot: LegalSpeciesSource, teamSize: number = DEFAULT_TEAM_SIZE) {
  const nameOf = (id: ID): string => {
    const entry = Object.hasOwn(snapshot.species, id) ? snapshot.species[id] : undefined;
    return entry !== undefined && typeof entry.name === 'string' ? entry.name : id;
  };
  const rosterOf = (file: DraftFile): ID[] => deriveDraft(file.league, file.picks, snapshot).drafters[file.league.me]?.roster ?? [];
  const hasTeam = (file: DraftFile, index: number): boolean => Number.isInteger(index) && index >= 0 && index < file.teams.length;
  const refuse = (state: DraftStoreState, path: string, message: string): DraftStoreState => ({
    file: state.file,
    errors: [{ path, message }],
  });
  const noFile = (state: DraftStoreState, path: string): DraftStoreState => refuse(state, path, 'set up a league first');

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
        if (state.file === null) return noFile(state, 'picks');
        const result = applyPick(state.file.league, state.file.picks, action.species, snapshot);
        if (!result.ok) return { file: state.file, errors: [result.problem] };
        return { file: { ...state.file, picks: result.picks }, errors: [] };
      }
      case 'undo': {
        const file = state.file;
        if (file === null || file.picks.length === 0) return { file, errors: [] };
        const undone = file.picks[file.picks.length - 1];
        const picks = undoPick(file.picks);
        if (!rosterOf(file).includes(undone)) return { file: { ...file, picks }, errors: [] };
        const sets = { ...file.sets };
        delete sets[undone];
        const teams = file.teams.map((team) =>
          team.members.includes(undone) ? { ...team, members: team.members.filter((id) => id !== undone) } : team,
        );
        return { file: { ...file, picks, sets, teams }, errors: [] };
      }
      case 'replace':
        return { file: action.file, errors: [] };
      case 'clear':
        return { file: null, errors: [] };
      case 'set-set': {
        const file = state.file;
        const path = `sets.${action.species}`;
        if (file === null) return noFile(state, path);
        if (!rosterOf(file).includes(action.species)) return refuse(state, path, `${nameOf(action.species)} is not on your roster`);
        if (action.set?.species !== action.species) {
          return refuse(state, path, `this set is for ${nameOf(String(action.set?.species))}, not ${nameOf(action.species)}`);
        }
        const structural = validateSet(action.set, path);
        if (structural.length > 0) return { file, errors: structural };
        const sets = { ...file.sets };
        Object.defineProperty(sets, action.species, { value: action.set, enumerable: true, writable: true, configurable: true });
        return { file: { ...file, sets }, errors: [] };
      }
      case 'clear-set': {
        const file = state.file;
        if (file === null) return noFile(state, `sets.${action.species}`);
        if (!Object.hasOwn(file.sets, action.species)) return { file, errors: [] };
        const sets = { ...file.sets };
        delete sets[action.species];
        return { file: { ...file, sets }, errors: [] };
      }
      case 'add-team': {
        const file = state.file;
        if (file === null) return noFile(state, 'teams');
        const name = typeof action.name === 'string' ? action.name.trim() : '';
        if (name === '') return refuse(state, 'teams', 'a team needs a name');
        return { file: { ...file, teams: [...file.teams, { name, members: [] }] }, errors: [] };
      }
      case 'rename-team': {
        const file = state.file;
        const path = `teams[${action.index}]`;
        if (file === null) return noFile(state, path);
        if (!hasTeam(file, action.index)) return refuse(state, path, 'there is no such team');
        const name = typeof action.name === 'string' ? action.name.trim() : '';
        if (name === '') return refuse(state, `${path}.name`, 'a team needs a name');
        const teams = file.teams.map((team, i) => (i === action.index ? { ...team, name } : team));
        return { file: { ...file, teams }, errors: [] };
      }
      case 'set-team-members': {
        const file = state.file;
        const path = `teams[${action.index}]`;
        if (file === null) return noFile(state, path);
        if (!hasTeam(file, action.index)) return refuse(state, path, 'there is no such team');
        const members = Array.isArray(action.members) ? action.members : [];
        if (members.length > teamSize) return refuse(state, `${path}.members`, `a team has at most ${teamSize} Pokémon`);
        const roster = rosterOf(file);
        const seen = new Set<ID>();
        for (const id of members) {
          if (!roster.includes(id)) return refuse(state, `${path}.members`, `${nameOf(id)} is not on your roster`);
          if (seen.has(id)) return refuse(state, `${path}.members`, `${nameOf(id)} is listed twice`);
          seen.add(id);
        }
        const teams = file.teams.map((team, i) => (i === action.index ? { ...team, members: [...members] } : team));
        return { file: { ...file, teams }, errors: [] };
      }
      case 'delete-team': {
        const file = state.file;
        const path = `teams[${action.index}]`;
        if (file === null) return noFile(state, path);
        if (!hasTeam(file, action.index)) return refuse(state, path, 'there is no such team');
        return { file: { ...file, teams: file.teams.filter((_, i) => i !== action.index) }, errors: [] };
      }
      default:
        return state;
    }
  };
}
