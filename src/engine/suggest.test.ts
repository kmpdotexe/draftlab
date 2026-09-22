import { describe, expect, it } from 'vitest';
import { speciesEntry } from '../domain/test-support';
import { suggest } from './suggest';
import { usageData, usageEntry } from './test-support';
import type { EngineSnapshot, SuggestContext, SuggestOptions } from './types';

/**
 * A small universe. Roster member `dra1` (Dragon, weight 100, usage 0.5, runs Fake Out at 60%). Candidates:
 *   stla, stlb, stlc: Steel twins, usage 0.1, co-occurrence 20 with dra1 -> lift 20 / (100 x 0.1) = 2
 *   grd: Ground, usage 0.2, co 5 -> lift 5 / (100 x 0.2) = 0.25
 *   nod: Normal, no usage entry (no lift)
 * None of the five candidates has a usage entry with any role moves, so `roleFit` is 0 for all of them: the roster
 * lacks nine roles (dra1's Fake Out covers `fakeOut`), and nobody fills any.
 * Absolute per-signal scores (see type-signal.test.ts for the type arithmetic):
 *   lift score: stl* (log2 2 + 3) / 6 = 0.6666667; grd (log2 0.25 + 3) / 6 = 0.1666667
 *   type score: stl* 0.4830882; grd 0.3426471; nod 0.2875
 *   role score: 0 for every candidate (see above)
 * Percentile ranks (mid-rank, ties share the average). Lift has data for stla, stlb, stlc and grd (n = 4): the three
 * tied Steels have `below` = 1 (only grd is smaller) and `equal` = 3, so rank = (1 + (3-1)/2) / 3 = 0.6666667; grd is
 * the smallest, rank 0. Type has data for all 5 (n = 5, no ties): stl* is above both nod and grd, so `below` = 2 and
 * `equal` = 1, rank = (2 + 0/2) / 4 = 0.75; grd is above only nod, rank = (1 + 0) / 4 = 0.25; nod is smallest, rank 0.
 * Role is 0 for every candidate (n = 5, all five tied): rank = (0 + (5-1)/2) / 4 = 0.5 for everyone.
 * Default weights 0.35 / 0.3 / 0.25 all have data for stl* and grd, so they re-normalize to themselves (sum 0.9):
 *   stl* = (0.35 x 0.6666667 + 0.3 x 0.75 + 0.25 x 0.5) / 0.9 = 0.6481481 (weights 0.3888889 / 0.3333333 / 0.2777778)
 *   grd  = (0.35 x 0 + 0.3 x 0.25 + 0.25 x 0.5) / 0.9 = 0.2222222
 * nod has no lift, so its lift weight is halved (MISSING_WEIGHT_FACTOR 0.5): weights 0.175, 0.3, 0.25, total 0.725.
 *   nod = (0.175 x 0.5 + 0.3 x 0 + 0.25 x 0.5) / 0.725 = 0.2931034 (weights 0.2413793 / 0.4137931 / 0.3448276)
 */
