import { describe, expect, it } from 'vitest';
import { deriveDraft } from './derive';
import { applyPick, checkPick, undoPick } from './draft';
import { leagueOf, PRICES, snapshotOf, SPECIES_IDS } from './test-support';

// Default league: Ana, Ben, Cy; snake; 2 rounds (order Ana, Ben, Cy, Cy, Ben, Ana); budget 50.
// Extra species: 'ghost' is priced but not legal, 'big' costs 60, 'mid' costs 20.
const league = leagueOf({ prices: { ...PRICES, ghost: 1, big: 60, mid: 20 } });
const snapshot = snapshotOf([...SPECIES_IDS, 'big', 'mid']);

describe('checkPick', () => {
  it('accepts a legal, priced, unbanned, untaken, affordable species', () => {
    expect(checkPick(league, [], 'a', snapshot)).toBeNull();
  });

  it('refuses a species that is not legal in the format', () => {
    const problem = checkPick(league, [], 'ghost', snapshot);
    expect(problem?.path).toBe('picks[0]');
    expect(problem?.message).toContain('ghost');
    expect(problem?.message).toContain('not legal');
    expect(problem?.message).toContain('fmt');
  });

  it('refuses a species with no price', () => {
    expect(checkPick(league, [], 'h', snapshot)?.message).toContain('no price');
  });

  it('refuses a banned species', () => {
    expect(checkPick(league, [], 'e', snapshot)?.message).toContain('banned');
  });

  it('refuses a species that was already picked, at the right slot', () => {
    const problem = checkPick(league, ['a'], 'a', snapshot);
    expect(problem?.path).toBe('picks[1]');
    expect(problem?.message).toContain('already been picked');
  });

  it('refuses a species that costs more than the drafter on the clock has left', () => {
    expect(checkPick(league, [], 'big', snapshot)?.message).toBe('"big" costs 60 points but Ana has 50 left');
    // After a, b, c the clock is on Cy, who spent 10 on c.
    expect(checkPick(league, ['a', 'b', 'c'], 'big', snapshot)?.message).toBe('"big" costs 60 points but Cy has 40 left');
    expect(checkPick(league, ['a', 'b', 'c'], 'mid', snapshot)).toBeNull();
  });

  it('refuses any pick once the draft is complete, even with too many picks', () => {
    const full = ['a', 'b', 'c', 'd', 'f', 'g'];
    const problem = checkPick(league, full, 'mid', snapshot);
    expect(problem?.path).toBe('picks[6]');
    expect(problem?.message).toContain('already complete');
    expect(checkPick(league, [...full, 'h'], 'mid', snapshot)?.message).toContain('already complete');
  });

  it('checks the reasons in a fixed order', () => {
    // complete first
    expect(checkPick(league, ['a', 'b', 'c', 'd', 'f', 'g'], 'ghost', snapshot)?.message).toContain('already complete');
    // legal before priced: unknown to the snapshot and unpriced
    expect(checkPick(league, [], 'zzz', snapshot)?.message).toContain('not legal');
    // banned before taken
    expect(checkPick(league, ['e'], 'e', snapshot)?.message).toContain('banned');
  });

  it('does not refuse a pick that will leave the drafter unable to fill the roster', () => {
    const tight = leagueOf({
      drafters: ['Ana', 'Ben'], me: 0, order: 'linear', rounds: 2, budget: 31, prices: { a: 30, b: 20, c: 10 }, extraBans: [],
    });
    const tightSnapshot = snapshotOf(['a', 'b', 'c']);
    const result = applyPick(tight, [], 'a', tightSnapshot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(deriveDraft(tight, result.picks, tightSnapshot).drafters[0].cannotFillRoster).toBe(true);
    }
  });
});

describe('applyPick', () => {
  it('returns a new list with the species appended and leaves the input alone', () => {
    const picks = ['a'];
    const result = applyPick(league, picks, 'b', snapshot);
    expect(result).toEqual({ ok: true, picks: ['a', 'b'] });
    expect(picks).toEqual(['a']);
  });

  it('returns the problem when the pick is refused', () => {
    const result = applyPick(league, [], 'h', snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem.message).toContain('no price');
  });
});

describe('undoPick', () => {
  it('drops the last pick and returns a new list', () => {
    const picks = ['a', 'b'];
    const undone = undoPick(picks);
    expect(undone).toEqual(['a']);
    expect(undone).not.toBe(picks);
    expect(picks).toEqual(['a', 'b']);
  });

  it('leaves an empty list empty', () => {
    expect(undoPick([])).toEqual([]);
  });

  it('undoes an applied pick exactly', () => {
    const before = ['a', 'b'];
    const applied = applyPick(league, before, 'c', snapshot);
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(undoPick(applied.picks)).toEqual(before);
  });
});
