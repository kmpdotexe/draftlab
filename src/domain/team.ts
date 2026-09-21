import type { ID } from './id';
import type { Problem } from './problem';
import type { PokemonSet } from './set';
import { validateSetAgainstSnapshot, type SetSnapshot } from './set-check';

/** The user's sets, one per drafted species, keyed by species id (the key must equal `set.species`). */
export type RosterSets = Record<ID, PokemonSet>;

/** A team of species ids picked from the user's roster. Sets come from `RosterSets`. */
export interface MatchTeam {
  name: string;
  members: ID[];
}

export interface TeamCheck {
  problems: Problem[];
  /** True when the team has exactly `teamSize` members and no problems. */
  complete: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Checks a match team: size, repeats, roster membership, each member's set, then Species Clause (same dex
 * number) and Item Clause (same item). Choosing which 4 to bring is not modeled. Never throws.
 * `path` is the prefix for every problem path (default 'team'), so a caller can root the team elsewhere,
 * for example 'teams[2]' gives 'teams[2].members[1]'.
 */
export function validateTeam(
  team: MatchTeam,
  roster: ID[],
  sets: RosterSets,
  snapshot: SetSnapshot,
  teamSize: number,
  path = 'team',
): TeamCheck {
  if (!isRecord(team) || !Array.isArray(team.members)) {
    return { problems: [{ path, message: 'team must have a list of members' }], complete: false };
  }

  const problems: Problem[] = [];
  const add = (at: string, message: string) => problems.push({ path: at, message });
  const onRoster = new Set(Array.isArray(roster) ? roster : []);
  const setFor = (id: ID): unknown => (isRecord(sets) && Object.hasOwn(sets, id) ? sets[id] : { species: id });

  if (team.members.length > teamSize) {
    add(`${path}.members`, `at most ${teamSize} members (found ${team.members.length})`);
  }

  const seen = new Set<ID>();
  const members: Array<{ index: number; id: ID; set: unknown }> = [];
  team.members.forEach((id, i) => {
    const at = `${path}.members[${i}]`;
    if (typeof id !== 'string' || id === '') {
      add(at, 'member must be a species id');
      return;
    }
    if (seen.has(id)) {
      add(at, `"${id}" is listed twice`);
      return;
    }
    seen.add(id);
    if (!onRoster.has(id)) add(at, `"${id}" is not on your roster`);

    const set = setFor(id);
    if (isRecord(set) && typeof set.species === 'string' && set.species !== id) {
      add(at, `the saved set for "${id}" is for "${set.species}"`);
      return;
    }
    problems.push(...validateSetAgainstSnapshot(set as PokemonSet, snapshot, at));
    members.push({ index: i, id, set });
  });

  // Species Clause: one problem per later member, naming the first earlier member with the same dex number.
  const firstByNum = new Map<number, ID>();
  for (const { index, id } of members) {
    if (!Object.hasOwn(snapshot.species, id)) continue;
    const num = snapshot.species[id].num;
    const first = firstByNum.get(num);
    if (first !== undefined) {
      add(`${path}.members[${index}]`, `"${id}" and "${first}" are the same Pokémon (dex number ${num}); Species Clause`);
    } else {
      firstByNum.set(num, id);
    }
  }

  // Item Clause: one problem per later member, naming the first earlier member holding the same item.
  const firstByItem = new Map<ID, ID>();
  for (const { index, id, set } of members) {
    const item = isRecord(set) ? set.item : undefined;
    if (typeof item !== 'string' || item === '') continue;
    const first = firstByItem.get(item);
    if (first !== undefined) {
      const name = Object.hasOwn(snapshot.items, item) ? snapshot.items[item].name : item;
      add(`${path}.members[${index}].item`, `"${id}" and "${first}" both hold ${name}; Item Clause`);
    } else {
      firstByItem.set(item, id);
    }
  }

  return { problems, complete: problems.length === 0 && team.members.length === teamSize };
}
