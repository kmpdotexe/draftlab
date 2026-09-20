import { describe, expect, it } from 'vitest';
import { isNatureName, NATURE_NAMES, NATURES } from './natures';

describe('NATURES', () => {
  it('has all 25 natures', () => {
    expect(NATURE_NAMES).toHaveLength(25);
  });

  it('has exactly the five neutral natures', () => {
    const neutral = NATURE_NAMES.filter((name) => NATURES[name].plus === null && NATURES[name].minus === null);
    expect(neutral.sort()).toEqual(['Bashful', 'Docile', 'Hardy', 'Quirky', 'Serious']);
  });

  it('gives every non-neutral nature a different raised and lowered stat, and no two share a pair', () => {
    const pairs = new Set<string>();
    for (const name of NATURE_NAMES) {
      const { plus, minus } = NATURES[name];
      if (plus === null && minus === null) continue;
      expect(plus, `${name} plus`).not.toBeNull();
      expect(minus, `${name} minus`).not.toBeNull();
      expect(plus, `${name} raises and lowers the same stat`).not.toBe(minus);
      pairs.add(`${plus}/${minus}`);
    }
    expect(pairs.size).toBe(20);
  });

  it('matches known natures', () => {
    expect(NATURES.Jolly).toEqual({ plus: 'spe', minus: 'spa' });
    expect(NATURES.Adamant).toEqual({ plus: 'atk', minus: 'spa' });
    expect(NATURES.Timid).toEqual({ plus: 'spe', minus: 'atk' });
    expect(NATURES.Modest).toEqual({ plus: 'spa', minus: 'atk' });
    expect(NATURES.Careful).toEqual({ plus: 'spd', minus: 'spa' });
    expect(NATURES.Relaxed).toEqual({ plus: 'def', minus: 'spe' });
  });
});

describe('isNatureName', () => {
  it('accepts exact nature names only', () => {
    expect(isNatureName('Jolly')).toBe(true);
    expect(isNatureName('jolly')).toBe(false);
    expect(isNatureName('toString')).toBe(false);
    expect(isNatureName(5)).toBe(false);
    expect(isNatureName(undefined)).toBe(false);
  });
});
