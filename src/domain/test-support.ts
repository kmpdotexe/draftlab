import type { LeagueConfig, LegalSpeciesSource } from './league';
import type { SpeciesEntry } from './types';

/** Species ids in the default test snapshot. Note: 'h' has no price and 'e' is banned in leagueOf(). */
export const SPECIES_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** Default prices: 'h' is deliberately absent (unpriced) and 'g' costs 0. */
export const PRICES: Record<string, number> = { a: 30, b: 20, c: 10, d: 5, e: 5, f: 1, g: 0 };

/** A snapshot slice whose species table holds only keys; the draft logic never reads the values. */
export function snapshotOf(ids: string[] = SPECIES_IDS): LegalSpeciesSource {
  return {
    formatId: 'fmt',
    species: Object.fromEntries(ids.map((id) => [id, {} as SpeciesEntry])),
  };
}

/** A valid 3-drafter snake league of 2 rounds and a budget of 50. Override any field. */
export function leagueOf(overrides: Partial<LeagueConfig> = {}): LeagueConfig {
  return {
    name: 'Test League',
    formatId: 'fmt',
    drafters: ['Ana', 'Ben', 'Cy'],
    order: 'snake',
    rounds: 2,
    me: 1,
    budget: 50,
    prices: { ...PRICES },
    extraBans: ['e'],
    ...overrides,
  };
}
