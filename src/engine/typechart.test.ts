import { describe, expect, it } from 'vitest';
import { TYPES, effectiveness, isTypeName, multiplier, severity } from './typechart';

describe('TYPES', () => {
  it('lists the 18 types alphabetically, without Stellar', () => {
    expect(TYPES).toHaveLength(18);
    expect([...TYPES]).toEqual([...TYPES].sort());
    expect(TYPES).not.toContain('Stellar');
    expect(TYPES).toContain('Fairy');
  });
});

describe('isTypeName', () => {
  it('accepts the 18 names only', () => {
    expect(isTypeName('Fire')).toBe(true);
    expect(isTypeName('Stellar')).toBe(false);
    expect(isTypeName('fire')).toBe(false);
    expect(isTypeName('constructor')).toBe(false);
    expect(isTypeName(5)).toBe(false);
    expect(isTypeName(undefined)).toBe(false);
  });
});

describe('effectiveness (attacking type first, defending type second)', () => {
  it('knows the immunities', () => {
    for (const [attacking, defending] of [
      ['Normal', 'Ghost'],
      ['Ghost', 'Normal'],
      ['Electric', 'Ground'],
      ['Ground', 'Flying'],
      ['Dragon', 'Fairy'],
      ['Poison', 'Steel'],
      ['Psychic', 'Dark'],
      ['Fighting', 'Ghost'],
    ]) {
      expect(effectiveness(attacking, defending), `${attacking} -> ${defending}`).toBe(0);
    }
  });

  it('knows super effective and resisted hits, and that the direction matters', () => {
    expect(effectiveness('Fairy', 'Dragon')).toBe(2);
    expect(effectiveness('Dragon', 'Fairy')).toBe(0);
    expect(effectiveness('Steel', 'Fairy')).toBe(2);
    expect(effectiveness('Fairy', 'Steel')).toBe(0.5);
    expect(effectiveness('Fire', 'Steel')).toBe(2);
    expect(effectiveness('Water', 'Fire')).toBe(2);
    expect(effectiveness('Fire', 'Water')).toBe(0.5);
    expect(effectiveness('Ice', 'Dragon')).toBe(2);
    expect(effectiveness('Ground', 'Electric')).toBe(2);
  });

  it('is neutral otherwise', () => {
    expect(effectiveness('Normal', 'Normal')).toBe(1);
    expect(effectiveness('Water', 'Electric')).toBe(1); // Electric -> Water is 2, the reverse is neutral
  });

  it('counts 51 super effective, 61 resisted, 8 immune and 204 neutral cells (matches the real package)', () => {
    const counts = { superEffective: 0, resisted: 0, immune: 0, neutral: 0 };
    for (const attacking of TYPES) {
      for (const defending of TYPES) {
        const value = effectiveness(attacking, defending);
        if (value === 2) counts.superEffective += 1;
        else if (value === 0.5) counts.resisted += 1;
        else if (value === 0) counts.immune += 1;
        else counts.neutral += 1;
      }
    }
    expect(counts).toEqual({ superEffective: 51, resisted: 61, immune: 8, neutral: 204 });
  });

  it('treats anything that is not a type name as neutral and never throws', () => {
    expect(effectiveness('Stellar', 'Fire')).toBe(1);
    expect(effectiveness('Fire', 'Stellar')).toBe(1);
    expect(effectiveness('constructor', 'Fire')).toBe(1);
    expect(effectiveness('Fire', 'toString')).toBe(1);
    expect(effectiveness(5 as unknown as string, 'Fire')).toBe(1);
  });
});

describe('multiplier', () => {
  it('multiplies over the defending types', () => {
    expect(multiplier('Fire', ['Grass'])).toBe(2);
    expect(multiplier('Rock', ['Fire', 'Flying'])).toBe(4); // 2 x 2
    expect(multiplier('Fire', ['Rock', 'Dragon'])).toBe(0.25); // 0.5 x 0.5
    expect(multiplier('Ice', ['Fire', 'Ground'])).toBe(1); // 0.5 x 2
    expect(multiplier('Ground', ['Fire', 'Flying'])).toBe(0); // 2 x 0
  });

  it('is 1 for no types or something that is not a list, and ignores unknown types', () => {
    expect(multiplier('Fire', [])).toBe(1);
    // A string is iterable, so it would pass even without the Array.isArray guard; null and undefined are not.
    expect(multiplier('Fire', null as unknown as string[])).toBe(1);
    expect(multiplier('Fire', undefined as unknown as string[])).toBe(1);
    expect(multiplier('Fire', ['Stellar', 'Grass'])).toBe(2);
  });
});

describe('severity', () => {
  it('is log2 of the multiplier, clamped to -2..2, with immunity counted as -2', () => {
    expect(severity(4)).toBe(2);
    expect(severity(2)).toBe(1);
    expect(severity(1)).toBe(0);
    expect(severity(0.5)).toBe(-1);
    expect(severity(0.25)).toBe(-2);
    expect(severity(0)).toBe(-2);
    expect(severity(8)).toBe(2); // clamped
    expect(severity(0.125)).toBe(-2); // clamped
    expect(severity(Number.NaN)).toBe(0);
  });
});
