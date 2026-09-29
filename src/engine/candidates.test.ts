import { describe, expect, it } from 'vitest';
import { deriveDraft } from '../domain/derive';
import type { DraftState } from '../domain/derive';
import type { LeagueConfig } from '../domain/league';
import { leagueOf, snapshotOf, speciesEntry } from '../domain/test-support';
import type { Snapshot } from '../domain/types';
import { contextFor, selectCandidates, usageOf } from './candidates';
import { usageData, usageEntry } from './test-support';
import type { SuggestContext, SuggestOptions } from './types';

type Slice = Pick<Snapshot, 'species' | 'usage'>;

/** Species with the given dex numbers and, optionally, usage shares (null means no usage data at all). */
const slice = (nums: Record<string, number>, shares: Record<string, number> | null = null): Slice => ({
  species: Object.fromEntries(Object.entries(nums).map(([id, num]) => [id, speciesEntry(id, id, { num })])),
  usage: shares === null ? null : usageData(Object.entries(shares).map(([id, usage]) => usageEntry(id, { usage }))),
});

const POOL_NUMS = { p1: 1, p2: 2, p3: 3, p4: 4, p5: 5 };
const PRICES: Record<string, number> = { p1: 5, p2: 3, p3: 8, p4: 3, p5: 10 };
// Sorted by price then id: p2 (3), p4 (3), p1 (5), p3 (8), p5 (10). Prefix sums of that order: 0, 3, 6, 11, 19, 29.
const ctx = (overrides: Partial<SuggestContext> = {}): SuggestContext => ({
  roster: [],
  pool: ['p5', 'p1', 'p3', 'p2', 'p4'], // shuffled on purpose
  prices: { ...PRICES },
  remaining: 100,
  openSlots: 1,
  ...overrides,
});
const ids = (result: ReturnType<typeof selectCandidates>) => result.candidates.map((entry) => entry.species);
const select = (
  overrides: Partial<SuggestContext> = {},
  snapshot: Slice = slice(POOL_NUMS),
  roster: string[] = [],
  options: SuggestOptions = {},
) => selectCandidates(ctx(overrides), roster, snapshot, options);

