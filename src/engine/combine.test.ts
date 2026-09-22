import { describe, expect, it } from 'vitest';
import { MISSING_WEIGHT_FACTOR, combineSignals, percentileRanks, rankAll } from './combine';

describe('percentileRanks', () => {
  it('gives 0 to the smallest value and 1 to the largest, keeping the input order', () => {
    expect(percentileRanks([3, 1, 2])).toEqual([1, 0, 0.5]);
    expect(percentileRanks([10, 20, 30, 40, 50])).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('does not depend on the input order', () => {
    const values = [0.9, 0.1, 0.5, 0.7, 0.3];
    const ranks = percentileRanks(values);
    const reversed = percentileRanks([...values].reverse());
    expect(reversed).toEqual([...ranks].reverse());
  });

  it('gives tied values their average rank', () => {
    // [1, 2, 2, 3]: the two 2s sit at positions 1 and 2 of 0..3, so (1 + 2) / 2 / 3 = 0.5.
    expect(percentileRanks([1, 2, 2, 3])).toEqual([0, 0.5, 0.5, 1]);
    // [1, 1, 2]: the 1s share positions 0 and 1: 0.5 / 2 = 0.25; the 2 is at position 2: 1.
    expect(percentileRanks([1, 1, 2])).toEqual([0.25, 0.25, 1]);
    expect(percentileRanks([5, 5, 5])).toEqual([0.5, 0.5, 0.5]);
  });

  it('gives 0.5 to a single value and nothing for no values', () => {
    expect(percentileRanks([7])).toEqual([0.5]);
    expect(percentileRanks([])).toEqual([]);
  });

  it('does not modify its input', () => {
    const values = [3, 1, 2];
    percentileRanks(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe('rankAll', () => {
  it('ranks each signal among the candidates that have it, and gives 0.5 to a candidate without it', () => {
    const scores = [
      { a: 1, b: null },
      { a: 3, b: 0.2 },
      { a: 2, b: 0.9 },
    ];
    expect(rankAll(['a', 'b'], scores)).toEqual([
      { a: 0, b: 0.5 },
      { a: 1, b: 0 },
      { a: 0.5, b: 1 },
    ]);
  });

  it('gives 0.5 to everyone for a signal that nobody has, and to a lone candidate with data', () => {
    expect(rankAll(['a'], [{ a: null }, { a: null }])).toEqual([{ a: 0.5 }, { a: 0.5 }]);
    expect(rankAll(['a'], [{ a: 0.3 }, { a: null }])).toEqual([{ a: 0.5 }, { a: 0.5 }]);
    expect(rankAll(['a'], [])).toEqual([]);
  });

  it('keeps candidates in the input order and does not modify the input', () => {
    const scores = [{ a: 0.2 }, { a: 0.8 }, { a: 0.5 }];
    const before = JSON.stringify(scores);
    expect(rankAll(['a'], scores)).toEqual([{ a: 0 }, { a: 1 }, { a: 0.5 }]);
    expect(rankAll(['a'], [...scores].reverse())).toEqual([{ a: 0.5 }, { a: 1 }, { a: 0 }]);
    expect(JSON.stringify(scores)).toBe(before);
  });
});

describe('combineSignals', () => {
  const names = ['a', 'b', 'c'] as const;
  const weights = { a: 0.35, b: 0.3, c: 0.25 };

  it('re-normalizes the weights and sums weight x rank when every signal has data', () => {
    // Weights sum to 0.9. score = (0.35 x 1 + 0.3 x 0.5 + 0.25 x 0) / 0.9 = 0.5 / 0.9.
    const result = combineSignals(names, { a: 0.9, b: 0.5, c: 0.1 }, { a: 1, b: 0.5, c: 0 }, weights);
    expect(result).not.toBeNull();
    expect(result?.score).toBeCloseTo(0.5555556, 7);
    expect(result?.weights.a).toBeCloseTo(0.3888889, 7);
    expect(result?.weights.b).toBeCloseTo(0.3333333, 7);
    expect(result?.weights.c).toBeCloseTo(0.2777778, 7);
  });

  it('counts a missing signal at MISSING_WEIGHT_FACTOR of its weight, with the rank it was given', () => {
    expect(MISSING_WEIGHT_FACTOR).toBe(0.5);
    // c is missing (rank 0.5): weights 0.35, 0.3 and 0.25 x 0.5 = 0.125, total 0.775.
    // score = (0.35 x 1 + 0.3 x 0.5 + 0.125 x 0.5) / 0.775 = 0.5625 / 0.775.
    const scores = { a: 0.9, b: 0.5, c: null };
    const ranks = { a: 1, b: 0.5, c: 0.5 };
    const result = combineSignals(names, scores, ranks, weights);
    expect(result?.score).toBeCloseTo(0.7258065, 7);
    expect(result?.weights.a).toBeCloseTo(0.4516129, 7);
    expect(result?.weights.b).toBeCloseTo(0.3870968, 7);
    expect(result?.weights.c).toBeCloseTo(0.1612903, 7);
    // The default is the constant.
    expect(combineSignals(names, scores, ranks, weights, 0.5)).toEqual(result);
  });

  it('takes the factor as an argument: 0 drops the missing signal, 1 counts it in full', () => {
    const scores = { a: 0.9, b: 0.5, c: null };
    const ranks = { a: 1, b: 0.5, c: 0.5 };
    // Factor 0: (0.35 + 0.15) / 0.65.
    expect(combineSignals(names, scores, ranks, weights, 0)?.score).toBeCloseTo(0.7692308, 7);
    expect(combineSignals(names, scores, ranks, weights, 0)?.weights.c).toBe(0);
    // Factor 1: (0.35 + 0.15 + 0.125) / 0.9.
    expect(combineSignals(names, scores, ranks, weights, 1)?.score).toBeCloseTo(0.6944444, 7);
  });

  it('gives effective weights that sum to 1', () => {
    const result = combineSignals(names, { a: 0.9, b: null, c: null }, { a: 0.2, b: 0.5, c: 0.5 }, weights);
    expect(result).not.toBeNull();
    const sum = (result?.weights.a ?? 0) + (result?.weights.b ?? 0) + (result?.weights.c ?? 0);
    expect(sum).toBeCloseTo(1, 12);
  });

  it('cannot score a candidate when no signal has data, or when only zero-weight signals have data', () => {
    expect(combineSignals(['a', 'b'], { a: null, b: null }, { a: 0.5, b: 0.5 }, { a: 0.5, b: 0.5 })).toBeNull();
    // Only a has data and its weight is 0: the missing signals must not carry the score on their own.
    expect(combineSignals(names, { a: 0.5, b: null, c: null }, { a: 0.5, b: 0.5, c: 0.5 }, { a: 0, b: 0.3, c: 0.25 })).toBeNull();
    // Give a its weight back and the same candidate is scored.
    expect(combineSignals(names, { a: 0.5, b: null, c: null }, { a: 0.5, b: 0.5, c: 0.5 }, { a: 0.1, b: 0.3, c: 0.25 })).not.toBeNull();
  });

  it('keeps a zero-weight signal at zero weight, whether or not it has data', () => {
    const withData = combineSignals(names, { a: 0.9, b: 0.5, c: 0.1 }, { a: 1, b: 0.5, c: 0 }, { a: 0.5, b: 0.5, c: 0 });
    expect(withData?.weights.c).toBe(0);
    expect(withData?.score).toBeCloseTo(0.75, 12);
    const withoutData = combineSignals(names, { a: 0.9, b: 0.5, c: null }, { a: 1, b: 0.5, c: 0.5 }, { a: 0.5, b: 0.5, c: 0 });
    expect(withoutData?.weights.c).toBe(0);
  });
});
