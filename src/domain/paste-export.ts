import { toID } from './id';
import { STAT_NAMES, type PokemonSet } from './set';
import type { SetSnapshot } from './set-check';
import type { MatchTeam, RosterSets } from './team';
import type { StatName } from './types';

const STAT_LABEL: Record<StatName, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

/** The display name for an id, or the id itself when the table has no such entry. */
function displayName(table: Record<string, { name: string }>, id: string): string {
  return Object.hasOwn(table, id) ? table[id].name : id;
}

/** "2 HP / 32 Atk / 32 Spe": non-zero stats only, in the fixed order. Empty when nothing is spent. */
function evsLine(points: unknown): string {
  if (typeof points !== 'object' || points === null || Array.isArray(points)) return '';
  const record = points as Partial<Record<StatName, unknown>>;
  const parts: string[] = [];
  for (const stat of STAT_NAMES) {
    const value = record[stat];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) parts.push(`${value} ${STAT_LABEL[stat]}`);
  }
  return parts.join(' / ');
}

/**
 * One Showdown block. Champions stat points go on the EVs line 1:1 and the level is always 50. A set whose
 * points are all zero writes no EVs line, so it reads back with no points. Names come from the snapshot and
 * fall back to the id as written. Never rewrites a set. Returns '' for something that is not a usable set.
 *
 * Round trip through `parsePaste` has two exceptions: all-zero points come back with no `points`, and a base
 * species holding a stone that a legal form of the same base species requires (Staraptor with Staraptite) comes
 * back as that Mega form, with a note.
 */
export function exportSet(set: PokemonSet, snapshot: SetSnapshot): string {
  if (typeof set !== 'object' || set === null || typeof set.species !== 'string' || set.species === '') return '';

  const species = Object.hasOwn(snapshot.species, set.species) ? snapshot.species[set.species] : null;
  let first = species ? species.name : set.species;
  if (typeof set.item === 'string' && set.item !== '') first += ` @ ${displayName(snapshot.items, set.item)}`;
  const out = [first];

  if (typeof set.ability === 'string' && set.ability !== '') {
    const name = species?.abilities.find((candidate) => toID(candidate) === set.ability);
    out.push(`Ability: ${name ?? set.ability}`);
  }
  out.push('Level: 50');
  const evs = evsLine(set.points);
  if (evs !== '') out.push(`EVs: ${evs}`);
  if (typeof set.nature === 'string' && (set.nature as string) !== '') out.push(`${set.nature} Nature`);
  for (const move of Array.isArray(set.moves) ? set.moves : []) {
    if (typeof move === 'string' && move !== '') out.push(`- ${displayName(snapshot.moves, move)}`);
  }
  return out.join('\n');
}

/** Blocks for each set, in the order given, joined by one blank line. Unusable entries are skipped. */
export function exportSets(sets: PokemonSet[], snapshot: SetSnapshot): string {
  if (!Array.isArray(sets)) return '';
  return sets
    .map((set) => exportSet(set, snapshot))
    .filter((block) => block !== '')
    .join('\n\n');
}

/**
 * The team's members in team order. A member with no saved set, or whose saved set cannot be written, gets a
 * species-only block. Returns '' for a team without a list of members.
 */
export function exportTeam(team: MatchTeam, sets: RosterSets, snapshot: SetSnapshot): string {
  if (typeof team !== 'object' || team === null || !Array.isArray(team.members)) return '';
  const blocks: string[] = [];
  for (const id of team.members) {
    if (typeof id !== 'string' || id === '') continue;
    const saved = typeof sets === 'object' && sets !== null && Object.hasOwn(sets, id) ? sets[id] : undefined;
    const block = saved === undefined ? '' : exportSet(saved, snapshot);
    blocks.push(block !== '' ? block : exportSet({ species: id }, snapshot));
  }
  return blocks.join('\n\n');
}