describe('selectCandidates: the budget reserve', () => {
  it('reserves the cheapest prices of the OTHER species for the other open slots (3 open slots: reserve 2)', () => {
    // k = 2. Total needed to pick each candidate and still fill: p2 3 + (p4 3 + p1 5) = 11; p4 3 + (p2 3 + p1 5) = 11;
    // p1 5 + (p2 3 + p4 3) = 11; p3 8 + 6 = 14; p5 10 + 6 = 16.
    expect(ids(select({ openSlots: 3, remaining: 13 }))).toEqual(['p2', 'p4', 'p1']);
    expect(ids(select({ openSlots: 3, remaining: 14 }))).toEqual(['p2', 'p4', 'p1', 'p3']); // p3 exactly on the boundary
    expect(ids(select({ openSlots: 3, remaining: 16 }))).toEqual(['p2', 'p4', 'p1', 'p3', 'p5']);
    expect(ids(select({ openSlots: 3, remaining: 11 }))).toEqual(['p2', 'p4', 'p1']);
    expect(ids(select({ openSlots: 3, remaining: 10 }))).toEqual([]);
    // Reserving pointsNeededToFill (the cheapest 3 = 11) plus the candidate's own price would already refuse p2 at 13.
  });

  it('with one open slot there is no reserve: the price alone must fit', () => {
    expect(ids(select({ openSlots: 1, remaining: 8 }))).toEqual(['p2', 'p4', 'p1', 'p3']);
    expect(ids(select({ openSlots: 1, remaining: 7 }))).toEqual(['p2', 'p4', 'p1']);
    expect(ids(select({ openSlots: 1, remaining: 2 }))).toEqual([]);
  });

  it('handles a candidate inside and outside the cheapest set (4 open slots: reserve 3)', () => {
    // Cheapest four are p2 3, p4 3, p1 5, p3 8 = 19. Each of them needs exactly 19; p5 needs 10 + 3 + 3 + 5 = 21.
    expect(ids(select({ openSlots: 4, remaining: 19 }))).toEqual(['p2', 'p4', 'p1', 'p3']);
    expect(ids(select({ openSlots: 4, remaining: 18 }))).toEqual([]);
    expect(ids(select({ openSlots: 4, remaining: 21 }))).toEqual(['p2', 'p4', 'p1', 'p3', 'p5']);
  });

  it('uses whatever others exist when the pool is smaller than the open slots, and reports the pool size', () => {
    // Two species, 4 open slots: each candidate needs its own price plus the one other species (3 + 3 = 6).
    const result = select({ pool: ['p4', 'p2'], openSlots: 4, remaining: 6 });
    expect(ids(result)).toEqual(['p2', 'p4']);
    expect(result.pricedPoolSize).toBe(2);
    expect(ids(select({ pool: ['p4', 'p2'], openSlots: 4, remaining: 5 }))).toEqual([]);
  });

  it('returns candidates in price then id order regardless of the pool order', () => {
    expect(ids(select({ pool: ['p3', 'p5', 'p4', 'p2', 'p1'] }))).toEqual(['p2', 'p4', 'p1', 'p3', 'p5']);
    expect(select().candidates[0]).toEqual({ species: 'p2', price: 3 });
  });

  it('ignores unpriced, non-finite and repeated pool entries, and inherited property names', () => {
    const odd = select({
      pool: ['p1', 'p1', 'p2', 'p3', 'p4', 'constructor'],
      prices: { p1: 5, p2: 'x', p3: Number.NaN, p4: 3 } as unknown as Record<string, number>,
    });
    expect(ids(odd)).toEqual(['p4', 'p1']);
    expect(odd.pricedPoolSize).toBe(2);
  });

  it('counts a priced pool id that is not in the snapshot toward the reserve and the pool size, but never suggests it', () => {
    // ghost 2, p1 5, 2 open slots: p1 needs 5 + 2 = 7.
    const withGhost = select({ pool: ['ghost', 'p1'], prices: { ghost: 2, p1: 5 }, openSlots: 2, remaining: 7 });
    expect(ids(withGhost)).toEqual(['p1']);
    expect(withGhost.pricedPoolSize).toBe(2);
    expect(ids(select({ pool: ['ghost', 'p1'], prices: { ghost: 2, p1: 5 }, openSlots: 2, remaining: 6 }))).toEqual([]);
  });
});

describe('selectCandidates: overBudget', () => {
  it('counts the species that pass every rule but fail the budget', () => {
    // 3 open slots, remaining 10: p2, p4, p1 need 11, p3 needs 14, p5 needs 16, so all five are over budget.
    const none = select({ openSlots: 3, remaining: 10 });
    expect(none.candidates).toEqual([]);
    expect(none.overBudget).toBe(5);
    // At 13 p2, p4 and p1 fit; p3 (14) and p5 (16) do not.
    const some = select({ openSlots: 3, remaining: 13 });
    expect(ids(some)).toEqual(['p2', 'p4', 'p1']);
    expect(some.overBudget).toBe(2);
    expect(select({ openSlots: 3, remaining: 100 }).overBudget).toBe(0);
  });

  it('does not count a species that a usage filter, the roster or the dex rule already excluded', () => {
    // p3 is at 90% usage: maxUsage 0.5 removes it, so only p5 is over budget at 13.
    const busy = slice(POOL_NUMS, { p3: 0.9 });
    const filtered = select({ openSlots: 3, remaining: 13 }, busy, [], { maxUsage: 0.5 });
    expect(ids(filtered)).toEqual(['p2', 'p4', 'p1']);
    expect(filtered.overBudget).toBe(1);
    // minUsage 0.5 keeps only p3, which is over budget; the other four fail the filter, not the budget.
    const kept = select({ openSlots: 3, remaining: 13 }, busy, [], { minUsage: 0.5 });
    expect(kept.candidates).toEqual([]);
    expect(kept.overBudget).toBe(1);

    // r1 is on the roster and shares dex number 5 with p5: p5 is excluded by the dex rule, so only p3 is over budget.
    const dex = slice({ ...POOL_NUMS, r1: 5 });
    const byDex = select({ roster: ['r1'], openSlots: 3, remaining: 13 }, dex, ['r1']);
    expect(ids(byDex)).toEqual(['p2', 'p4', 'p1']);
    expect(byDex.overBudget).toBe(1);
  });

  it('does not count a pool id that is not in the snapshot or is on the roster', () => {
    const snapshot = slice({ ...POOL_NUMS, r1: 10 });
    const result = select(
      { roster: ['r1'], pool: ['ghost', 'r1', 'p1'], prices: { ghost: 50, r1: 50, p1: 5 }, openSlots: 1, remaining: 4 },
      snapshot,
      ['r1'],
    );
    expect(result.candidates).toEqual([]);
    expect(result.overBudget).toBe(1); // p1 only
  });
});

