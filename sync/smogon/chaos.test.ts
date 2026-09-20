import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRUNE,
  parseChaos,
  parseSpread,
  pruneChaos,
  type RawChaos,
  type RawChaosMon,
} from './chaos';

function mon(overrides: Partial<RawChaosMon> = {}): RawChaosMon {
  return { usage: 0.1, Abilities: { a: 100 }, Items: {}, Moves: {}, Spreads: {}, Teammates: {}, ...overrides };
}

function chaos(data: Record<string, RawChaosMon>): RawChaos {
  return {
    info: { metagame: 'gen9championsvgc2026regmb', cutoff: 1630, 'number of battles': 1000 },
    data,
  };
}

const fixture = chaos({
  Kingambit: mon({
    usage: 0.4074192,
    Abilities: { defiant: 79122.1, supremeoverlord: 547.9, pressure: 7.6 },
    Items: { chopleberry: 28882.26, occaberry: 1831.44, '': 100 },
    Moves: { suckerpunch: 70000, kowtowcleave: 60000 },
    Spreads: { 'Adamant:4/31/11/0/0/20': 873.67, garbage: 5 },
    Teammates: { Incineroar: 14648, Rampardos: 12, Unknownmon: 5 },
  }),
  Incineroar: mon({
    usage: 0.2684631,
    Abilities: { intimidate: 52000, blaze: 277 },
    Teammates: { Kingambit: 14648 },
  }),
  Rampardos: mon({ usage: 0.0001, Abilities: { sheerforce: 10 } }),
});

describe('parseChaos', () => {
  it('returns the parsed structure for a valid file', () => {
    const parsed = parseChaos(JSON.stringify(fixture));
    expect(parsed.info.cutoff).toBe(1630);
    expect(Object.keys(parsed.data)).toEqual(['Kingambit', 'Incineroar', 'Rampardos']);
  });

  it('throws on text that is not JSON', () => {
    expect(() => parseChaos('<html>nope</html>')).toThrow(/not valid JSON/);
  });

  it('throws when the top-level shape is wrong', () => {
    expect(() => parseChaos(JSON.stringify({ info: {} }))).toThrow(/top-level "info" and "data"/);
  });

  it('throws when info lacks a numeric cutoff and battle count', () => {
    expect(() => parseChaos(JSON.stringify({ info: { metagame: 'x' }, data: { A: mon() } }))).toThrow(
      /info/,
    );
  });

  it('throws when data is empty', () => {
    expect(() => parseChaos(JSON.stringify(chaos({})))).toThrow(/empty/);
  });

  it('names the species when an entry is malformed', () => {
    const broken = { info: fixture.info, data: { Kingambit: { usage: 'lots' } } };
    expect(() => parseChaos(JSON.stringify(broken))).toThrow(/"Kingambit"/);
  });
});

describe('parseSpread', () => {
  it('parses a nature and six stat points', () => {
    expect(parseSpread('Adamant:4/31/11/0/0/20')).toEqual({
      nature: 'Adamant',
      points: [4, 31, 11, 0, 0, 20],
    });
  });

  it('returns null for keys that are not spreads', () => {
    expect(parseSpread('garbage')).toBeNull();
    expect(parseSpread('Jolly:1/2/3')).toBeNull();
  });
});

describe('pruneChaos', () => {
  it('keeps species at or above minUsage and drops the rest', () => {
    const usage = pruneChaos(fixture);
    expect(Object.keys(usage.species).sort()).toEqual(['incineroar', 'kingambit']);
  });

  it('carries cutoff and battle count from info', () => {
    const usage = pruneChaos(fixture);
    expect(usage.cutoff).toBe(1630);
    expect(usage.battles).toBe(1000);
  });

  it('computes weight as the sum of Abilities and shares as value / weight', () => {
    const king = pruneChaos(fixture).species.kingambit;
    expect(king.weight).toBeCloseTo(79677.6, 1);
    expect(king.usage).toBeCloseTo(0.4074192, 6);
    expect(king.abilities[0][0]).toBe('defiant');
    expect(king.abilities[0][1]).toBeCloseTo(79122.1 / 79677.6, 6);
    expect(king.items[0][0]).toBe('chopleberry');
    expect(king.items[0][1]).toBeCloseTo(28882.26 / 79677.6, 6);
  });

  it('drops the empty-string key Smogon uses for "no item"', () => {
    const king = pruneChaos(fixture).species.kingambit;
    expect(king.items.map(([id]) => id)).toEqual(['chopleberry', 'occaberry']);
  });

  it('parses spreads and drops unparsable keys', () => {
    const king = pruneChaos(fixture).species.kingambit;
    expect(king.spreads).toHaveLength(1);
    expect(king.spreads[0].nature).toBe('Adamant');
    expect(king.spreads[0].points).toEqual([4, 31, 11, 0, 0, 20]);
    expect(king.spreads[0].share).toBeCloseTo(873.67 / 79677.6, 6);
  });

  it('keeps only teammates that survived pruning, keyed by id', () => {
    const king = pruneChaos(fixture).species.kingambit;
    expect(king.teammates).toEqual([['incineroar', 14648]]);
  });

  it('limits teammates to the top N by co-occurrence', () => {
    const raw = chaos({
      A: mon({ Teammates: { B: 5, C: 9 } }),
      B: mon(),
      C: mon(),
    });
    const usage = pruneChaos(raw, { ...DEFAULT_PRUNE, topTeammates: 1 });
    expect(usage.species.a.teammates).toEqual([['c', 9]]);
  });

  it('computes the weighted team count as total weight over total usage', () => {
    const usage = pruneChaos(fixture);
    const expected = (79677.6 + 52277 + 10) / (0.4074192 + 0.2684631 + 0.0001);
    expect(usage.teams).toBeCloseTo(expected, 3);
  });
});