const snapshot = (): EngineSnapshot => ({
  species: {
    dra1: speciesEntry('dra1', 'dra1', { num: 1, types: ['Dragon'] }),
    stla: speciesEntry('stla', 'stla', { num: 2, types: ['Steel'] }),
    stlb: speciesEntry('stlb', 'stlb', { num: 3, types: ['Steel'] }),
    stlc: speciesEntry('stlc', 'stlc', { num: 4, types: ['Steel'] }),
    grd: speciesEntry('grd', 'grd', { num: 5, types: ['Ground'] }),
    nod: speciesEntry('nod', 'nod', { num: 6, types: ['Normal'] }),
  },
  moves: {},
  usage: usageData([
    usageEntry('dra1', { weight: 100, usage: 0.5, moves: [['fakeout', 0.6]], teammates: [['stla', 20], ['stlb', 20], ['stlc', 20], ['grd', 5]] }),
    usageEntry('stla', { usage: 0.1 }),
    usageEntry('stlb', { usage: 0.1 }),
    usageEntry('stlc', { usage: 0.1 }),
    usageEntry('grd', { usage: 0.2 }),
  ]),
});
const PRICES: Record<string, number> = { stla: 10, stlb: 6, stlc: 6, grd: 4, nod: 3 };
const ctx = (overrides: Partial<SuggestContext> = {}): SuggestContext => ({
  roster: ['dra1'],
  pool: ['grd', 'nod', 'stlc', 'stlb', 'stla'], // the reverse of the expected ranking
  prices: { ...PRICES },
  remaining: 100,
  openSlots: 1,
  ...overrides,
});
const order = (result: ReturnType<typeof suggest>) => result.suggestions.map((s) => s.species);
const LACKS_NINE = { kind: 'roster-lacks-roles', roles: ['redirection', 'speedControl', 'intimidate', 'weatherTerrain', 'pivot', 'screens', 'support', 'priority', 'disruption'] } as const;

describe('suggest: ranking', () => {
  it('ranks by combined score, then price ascending, then id ascending', () => {
    const result = suggest(ctx(), snapshot());
    // stlb and stlc tie with stla on score; stlb and stlc cost 6, stla costs 10; stlb comes before stlc by id.
    expect(order(result)).toEqual(['stlb', 'stlc', 'stla', 'nod', 'grd']);
    expect(result.suggestions[0].score).toBeCloseTo(0.6481481, 6);
    expect(result.suggestions[3].score).toBeCloseTo(0.2931034, 6);
    expect(result.suggestions[4].score).toBeCloseTo(0.2222222, 6);
    expect(result.considered).toBe(5);
    expect(result.notes).toEqual([LACKS_NINE]);
  });

  it('gives every suggestion all three signals in a fixed order, with score, rank, effective weight and reasons', () => {
    const top = suggest(ctx(), snapshot()).suggestions[0];
    expect(top.species).toBe('stlb');
    expect(top.price).toBe(6);
    expect(top.signals.map((s) => s.signal)).toEqual(['usageLift', 'typeSynergy', 'roleFit']);
    expect(top.signals[0]).toMatchObject({ score: expect.closeTo(0.6666667, 6), rank: expect.closeTo(0.6666667, 6), weight: expect.closeTo(0.3888889, 6) });
    expect(top.signals[0].reasons).toEqual([{ kind: 'pairs-often-with', with: 'dra1', lift: 2 }]);
    expect(top.signals[1]).toMatchObject({ score: expect.closeTo(0.4830882, 6), rank: 0.75, weight: expect.closeTo(0.3333333, 6) });
    expect(top.signals[1].reasons).toEqual([
      { kind: 'covers-weakness', type: 'Dragon', by: 'resists', weakMembers: ['dra1'] },
      { kind: 'covers-weakness', type: 'Fairy', by: 'resists', weakMembers: ['dra1'] },
      { kind: 'covers-weakness', type: 'Ice', by: 'resists', weakMembers: ['dra1'] },
      { kind: 'adds-coverage', types: ['Fairy', 'Ice', 'Rock'] },
    ]);
    expect(top.signals[2]).toEqual({ signal: 'roleFit', score: 0, rank: 0.5, weight: expect.closeTo(0.2777778, 6), reasons: [] });
    // Usage 0.1 is above the low-usage line, so there is no informational reason; the flat list is the three signals' reasons in order.
    expect(top.reasons).toEqual([...top.signals[0].reasons, ...top.signals[1].reasons, ...top.signals[2].reasons]);
  });

  it('uses only the signals that have data: a candidate with no usage entry has null lift but a real rank', () => {
    const nod = suggest(ctx(), snapshot()).suggestions.find((s) => s.species === 'nod');
    expect(nod).toBeDefined();
    expect(nod?.signals[0]).toMatchObject({ signal: 'usageLift', score: null, rank: 0.5, weight: expect.closeTo(0.2413793, 6) });
    expect(nod?.signals[1]).toMatchObject({ score: expect.closeTo(0.2875, 6), rank: 0, weight: expect.closeTo(0.4137931, 6) });
    expect(nod?.signals[2]).toEqual({ signal: 'roleFit', score: 0, rank: 0.5, weight: expect.closeTo(0.3448276, 6), reasons: [] });
    expect(nod?.reasons.at(-1)).toEqual({ kind: 'no-ladder-usage' });
  });
});

