import { describe, expect, it } from 'vitest';
import { liftSignal } from './lift-signal';
import { usageData, usageEntry } from './test-support';

// Every candidate below has usage 0.1 and member `a` has weight 1000, so expected co-occurrence is 1000 x 0.1 = 100
// and lift = co / 100.
const usage = usageData([
  usageEntry('a', {
    weight: 1000,
    usage: 0.4,
    teammates: [['c', 200], ['d', 12.5], ['e', 800], ['f', 6400], ['g', 1.5625]],
  }),
  usageEntry('b', { weight: 500, usage: 0.3, teammates: [] }),
  usageEntry('c', { usage: 0.1, teammates: [['b', 50]] }), // only c lists b: the pair is found through the symmetric fallback
  usageEntry('d', { usage: 0.1 }),
  usageEntry('e', { usage: 0.1 }),
  usageEntry('f', { usage: 0.1 }),
  usageEntry('g', { usage: 0.1 }),
  usageEntry('h', { usage: 0.1 }), // no stored pair with anyone
]);

describe('liftSignal: the score', () => {
  it('maps lift 1 to 0.5 and lift 2 to 4/6', () => {
    // a -> c: lift = 200 / (1000 x 0.1) = 2, log2 = 1, score = (1 + 3) / 6.
    expect(liftSignal(['a'], 'c', usage).score).toBeCloseTo(4 / 6, 9);
    // b -> c: lift = 50 / (500 x 0.1) = 1, log2 = 0, score = 3 / 6 (found through c's list).
    expect(liftSignal(['b'], 'c', usage).score).toBe(0.5);
  });

  it('spans 0 to 1 over lifts 1/8 to 8 and clamps beyond them', () => {
    expect(liftSignal(['a'], 'd', usage).score).toBe(0); // 12.5 / 100 = 1/8, log2 = -3
    expect(liftSignal(['a'], 'e', usage).score).toBe(1); // 800 / 100 = 8, log2 = 3
    expect(liftSignal(['a'], 'f', usage).score).toBe(1); // 64: (6 + 3) / 6 clamped
    expect(liftSignal(['a'], 'g', usage).score).toBe(0); // 1/64: (-6 + 3) / 6 clamped
  });

  it('averages log2(lift) over the members that have a lift', () => {
    // a -> c lift 2 (log2 1) and b -> c lift 1 (log2 0): mean 0.5, score (0.5 + 3) / 6.
    expect(liftSignal(['a', 'b'], 'c', usage).score).toBeCloseTo(3.5 / 6, 9);
  });
});

describe('liftSignal: no data', () => {
  it('is null without usage data, without a stored pair, or for a candidate without a usage entry', () => {
    expect(liftSignal(['a'], 'c', null)).toEqual({ score: null, reasons: [] });
    expect(liftSignal(['a'], 'h', usage)).toEqual({ score: null, reasons: [] }); // h has an entry but no stored pair
    expect(liftSignal(['a'], 'nobody', usage)).toEqual({ score: null, reasons: [] });
    expect(liftSignal(['x', 'y'], 'c', usage)).toEqual({ score: null, reasons: [] }); // roster members with no usage entry
    expect(liftSignal([], 'c', usage)).toEqual({ score: null, reasons: [] });
  });

  it('ignores a pair whose lift is not above zero', () => {
    const zero = usageData([usageEntry('a', { teammates: [['c', 0]] }), usageEntry('c')]);
    expect(liftSignal(['a'], 'c', zero)).toEqual({ score: null, reasons: [] });
  });
});

describe('liftSignal: reasons', () => {
  it('reports the strongest partners, the weakest partner and how many members had data', () => {
    // Six roster members, each weight 100, candidate usage 0.5: expected co-occurrence 100 x 0.5 = 50 for each.
    // co = lift x 50: m1 200 (lift 4), m2 100 (2), m3 100 (2), m4 150 (3), m5 25 (0.5), m6 12.5 (0.25).
    const table = usageData([
      usageEntry('m1', { teammates: [['cand', 200]] }),
      usageEntry('m2', { teammates: [['cand', 100]] }),
      usageEntry('m3', { teammates: [['cand', 100]] }),
      usageEntry('m4', { teammates: [['cand', 150]] }),
      usageEntry('m5', { teammates: [['cand', 25]] }),
      usageEntry('m6', { teammates: [['cand', 12.5]] }),
      usageEntry('cand', { usage: 0.5 }),
    ]);
    // Roster passed in reverse: the output order must come from the lifts and ids, not from the roster order.
    const result = liftSignal(['m6', 'm5', 'm4', 'm3', 'm2', 'm1'], 'cand', table);
    // mean log2 = (2 + 1 + 1 + 1.5849625 - 1 - 2) / 6 = 0.4308271, score = (0.4308271 + 3) / 6.
    expect(result.score).toBeCloseTo(0.5718045, 6);
    expect(result.reasons).toEqual([
      { kind: 'pairs-often-with', with: 'm1', lift: 4 },
      { kind: 'pairs-often-with', with: 'm4', lift: 3 },
      { kind: 'pairs-often-with', with: 'm2', lift: 2 }, // m2 and m3 tie at 2: id ascending, and only three are listed
      { kind: 'pairs-rarely-with', with: 'm6', lift: 0.25 },
    ]);
  });

  it('adds lift-coverage when only some roster members have a lift', () => {
    const result = liftSignal(['a', 'x'], 'c', usage);
    expect(result.score).toBeCloseTo(4 / 6, 9);
    expect(result.reasons).toEqual([
      { kind: 'pairs-often-with', with: 'a', lift: 2 },
      { kind: 'lift-coverage', covered: 1, of: 2 },
    ]);
  });

  it('lists no often or rarely reason for a lift of exactly 1', () => {
    expect(liftSignal(['b'], 'c', usage).reasons).toEqual([]);
  });

  it('does not modify its inputs', () => {
    const before = JSON.stringify(usage);
    const roster = ['a', 'b'];
    liftSignal(roster, 'c', usage);
    expect(JSON.stringify(usage)).toBe(before);
    expect(roster).toEqual(['a', 'b']);
  });
});
