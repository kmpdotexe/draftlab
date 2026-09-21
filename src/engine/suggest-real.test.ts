import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ID } from '../domain/id';
import type { Snapshot } from '../domain/types';
import { suggest } from './suggest';
import type { SuggestContext, Suggestion } from './types';

const snapshot = JSON.parse(
  readFileSync(new URL('../../data/gen9championsvgc2026regmb/snapshot.json', import.meta.url), 'utf8'),
) as Snapshot;
if (!snapshot.usage) throw new Error('the committed snapshot has no usage data');
const usage = snapshot.usage;
const legal = Object.keys(snapshot.species);
const topUsage = Math.max(...Object.values(usage.species).map((entry) => entry.usage));
const usageOf = (id: ID) => (Object.hasOwn(usage.species, id) ? usage.species[id].usage : 0);

/** A synthetic price list: 1 to 21 points, rising with usage; a species with no usage entry costs 1. */
const PRICES: Record<ID, number> = Object.fromEntries(
  legal.map((id) => [id, 1 + Math.round((20 * usageOf(id)) / topUsage)]),
);

/** The whole legal list minus the roster is the pool. */
function rosterContext(roster: ID[], remaining: number, openSlots: number): SuggestContext {
  return { roster, pool: legal.filter((id) => !roster.includes(id)), prices: PRICES, remaining, openSlots };
}

const sharesDexNumber = (roster: ID[], id: ID) => roster.some((member) => snapshot.species[member].num === snapshot.species[id].num);

/** Independent of the engine's prefix sums: sort the other prices and add up the cheapest `openSlots - 1`. */
function affordable(ctx: SuggestContext, id: ID): boolean {
  const others = ctx.pool.filter((other) => other !== id).map((other) => PRICES[other]).sort((a, b) => a - b);
  const reserve = others.slice(0, ctx.openSlots - 1).reduce((sum, price) => sum + price, 0);
  return PRICES[id] + reserve <= ctx.remaining;
}

const ranked = Object.values(usage.species).sort((a, b) => b.usage - a.usage).map((entry) => entry.id);
const topSix: ID[] = [];
{
  const numbers = new Set<number>();
  for (const id of ranked) {
    const num = snapshot.species[id].num;
    if (numbers.has(num)) continue;
    numbers.add(num);
    topSix.push(id);
    if (topSix.length === 6) break;
  }
}

const isRankedBefore = (a: Suggestion, b: Suggestion) =>
  a.score > b.score || (a.score === b.score && (a.price < b.price || (a.price === b.price && a.species < b.species)));

describe.each([
  ['the pair incineroar + kingambit', ['incineroar', 'kingambit']],
  ['the six most used species', topSix],
] as Array<[string, ID[]]>)('suggestions for %s', (_name, roster) => {
  // Remaining 12 with 3 open slots: 3 of 347 (six) or 7 of 353 (pair) candidates cost too much once two cheap slots are reserved.
  const ctx = rosterContext(roster, 12, 3);
  const result = suggest(ctx, snapshot, { limit: 1000 });
  const candidateIds = ctx.pool.filter((id) => !sharesDexNumber(roster, id));
  const expectedIds = candidateIds.filter((id) => affordable(ctx, id));

  it('returns exactly the affordable candidates, with no notes', () => {
    expect(expectedIds.length).toBeGreaterThanOrEqual(300);
    expect(candidateIds.length - expectedIds.length).toBeGreaterThanOrEqual(1); // the budget really excludes someone
    expect(result.notes).toEqual([]);
    expect(result.considered).toBe(expectedIds.length);
    expect(result.suggestions.map((s) => s.species).sort()).toEqual([...expectedIds].sort());
  });

  it('gives every suggestion a valid score, the right price, and both signals in order', () => {
    for (const s of result.suggestions) {
      expect(s.score, s.species).toBeGreaterThanOrEqual(0);
      expect(s.score, s.species).toBeLessThanOrEqual(1);
      expect(s.price, s.species).toBe(PRICES[s.species]);
      expect(s.signals.map((signal) => signal.signal), s.species).toEqual(['usageLift', 'typeSynergy']);
      expect(s.signals[1].score, s.species).not.toBeNull(); // a non-empty roster always has type data
    }
  });

  it('ranks by score, then price, then id', () => {
    for (let i = 1; i < result.suggestions.length; i += 1) {
      const before = result.suggestions[i - 1];
      const after = result.suggestions[i];
      expect(isRankedBefore(before, after), `${before.species} before ${after.species}`).toBe(true);
    }
  });

  it('scores candidates without usage data by type synergy alone, and has plenty of both kinds', () => {
    const typeOnly = result.suggestions.filter((s) => s.signals[0].score === null);
    const both = result.suggestions.filter((s) => s.signals[0].score !== null);
    expect(typeOnly.length).toBeGreaterThanOrEqual(100); // 132 when this was written
    expect(both.length).toBeGreaterThanOrEqual(150); // about 215 when this was written
    for (const s of typeOnly) expect(s.signals[1].weight, s.species).toBe(1);
  });

  it('explains every suggestion that scores above 0.5', () => {
    const strong = result.suggestions.filter((s) => s.score > 0.5);
    expect(strong.length).toBeGreaterThanOrEqual(1);
    // A score above 0.5 needs lift above 1 (a pairs-often-with reason) or a positive defensive raw score or offensive coverage.
    for (const s of strong) expect(s.signals.some((signal) => signal.reasons.length > 0), s.species).toBe(true);
  });
});

