import type { ID } from './id';
import { isNatureName, type NatureName } from './natures';
import type { Problem } from './problem';
import type { StatName } from './types';

export const MAX_STAT_POINT = 32;
export const MAX_TOTAL_STAT_POINTS = 66;
export const MAX_MOVES = 4;

export const STAT_NAMES: StatName[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

/** Champions stat points: added 1:1 to the stat, no EVs or IVs. */
export type StatPoints = Record<StatName, number>;

export interface PokemonSet {
  species: ID;
  ability?: ID;
  item?: ID;
  moves?: ID[];
  nature?: NatureName;
  points?: StatPoints;
}

/** Structural checks only. Checking a set against the snapshot (legal moves, abilities, items) is a later increment. */
export function validateSet(set: PokemonSet, path: string): Problem[] {
  const problems: Problem[] = [];
  const add = (sub: string, message: string) => problems.push({ path: `${path}${sub}`, message });

  if (typeof set !== 'object' || set === null || Array.isArray(set)) {
    return [{ path, message: 'set must be an object' }];
  }

  if (typeof set.species !== 'string' || set.species === '') add('.species', 'species is required');

  for (const key of ['ability', 'item'] as const) {
    const value = set[key];
    if (value !== undefined && (typeof value !== 'string' || value === '')) {
      add(`.${key}`, `${key} must be a non-empty id when present`);
    }
  }

  if (set.moves !== undefined) {
    if (!Array.isArray(set.moves)) {
      add('.moves', 'moves must be a list');
    } else {
      if (set.moves.length > MAX_MOVES) add('.moves', `at most ${MAX_MOVES} moves (found ${set.moves.length})`);
      const seen = new Set<string>();
      set.moves.forEach((move, i) => {
        if (typeof move !== 'string' || move === '') add(`.moves[${i}]`, 'move must be a non-empty id');
        else if (seen.has(move)) add(`.moves[${i}]`, `duplicate move "${move}"`);
        else seen.add(move);
      });
    }
  }

  if (set.nature !== undefined && !isNatureName(set.nature)) {
    add('.nature', `unknown nature "${String(set.nature)}"`);
  }

  if (set.points !== undefined) {
    if (typeof set.points !== 'object' || set.points === null || Array.isArray(set.points)) {
      add('.points', 'points must be an object with hp, atk, def, spa, spd and spe');
    } else {
      let total = 0;
      for (const stat of STAT_NAMES) {
        const value = set.points[stat];
        if (!Number.isInteger(value) || value < 0 || value > MAX_STAT_POINT) {
          add(`.points.${stat}`, `${stat} must be a whole number from 0 to ${MAX_STAT_POINT} (found ${String(value)})`);
        } else {
          total += value;
        }
      }
      if (total > MAX_TOTAL_STAT_POINTS) {
        add('.points', `total ${total} is over the ${MAX_TOTAL_STAT_POINTS}-point limit`);
      }
    }
  }

  return problems;
}
