import { describe, expect, it } from 'vitest';
import { realData } from '../test-support';
import { nextTierPoints, parseWholePoints, speciesOptions, templateCsv, tiersOf, unpricedOf } from './tiers';

const species = {
  a: { name: 'Alpha' },
  b: { name: 'Bravo' },
  c: { name: 'Charlie' },
  d: { name: 'Delta' },
};

describe('tiersOf / unpricedOf', () => {
  it('groups legal Pokémon by points, highest first, members by name', () => {
    expect(tiersOf({ d: 5, a: 20, c: 5, zz: 20 }, species)).toEqual([
      { points: 20, members: ['a'] },
      { points: 5, members: ['c', 'd'] },
    ]);
    expect(tiersOf({}, species)).toEqual([]);
  });

  it('lists the unpriced legal Pokémon by name, and keeps a 0-point tier', () => {
    expect(unpricedOf({ b: 0 }, species)).toEqual(['a', 'c', 'd']);
    expect(tiersOf({ b: 0 }, species)).toEqual([{ points: 0, members: ['b'] }]);
  });
});

describe('nextTierPoints', () => {
  it('starts at 10, halves the lowest tier, and goes above the highest when it cannot halve', () => {
    expect(nextTierPoints([])).toBe(10);
    expect(nextTierPoints([20, 10])).toBe(5);
    expect(nextTierPoints([3])).toBe(1);
    expect(nextTierPoints([15, 1])).toBe(20);
    expect(nextTierPoints([0])).toBe(5);
  });
});

describe('templateCsv', () => {
  it('has a header and one empty-priced row per legal Pokémon, by name', () => {
    expect(templateCsv(species)).toBe('Pokemon,Points\nAlpha,\nBravo,\nCharlie,\nDelta,\n');
    const real = templateCsv(realData().snapshot.species).trimEnd().split('\n');
    expect(real).toHaveLength(Object.keys(realData().snapshot.species).length + 1);
    expect(real).toContain('Garchomp,');
  });
});

describe('parseWholePoints and speciesOptions', () => {
  it('parses whole points and lists options', () => {
    expect(parseWholePoints('12')).toBe(12);
    expect(parseWholePoints(' 0 ')).toBe(0);
    expect(parseWholePoints('-3')).toBeNull();
    expect(parseWholePoints('2.5')).toBeNull();
    expect(parseWholePoints('')).toBeNull();

    const speciesWithIds = {
      a: { id: 'a' as const, name: 'Alpha' },
      b: { id: 'b' as const, name: 'Bravo' },
      c: { id: 'c' as const, name: 'Charlie' },
      d: { id: 'd' as const, name: 'Delta' },
    };
    expect(speciesOptions(speciesWithIds, (id) => id === 'b').map((o) => o.id)).toEqual(['a', 'c', 'd']);
  });
});
