import { describe, expect, it } from 'vitest';
import { cooccurrence, teammateLift } from './usage';
import type { UsageData, UsageEntry } from './types';

function entry(id: string, weight: number, usage: number, teammates: Array<[string, number]>): UsageEntry {
  return { id, weight, usage, abilities: [], items: [], moves: [], spreads: [], teammates };
}

// Numbers taken from the real gen9championsvgc2026regmb-1630 data (2026-08).
const usage: UsageData = {
  teams: 195_000,
  cutoff: 1630,
  battles: 1_269_250,
  species: {
    kingambit: entry('kingambit', 79_678, 0.4074192, [['incineroar', 14_648]]),
    incineroar: entry('incineroar', 52_277, 0.2684631, []),
    whimsicott: entry('whimsicott', 47_595, 0.2439747, [['incineroar', 5_612]]),
  },
};

describe('cooccurrence', () => {
  it('reads the pair from the first species list', () => {
    expect(cooccurrence(usage, 'kingambit', 'incineroar')).toBe(14_648);
  });

  it('falls back to the other species list because co-occurrence is symmetric', () => {
    expect(cooccurrence(usage, 'incineroar', 'kingambit')).toBe(14_648);
  });

  it('returns null when neither list stores the pair', () => {
    expect(cooccurrence(usage, 'kingambit', 'whimsicott')).toBeNull();
  });

  it('returns null for unknown species', () => {
    expect(cooccurrence(usage, 'kingambit', 'missingno')).toBeNull();
  });
});

describe('teammateLift', () => {
  it('divides co-occurrence by what chance alone would give', () => {
    // 14648 / (79678 * 0.2684631) ≈ 0.685: the pair appears together LESS than chance.
    expect(teammateLift(usage, 'kingambit', 'incineroar')).toBeCloseTo(0.685, 2);
  });

  it('uses the given species weight and the candidate usage, so swapping them changes the denominator', () => {
    // forward:  14648 / (79678 * 0.2684631) ≈ 0.685
    // backward: 14648 / (52277 * 0.4074192) ≈ 0.688
    expect(teammateLift(usage, 'kingambit', 'incineroar')).toBeCloseTo(0.685, 3);
    expect(teammateLift(usage, 'incineroar', 'kingambit')).toBeCloseTo(0.688, 3);
  });

  it('returns null, not 0, when the pair was not observed among stored teammates', () => {
    expect(teammateLift(usage, 'kingambit', 'whimsicott')).toBeNull();
  });

  it('returns null when either species has no usage entry', () => {
    expect(teammateLift(usage, 'kingambit', 'missingno')).toBeNull();
    expect(teammateLift(usage, 'missingno', 'kingambit')).toBeNull();
  });
});