describe('suggest: weights', () => {
  it('lets the options override the default weights', () => {
    // Lift only: stl* rank 0.6666667, grd rank 0; nod has no lift and every other weight is 0, so nod is unscored.
    const liftOnly = suggest(ctx(), snapshot(), { weights: { usageLift: 1, typeSynergy: 0, roleFit: 0 } });
    expect(order(liftOnly)).toEqual(['stlb', 'stlc', 'stla', 'grd']);
    expect(liftOnly.suggestions[0].score).toBeCloseTo(0.6666667, 6);
    expect(liftOnly.suggestions[3].score).toBeCloseTo(0, 6);
    expect(liftOnly.considered).toBe(5);
    expect(liftOnly.notes).toEqual([LACKS_NINE, { kind: 'unscored-candidates', count: 1 }]);

    // Equal weights on lift and type (role at 0): stl* (0.6666667 + 0.75) / 2 = 0.7083333.
    const equal = suggest(ctx(), snapshot(), { weights: { usageLift: 0.5, typeSynergy: 0.5, roleFit: 0 } });
    expect(equal.suggestions[0].score).toBeCloseTo(0.7083333, 6);
    // A zero weight on type and role leaves the lift signal alone: stl* rank 0.6666667.
    const zeroType = suggest(ctx(), snapshot(), { weights: { typeSynergy: 0, roleFit: 0 } });
    expect(zeroType.suggestions[0].score).toBeCloseTo(0.6666667, 6);
    // A zero weight on lift and role leaves the type signal alone: stl* rank 0.75.
    const zeroLift = suggest(ctx(), snapshot(), { weights: { usageLift: 0, roleFit: 0 } });
    expect(zeroLift.suggestions[0].score).toBeCloseTo(0.75, 6);
  });

  it('ignores weights that are not finite non-negative numbers', () => {
    const baseline = suggest(ctx(), snapshot());
    for (const weights of [
      { usageLift: -1, typeSynergy: Number.NaN, roleFit: -1 },
      { usageLift: 'x', typeSynergy: Number.POSITIVE_INFINITY },
      null,
      5,
      [],
    ]) {
      const result = suggest(ctx(), snapshot(), { weights } as unknown as SuggestOptions);
      expect(result, JSON.stringify(weights)).toEqual(baseline);
    }
  });
});

describe('suggest: limit and options', () => {
  it('cuts to the limit after ranking, and reports how many were considered', () => {
    const result = suggest(ctx(), snapshot(), { limit: 2 });
    expect(order(result)).toEqual(['stlb', 'stlc']);
    expect(result.considered).toBe(5);
  });

  it('falls back to the default limit for a value that is not a positive integer', () => {
    for (const limit of [0, -1, 2.5, Number.NaN, 'x', null]) {
      expect(suggest(ctx(), snapshot(), { limit } as unknown as SuggestOptions).suggestions, String(limit)).toHaveLength(5);
    }
  });

  it('passes the usage filters to candidate selection', () => {
    expect(order(suggest(ctx(), snapshot(), { maxUsage: 0.15 }))).toEqual(['stlb', 'stlc', 'stla', 'nod']); // grd is at 0.2
    expect(order(suggest(ctx(), snapshot(), { minUsage: 0.15 }))).toEqual(['grd']); // nod has no usage entry
  });

  it('never throws on odd options', () => {
    for (const options of [null, 'x', 5, [], { limit: {}, weights: 5, maxUsage: 'a' }]) {
      expect(() => suggest(ctx(), snapshot(), options as unknown as SuggestOptions), JSON.stringify(options)).not.toThrow();
    }
    expect(order(suggest(ctx(), snapshot(), undefined))).toEqual(['stlb', 'stlc', 'stla', 'nod', 'grd']);
  });
});

