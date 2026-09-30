import { describe, expect, it } from 'vitest';
import type { DraftFile } from '../../domain/file';
import { leagueOf, snapshotOf } from '../../domain/test-support';
import { makeDraftReducer, type DraftStoreState } from './draft-store';

// leagueOf(): drafters Ana, Ben, Cy (snake, 2 rounds, budget 50, me = Ben); prices a 30, b 20, c 10, d 5, e 5, f 1, g 0;
// 'e' is banned and 'h' has no price.
const reduce = makeDraftReducer(snapshotOf());
const empty: DraftStoreState = { file: null, errors: [] };
const fileWith = (picks: string[]): DraftStoreState => ({
  file: { schemaVersion: 2, league: leagueOf(), picks, sets: {}, teams: [] },
  errors: [],
});

describe('set-league', () => {
  it('creates the file from nothing, with no picks, sets or teams', () => {
    const next = reduce(empty, { type: 'set-league', league: leagueOf() });
    expect(next).toEqual({ file: { schemaVersion: 2, league: leagueOf(), picks: [], sets: {}, teams: [] }, errors: [] });
  });

  it('refuses an invalid league and keeps the state', () => {
    const next = reduce(empty, { type: 'set-league', league: leagueOf({ name: ' ', budget: 0 }) });
    expect(next.file).toBeNull();
    expect(next.errors.map((p) => p.path)).toEqual(['league.name', 'league.budget']);
  });

  it('replaces the league and keeps picks, sets and teams', () => {
    const start: DraftStoreState = { file: { ...fileWith(['a']).file!, sets: { a: { species: 'a' } }, teams: [{ name: 'T', members: ['a'] }] }, errors: [] };
    const next = reduce(start, { type: 'set-league', league: leagueOf({ name: 'Renamed', budget: 60 }) });
    expect(next.errors).toEqual([]);
    expect(next.file?.league.name).toBe('Renamed');
    expect(next.file?.picks).toEqual(['a']);
    expect(next.file?.sets).toEqual({ a: { species: 'a' } });
    expect(next.file?.teams).toEqual([{ name: 'T', members: ['a'] }]);
  });

  it('locks drafters, order, rounds and your slot once a pick is recorded', () => {
    const start = fileWith(['a']);
    const changes = [
      { drafters: ['Ana', 'Ben', 'Dee'] },
      { order: 'linear' as const },
      { rounds: 3 },
      { me: 0 },
    ];
    for (const change of changes) {
      const next = reduce(start, { type: 'set-league', league: leagueOf(change) });
      expect(next.file, JSON.stringify(change)).toBe(start.file);
      expect(next.errors[0].message, JSON.stringify(change)).toMatch(/cannot change once picks are recorded/);
    }
    // Without picks the same changes are fine.
    expect(reduce(fileWith([]), { type: 'set-league', league: leagueOf({ rounds: 3 }) }).errors).toEqual([]);
  });

  it('refuses a price or ban change that would break a recorded pick, naming the pick', () => {
    const start = fileWith(['c', 'a']);
    const banned = reduce(start, { type: 'set-league', league: leagueOf({ extraBans: ['e', 'a'] }) });
    expect(banned.file).toBe(start.file);
    expect(banned.errors).toEqual([{ path: 'picks[1]', message: 'this would break pick 2: "a" is banned in this league' }]);
    const tooExpensive = reduce(start, { type: 'set-league', league: leagueOf({ prices: { ...leagueOf().prices, a: 51 } }) });
    expect(tooExpensive.errors[0].path).toBe('picks[1]');
  });
});

describe('pick and undo', () => {
  it('appends a pick the domain allows', () => {
    expect(reduce(fileWith([]), { type: 'pick', species: 'a' }).file?.picks).toEqual(['a']);
  });

  it('refuses a pick the domain refuses, with its message, and keeps the file', () => {
    const start = fileWith(['a']);
    for (const species of ['a', 'e', 'h', 'zz']) {
      const next = reduce(start, { type: 'pick', species });
      expect(next.file, species).toBe(start.file);
      expect(next.errors, species).toHaveLength(1);
    }
    expect(reduce(start, { type: 'pick', species: 'e' }).errors[0].message).toBe('"e" is banned in this league');
  });

  it('refuses a pick before a league exists', () => {
    expect(reduce(empty, { type: 'pick', species: 'a' })).toEqual({ file: null, errors: [{ path: 'picks', message: 'set up a league first' }] });
  });

  it('undoes the last pick, and does nothing with no picks or no file', () => {
    expect(reduce(fileWith(['a', 'b']), { type: 'undo' }).file?.picks).toEqual(['a']);
    const none = fileWith([]);
    expect(reduce(none, { type: 'undo' }).file).toBe(none.file);
    expect(reduce(empty, { type: 'undo' })).toEqual(empty);
  });

  it('clears the errors on the next successful action', () => {
    const refused = reduce(fileWith([]), { type: 'pick', species: 'e' });
    expect(refused.errors).toHaveLength(1);
    expect(reduce(refused, { type: 'pick', species: 'a' }).errors).toEqual([]);
  });
});

describe('replace and clear', () => {
  it('replaces the file, and clears it', () => {
    const other: DraftFile = { schemaVersion: 2, league: leagueOf({ name: 'Other' }), picks: ['b'], sets: {}, teams: [] };
    expect(reduce(fileWith(['a']), { type: 'replace', file: other })).toEqual({ file: other, errors: [] });
    expect(reduce(fileWith(['a']), { type: 'clear' })).toEqual({ file: null, errors: [] });
  });
});

describe('robustness', () => {
  it('never modifies the state or the action it is given', () => {
    const start = fileWith(['a']);
    const league = leagueOf({ name: 'X' });
    const before = JSON.stringify({ start, league });
    reduce(start, { type: 'pick', species: 'b' });
    reduce(start, { type: 'undo' });
    reduce(start, { type: 'set-league', league });
    expect(JSON.stringify({ start, league })).toBe(before);
  });
});
