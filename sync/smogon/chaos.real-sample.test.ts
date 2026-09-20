import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cooccurrence, teammateLift } from '../../src/domain/usage';
import { DEFAULT_PRUNE, parseChaos, parseSpread, pruneChaos } from './chaos';

// A trimmed real sample of Smogon's gen9championsvgc2026regmb-1630 chaos file.
// If Smogon changes the file's shape or semantics, these tests fail instead of production.
const text = readFileSync(new URL('./fixtures/chaos-sample.json', import.meta.url), 'utf8');

describe('real Smogon chaos sample', () => {
  const raw = parseChaos(text);
  const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

  it('parses with the expected metagame and cutoff', () => {
    expect(raw.info.metagame).toBe('gen9championsvgc2026regmb');
    expect(raw.info.cutoff).toBe(1630);
    expect(Object.keys(raw.data).sort()).toEqual(['Incineroar', 'Kingambit', 'Whimsicott']);
  });

  it('has usage as a fraction of teams', () => {
    for (const mon of Object.values(raw.data)) {
      expect(mon.usage).toBeGreaterThan(0);
      expect(mon.usage).toBeLessThan(1);
    }
  });

  it('gives the same weighted team count for every species (weight / usage)', () => {
    const teams = Object.values(raw.data).map((mon) => sum(mon.Abilities) / mon.usage);
    expect(Math.max(...teams) / Math.min(...teams)).toBeLessThan(1.02);
  });

  it('reports teammate co-occurrence symmetrically', () => {
    const a = raw.data.Kingambit.Teammates.Incineroar;
    const b = raw.data.Incineroar.Teammates.Kingambit;
    expect(a).toBeGreaterThan(0);
    expect(Math.abs(a - b) / a).toBeLessThan(1e-6);
  });

  it('uses nature plus six stat points of at most 32 each, totalling at most 66', () => {
    for (const mon of Object.values(raw.data)) {
      for (const key of Object.keys(mon.Spreads)) {
        const spread = parseSpread(key);
        expect(spread, `spread key ${key}`).not.toBeNull();
        expect(spread!.points.every((p) => p >= 0 && p <= 32), key).toBe(true);
        expect(spread!.points.reduce((a, b) => a + b, 0), key).toBeLessThanOrEqual(66);
      }
    }
  });

  it('prunes into usage data whose co-occurrence and lift are computable', () => {
    const usage = pruneChaos(raw, { ...DEFAULT_PRUNE, minUsage: 0 });
    expect(usage.teams).toBeGreaterThan(100_000);
    expect(cooccurrence(usage, 'kingambit', 'incineroar')).toBeGreaterThan(0);
    // Bounds rather than an exact value, so the test survives regenerating the sample from a later month.
    const lift = teammateLift(usage, 'kingambit', 'incineroar');
    expect(lift).not.toBeNull();
    expect(lift!).toBeGreaterThan(0.2);
    expect(lift!).toBeLessThan(3);
  });
});
