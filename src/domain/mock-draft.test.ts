import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deriveDraft } from './derive';
import { applyPick, undoPick } from './draft';
import { parseDraftFile, serializeDraftFile } from './file';
import type { ID } from './id';
import type { LeagueConfig } from './league';
import type { Snapshot } from './types';

const snapshot = JSON.parse(
  readFileSync(new URL('../../data/gen9championsvgc2026regmb/snapshot.json', import.meta.url), 'utf8'),
) as Snapshot;
if (!snapshot.usage) throw new Error('the committed snapshot has no usage data');

// Price every species that has usage: the ten most used cost 20, the next ten 19, and so on, never below 1.
const ranked = Object.values(snapshot.usage.species).sort((a, b) => b.usage - a.usage);
const prices: Record<ID, number> = Object.fromEntries(
  ranked.map((entry, rank) => [entry.id, Math.max(1, 20 - Math.floor(rank / 10))]),
);
const BANNED = ranked[0].id; // the most-used species is banned in the mock league

function mockLeague(overrides: Partial<LeagueConfig> = {}): LeagueConfig {
  return {
    name: 'Mock League',
    formatId: snapshot.formatId,
    drafters: ['Ana', 'Ben', 'Cy', 'Di'],
    order: 'snake',
    rounds: 6,
    me: 2,
    budget: 100,
    prices,
    extraBans: [BANNED],
    ...overrides,
  };
}

/** Picks the cheapest species left in the pool, `count` times. */
function draftCheapest(league: LeagueConfig, count: number): ID[] {
  let picks: ID[] = [];
  for (let i = 0; i < count; i++) {
    const { pool } = deriveDraft(league, picks, snapshot);
    const result = applyPick(league, picks, pool[pool.length - 1], snapshot);
    if (!result.ok) throw new Error(`pick ${i + 1} refused: ${result.problem.message}`);
    picks = result.picks;
  }
  return picks;
}

describe('mock draft on the real Reg M-B snapshot', () => {
  it('runs a full 4-drafter snake draft, keeping the derived state consistent at every step', () => {
    const league = mockLeague();
    const total = league.drafters.length * league.rounds;
    const startPool = deriveDraft(league, [], snapshot).pool.length;
    expect(startPool).toBe(ranked.length - 1); // everything priced except the banned species

    let picks: ID[] = [];
    for (let i = 0; i < total; i++) {
      const state = deriveDraft(league, picks, snapshot);
      expect(state.complete).toBe(false);
      expect(state.pool).not.toContain(BANNED);
      expect(state.pool.length).toBe(startPool - picks.length);
      for (const picked of picks) expect(state.pool).not.toContain(picked);

      const cheapest = state.pool[state.pool.length - 1];
      const result = applyPick(league, picks, cheapest, snapshot);
      if (!result.ok) throw new Error(`pick ${i + 1} refused: ${result.problem.message}`);
      picks = result.picks;
    }

    const final = deriveDraft(league, picks, snapshot);
    // 4 drafters, snake: round 1 goes 0,1,2,3 and round 2 comes back 3,2,1,0.
    expect(final.picks.slice(0, 8).map((p) => p.drafter)).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
    expect(final.complete).toBe(true);
    expect(final.onTheClock).toBeNull();
    expect(new Set(picks).size).toBe(total);
    for (const drafter of final.drafters) {
      expect(drafter.roster).toHaveLength(league.rounds);
      expect(drafter.openSlots).toBe(0);
      expect(drafter.spent + drafter.remaining).toBe(league.budget);
    }
    expect(final.drafters.reduce((sum, d) => sum + d.spent, 0)).toBe(picks.reduce((sum, id) => sum + prices[id], 0));
  });

  it('undo returns to exactly the previous state', () => {
    const league = mockLeague();
    const picks = draftCheapest(league, 7);
    const before = deriveDraft(league, picks.slice(0, 6), snapshot);
    expect(deriveDraft(league, undoPick(picks), snapshot)).toEqual(before);
  });

  it('refuses a banned species and a species with no price', () => {
    const league = mockLeague();
    const banned = applyPick(league, [], BANNED, snapshot);
    expect(banned.ok).toBe(false);
    if (!banned.ok) expect(banned.problem.message).toContain('banned');

    const unpriced = Object.keys(snapshot.species).find((id) => !Object.hasOwn(prices, id));
    expect(unpriced).toBeDefined();
    const result = applyPick(league, [], unpriced as string, snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem.message).toContain('no price');
  });

  it('refuses a pick that costs more than the budget', () => {
    const league = mockLeague({ budget: 5 });
    const priciest = deriveDraft(league, [], snapshot).pool[0];
    const result = applyPick(league, [], priciest, snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem.message).toContain('costs');
  });

  it('saves and reopens a finished draft with no warnings', () => {
    const league = mockLeague();
    const picks = draftCheapest(league, league.drafters.length * league.rounds);
    const parsed = parseDraftFile(serializeDraftFile({ schemaVersion: 1, league, picks }), snapshot);
    if (!parsed.ok) throw new Error(`file refused: ${JSON.stringify(parsed.errors)}`);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.file.picks).toEqual(picks);
  });

  it('refuses a saved draft that contains an unpriced species, naming the pick', () => {
    const league = mockLeague();
    const picks = draftCheapest(league, 5);
    const unpriced = Object.keys(snapshot.species).find((id) => !Object.hasOwn(prices, id)) as string;
    const bad = [...picks.slice(0, 3), unpriced, ...picks.slice(4)];
    const parsed = parseDraftFile(serializeDraftFile({ schemaVersion: 1, league, picks: bad }), snapshot);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors[0].path).toBe('picks[3]');
      expect(parsed.errors[0].message).toContain('pick 4: ');
      expect(parsed.errors[0].message).toContain('no price');
    }
  });
});
