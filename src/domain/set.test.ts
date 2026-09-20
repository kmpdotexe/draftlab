import { describe, expect, it } from 'vitest';
import type { NatureName } from './natures';
import { MAX_MOVES, MAX_STAT_POINT, MAX_TOTAL_STAT_POINTS, validateSet, type PokemonSet, type StatPoints } from './set';

const points = (overrides: Partial<StatPoints> = {}): StatPoints => ({
  hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...overrides,
});

const paths = (set: PokemonSet) => validateSet(set, 'set').map((p) => p.path);

describe('limits', () => {
  it('are the Champions values', () => {
    expect(MAX_STAT_POINT).toBe(32);
    expect(MAX_TOTAL_STAT_POINTS).toBe(66);
    expect(MAX_MOVES).toBe(4);
  });
});

describe('validateSet', () => {
  it('accepts a set with only a species', () => {
    expect(validateSet({ species: 'incineroar' }, 'set')).toEqual([]);
  });

  it('accepts a full set at the limits', () => {
    const set: PokemonSet = {
      species: 'incineroar',
      ability: 'intimidate',
      item: 'sitrusberry',
      moves: ['fakeout', 'partingshot', 'flareblitz', 'throatchop'],
      nature: 'Jolly',
      points: points({ atk: 32, def: 2, spe: 32 }),
    };
    expect(validateSet(set, 'set')).toEqual([]);
  });

  it('requires a species', () => {
    expect(paths({ species: '' })).toEqual(['set.species']);
  });

  it('rejects empty ability or item when present', () => {
    expect(paths({ species: 'a', ability: '' })).toEqual(['set.ability']);
    expect(paths({ species: 'a', item: '' })).toEqual(['set.item']);
  });

  it('rejects more than four moves', () => {
    const problems = validateSet({ species: 'a', moves: ['m1', 'm2', 'm3', 'm4', 'm5'] }, 'set');
    expect(problems.map((p) => p.path)).toEqual(['set.moves']);
    expect(problems[0].message).toContain('4');
  });

  it('rejects duplicate and empty moves, naming the slot', () => {
    const dup = validateSet({ species: 'a', moves: ['fakeout', 'fakeout'] }, 'set');
    expect(dup.map((p) => p.path)).toEqual(['set.moves[1]']);
    expect(dup[0].message).toContain('duplicate');
    expect(paths({ species: 'a', moves: ['', 'fakeout'] })).toEqual(['set.moves[0]']);
  });

  it('rejects an unknown nature', () => {
    expect(paths({ species: 'a', nature: 'Jolly ' as unknown as NatureName })).toEqual(['set.nature']);
  });

  it('rejects stat points outside 0..32 or not whole numbers, naming the stat', () => {
    expect(paths({ species: 'a', points: points({ atk: 33 }) })).toEqual(['set.points.atk']);
    expect(paths({ species: 'a', points: points({ spd: -1 }) })).toEqual(['set.points.spd']);
    expect(paths({ species: 'a', points: points({ hp: 1.5 }) })).toEqual(['set.points.hp']);
  });

  it('rejects a points table with a missing stat', () => {
    const missing = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0 } as unknown as StatPoints;
    expect(paths({ species: 'a', points: missing })).toEqual(['set.points.spe']);
  });

  it('accepts a total of exactly 66 and rejects 67', () => {
    expect(validateSet({ species: 'a', points: points({ hp: 2, atk: 32, spe: 32 }) }, 'set')).toEqual([]);
    const over = validateSet({ species: 'a', points: points({ hp: 3, atk: 32, spe: 32 }) }, 'set');
    expect(over.map((p) => p.path)).toEqual(['set.points']);
    expect(over[0].message).toContain('67');
  });

  it('reports every problem, not just the first', () => {
    expect(paths({ species: '', ability: '', nature: 'x' as unknown as NatureName })).toEqual([
      'set.species',
      'set.ability',
      'set.nature',
    ]);
  });
});
