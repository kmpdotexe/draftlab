import type { ID } from '../domain/id';
import { immunityOf, type Immunity } from './abilities';
import { clamp, compareIds } from './math';
import { profileOf, setFor } from './profile';
import { TYPES, effectiveness, multiplier, severity, type TypeName } from './typechart';
import type { EngineSnapshot, Reason, SignalOutput } from './types';

/** Raw defensive scores are divided by this before being centred on 0.5. */
export const DEFENSIVE_SCALE = 12;
/** A weakness the roster is not yet exposed to costs this fraction of a normal one. */
export const UNEXPOSED_HARM_FACTOR = 0.25;
/** A move counts toward a species' attacking types when it runs on at least this share of its sets. */
export const OFFENSIVE_MIN_MOVE_SHARE = 0.1;
export const DEFENSIVE_WEIGHT = 0.6;
export const OFFENSIVE_WEIGHT = 0.4;

const MAX_COVERS = 3;
const MAX_ADDS = 2;

export interface TypedMember {
  id: ID;
  types: readonly string[];
  /** The type the member's expected ability makes it immune to, if any. */
  immune?: Immunity;
}

/** The damage multiplier `type` does to a member: 0 when its ability makes it immune to `type`, else the typing's product. */
function memberMultiplier(type: TypeName, member: Pick<TypedMember, 'types' | 'immune'>): number {
  return member.immune?.type === type ? 0 : multiplier(type, member.types);
}

export interface DefensiveResult {
  raw: number;
  score: number;
  reasons: Reason[];
}

/**
 * How well the candidate's typing complements the roster's. For each attacking type `T`, `exposure` is the roster's
 * summed severity (x4 = +2, x2 = +1, x1/2 = -1, x1/4 or immune = -2); only the part above 0 is an unresisted
 * weakness. A candidate that resists `T` relieves up to that much; one that is weak to `T` costs its severity
 * (a quarter of it where the roster is not exposed). The score is `0.5 + raw / DEFENSIVE_SCALE`, clamped.
 *
 * Two caveats. Exposure is a signed sum, so one member's resistance cancels another member's weakness to the same
 * type; a real team does not fully work that way. And `DEFENSIVE_SCALE = 12` keeps the defensive score in roughly
 * 0.12 to 0.79 on real rosters, so the combined scores cluster around 0.3 to 0.6.
 */
export function defensiveComponent(
  roster: readonly TypedMember[],
  candidate: readonly string[],
  candidateImmune?: Immunity,
): DefensiveResult {
  let raw = 0;
  const covers: Array<{ type: TypeName; relief: number }> = [];
  const adds: Array<{ type: TypeName; harm: number }> = [];

  for (const type of TYPES) {
    const exposure = roster.reduce((sum, member) => sum + severity(memberMultiplier(type, member)), 0);
    const exposed = Math.max(0, exposure);
    const own = severity(memberMultiplier(type, { types: candidate, immune: candidateImmune }));
    if (own < 0) {
      const relief = Math.min(exposed, -own);
      if (relief > 0) {
        raw += relief;
        covers.push({ type, relief });
      }
    } else if (own > 0) {
      const harm = own * (exposed >= 1 ? 1 : UNEXPOSED_HARM_FACTOR);
      raw -= harm;
      if (exposed >= 1) adds.push({ type, harm });
    }
  }

  const weakMembersOf = (type: TypeName): ID[] =>
    roster.filter((member) => memberMultiplier(type, member) > 1).map((member) => member.id);

  covers.sort((a, b) => b.relief - a.relief || compareIds(a.type, b.type));
  adds.sort((a, b) => b.harm - a.harm || compareIds(a.type, b.type));

  const reasons: Reason[] = [];
  for (const { type } of covers.slice(0, MAX_COVERS)) {
    const weakMembers = weakMembersOf(type);
    if (multiplier(type, candidate) === 0) reasons.push({ kind: 'covers-weakness', type, by: 'immune', weakMembers });
    else if (candidateImmune?.type === type) {
      reasons.push({ kind: 'covers-weakness', type, by: 'ability', weakMembers, ability: candidateImmune.ability });
    } else reasons.push({ kind: 'covers-weakness', type, by: 'resists', weakMembers });
  }
  for (const { type } of adds.slice(0, MAX_ADDS)) {
    reasons.push({ kind: 'adds-weakness', type, weakMembers: weakMembersOf(type) });
  }
  return { raw, score: clamp(0.5 + raw / DEFENSIVE_SCALE, 0, 1), reasons };
}

