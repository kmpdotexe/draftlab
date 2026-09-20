import { describe, expect, it } from 'vitest';
import { deriveDraft, drafterAt } from './derive';
import { leagueOf, snapshotOf } from './test-support';

const sequence = (league: ReturnType<typeof leagueOf>) => {
  const total = league.drafters.length * league.rounds;
  return Array.from({ length: total }, (_, n) => drafterAt(league, n).drafter);
};

describe('drafterAt', () => {
  it('goes 0..D-1 every round in a linear draft', () => {
    const league = leagueOf({ order: 'linear' }); // 3 drafters, 2 rounds
    expect(sequence(league)).toEqual([0, 1, 2, 0, 1, 2]);
    expect(drafterAt(league, 4)).toEqual({ round: 1, drafter: 1 });
  });

  it('reverses every odd round in a snake draft', () => {
    expect(sequence(leagueOf({ rounds: 3 }))).toEqual([0, 1, 2, 2, 1, 0, 0, 1, 2]);
    expect(sequence(leagueOf({ drafters: ['A', 'B'], me: 0, rounds: 4 }))).toEqual([0, 1, 1, 0, 0, 1, 1, 0]);
    expect(sequence(leagueOf({ drafters: ['A', 'B', 'C', 'D'], me: 0, rounds: 2 }))).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
  });

  it('reports the 0-based round', () => {
    expect(drafterAt(leagueOf(), 0)).toEqual({ round: 0, drafter: 0 });
    expect(drafterAt(leagueOf(), 3)).toEqual({ round: 1, drafter: 2 });
  });

  it('throws RangeError outside 0 .. drafters*rounds-1', () => {
    const league = leagueOf(); // 6 slots
    expect(() => drafterAt(league, -1)).toThrow(RangeError);
    expect(() => drafterAt(league, 6)).toThrow(RangeError);
    expect(() => drafterAt(league, 1.5)).toThrow(RangeError);
  });
});

describe('deriveDraft', () => {
  const league = leagueOf(); // Ana, Ben, Cy; snake; 2 rounds; budget 50; prices a30 b20 c10 d5 e5(banned) f1 g0; h unpriced
  const snapshot = snapshotOf();

  it('starts with the full pool, sorted by price descending then id, without banned or unpriced species', () => {
    const state = deriveDraft(league, [], snapshot);
    expect(state.pool).toEqual(['a', 'b', 'c', 'd', 'f', 'g']);
    expect(state.picks).toEqual([]);
    expect(state.complete).toBe(false);
    expect(state.onTheClock).toEqual({ number: 1, round: 1, drafter: 0 });
    for (const d of state.drafters) {
      expect(d.roster).toEqual([]);
      expect(d.spent).toBe(0);
      expect(d.remaining).toBe(50);
      expect(d.openSlots).toBe(2);
      expect(d.pointsNeededToFill).toBe(1); // cheapest two prices: 0 + 1
      expect(d.cannotFillRoster).toBe(false);
    }
    expect(state.drafters.map((d) => d.name)).toEqual(['Ana', 'Ben', 'Cy']);
  });

  it('breaks price ties by id', () => {
    const state = deriveDraft(leagueOf({ prices: { b: 5, a: 5 } }), [], snapshotOf());
    expect(state.pool).toEqual(['a', 'b']);
  });

  it('derives rosters, budgets, the pool and the clock after some picks', () => {
    const state = deriveDraft(league, ['a', 'b', 'c'], snapshot);
    expect(state.picks).toEqual([
      { number: 1, round: 1, drafter: 0, species: 'a', price: 30 },
      { number: 2, round: 1, drafter: 1, species: 'b', price: 20 },
      { number: 3, round: 1, drafter: 2, species: 'c', price: 10 },
    ]);
    expect(state.pool).toEqual(['d', 'f', 'g']);
    expect(state.onTheClock).toEqual({ number: 4, round: 2, drafter: 2 });
    const [ana, ben, cy] = state.drafters;
    expect(ana).toMatchObject({ roster: ['a'], spent: 30, remaining: 20, openSlots: 1, pointsNeededToFill: 0 });
    expect(ben).toMatchObject({ roster: ['b'], spent: 20, remaining: 30, openSlots: 1 });
    expect(cy).toMatchObject({ roster: ['c'], spent: 10, remaining: 40, openSlots: 1 });
  });

  it('is complete after every slot is filled', () => {
    const state = deriveDraft(league, ['a', 'b', 'c', 'd', 'f', 'g'], snapshot);
    expect(state.complete).toBe(true);
    expect(state.onTheClock).toBeNull();
    expect(state.pool).toEqual([]);
    expect(state.picks.map((p) => [p.number, p.round, p.drafter, p.price])).toEqual([
      [1, 1, 0, 30], [2, 1, 1, 20], [3, 1, 2, 10], [4, 2, 2, 5], [5, 2, 1, 1], [6, 2, 0, 0],
    ]);
    const [ana, ben, cy] = state.drafters;
    expect(ana).toMatchObject({ roster: ['a', 'g'], spent: 30, remaining: 20, openSlots: 0, pointsNeededToFill: 0, cannotFillRoster: false });
    expect(ben).toMatchObject({ roster: ['b', 'f'], spent: 21, remaining: 29, openSlots: 0 });
    expect(cy).toMatchObject({ roster: ['c', 'd'], spent: 15, remaining: 35, openSlots: 0 });
  });

  it('sums the cheapest open-slot prices and flags a drafter who cannot afford them', () => {
    const tight = leagueOf({
      drafters: ['Ana', 'Ben'], me: 0, order: 'linear', rounds: 2, budget: 31, prices: { a: 30, b: 20, c: 10 }, extraBans: [],
    });
    const state = deriveDraft(tight, ['a'], snapshotOf(['a', 'b', 'c']));
    expect(state.drafters[0]).toMatchObject({ remaining: 1, openSlots: 1, pointsNeededToFill: 10, cannotFillRoster: true });
    expect(state.drafters[1]).toMatchObject({ remaining: 31, openSlots: 2, pointsNeededToFill: 30, cannotFillRoster: false });
  });

  it('reports null points needed, and cannotFillRoster, when the pool is smaller than the open slots', () => {
    const small = leagueOf({
      drafters: ['Ana', 'Ben'], me: 0, order: 'linear', rounds: 3, prices: { a: 1, b: 1 }, extraBans: [],
    });
    const state = deriveDraft(small, [], snapshotOf(['a', 'b']));
    expect(state.drafters[0].pointsNeededToFill).toBeNull();
    expect(state.drafters[0].cannotFillRoster).toBe(true);
  });

  it('ignores prices for species that are not in the snapshot', () => {
    const state = deriveDraft(leagueOf({ prices: { a: 3, ghost: 1 }, extraBans: [] }), [], snapshotOf(['a']));
    expect(state.pool).toEqual(['a']);
  });

  it('counts a picked species that has no price as costing 0', () => {
    const state = deriveDraft(league, ['h'], snapshot);
    expect(state.picks[0].price).toBe(0);
  });

  it('throws RangeError when there are more picks than slots', () => {
    expect(() => deriveDraft(league, ['a', 'b', 'c', 'd', 'f', 'g', 'h'], snapshot)).toThrow(RangeError);
  });

  it('does not modify its inputs', () => {
    const picks = ['a', 'b'];
    const before = JSON.stringify({ league, picks });
    deriveDraft(league, picks, snapshot);
    expect(JSON.stringify({ league, picks })).toBe(before);
  });
});
