import { toID, type ID } from '../domain/id';
import { compareIds } from './math';
import type { TypeName } from './typechart';
import type { EngineSnapshot } from './types';

/** A species' expected ability is its top-used ability, but only when at least this share of its sets run it. */
export const EXPECTED_ABILITY_MIN_SHARE = 0.5;

/** Abilities that make the holder immune to a type, by ability name. Partial resistances (Thick Fat, Fluffy, ...) are not listed. */
export const IMMUNITY_ABILITIES: Readonly<Record<string, TypeName>> = {
  Levitate: 'Ground',
  'Earth Eater': 'Ground',
  'Flash Fire': 'Fire',
  'Water Absorb': 'Water',
  'Dry Skin': 'Water',
  'Volt Absorb': 'Electric',
  'Lightning Rod': 'Electric',
  'Motor Drive': 'Electric',
  'Sap Sipper': 'Grass',
};

export interface Immunity {
  type: TypeName;
  ability: string;
}

type AbilitySnapshot = Pick<EngineSnapshot, 'species' | 'usage'>;

/**
 * The ability a species most likely has, as its display name from `species.abilities`. With ability usage data it is the
 * most-used ability (ties by id ascending) when at least `EXPECTED_ABILITY_MIN_SHARE` of sets run it and it is one of the
 * species' listed abilities; otherwise null. Without a usage entry, or without ability usage, it is the species' only
 * ability when it has exactly one, else null. An id that is not in the snapshot gives null.
 */
export function expectedAbility(id: ID, snapshot: AbilitySnapshot): string | null {
  if (!Object.hasOwn(snapshot.species, id)) return null;
  const listed: unknown = snapshot.species[id].abilities;
  const names = Array.isArray(listed) ? listed.filter((name): name is string => typeof name === 'string') : [];

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

/** The type a species is immune to through its expected ability, with that ability's name; null when it has none. */
export function immunityOf(id: ID, snapshot: AbilitySnapshot): Immunity | null {
  const ability = expectedAbility(id, snapshot);
  if (ability === null || !Object.hasOwn(IMMUNITY_ABILITIES, ability)) return null;
  return { type: IMMUNITY_ABILITIES[ability], ability };
}