describe('suggest: budget', () => {
  it('leaves out candidates that would make the roster impossible to fill', () => {
    // 3 open slots, reserve the 2 cheapest others. Sorted prices: nod 3, grd 4, stlb 6, stlc 6, stla 10 (prefix 0, 3, 7, 13, 19, 29).
    // nod needs 3 + (4 + 6) = 13; grd 4 + (3 + 6) = 13; stlb 6 + (3 + 4) = 13; stlc 13; stla 10 + (3 + 4) = 17.
    const result = suggest(ctx({ openSlots: 3, remaining: 14 }), snapshot());
    expect(order(result)).toEqual(['stlb', 'stlc', 'nod', 'grd']);
    expect(result.considered).toBe(4);
    expect(order(suggest(ctx({ openSlots: 3, remaining: 13 }), snapshot()))).toEqual(['stlb', 'stlc', 'nod', 'grd']);
    expect(order(suggest(ctx({ openSlots: 3, remaining: 12 }), snapshot()))).toEqual([]);
    expect(order(suggest(ctx({ openSlots: 3, remaining: 17 }), snapshot()))).toContain('stla');
  });
});

describe('suggest: same dex number and roster', () => {
  it('leaves out a species that shares a dex number with a roster member', () => {
    const s = snapshot();
    s.species.dra2 = speciesEntry('dra2', 'dra2', { num: 1, types: ['Dragon'] });
    const result = suggest(ctx({ pool: [...ctx().pool, 'dra2'], prices: { ...PRICES, dra2: 1 } }), s);
    expect(order(result)).not.toContain('dra2');
    expect(result.considered).toBe(5);
  });

  it('ignores roster ids that are not in the snapshot and repeated roster ids', () => {
    expect(order(suggest(ctx({ roster: ['ghost', 'dra1', 'dra1'] }), snapshot()))).toEqual(['stlb', 'stlc', 'stla', 'nod', 'grd']);
  });
});

describe('suggest: informational usage reasons', () => {
  const withLow = () => {
    const s = snapshot();
    s.species.lowu = speciesEntry('lowu', 'lowu', { num: 7, types: ['Normal'] });
    s.species.edge = speciesEntry('edge', 'edge', { num: 8, types: ['Normal'] });
    s.species.justunder = speciesEntry('justunder', 'justunder', { num: 9, types: ['Normal'] });
    if (s.usage === null) throw new Error('fixture has usage');
    s.usage.species.lowu = usageEntry('lowu', { usage: 0.02 });
    s.usage.species.edge = usageEntry('edge', { usage: 0.03 });
    s.usage.species.justunder = usageEntry('justunder', { usage: 0.029 });
    return s;
  };
  const wide = () =>
    ctx({
      pool: ['lowu', 'edge', 'justunder', 'nod'],
      prices: { lowu: 1, edge: 1, justunder: 1, nod: 1 },
    });

  it('adds low-usage below 3% (strictly), no-ladder-usage without an entry, and nothing otherwise', () => {
    const result = suggest(wide(), withLow());
    const byId = Object.fromEntries(result.suggestions.map((s) => [s.species, s]));
    expect(byId.lowu.reasons.at(-1)).toEqual({ kind: 'low-usage', usage: 0.02 });
    expect(byId.justunder.reasons.at(-1)).toEqual({ kind: 'low-usage', usage: 0.029 });
    expect(byId.edge.reasons.some((r) => r.kind === 'low-usage')).toBe(false); // exactly 0.03 is not low
    expect(byId.nod.reasons.at(-1)).toEqual({ kind: 'no-ladder-usage' });
  });

  it('never changes the score', () => {
    // lowu, edge, justunder and nod are Normal-typed twins with no stored pair and no role moves: all four score alike.
    const result = suggest(wide(), withLow());
    const scores = new Set(result.suggestions.map((s) => s.score));
    expect(scores.size).toBe(1);
  });

  it('adds no usage reason at all when there is no usage data', () => {
    const s = snapshot();
    s.usage = null;
    for (const suggestion of suggest(ctx(), s).suggestions) {
      expect(suggestion.reasons.every((r) => r.kind !== 'no-ladder-usage' && r.kind !== 'low-usage')).toBe(true);
    }
  });
});

