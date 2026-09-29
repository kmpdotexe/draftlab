import type { ID } from '../domain/id';
import { compareIds } from './math';
import { profileOf, setFor, type Profile } from './profile';
import type { EngineSnapshot, ProfileSource, RoleId, RoleSource } from './types';

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
  /** Where the fact came from: the entered set or the ladder (`can-learn` is always `'ladder'`). */
  from: ProfileSource;
}

type RoleSnapshot = Pick<EngineSnapshot, 'species' | 'moves' | 'usage' | 'learnsets'>;

/** The role move the profile runs most (at least `RUN_MIN_SHARE`; ties by id ascending), or null. */
function bestRunMove(moves: readonly string[], profile: Profile): string | null {
  let best: [ID, number] | null = null;
  for (const [move, share] of profile.moves) {
    if (share < RUN_MIN_SHARE || !moves.includes(move)) continue;
    if (best === null || share > best[1] || (share === best[1] && compareIds(move, best[0]) < 0)) best = [move, share];
  }
  return best === null ? null : best[0];
}

/**
 * The roles a species fills, at most one tag per role, in table order, from the strongest source: `runs` (its profile
 * runs a role move at `RUN_MIN_SHARE` or more; `via` is the most-run one), then `ability` (its profile's ability is a
 * role ability), then `can-learn` (only for a species with no usage entry and no set moves: its learnset holds a
 * signature move; `via` is the first one in table order). The profile reads `sets[id]` where there is one (see
 * `profileOf`). An id that is not in the snapshot has no tags.
 */
export function speciesRoles(id: ID, snapshot: RoleSnapshot, sets?: Record<ID, unknown>): RoleTag[] {
  if (!Object.hasOwn(snapshot.species, id)) return [];
  const usage = snapshot.usage;
  const hasEntry = usage !== null && Object.hasOwn(usage.species, id);
  const rawLearnset = snapshot.learnsets !== undefined && Object.hasOwn(snapshot.learnsets, id) ? snapshot.learnsets[id] : [];
  const learnset: readonly string[] = Array.isArray(rawLearnset) ? rawLearnset : [];
  const profile = profileOf(id, snapshot, setFor(sets, id));
  const ability = profile.ability;

  const tags: RoleTag[] = [];
  for (const role of ROLES) {
    const run = bestRunMove(role.moves, profile);
    if (run !== null) {
      tags.push({ role: role.id, source: 'runs', via: run, from: profile.movesFrom });
    } else if (ability !== null && role.abilities.includes(ability)) {
      tags.push({ role: role.id, source: 'ability', via: ability, from: profile.abilityFrom });
    } else if (!hasEntry && profile.movesFrom === 'ladder') {
      const learnable = role.signatureMoves.find((move) => learnset.includes(move));
      if (learnable !== undefined) tags.push({ role: role.id, source: 'can-learn', via: learnable, from: 'ladder' });
    }
  }
  return tags;
}

/**
 * The roles (table order) no roster member covers. A member covers a role with a `runs` or `ability` tag; a `can-learn`
 * tag does not. Members are read through their sets where `sets` has one. Roster ids that are not in the snapshot are
 * ignored, so an empty roster lacks every role.
 */
export function rosterLacks(roster: readonly ID[], snapshot: RoleSnapshot, sets?: Record<ID, unknown>): RoleId[] {
  const covered = new Set<RoleId>();
  for (const id of roster) {
    for (const tag of speciesRoles(id, snapshot, sets)) if (tag.source !== 'can-learn') covered.add(tag.role);
  }
  return ROLES.filter((role) => !covered.has(role.id)).map((role) => role.id);
}
