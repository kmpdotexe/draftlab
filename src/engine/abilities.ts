import type { ID } from '../domain/id';
import { abilityOf, setFor } from './profile';
import type { TypeName } from './typechart';
import type { EngineSnapshot } from './types';

// `expectedAbility` moved to `profile.ts` (profiles need it, and this module needs profiles); re-exported for callers.
export { EXPECTED_ABILITY_MIN_SHARE, expectedAbility } from './profile';

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

/**
 * The type a species is immune to through its ability, with that ability's name; null when it has none. The ability is
 * the one in `sets[id]` when that set names one the species can have, otherwise the expected ability.
 */
export function immunityOf(id: ID, snapshot: Pick<EngineSnapshot, 'species' | 'usage'>, sets?: Record<ID, unknown>): Immunity | null {
  const { ability } = abilityOf(id, snapshot, setFor(sets, id));
  if (ability === null || !Object.hasOwn(IMMUNITY_ABILITIES, ability)) return null;
  return { type: IMMUNITY_ABILITIES[ability], ability };
}
