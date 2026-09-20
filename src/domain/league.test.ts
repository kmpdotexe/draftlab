import { describe, expect, it } from 'vitest';
import { MAX_DRAFTERS, MAX_ROUNDS, validateLeague, type LeagueConfig } from './league';
import { leagueOf } from './test-support';

/** Build a league with values of the wrong type, the way a corrupt file would. */
const bad = (overrides: Record<string, unknown>): LeagueConfig =>
  leagueOf(overrides as unknown as Partial<LeagueConfig>);
const paths = (league: LeagueConfig) => validateLeague(league, 'league').map((p) => p.path);

describe('validateLeague', () => {
  it('returns one problem, and does not throw, when the league is not an object', () => {
    for (const notALeague of [null, 'x', [], 5]) {
      expect(validateLeague(notALeague as unknown as LeagueConfig, 'league')).toEqual([
        { path: 'league', message: 'league must be an object' },
      ]);
    }
  });

  it('accepts a valid league', () => {
    expect(validateLeague(leagueOf(), 'league')).toEqual([]);
  });

  it('accepts the boundary values', () => {
    const many = Array.from({ length: MAX_DRAFTERS }, (_, i) => `Drafter ${i}`);
    expect(validateLeague(leagueOf({ drafters: many, me: 0, rounds: MAX_ROUNDS }), 'league')).toEqual([]);
    expect(validateLeague(leagueOf({ drafters: ['A', 'B'], me: 0, rounds: 1, order: 'linear' }), 'league')).toEqual([]);
    expect(validateLeague(leagueOf({ prices: { a: 0 } }), 'league')).toEqual([]);
  });

  it('prefixes every path with the path it is given', () => {
    expect(validateLeague(leagueOf({ name: '' }), 'x').map((p) => p.path)).toEqual(['x.name']);
  });

  it.each(['', '   '])('requires a name (%j)', (name) => {
    expect(paths(leagueOf({ name }))).toEqual(['league.name']);
  });

  it('requires a formatId', () => {
    expect(paths(leagueOf({ formatId: '' }))).toEqual(['league.formatId']);
  });

  it('needs between 2 and 32 drafters', () => {
    expect(paths(leagueOf({ drafters: ['Ana'], me: 0 }))).toEqual(['league.drafters']);
    const tooMany = Array.from({ length: MAX_DRAFTERS + 1 }, (_, i) => `D${i}`);
    expect(paths(leagueOf({ drafters: tooMany, me: 0 }))).toEqual(['league.drafters']);
    expect(paths(bad({ drafters: 'Ana' }))).toContain('league.drafters');
  });

  it('rejects duplicate drafter names ignoring case, naming the first one', () => {
    const problems = validateLeague(leagueOf({ drafters: ['Ana', 'ana', 'Cy'] }), 'league');
    expect(problems.map((p) => p.path)).toEqual(['league.drafters[1]']);
    expect(problems[0].message).toContain('drafters[0]');
  });

  it('rejects a blank drafter name', () => {
    expect(paths(leagueOf({ drafters: ['Ana', '  ', 'Cy'] }))).toEqual(['league.drafters[1]']);
  });

  it('accepts only snake or linear order', () => {
    expect(paths(bad({ order: 'auction' }))).toEqual(['league.order']);
  });

  it.each([0, 31, 2.5])('rejects rounds = %s', (rounds) => {
    expect(paths(leagueOf({ rounds }))).toEqual(['league.rounds']);
  });

  it.each([-1, 3, 1.5])('rejects me = %s for a 3-drafter league', (me) => {
    expect(paths(leagueOf({ me }))).toEqual(['league.me']);
  });

  it.each([0, -5, 10.5])('rejects budget = %s', (budget) => {
    expect(paths(leagueOf({ budget }))).toEqual(['league.budget']);
  });

  it('rejects negative or fractional prices, naming the species', () => {
    expect(paths(leagueOf({ prices: { a: -1 } }))).toEqual(['league.prices.a']);
    expect(paths(leagueOf({ prices: { a: 1.5 } }))).toEqual(['league.prices.a']);
    expect(paths(bad({ prices: null }))).toEqual(['league.prices']);
  });

  it('rejects an empty banned species id', () => {
    expect(paths(leagueOf({ extraBans: [''] }))).toEqual(['league.extraBans[0]']);
    expect(paths(bad({ extraBans: 'x' }))).toEqual(['league.extraBans']);
  });

  it('reports every problem, in field order', () => {
    expect(paths(leagueOf({ name: '', budget: 0 }))).toEqual(['league.name', 'league.budget']);
  });
});