describe('suggestions on the real snapshot: filters, dex numbers, notes and determinism', () => {
  const pair: ID[] = ['incineroar', 'kingambit'];
  const generous = rosterContext(pair, 200, 5);

  it('honours the usage filters', () => {
    const niche = suggest(generous, snapshot, { maxUsage: 0.03, limit: 1000 });
    expect(niche.suggestions.length).toBeGreaterThan(100); // 307 when this was written
    for (const s of niche.suggestions) expect(usageOf(s.species), s.species).toBeLessThanOrEqual(0.03);

    const popular = suggest(generous, snapshot, { minUsage: 0.05, limit: 1000 });
    expect(popular.suggestions.length).toBeGreaterThanOrEqual(10); // 29 when this was written
    for (const s of popular.suggestions) {
      expect(Object.hasOwn(usage.species, s.species), s.species).toBe(true);
      expect(usageOf(s.species), s.species).toBeGreaterThanOrEqual(0.05);
    }
  });

  it('leaves out other forms of the roster\'s Pokémon (same dex number)', () => {
    const roster: ID[] = ['charizard', 'garchomp', 'sinistcha'];
    const otherForms = ['charizardmegax', 'charizardmegay', 'garchompmega', 'sinistchamasterpiece'];
    for (const id of otherForms) expect(Object.hasOwn(snapshot.species, id), id).toBe(true); // they are legal, priced picks...
    const result = suggest(rosterContext(roster, 200, 5), snapshot, { limit: 1000 });
    const suggested = new Set(result.suggestions.map((s) => s.species));
    for (const id of otherForms) expect(suggested.has(id), id).toBe(false); // ...that the rule removes
    for (const s of result.suggestions) expect(sharesDexNumber(roster, s.species), s.species).toBe(false);
    expect(result.suggestions.length).toBeGreaterThan(300);
  });

  it('adds the informational usage reasons', () => {
    const result = suggest(generous, snapshot, { limit: 1000 });
    const noEntry = result.suggestions.filter((s) => !Object.hasOwn(usage.species, s.species));
    const low = result.suggestions.filter((s) => Object.hasOwn(usage.species, s.species) && usageOf(s.species) < 0.03);
    const other = result.suggestions.filter((s) => usageOf(s.species) >= 0.03);
    expect(noEntry.length).toBeGreaterThanOrEqual(100); // 132 when this was written
    expect(low.length).toBeGreaterThanOrEqual(100); // 175 when this was written
    expect(other.length).toBeGreaterThanOrEqual(20); // 46 when this was written
    for (const s of noEntry) expect(s.reasons.at(-1), s.species).toEqual({ kind: 'no-ladder-usage' });
    for (const s of low) expect(s.reasons.at(-1), s.species).toEqual({ kind: 'low-usage', usage: usageOf(s.species) });
    for (const s of other) {
      expect(s.reasons.some((r) => r.kind === 'low-usage' || r.kind === 'no-ladder-usage'), s.species).toBe(false);
    }
  });

  it('says no-usage-data and drops the lift signal when the snapshot has no usage', () => {
    const result = suggest(generous, { ...snapshot, usage: null }, { limit: 1000 });
    expect(result.notes).toEqual([{ kind: 'no-usage-data' }]);
    expect(result.suggestions.length).toBeGreaterThan(300);
    for (const s of result.suggestions) expect(s.signals[0].score, s.species).toBeNull();
  });

  it('is deterministic and does not modify its inputs', () => {
    const before = JSON.stringify({ generous, snapshot });
    const first = suggest(generous, snapshot, { limit: 50 });
    const second = suggest(generous, snapshot, { limit: 50 });
    expect(JSON.stringify({ generous, snapshot })).toBe(before);
    expect(second).toEqual(first);
    expect(first.suggestions).toHaveLength(50);
  });
});
