import { describe, expect, it } from 'vitest';
import { speciesEntry } from '../../domain/test-support';
import type { Snapshot, UsageEntry } from '../../domain/types';
import { realData } from '../test-support';
import { DEFAULT_SUGGESTION, rankedByUsage, suggestedPrices, suggestionSummary } from './suggest-prices';

const usageEntry = (id: string, usage: number): UsageEntry => ({
  id,
  weight: 1,
  usage,
  abilities: [],
  items: [],
  moves: [],
  spreads: [],
  teammates: [],
});

// b and c tie on usage (Bravo before Charlie by name); d has no usage; zz is not legal.
const snapshot: Pick<Snapshot, 'species' | 'usage'> = {
  species: {
    a: speciesEntry('a', 'Alpha'),
    b: speciesEntry('b', 'Bravo'),
    c: speciesEntry('c', 'Charlie'),
    d: speciesEntry('d', 'Delta'),
  },
  usage: {
    teams: 10,
    cutoff: 1630,
    battles: 5,
    species: { c: usageEntry('c', 0.3), a: usageEntry('a', 0.5), b: usageEntry('b', 0.3), zz: usageEntry('zz', 0.9) },
  },
};

describe('suggestedPrices', () => {
  it('fills the tiers in usage order, ties by name, then the rest; no usage, no price', () => {
    expect(rankedByUsage(snapshot)).toEqual(['a', 'b', 'c']);
    const suggestion = { tiers: [{ count: 1, points: 20 }, { count: 1, points: 10 }], restPoints: 1 };
    expect(suggestedPrices(snapshot, suggestion)).toEqual({ a: 20, b: 10, c: 1 });
    expect(suggestionSummary(snapshot, suggestion)).toEqual({ tiered: 2, tierCount: 2, rest: 1, left: 1 });
  });

  it('leaves the rest out with restPoints null, and copes with tiers larger than the ranked list', () => {
    const suggestion = { tiers: [{ count: 2, points: 9 }, { count: 50, points: 4 }, { count: 5, points: 2 }], restPoints: null };
    expect(suggestedPrices(snapshot, suggestion)).toEqual({ a: 9, b: 9, c: 4 });
    expect(suggestionSummary(snapshot, suggestion)).toEqual({ tiered: 3, tierCount: 2, rest: 0, left: 1 });
  });

  it('is empty without usage data', () => {
    expect(suggestedPrices({ ...snapshot, usage: null }, DEFAULT_SUGGESTION)).toEqual({});
    expect(suggestionSummary({ ...snapshot, usage: null }, DEFAULT_SUGGESTION)).toEqual({ tiered: 0, tierCount: 0, rest: 0, left: 4 });
  });

  it('gives the default tier sizes on the real snapshot, the most used Pokémon at 20', () => {
    const { snapshot: real } = realData();
    const ranked = rankedByUsage(real);
    expect(ranked.length).toBeGreaterThan(120);
    const prices = suggestedPrices(real, DEFAULT_SUGGESTION);
    const count = (points: number) => Object.values(prices).filter((p) => p === points).length;
    expect([count(20), count(15), count(10), count(5)]).toEqual([10, 20, 30, 60]);
    expect(count(1)).toBe(ranked.length - 120);
    expect(prices[ranked[0]]).toBe(20);
    expect(Object.keys(prices)).toHaveLength(ranked.length);
    const summary = suggestionSummary(real, DEFAULT_SUGGESTION);
    expect(summary).toEqual({ tiered: 120, tierCount: 4, rest: ranked.length - 120, left: Object.keys(real.species).length - ranked.length });
  });
});
