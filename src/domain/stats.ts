import { NATURES, type Nature, type NatureName } from './natures';
import { STAT_NAMES, type PokemonSet, type StatPoints } from './set';
import type { Snapshot, StatName, StatTable } from './types';

/** Champions VGC battles are fixed at level 50. */
export const LEVEL = 50;

export type Stats = Record<StatName, number>;

const NO_EFFECT: Nature = { plus: null, minus: null };

/**
 * Final battle stats, using Showdown's Champions formula for the VGC formats: HP is base + points + 75,
 * every other stat is base + points + 20, and then a raised stat is floor(v * 110 / 100) and a lowered
 * stat floor(v * 90 / 100). No IVs. A missing nature is neutral; missing points are 0.
 */
export function computeStats(baseStats: StatTable, nature?: NatureName, points?: StatPoints): Stats {
  const effect = nature !== undefined && Object.hasOwn(NATURES, nature) ? NATURES[nature] : NO_EFFECT;
  const result = {} as Stats;
  for (const stat of STAT_NAMES) {
    const spent = points?.[stat] ?? 0;
    if (stat === 'hp') {
      result.hp = baseStats.hp + spent + 75;
      continue;
    }
    const value = baseStats[stat] + spent + 20;
    if (effect.plus === stat) result[stat] = Math.floor((value * 110) / 100);
    else if (effect.minus === stat) result[stat] = Math.floor((value * 90) / 100);
    else result[stat] = value;
  }
  return result;
}

/** Stats for a set, or null if the set is malformed or its species is not in the snapshot. */
export function computeSetStats(set: PokemonSet, snapshot: Pick<Snapshot, 'species'>): Stats | null {
  if (typeof set !== 'object' || set === null) return null;
  if (typeof set.species !== 'string' || !Object.hasOwn(snapshot.species, set.species)) return null;
  return computeStats(snapshot.species[set.species].baseStats, set.nature, set.points);
}
