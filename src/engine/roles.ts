import type { ID } from '../domain/id';
import { expectedAbility } from './abilities';
import { compareIds } from './math';
import type { EngineSnapshot, RoleId, RoleSource } from './types';

/** A species runs a role move when at least this share of its sets carry it. */
export const RUN_MIN_SHARE = 0.1;
/** A role a species can only learn (a signature move, no usage entry) counts for this fraction of its importance. */
export const CAN_LEARN_FACTOR = 0.5;

export interface RoleDef {
  id: RoleId;
  /** How much a team missing this role should care; the role signal weighs roles by it. */
  importance: number;
  /** Move ids a species can run to fill the role. */
  moves: readonly string[];
  /** Ability names that fill the role. */
  abilities: readonly string[];
  /** Move ids credited as `can-learn` to a species with no usage entry. */
  signatureMoves: readonly string[];
}

/** The role table, in the order roles are listed everywhere. Hand-curated; see the stage 2 spec. */
export const ROLES: readonly RoleDef[] = [
  { id: 'fakeOut', importance: 1, moves: ['fakeout'], abilities: [], signatureMoves: ['fakeout'] },
  { id: 'redirection', importance: 1, moves: ['followme', 'ragepowder'], abilities: [], signatureMoves: ['followme', 'ragepowder'] },
  { id: 'speedControl', importance: 1, moves: ['tailwind', 'trickroom', 'icywind', 'electroweb'], abilities: [], signatureMoves: ['tailwind', 'trickroom'] },
  { id: 'intimidate', importance: 0.75, moves: [], abilities: ['Intimidate'], signatureMoves: [] },
  {
    id: 'weatherTerrain',
    importance: 0.75,
    moves: [],
    abilities: ['Drought', 'Drizzle', 'Sand Stream', 'Snow Warning', 'Electric Surge'],
    signatureMoves: [],
  },
  { id: 'pivot', importance: 0.5, moves: ['partingshot', 'uturn', 'voltswitch', 'flipturn'], abilities: [], signatureMoves: ['partingshot'] },
  { id: 'screens', importance: 0.5, moves: ['reflect', 'lightscreen', 'auroraveil'], abilities: [], signatureMoves: [] },
  { id: 'support', importance: 0.5, moves: ['helpinghand', 'wideguard', 'quickguard', 'coaching'], abilities: [], signatureMoves: [] },
  {
    id: 'priority',
    importance: 0.5,
    moves: ['aquajet', 'machpunch', 'iceshard', 'suckerpunch', 'shadowsneak', 'bulletpunch', 'quickattack', 'extremespeed', 'vacuumwave', 'jetpunch', 'firstimpression'],
    abilities: [],
    signatureMoves: [],
  },
  { id: 'disruption', importance: 0.5, moves: ['encore', 'taunt', 'willowisp', 'yawn', 'sleeppowder', 'nuzzle'], abilities: [], signatureMoves: [] },
];

export interface RoleTag {
  role: RoleId;
  source: RoleSource;
  /** The move id (`runs`, `can-learn`) or the ability name (`ability`) behind the tag. */
  via: string;
}

type RoleSnapshot = Pick<EngineSnapshot, 'species' | 'usage' | 'learnsets'>;

/** The role move the species runs most (at least `RUN_MIN_SHARE`; ties by id ascending), or null. */
function bestRunMove(moves: readonly string[], rows: ReadonlyArray<readonly [ID, number]>): string | null {
  let best: readonly [ID, number] | null = null;
  for (const row of rows) {
    if (row[1] < RUN_MIN_SHARE || !moves.includes(row[0])) continue;
    if (best === null || row[1] > best[1] || (row[1] === best[1] && compareIds(row[0], best[0]) < 0)) best = row;
  }
  return best === null ? null : best[0];
}

/**
 * The roles a species fills, at most one tag per role, in table order, from the strongest source: `runs` (it has a
 * usage entry and runs a role move at `RUN_MIN_SHARE` or more; `via` is the most-run one), then `ability` (its expected
 * ability is a role ability), then `can-learn` (only for a species with no usage entry: its learnset holds a signature
 * move; `via` is the first one in table order). An id that is not in the snapshot has no tags.
 */
export function speciesRoles(id: ID, snapshot: RoleSnapshot): RoleTag[] {
  if (!Object.hasOwn(snapshot.species, id)) return [];
  const usage = snapshot.usage;
  const entry = usage !== null && Object.hasOwn(usage.species, id) ? usage.species[id] : null;
  const learnset = snapshot.learnsets !== undefined && Object.hasOwn(snapshot.learnsets, id) ? snapshot.learnsets[id] : [];
  const ability = expectedAbility(id, snapshot);

  const tags: RoleTag[] = [];
  for (const role of ROLES) {
    const run = entry === null ? null : bestRunMove(role.moves, entry.moves);
    if (run !== null) {
      tags.push({ role: role.id, source: 'runs', via: run });
    } else if (ability !== null && role.abilities.includes(ability)) {
      tags.push({ role: role.id, source: 'ability', via: ability });
    } else if (entry === null) {
      const learnable = role.signatureMoves.find((move) => learnset.includes(move));
      if (learnable !== undefined) tags.push({ role: role.id, source: 'can-learn', via: learnable });
    }
  }
  return tags;
}

/**
 * The roles (table order) no roster member covers. A member covers a role with a `runs` or `ability` tag; a `can-learn`
 * tag does not. Roster ids that are not in the snapshot are ignored, so an empty roster lacks every role.
 */
export function rosterLacks(roster: readonly ID[], snapshot: RoleSnapshot): RoleId[] {
  const covered = new Set<RoleId>();
  for (const id of roster) {
    for (const tag of speciesRoles(id, snapshot)) if (tag.source !== 'can-learn') covered.add(tag.role);
  }
  return ROLES.filter((role) => !covered.has(role.id)).map((role) => role.id);
}
