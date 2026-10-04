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

// Snake picks go Ana, Ben (you), Cy, Cy, Ben, Ana: in fileWith(['a', 'b', 'c']) your roster is ['b'].
const mine = (extra: Partial<DraftFile> = {}): DraftStoreState => ({ file: { ...fileWith(['a', 'b', 'c']).file!, ...extra }, errors: [] });

describe('sets', () => {
  it('stores a set for a Pokémon on your roster', () => {
    const set = { species: 'b', moves: ['m1'], nature: 'Jolly' as const };
    const next = reduce(mine(), { type: 'set-set', species: 'b', set });
    expect(next.errors).toEqual([]);
    expect(next.file?.sets).toEqual({ b: set });
  });

  it('refuses a set for a Pokémon that is not yours, under the wrong key, or badly shaped', () => {
    const start = mine();
    const cases = [
      { species: 'a', set: { species: 'a' }, message: 'a is not on your roster' },
      { species: 'b', set: { species: 'c' }, message: 'this set is for c, not b' },
      { species: 'b', set: { species: 'b', moves: ['m1', 'm1'] }, message: 'duplicate move "m1"' },
    ];
    for (const { species, set, message } of cases) {
      const next = reduce(start, { type: 'set-set', species, set });
      expect(next.file, message).toBe(start.file);
      expect(next.errors.map((p) => p.message), message).toEqual([message]);
    }
    expect(reduce(empty, { type: 'set-set', species: 'b', set: { species: 'b' } }).errors[0].message).toBe('set up a league first');
  });

  it('clears a set, and does nothing for a Pokémon without one', () => {
    const start = mine({ sets: { b: { species: 'b' } } });
    expect(reduce(start, { type: 'clear-set', species: 'b' }).file?.sets).toEqual({});
    const none = mine();
    expect(reduce(none, { type: 'clear-set', species: 'b' }).file).toBe(none.file);
  });
});

describe('teams', () => {
  it('adds, renames and deletes teams', () => {
    let state = reduce(mine(), { type: 'add-team', name: ' Rain ' });
    state = reduce(state, { type: 'add-team', name: 'Sun' });
    expect(state.file?.teams).toEqual([{ name: 'Rain', members: [] }, { name: 'Sun', members: [] }]);
    state = reduce(state, { type: 'rename-team', index: 1, name: 'Trick Room' });
    expect(state.file?.teams.map((t) => t.name)).toEqual(['Rain', 'Trick Room']);
    state = reduce(state, { type: 'delete-team', index: 0 });
    expect(state.file?.teams).toEqual([{ name: 'Trick Room', members: [] }]);
  });

  it('refuses an empty name and a team that does not exist', () => {
    const start = mine({ teams: [{ name: 'T', members: [] }] });
    expect(reduce(start, { type: 'add-team', name: '  ' }).errors).toEqual([{ path: 'teams', message: 'a team needs a name' }]);
    expect(reduce(start, { type: 'rename-team', index: 0, name: '' }).errors).toEqual([{ path: 'teams[0].name', message: 'a team needs a name' }]);
    for (const action of [
      { type: 'rename-team' as const, index: 1, name: 'X' },
      { type: 'set-team-members' as const, index: -1, members: [] },
      { type: 'delete-team' as const, index: 1 },
    ]) {
      const next = reduce(start, action);
      expect(next.file, action.type).toBe(start.file);
      expect(next.errors[0].message, action.type).toBe('there is no such team');
    }
  });

  it('sets members from your roster, refusing others, repeats and more than the team size', () => {
    // A 3-round league so that your roster can hold two Pokémon: picks a (Ana), b (you), c, d (Cy), f (you).
    const reduce3 = makeDraftReducer(snapshotOf(), 1);
    const file: DraftFile = { schemaVersion: 2, league: leagueOf({ rounds: 3 }), picks: ['a', 'b', 'c', 'd', 'f'], sets: {}, teams: [{ name: 'T', members: [] }] };
    const start: DraftStoreState = { file, errors: [] };
    expect(reduce(start, { type: 'set-team-members', index: 0, members: ['f', 'b'] }).file?.teams[0].members).toEqual(['f', 'b']);
    expect(reduce(start, { type: 'set-team-members', index: 0, members: ['b', 'a'] }).errors[0].message).toBe('a is not on your roster');
    expect(reduce(start, { type: 'set-team-members', index: 0, members: ['b', 'b'] }).errors[0].message).toBe('b is listed twice');
    expect(reduce3(start, { type: 'set-team-members', index: 0, members: ['b', 'f'] }).errors).toEqual([
      { path: 'teams[0].members', message: 'a team has at most 1 Pokémon' },
    ]);
    expect(reduce3(start, { type: 'set-team-members', index: 0, members: ['f'] }).errors).toEqual([]);
  });
});

describe('undo with sets and teams', () => {
  it('removes your undone Pokémon from your sets and every team', () => {
    // picks a (Ana), b (you): undoing b is undoing your pick.
    const start: DraftStoreState = {
      file: { ...fileWith(['a', 'b']).file!, sets: { b: { species: 'b' } }, teams: [{ name: 'T', members: ['b'] }, { name: 'U', members: [] }] },
      errors: [],
    };
    const next = reduce(start, { type: 'undo' });
    expect(next.file?.picks).toEqual(['a']);
    expect(next.file?.sets).toEqual({});
    expect(next.file?.teams).toEqual([{ name: 'T', members: [] }, { name: 'U', members: [] }]);
    expect(next.file?.teams[1]).toBe(start.file?.teams[1]);
  });

  it("leaves sets and teams alone when undoing another drafter's pick", () => {
    const start = mine({ sets: { b: { species: 'b' } }, teams: [{ name: 'T', members: ['b'] }] });
    const next = reduce(start, { type: 'undo' });
    expect(next.file?.picks).toEqual(['a', 'b']);
    expect(next.file?.sets).toBe(start.file?.sets);
    expect(next.file?.teams).toBe(start.file?.teams);
  });

  it('never modifies the state it is given', () => {
    const start = mine({ sets: { b: { species: 'b' } }, teams: [{ name: 'T', members: ['b'] }] });
    const before = JSON.stringify(start);
    reduce(start, { type: 'set-set', species: 'b', set: { species: 'b', moves: ['m'] } });
    reduce(start, { type: 'clear-set', species: 'b' });
    reduce(start, { type: 'set-team-members', index: 0, members: [] });
    reduce(start, { type: 'rename-team', index: 0, name: 'X' });
    reduce(start, { type: 'delete-team', index: 0 });
    reduce({ ...start, file: { ...start.file!, picks: ['a', 'b'] } }, { type: 'undo' });
    expect(JSON.stringify(start)).toBe(before);
  });
});
