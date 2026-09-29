import { toID, type ID } from '../domain/id';
import { compareIds } from './math';
import type { EngineSnapshot, ProfileSource } from './types';

/** A species' expected ability is its top-used ability, but only when at least this share of its sets run it. */
export const EXPECTED_ABILITY_MIN_SHARE = 0.5;

/** What a species runs: from the user's entered set where it has one, otherwise from ladder usage. */
export interface Profile {
  /** Move id -> share of sets. A move from an entered set has share 1. */
  moves: ReadonlyMap<ID, number>;
  movesFrom: ProfileSource;
  /** An ability display name from `species.abilities`, or null. */
  ability: string | null;
  abilityFrom: ProfileSource;
}

type ProfileSnapshot = Pick<EngineSnapshot, 'species' | 'moves' | 'usage'>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The species' listed ability names; anything that is not a string is skipped. */
function listedAbilities(id: ID, snapshot: Pick<EngineSnapshot, 'species'>): string[] {
  const listed: unknown = snapshot.species[id].abilities;
  return Array.isArray(listed) ? listed.filter((name): name is string => typeof name === 'string') : [];
}

/**
 * The ability a species most likely has, as its display name from `species.abilities`. With ability usage data it is the
 * most-used ability (ties by id ascending) when at least `EXPECTED_ABILITY_MIN_SHARE` of sets run it and it is one of the
 * species' listed abilities; otherwise null. Without a usage entry, or without ability usage, it is the species' only
 * ability when it has exactly one, else null. An id that is not in the snapshot gives null.
 */
export function expectedAbility(id: ID, snapshot: Pick<EngineSnapshot, 'species' | 'usage'>): string | null {
  if (!Object.hasOwn(snapshot.species, id)) return null;
  const names = listedAbilities(id, snapshot);

  const usage = snapshot.usage;
  if (usage !== null && Object.hasOwn(usage.species, id) && usage.species[id].abilities.length > 0) {
    let best: [ID, number] | null = null;
    for (const row of usage.species[id].abilities) {
      if (best === null || row[1] > best[1] || (row[1] === best[1] && compareIds(row[0], best[0]) < 0)) best = row;
    }
    if (best === null || best[1] < EXPECTED_ABILITY_MIN_SHARE) return null;
    const topId = best[0];
    return names.find((name) => toID(name) === topId) ?? null;
  }
  return names.length === 1 ? names[0] : null;
}

/**
 * The ladder moves as id -> share: the usage entry's rows that are `[id, number]` pairs (a repeated id keeps its largest
 * share). Empty without an entry.
 */
function ladderMoves(id: ID, snapshot: Pick<EngineSnapshot, 'usage'>): Map<ID, number> {
  const moves = new Map<ID, number>();
  const usage = snapshot.usage;
  if (usage === null || !Object.hasOwn(usage.species, id)) return moves;
  const rows: unknown = usage.species[id].moves;
  if (!Array.isArray(rows)) return moves;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2 || typeof row[0] !== 'string' || typeof row[1] !== 'number') continue;
    const known = moves.get(row[0]);
    if (known === undefined || row[1] > known) moves.set(row[0], row[1]);
  }
  return moves;
}

/**
 * What a species runs. `set` is the user's entered set for it, if any (read defensively; only the fields that are usable
 * count). Moves: the set's string moves that are in the move table (no duplicates, set order) at share 1 when there is at
 * least one, else the ladder moves. Ability: the set's ability when its id matches one of the species' listed abilities
 * (returned as the listed name), else the expected ability. A set whose `species` is a string other than `id` is ignored.
 * An id that is not in the snapshot gives an empty ladder profile.
 */
export function profileOf(id: ID, snapshot: ProfileSnapshot, set?: unknown): Profile {
  const empty: Profile = { moves: new Map(), movesFrom: 'ladder', ability: null, abilityFrom: 'ladder' };
  if (!Object.hasOwn(snapshot.species, id)) return empty;

  const usable = isRecord(set) && !(typeof set.species === 'string' && set.species !== id) ? set : null;

  let moves: Map<ID, number> | null = null;
  if (usable !== null && Array.isArray(usable.moves)) {
    const chosen = new Map<ID, number>();
    for (const move of usable.moves) {
      if (typeof move === 'string' && Object.hasOwn(snapshot.moves, move)) chosen.set(move, 1);
    }
    if (chosen.size > 0) moves = chosen;
  }

  const { ability, from } = abilityOf(id, snapshot, usable);
  return {
    moves: moves ?? ladderMoves(id, snapshot),
    movesFrom: moves === null ? 'ladder' : 'set',
    ability,
    abilityFrom: from,
  };
}

/**
 * The ability half of `profileOf`, for callers that have no move table: the set's ability when its id matches one of the
 * species' listed abilities (as the listed name), else the expected ability. Same rules for `set` as `profileOf`.
 */
export function abilityOf(
  id: ID,
  snapshot: Pick<EngineSnapshot, 'species' | 'usage'>,
  set?: unknown,
): { ability: string | null; from: ProfileSource } {
  if (!Object.hasOwn(snapshot.species, id)) return { ability: null, from: 'ladder' };
  if (isRecord(set) && !(typeof set.species === 'string' && set.species !== id) && typeof set.ability === 'string') {
    const wanted = toID(set.ability);
    const listed = listedAbilities(id, snapshot).find((name) => toID(name) === wanted);
    if (listed !== undefined) return { ability: listed, from: 'set' };
  }
  return { ability: expectedAbility(id, snapshot), from: 'ladder' };
}

/**
 * The roster members' entries of `given` (own keys only) when `given` is a plain object; anything else gives `{}`.
 * Entries for species that are not on the roster are dropped. The entries themselves are not checked here: `profileOf`
 * reads them defensively.
 */
export function readSets(given: unknown, roster: readonly ID[]): Record<ID, unknown> {
  if (!isRecord(given)) return {};
  return Object.fromEntries(roster.filter((id) => Object.hasOwn(given, id)).map((id) => [id, given[id]]));
}

/** The entry for `id` in a `readSets` result, or undefined (own keys only). */
export function setFor(sets: Record<ID, unknown> | undefined, id: ID): unknown {
  return sets !== undefined && Object.hasOwn(sets, id) ? sets[id] : undefined;
}

/** True when the profile runs `move`: its share is at least `minShare` (a set move, share 1, always is). */
export function runsMove(profile: Profile, move: ID, minShare: number): boolean {
  const share = profile.moves.get(move);
  return share !== undefined && share >= minShare;
}