describe('selectCandidates: roster and dex numbers', () => {
  it('leaves out the roster and every species that shares a dex number with a roster member', () => {
    const snapshot = slice({ r1: 10, p1: 10, p2: 11 });
    const result = selectCandidates(
      ctx({ roster: ['r1'], pool: ['r1', 'p1', 'p2'], prices: { r1: 1, p1: 5, p2: 3 } }),
      ['r1'],
      snapshot,
      {},
    );
    expect(ids(result)).toEqual(['p2']);
  });
});

describe('selectCandidates: usage filters', () => {
  // p1 is at 2% usage, p2 at 10%, the others have no usage entry (usage 0).
  const shares = slice(POOL_NUMS, { p1: 0.02, p2: 0.1 });

  it('maxUsage keeps species at or below it, and species with no usage entry', () => {
    expect(ids(select({}, shares, [], { maxUsage: 0.05 }))).toEqual(['p4', 'p1', 'p3', 'p5']);
    expect(ids(select({}, shares, [], { maxUsage: 0.02 }))).toEqual(['p4', 'p1', 'p3', 'p5']); // boundary is inclusive
    expect(ids(select({}, shares, [], { maxUsage: 0.01 }))).toEqual(['p4', 'p3', 'p5']);
  });

  it('minUsage keeps species at or above it and drops species with no usage entry', () => {
    expect(ids(select({}, shares, [], { minUsage: 0.05 }))).toEqual(['p2']);
    expect(ids(select({}, shares, [], { minUsage: 0.1 }))).toEqual(['p2']); // boundary is inclusive
    expect(ids(select({}, shares, [], { minUsage: 0.02, maxUsage: 0.02 }))).toEqual(['p1']);
  });

  it('ignores a filter that is not a finite number', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 'x', null, {}]) {
      const options = { maxUsage: bad, minUsage: bad } as unknown as SuggestOptions;
      expect(ids(select({}, shares, [], options)), String(bad)).toEqual(['p2', 'p4', 'p1', 'p3', 'p5']);
    }
  });

  it('treats every species as usage 0 when there is no usage data', () => {
    const none = slice(POOL_NUMS, null);
    expect(ids(select({}, none, [], { maxUsage: 0.05 }))).toHaveLength(5);
    expect(ids(select({}, none, [], { minUsage: 0.05 }))).toEqual([]);
  });
});

describe('usageOf', () => {
  it('reads the usage fraction, and gives 0 for no entry, no usage data or an inherited property name', () => {
    const withUsage = slice(POOL_NUMS, { p1: 0.02 });
    expect(usageOf(withUsage, 'p1')).toBe(0.02);
    expect(usageOf(withUsage, 'p2')).toBe(0);
    expect(usageOf(withUsage, 'constructor')).toBe(0);
    expect(usageOf({ usage: null }, 'p1')).toBe(0);
  });
});