/**
 * The types a species can hit with: its own types plus the types of the damaging moves (not Status, base power above 0)
 * its profile runs on at least `OFFENSIVE_MIN_MOVE_SHARE` of its sets (every move of an entered set counts). A species
 * with no usage entry and no set, or a move that is not in the move table, contributes only its own types. An id that
 * is not in the snapshot has none.
 */
export function attackingTypes(id: ID, snapshot: EngineSnapshot, sets?: Record<ID, unknown>): Set<string> {
  const types = new Set<string>(Object.hasOwn(snapshot.species, id) ? snapshot.species[id].types : []);
  for (const [moveId, share] of profileOf(id, snapshot, setFor(sets, id)).moves) {
    if (share < OFFENSIVE_MIN_MOVE_SHARE || !Object.hasOwn(snapshot.moves, moveId)) continue;
    const move = snapshot.moves[moveId];
    if (move.category !== 'Status' && move.basePower > 0) types.add(move.type);
  }
  return types;
}

/**
 * The fraction of the defending types the roster cannot yet hit super effectively that the candidate can. Each
 * defending type is judged on its own (dual typing is ignored). `fraction` is null when the roster already covers all 18.
 */
export function offensiveComponent(
  roster: readonly ReadonlySet<string>[],
  candidate: ReadonlySet<string>,
): { fraction: number | null; newTypes: TypeName[] } {
  const covered = new Set<TypeName>();
  for (const attacking of roster) {
    for (const type of attacking) {
      for (const defending of TYPES) if (effectiveness(type, defending) >= 2) covered.add(defending);
    }
  }
  const uncovered = TYPES.filter((defending) => !covered.has(defending));
  if (uncovered.length === 0) return { fraction: null, newTypes: [] };
  const newTypes = uncovered.filter((defending) => [...candidate].some((type) => effectiveness(type, defending) >= 2));
  return { fraction: newTypes.length / uncovered.length, newTypes };
}

/**
 * Type synergy: `0.6 x defensive + 0.4 x offensive`, or just the defensive score when the offensive component has no
 * data. Roster members are read through `sets` where it has an entry (their ability immunity and attacking types); the
 * candidate never is. No data for an empty roster (after dropping ids that are not in the snapshot) or an unknown
 * candidate.
 */
export function typeSignal(roster: ID[], candidate: ID, snapshot: EngineSnapshot, sets?: Record<ID, unknown>): SignalOutput {
  if (!Object.hasOwn(snapshot.species, candidate)) return { score: null, reasons: [] };
  const members: TypedMember[] = roster
    .filter((id) => Object.hasOwn(snapshot.species, id))
    .map((id) => ({ id, types: snapshot.species[id].types, immune: immunityOf(id, snapshot, sets) ?? undefined }));
  if (members.length === 0) return { score: null, reasons: [] };

  const defensive = defensiveComponent(members, snapshot.species[candidate].types, immunityOf(candidate, snapshot) ?? undefined);
  const offensive = offensiveComponent(
    members.map((entry) => attackingTypes(entry.id, snapshot, sets)),
    attackingTypes(candidate, snapshot),
  );

  const reasons = [...defensive.reasons];
  if (offensive.fraction === null) return { score: defensive.score, reasons };
  if (offensive.newTypes.length > 0) reasons.push({ kind: 'adds-coverage', types: [...offensive.newTypes] });
  return { score: clamp(DEFENSIVE_WEIGHT * defensive.score + OFFENSIVE_WEIGHT * offensive.fraction, 0, 1), reasons };
}