describe('suggest: notes and early results', () => {
  it('says roster-full when there are no open slots, and empty-roster when the roster has nothing usable', () => {
    expect(suggest(ctx({ openSlots: 0 }), snapshot())).toEqual({ suggestions: [], considered: 0, notes: [{ kind: 'roster-full' }] });
    expect(suggest(ctx({ roster: [] }), snapshot())).toEqual({ suggestions: [], considered: 0, notes: [{ kind: 'empty-roster' }] });
    expect(suggest(ctx({ roster: ['ghost'] }), snapshot()).notes).toEqual([{ kind: 'empty-roster' }]);
    // Both at once: roster-full wins and is the only note.
    expect(suggest(ctx({ roster: [], openSlots: 0 }), snapshot()).notes).toEqual([{ kind: 'roster-full' }]);
  });

  it('says invalid-context for a malformed context and returns nothing', () => {
    const bad: unknown[] = [
      null,
      undefined,
      5,
      {},
      { ...ctx(), roster: 'dra1' },
      { ...ctx(), pool: null },
      { ...ctx(), prices: null },
      { ...ctx(), remaining: Number.NaN },
      { ...ctx(), remaining: '100' },
      { ...ctx(), openSlots: -1 },
      { ...ctx(), openSlots: 1.5 },
      { ...ctx(), openSlots: '1' },
    ];
    for (const context of bad) {
      expect(suggest(context as SuggestContext, snapshot()), JSON.stringify(context)).toEqual({
        suggestions: [],
        considered: 0,
        notes: [{ kind: 'invalid-context' }],
      });
    }
  });

  it('says cannot-fill-roster when the priced pool is smaller than the open slots, and still ranks', () => {
    // 6 open slots, 5 priced species: each candidate needs its own price plus all four others (29 in total).
    const result = suggest(ctx({ openSlots: 6, remaining: 29 }), snapshot());
    expect(result.notes).toEqual([{ kind: 'cannot-fill-roster', poolSize: 5, openSlots: 6 }, LACKS_NINE]);
    expect(result.suggestions).toHaveLength(5);
    expect(suggest(ctx({ openSlots: 6, remaining: 28 }), snapshot()).suggestions).toEqual([]);
  });

  it('says no-usage-data when there is no usage data, and the lift signal has no data for anyone', () => {
    const s = snapshot();
    s.usage = null;
    const result = suggest(ctx(), s);
    // Without usage data dra1 has no tags at all: the roster lacks all ten roles (fakeOut first, in table order, then the nine above).
    expect(result.notes).toEqual([{ kind: 'no-usage-data' }, { kind: 'roster-lacks-roles', roles: ['fakeOut', ...LACKS_NINE.roles] }]);
    expect(result.suggestions).toHaveLength(5);
    for (const suggestion of result.suggestions) expect(suggestion.signals[0].score).toBeNull();
  });

  it('lists the notes in a fixed order', () => {
    const s = snapshot();
    s.usage = null;
    const result = suggest(ctx({ openSlots: 6 }), s, { weights: { typeSynergy: 0, roleFit: 0 } });
    // Nothing is scorable (no usage data and the type and role weights are 0): all 5 candidates are unscored.
    expect(result.suggestions).toEqual([]);
    expect(result.considered).toBe(5);
    expect(result.notes).toEqual([
      { kind: 'cannot-fill-roster', poolSize: 5, openSlots: 6 },
      { kind: 'no-usage-data' },
      { kind: 'roster-lacks-roles', roles: ['fakeOut', ...LACKS_NINE.roles] },
      { kind: 'unscored-candidates', count: 5 },
    ]);
  });
});

