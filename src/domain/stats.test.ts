import { describe, expect, it } from 'vitest';
import type { NatureName } from './natures';
import type { PokemonSet, StatPoints } from './set';
import { computeSetStats, computeStats, LEVEL } from './stats';
import type { StatTable } from './types';

const INCINEROAR: StatTable = { hp: 95, atk: 115, def: 90, spa: 80, spd: 90, spe: 60 };
const FLAT: StatTable = { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 };
const points = (overrides: Partial<StatPoints> = {}): StatPoints => ({
  hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...overrides,
});

describe('LEVEL', () => {
  it('is 50', () => {
    expect(LEVEL).toBe(50);
  });
});

describe('computeStats', () => {
  it('computes the worked Incineroar example (Jolly, 2 HP / 32 Atk / 32 Spe)', () => {
    // HP 95+2+75; Atk 115+32+20; Def 90+20; SpA (80+20)*0.9; SpD 90+20; Spe (60+32+20)*1.1 = 123.2 -> 123
    expect(computeStats(INCINEROAR, 'Jolly', points({ hp: 2, atk: 32, spe: 32 }))).toEqual({
      hp: 172, atk: 167, def: 110, spa: 90, spd: 110, spe: 123,
    });
  });

  it('uses base + 75 for HP and base + 20 for the rest when there is no nature and no points', () => {
    expect(computeStats(INCINEROAR)).toEqual({ hp: 170, atk: 135, def: 110, spa: 100, spd: 110, spe: 80 });
  });

  it('leaves every stat alone for a neutral nature', () => {
    expect(computeStats(INCINEROAR, 'Hardy', points())).toEqual(computeStats(INCINEROAR));
  });

  it('truncates a lowered stat that has a fractional result', () => {
    // Mild: +SpA -Def. Def 81+20 = 101 -> 101*90/100 = 90.9 -> 90. SpA 75+20 = 95 -> 95*110/100 = 104.5 -> 104.
    expect(computeStats({ hp: 50, atk: 50, def: 81, spa: 75, spd: 50, spe: 50 }, 'Mild')).toEqual({
      hp: 125, atk: 70, def: 90, spa: 104, spd: 70, spe: 70,
    });
  });

  it('adds the stat points before the nature is applied', () => {
    // Modest: +SpA -Atk. SpA 75+32+20 = 127 -> 139.7 -> 139. Atk 50+20 = 70 -> 63.
    expect(computeStats({ hp: 50, atk: 50, def: 50, spa: 75, spd: 50, spe: 50 }, 'Modest', points({ spa: 32 }))).toEqual({
      hp: 125, atk: 63, def: 70, spa: 139, spd: 70, spe: 70,
    });
  });

  it('never applies a nature to HP', () => {
    for (const nature of ['Adamant', 'Bold', 'Timid', 'Calm', 'Modest'] as NatureName[]) {
      expect(computeStats(FLAT, nature, points({ hp: 10 })).hp).toBe(50 + 10 + 75);
    }
  });

  it('treats a missing stat in a partial points object as 0', () => {
    const partial = { atk: 10 } as unknown as StatPoints;
    expect(computeStats(FLAT, undefined, partial)).toEqual({ hp: 125, atk: 80, def: 70, spa: 70, spd: 70, spe: 70 });
  });

  it('treats an unknown nature name as neutral', () => {
    expect(computeStats(FLAT, 'Bogus' as unknown as NatureName)).toEqual(computeStats(FLAT));
  });

  it('does not modify its inputs', () => {
    const base = { ...INCINEROAR };
    const spent = points({ atk: 32 });
    const before = JSON.stringify({ base, spent });
    computeStats(base, 'Jolly', spent);
    expect(JSON.stringify({ base, spent })).toBe(before);
  });
});

describe('computeSetStats', () => {
  const snapshot = { species: { incineroar: { baseStats: INCINEROAR } } } as unknown as Parameters<typeof computeSetStats>[1];

  it('looks the species up and applies its nature and points', () => {
    const set: PokemonSet = { species: 'incineroar', nature: 'Jolly', points: points({ hp: 2, atk: 32, spe: 32 }) };
    expect(computeSetStats(set, snapshot)).toEqual({ hp: 172, atk: 167, def: 110, spa: 90, spd: 110, spe: 123 });
  });

  it('works for a species-only set', () => {
    expect(computeSetStats({ species: 'incineroar' }, snapshot)).toEqual(computeStats(INCINEROAR));
  });

  it('returns null, and does not throw, for an unknown species or a malformed set', () => {
    expect(computeSetStats({ species: 'ghost' }, snapshot)).toBeNull();
    expect(computeSetStats({ species: 'constructor' }, snapshot)).toBeNull();
    expect(computeSetStats(null as unknown as PokemonSet, snapshot)).toBeNull();
    expect(computeSetStats({ species: 5 } as unknown as PokemonSet, snapshot)).toBeNull();
  });

  it('ignores a malformed points value instead of throwing', () => {
    const set = { species: 'incineroar', points: null } as unknown as PokemonSet;
    expect(computeSetStats(set, snapshot)).toEqual(computeStats(INCINEROAR));
  });
});
