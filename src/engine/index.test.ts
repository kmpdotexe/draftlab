import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMIT, MISSING_WEIGHT_FACTOR, ROLES, SIGNAL_NAMES, contextFor, suggest } from './index';

describe('the engine index', () => {
  it('exports the public functions and constants', () => {
    expect(typeof contextFor).toBe('function');
    expect(DEFAULT_LIMIT).toBe(20);
    expect([...SIGNAL_NAMES]).toEqual(['usageLift', 'typeSynergy', 'roleFit']);
    expect(MISSING_WEIGHT_FACTOR).toBe(0.5);
    expect(ROLES.map((role) => role.id)).toHaveLength(10);
  });

  it('exports a working suggest', () => {
    const result = suggest({ roster: [], pool: [], prices: {}, remaining: 0, openSlots: 0 }, { species: {}, moves: {}, usage: null });
    expect(result).toEqual({ suggestions: [], considered: 0, notes: [{ kind: 'roster-full' }] });
  });
});
