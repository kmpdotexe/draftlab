import { clamp } from './math';

/** The 18 types legal species use (Showdown also lists Stellar, which no species has). */
export const TYPES = [
  'Bug', 'Dark', 'Dragon', 'Electric', 'Fairy', 'Fighting', 'Fire', 'Flying', 'Ghost',
  'Grass', 'Ground', 'Ice', 'Normal', 'Poison', 'Psychic', 'Rock', 'Steel', 'Water',
] as const;

export type TypeName = (typeof TYPES)[number];

/**
 * CHART[attacking][defending]: only the cells that are not neutral. Generated from
 * `Dex.mod('champions').types` (damageTaken codes 0 -> 1, 1 -> 2, 2 -> 0.5, 3 -> 0); the integration test
 * `sync/showdown/typechart.integration.test.ts` checks every cell against the real package.
 */
const CHART: Record<TypeName, Partial<Record<TypeName, 0 | 0.5 | 2>>> = {
  Bug:       { Dark: 2, Fairy: 0.5, Fighting: 0.5, Fire: 0.5, Flying: 0.5, Ghost: 0.5, Grass: 2, Poison: 0.5, Psychic: 2, Steel: 0.5 },
  Dark:      { Dark: 0.5, Fairy: 0.5, Fighting: 0.5, Ghost: 2, Psychic: 2 },
  Dragon:    { Dragon: 2, Fairy: 0, Steel: 0.5 },
  Electric:  { Dragon: 0.5, Electric: 0.5, Flying: 2, Grass: 0.5, Ground: 0, Water: 2 },
  Fairy:     { Dark: 2, Dragon: 2, Fighting: 2, Fire: 0.5, Poison: 0.5, Steel: 0.5 },
  Fighting:  { Bug: 0.5, Dark: 2, Fairy: 0.5, Flying: 0.5, Ghost: 0, Ice: 2, Normal: 2, Poison: 0.5, Psychic: 0.5, Rock: 2, Steel: 2 },
  Fire:      { Bug: 2, Dragon: 0.5, Fire: 0.5, Grass: 2, Ice: 2, Rock: 0.5, Steel: 2, Water: 0.5 },
  Flying:    { Bug: 2, Electric: 0.5, Fighting: 2, Grass: 2, Rock: 0.5, Steel: 0.5 },
  Ghost:     { Dark: 0.5, Ghost: 2, Normal: 0, Psychic: 2 },
  Grass:     { Bug: 0.5, Dragon: 0.5, Fire: 0.5, Flying: 0.5, Grass: 0.5, Ground: 2, Poison: 0.5, Rock: 2, Steel: 0.5, Water: 2 },
  Ground:    { Bug: 0.5, Electric: 2, Fire: 2, Flying: 0, Grass: 0.5, Poison: 2, Rock: 2, Steel: 2 },
  Ice:       { Dragon: 2, Fire: 0.5, Flying: 2, Grass: 2, Ground: 2, Ice: 0.5, Steel: 0.5, Water: 0.5 },
  Normal:    { Ghost: 0, Rock: 0.5, Steel: 0.5 },
  Poison:    { Fairy: 2, Ghost: 0.5, Grass: 2, Ground: 0.5, Poison: 0.5, Rock: 0.5, Steel: 0 },
  Psychic:   { Dark: 0, Fighting: 2, Poison: 2, Psychic: 0.5, Steel: 0.5 },
  Rock:      { Bug: 2, Fighting: 0.5, Fire: 2, Flying: 2, Ground: 0.5, Ice: 2, Steel: 0.5 },
  Steel:     { Electric: 0.5, Fairy: 2, Fire: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Water: 0.5 },
  Water:     { Dragon: 0.5, Fire: 2, Grass: 0.5, Ground: 2, Rock: 2, Water: 0.5 },
};

export function isTypeName(value: unknown): value is TypeName {
  return typeof value === 'string' && (TYPES as readonly string[]).includes(value);
}

/** How much damage an attacking type does to a defending type: 0, 0.5, 1 or 2. Anything that is not a type name is neutral. */
export function effectiveness(attacking: string, defending: string): 0 | 0.5 | 1 | 2 {
  if (!isTypeName(attacking) || !isTypeName(defending)) return 1;
  return CHART[attacking][defending] ?? 1;
}

/** The product of `effectiveness` over a species' defending types: 0, 0.25, 0.5, 1, 2 or 4. */
export function multiplier(attacking: string, defendingTypes: readonly string[]): number {
  if (!Array.isArray(defendingTypes)) return 1;
  let result = 1;
  for (const defending of defendingTypes) result *= effectiveness(attacking, defending);
  return result;
}

/** log2 of a multiplier clamped to -2..2, with immunity counted as -2. NaN is 0. */
export function severity(m: number): number {
  if (typeof m !== 'number' || Number.isNaN(m)) return 0;
  if (m <= 0) return -2;
  return clamp(Math.log2(m), -2, 2);
}
