import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { TYPES, effectiveness } from '../../src/engine/typechart';

// The slice of the pokemon-showdown API this test relies on. Kept local, like the loader does.
interface ShowdownType {
  name: string;
  exists: boolean;
  isNonstandard?: string | null;
  /** attacking type name -> 0 normal, 1 super effective, 2 resisted, 3 immune. */
  damageTaken: Record<string, number>;
}
interface ShowdownDex {
  mod(name: string): { types: { all(): ShowdownType[]; get(name: string): ShowdownType } };
}
const { Dex } = createRequire(import.meta.url)('pokemon-showdown') as { Dex: ShowdownDex };
const types = Dex.mod('champions').types;

const FROM_CODE: Record<number, 0 | 0.5 | 1 | 2> = { 0: 1, 1: 2, 2: 0.5, 3: 0 };

describe('the engine type chart against the real pokemon-showdown Champions mod', () => {
  it('has the same 18 types (the package also lists Stellar, which no legal species uses)', () => {
    const names = types
      .all()
      .filter((t) => t.exists && !t.isNonstandard)
      .map((t) => t.name)
      .filter((name) => name !== 'Stellar')
      .sort();
    expect(names).toEqual([...TYPES].sort());
  });

  it('agrees on every one of the 324 cells (attacking type x defending type)', () => {
    const mismatches: string[] = [];
    let checked = 0;
    for (const attacking of TYPES) {
      for (const defending of TYPES) {
        checked += 1;
        const expected = FROM_CODE[types.get(defending).damageTaken[attacking]];
        const actual = effectiveness(attacking, defending);
        if (actual !== expected) mismatches.push(`${attacking} -> ${defending}: ours ${actual}, package ${expected}`);
      }
    }
    expect(checked).toBe(324);
    expect(mismatches).toEqual([]);
  });

  it('is not trivially neutral: the package has many super effective cells and so do we', () => {
    let packageSuperEffective = 0;
    let ourSuperEffective = 0;
    for (const attacking of TYPES) {
      for (const defending of TYPES) {
        if (FROM_CODE[types.get(defending).damageTaken[attacking]] === 2) packageSuperEffective += 1;
        if (effectiveness(attacking, defending) === 2) ourSuperEffective += 1;
      }
    }
    expect(packageSuperEffective).toBeGreaterThanOrEqual(40); // 51 when this was written
    expect(ourSuperEffective).toBe(packageSuperEffective);
  });
});
