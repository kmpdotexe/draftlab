import type { ID } from '../domain/id';
import { runsMove, type Profile } from './profile';
import { RUN_MIN_SHARE } from './roles';
import type { ComboId, ComboSource, EngineSnapshot } from './types';

/** The Trick Room beneficiary side: species with base Speed at most this. */
export const TRICK_ROOM_MAX_BASE_SPEED = 50;

/** One side of a combo. A species is on the side when any one of the set checks matches. */
export interface ComboSide {
  /** Ability names, matched against the profile's ability. */
  abilities: readonly string[];
  /** Move ids, matched against the moves the profile runs. */
  moves: readonly string[];
  /** Matched when the species' base Speed is at most this. */
  maxBaseSpeed?: number;
  /** Matched when the profile runs a spread attack (a damaging spread move at `SPREAD_MIN_BASE_POWER` or more). */
  spreadMove?: boolean;
}

export interface ComboDef {
  id: ComboId;
  /** How much completing this combo is worth; the combo signal weighs combos by it. */
  importance: number;
  enabler: ComboSide;
  beneficiary: ComboSide;
}

const SETUP_MOVES = ['swordsdance', 'nastyplot', 'dragondance', 'calmmind', 'bellydrum', 'shellsmash', 'quiverdance', 'bulkup'];

/** The combo table, in the order combos are listed everywhere. Hand-curated; see the stage 3 spec. */
export const COMBOS: readonly ComboDef[] = [
  {
    id: 'trickRoom',
    importance: 1,
    enabler: { abilities: [], moves: ['trickroom'] },
    beneficiary: { abilities: [], moves: [], maxBaseSpeed: TRICK_ROOM_MAX_BASE_SPEED },
  },
  {
    id: 'redirectSetup',
    importance: 0.75,
    enabler: { abilities: [], moves: ['followme', 'ragepowder'] },
    beneficiary: { abilities: [], moves: SETUP_MOVES },
  },
  {
    id: 'rain',
    importance: 0.75,
    enabler: { abilities: ['Drizzle'], moves: ['raindance'] },
    beneficiary: { abilities: ['Swift Swim', 'Rain Dish'], moves: ['thunder', 'hurricane'] },
  },
  {
    id: 'sun',
    importance: 0.75,
    enabler: { abilities: ['Drought'], moves: ['sunnyday'] },
    beneficiary: { abilities: ['Chlorophyll', 'Solar Power'], moves: ['solarbeam'] },
  },
  {
    id: 'sand',
    importance: 0.75,
    enabler: { abilities: ['Sand Stream'], moves: ['sandstorm'] },
    beneficiary: { abilities: ['Sand Rush', 'Sand Force'], moves: [] },
  },
  {
    id: 'snow',
    importance: 0.75,
    enabler: { abilities: ['Snow Warning'], moves: ['snowscape'] },
    beneficiary: { abilities: ['Slush Rush'], moves: ['blizzard'] },
  },
  {
    id: 'electricTerrain',
    importance: 0.5,
    enabler: { abilities: ['Electric Surge'], moves: [] },
    beneficiary: { abilities: ['Surge Surfer'], moves: ['risingvoltage'] },
  },
  {
    id: 'helpingHand',
    importance: 0.5,
    enabler: { abilities: [], moves: ['helpinghand'] },
    beneficiary: { abilities: [], moves: [], spreadMove: true },
  },
];

/**
 * A spread move counts for Helping Hand only at this base power or more: utility spread moves (Icy Wind, Electroweb,
 * Snarl, Bulldoze and similar, all 65 or less) are speed control, not spread attacks.
 */
export const SPREAD_MIN_BASE_POWER = 70;

const SPREAD_TARGETS = ['allAdjacentFoes', 'allAdjacent'];

/** A damaging spread attack. Read defensively: `target` is not checked by the sanitizer. */
function isSpreadAttack(move: unknown): boolean {
  if (typeof move !== 'object' || move === null) return false;
  const m = move as Record<string, unknown>;
  return (
    typeof m.target === 'string' &&
    SPREAD_TARGETS.includes(m.target) &&
    m.category !== 'Status' &&
    typeof m.basePower === 'number' &&
    m.basePower >= SPREAD_MIN_BASE_POWER
  );
}

/** The species' base Speed, or null when it is missing or not a finite number (`baseStats` is not checked by the sanitizer). */
function baseSpeed(id: ID, snapshot: Pick<EngineSnapshot, 'species'>): number | null {
  const stats: unknown = snapshot.species[id].baseStats;
  if (typeof stats !== 'object' || stats === null) return null;
  const spe = (stats as Record<string, unknown>).spe;
  return typeof spe === 'number' && Number.isFinite(spe) ? spe : null;
}

/**
 * Whether species `id` with profile `profile` is on `side`, and if so how that was known. Checks, in order: the
 * profile's ability (`abilityFrom`), a side move the profile runs (`movesFrom`), a spread attack it runs
 * (`movesFrom`), base Speed (`'species'`). Null when nothing matches or the species is not in the snapshot.
 */
export function sideMatch(
  side: ComboSide,
  id: ID,
  profile: Profile,
  snapshot: Pick<EngineSnapshot, 'species' | 'moves'>,
): ComboSource | null {
  if (!Object.hasOwn(snapshot.species, id)) return null;
  if (profile.ability !== null && side.abilities.includes(profile.ability)) return profile.abilityFrom;
  if (side.moves.some((move) => runsMove(profile, move, RUN_MIN_SHARE))) return profile.movesFrom;
  if (side.spreadMove === true) {
    for (const [move, share] of profile.moves) {
      if (share >= RUN_MIN_SHARE && Object.hasOwn(snapshot.moves, move) && isSpreadAttack(snapshot.moves[move])) return profile.movesFrom;
    }
  }
  if (side.maxBaseSpeed !== undefined) {
    const spe = baseSpeed(id, snapshot);
    if (spe !== null && spe <= side.maxBaseSpeed) return 'species';
  }
  return null;
}