describe('contextFor', () => {
  // leagueOf(): 3 drafters snake, 2 rounds, budget 50, me = 1. Picks a, b, c go to Ana, Ben, Cy (round 1).
  const league: LeagueConfig = leagueOf();
  const draft: DraftState = deriveDraft(league, ['a', 'b', 'c'], snapshotOf());

  it("builds a context from a drafter's state (roster, remaining budget, open slots) and the draft's pool", () => {
    // Ben: roster b (20 points), 30 left, 1 open slot. Pool: legal, priced, not banned (e), not taken: d 5, f 1, g 0.
    expect(contextFor(league, draft, 1)).toEqual({
      roster: ['b'],
      pool: ['d', 'f', 'g'],
      prices: league.prices,
      remaining: 30,
      openSlots: 1,
    });
    expect(contextFor(league, draft, 0)).toEqual({
      roster: ['a'],
      pool: ['d', 'f', 'g'],
      prices: league.prices,
      remaining: 20,
      openSlots: 1,
    });
  });

  it('returns null for a drafter index that is not an integer in range, and for malformed input', () => {
    for (const bad of [-1, 3, 1.5, Number.NaN, '1']) {
      expect(contextFor(league, draft, bad as number), String(bad)).toBeNull();
    }
    expect(contextFor(null as unknown as LeagueConfig, draft, 1)).toBeNull();
    expect(contextFor(league, null as unknown as DraftState, 1)).toBeNull();
    expect(contextFor(league, { drafters: 5 } as unknown as DraftState, 1)).toBeNull();
  });

  it('returns null when the drafter entry is not an object with a roster array', () => {
    expect(contextFor(league, { drafters: [null], pool: [] } as unknown as DraftState, 0)).toBeNull();
    expect(contextFor(league, { drafters: [{ roster: 'x' }], pool: [] } as unknown as DraftState, 0)).toBeNull();
    expect(contextFor(league, { drafters: [{ remaining: 5, openSlots: 1 }], pool: [] } as unknown as DraftState, 0)).toBeNull();
  });

  it('adds a copy of the entered sets when given an object, and no sets field otherwise', () => {
    const sets = { b: { species: 'b', moves: ['tackle'], points: { hp: 32, atk: 32, def: 2, spa: 0, spd: 0, spe: 0 } } };
    const context = contextFor(league, draft, 1, sets);
    expect(context?.sets).toEqual(sets);
    expect(context?.sets).not.toBe(sets);
    expect(context?.sets?.b).not.toBe(sets.b);
    expect(context?.sets?.b.moves).not.toBe(sets.b.moves);
    expect(context?.sets?.b.points).not.toBe(sets.b.points);
    // Changing the copy leaves the original alone.
    context?.sets?.b.moves?.push('surf');
    expect(sets.b.moves).toEqual(['tackle']);
    for (const bad of [undefined, null, 5, 'x', [1]]) {
      const plain = contextFor(league, draft, 1, bad as never);
      expect(plain !== null && Object.hasOwn(plain, 'sets'), String(bad)).toBe(false);
    }
  });

  it('copies only the set entries that are objects, and keeps an id such as __proto__ as an own entry', () => {
    const given = JSON.parse('{"__proto__": {"moves": ["tackle"]}, "b": 5, "c": {"ability": "x"}}');
    const context = contextFor(league, draft, 1, given);
    expect(Object.keys(context?.sets ?? {})).toEqual(['__proto__', 'c']);
    expect(Object.getPrototypeOf(context?.sets)).toBe(Object.prototype);
  });

  it('returns copies, so changing the context leaves the draft and the league alone', () => {
    const context = contextFor(league, draft, 1);
    expect(context).not.toBeNull();
    if (context === null) return;
    expect(context.roster).toEqual(draft.drafters[1].roster);
    expect(context.roster).not.toBe(draft.drafters[1].roster);
    expect(context.pool).toEqual(draft.pool);
    expect(context.pool).not.toBe(draft.pool);
    expect(context.prices).toEqual(league.prices);
    expect(context.prices).not.toBe(league.prices);

    const before = JSON.stringify({ draft, league });
    context.roster.push('zzz');
    context.pool.push('zzz');
    context.prices.zzz = 99;
    expect(draft.drafters[1].roster).toEqual(['b']);
    expect(JSON.stringify({ draft, league })).toBe(before);
  });
});

describe('selectCandidates: robustness', () => {
  it('does not modify its inputs', () => {
    const context = ctx({ openSlots: 3, remaining: 14 });
    const snapshot = slice(POOL_NUMS, { p1: 0.02 });
    const before = JSON.stringify({ context, snapshot });
    selectCandidates(context, [], snapshot, { maxUsage: 0.5 });
    expect(JSON.stringify({ context, snapshot })).toBe(before);
  });
});