describe('suggest: no-affordable-candidates', () => {
  it('says so when candidates passed every rule but none fits the budget', () => {
    // 3 open slots: the cheapest way to pick any of the five species costs 13, so 12 is short for all of them.
    expect(suggest(ctx({ openSlots: 3, remaining: 12 }), snapshot())).toEqual({
      suggestions: [],
      considered: 0,
      notes: [{ kind: 'no-affordable-candidates' }, LACKS_NINE],
    });
  });

  it('says nothing when some candidate fits, or when the filters (not the budget) left nobody', () => {
    // At 14 with 3 open slots stla (17) is over budget but four others fit.
    expect(suggest(ctx({ openSlots: 3, remaining: 14 }), snapshot()).notes).toEqual([LACKS_NINE]);
    // Nothing has 90% usage: everyone is removed by the filter, none by the budget. No candidates means no role-lacks note either.
    const filtered = suggest(ctx(), snapshot(), { minUsage: 0.9 });
    expect(filtered.suggestions).toEqual([]);
    expect(filtered.notes).toEqual([LACKS_NINE]);
  });

  it('comes after cannot-fill-roster and before no-usage-data', () => {
    const s = snapshot();
    s.usage = null;
    // 6 open slots, 5 priced species: each needs all five (29 in total), so 28 is short for everyone.
    expect(suggest(ctx({ openSlots: 6, remaining: 28 }), s).notes).toEqual([
      { kind: 'cannot-fill-roster', poolSize: 5, openSlots: 6 },
      { kind: 'no-affordable-candidates' },
      { kind: 'no-usage-data' },
      { kind: 'roster-lacks-roles', roles: ['fakeOut', ...LACKS_NINE.roles] },
    ]);
  });
});

describe('suggest: roster-lacks-roles', () => {
  it('says nothing when the roster lacks no role', () => {
    const s = snapshot();
    if (s.usage === null) throw new Error('fixture has usage');
    s.usage.species.dra1 = usageEntry('dra1', {
      weight: 100,
      usage: 0.5,
      teammates: [['stla', 20], ['stlb', 20], ['stlc', 20], ['grd', 5]],
      moves: [
        ['fakeout', 0.6], ['followme', 0.5], ['tailwind', 0.5], ['uturn', 0.5],
        ['reflect', 0.5], ['helpinghand', 0.5], ['suckerpunch', 0.5], ['encore', 0.5],
      ],
    });
    s.species.dra1.abilities = ['Intimidate'];
    // Intimidate and weatherTerrain still need an ability tag; dra1 covers everything but those two.
    expect(suggest(ctx(), s).notes).toEqual([{ kind: 'roster-lacks-roles', roles: ['weatherTerrain'] }]);
  });

  it('lists the roles in table order, not the order the roster fills them', () => {
    const s = snapshot();
    if (s.usage === null) throw new Error('fixture has usage');
    s.usage.species.dra1 = usageEntry('dra1', { weight: 100, usage: 0.5, teammates: [['stla', 20], ['stlb', 20], ['stlc', 20], ['grd', 5]], moves: [['encore', 0.6], ['fakeout', 0.6]] });
    const result = suggest(ctx(), s);
    const note = result.notes.find((n) => n.kind === 'roster-lacks-roles');
    expect(note).toEqual({
      kind: 'roster-lacks-roles',
      roles: ['redirection', 'speedControl', 'intimidate', 'weatherTerrain', 'pivot', 'screens', 'support', 'priority'],
    });
  });
});

describe('suggest: a malformed snapshot', () => {
  const invalid = { suggestions: [], considered: 0, notes: [{ kind: 'invalid-snapshot' }] };
  const asSnapshot = (value: unknown) => value as EngineSnapshot;

  it('says invalid-snapshot when the species or moves table is missing or not an object, without throwing', () => {
    for (const bad of [null, {}, { species: {}, moves: 5, usage: null }, { ...snapshot(), moves: undefined }]) {
      expect(() => suggest(ctx(), asSnapshot(bad)), JSON.stringify(bad)).not.toThrow();
      expect(suggest(ctx(), asSnapshot(bad)), JSON.stringify(bad)).toEqual(invalid);
    }
  });

  it('treats malformed usage as no usage data', () => {
    const result = suggest(ctx(), asSnapshot({ ...snapshot(), usage: undefined }));
    expect(result.notes).toEqual([{ kind: 'no-usage-data' }, { kind: 'roster-lacks-roles', roles: ['fakeOut', ...LACKS_NINE.roles] }]);
    expect(result.suggestions).toHaveLength(5);
    for (const suggestion of result.suggestions) expect(suggestion.signals[0].score).toBeNull();
  });

  it('leaves out a species entry that is not an object, without throwing', () => {
    const s = snapshot();
    (s.species as Record<string, unknown>).nod = null;
    expect(() => suggest(ctx(), s)).not.toThrow();
    const result = suggest(ctx(), s);
    expect(order(result)).toEqual(['stlb', 'stlc', 'stla', 'grd']);
    expect(result.considered).toBe(4);
  });

  // A row that is not an [id, number] pair used to make the usage lookups throw a TypeError.
  const badRows: Array<[string, unknown[]]> = [
    ['[5]', [5]],
    ['[null]', [null]],
    ['a sparse array', new Array(1)],
  ];
  for (const field of ['teammates', 'moves'] as const) {
    for (const [label, rows] of badRows) {
      it(`treats a species whose ${field} is ${label} as having no usage data: roster member`, () => {
        const s = snapshot();
        (s.usage!.species as Record<string, unknown>).dra1 = { ...usageEntry('dra1', { weight: 100, usage: 0.5 }), [field]: rows };
        expect(() => suggest(ctx(), s)).not.toThrow();
        const result = suggest(ctx(), s);
        expect(result.considered).toBe(5);
        expect(result.suggestions.length).toBeGreaterThan(0);
      });

      it(`treats a species whose ${field} is ${label} as having no usage data: candidate`, () => {
        const s = snapshot();
        (s.usage!.species as Record<string, unknown>).stla = { ...usageEntry('stla', { usage: 0.1 }), [field]: rows };
        expect(() => suggest(ctx(), s)).not.toThrow();
        const result = suggest(ctx(), s);
        expect(result.considered).toBe(5);
        const stla = result.suggestions.find((suggestion) => suggestion.species === 'stla');
        expect(stla?.signals[0].score).toBeNull();
      });
    }
  }

  it('reports invalid-context first when both the context and the snapshot are malformed', () => {
    expect(suggest({ ...ctx(), roster: 'dra1' } as unknown as SuggestContext, asSnapshot(null))).toEqual({
      suggestions: [],
      considered: 0,
      notes: [{ kind: 'invalid-context' }],
    });
  });
});

describe('suggest: robustness', () => {
  it('does not modify its inputs and gives the same answer twice', () => {
    const s = snapshot();
    const context = ctx({ openSlots: 3, remaining: 14 });
    const options: SuggestOptions = { limit: 3, weights: { usageLift: 0.5 } };
    const before = JSON.stringify({ s, context, options });
    const first = suggest(context, s, options);
    const second = suggest(context, s, options);
    expect(JSON.stringify({ s, context, options })).toBe(before);
    expect(second).toEqual(first);
  });

  it('never returns a score outside 0..1', () => {
    for (const suggestion of suggest(ctx(), snapshot()).suggestions) {
      expect(suggestion.score).toBeGreaterThanOrEqual(0);
      expect(suggestion.score).toBeLessThanOrEqual(1);
    }
  });
});
