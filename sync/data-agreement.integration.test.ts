import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toID } from '../src/domain/id';
import { loadShowdownFormat } from './showdown/source';
import { parseChaos } from './smogon/chaos';

describe('Showdown legality agrees with Smogon ladder usage (gen9championsvgc2026regmb)', () => {
  it('lets each sampled species learn every move used in at least 1% of its sets', () => {
    const raw = parseChaos(readFileSync(new URL('./smogon/fixtures/chaos-sample.json', import.meta.url), 'utf8'));
    const data = loadShowdownFormat('gen9championsvgc2026regmb');

    for (const [name, mon] of Object.entries(raw.data)) {
      const weight = Object.values(mon.Abilities).reduce((a, b) => a + b, 0);
      const learnset = new Set(data.learnsets[toID(name)] ?? []);
      expect(learnset.size, `${name} has a learnset`).toBeGreaterThan(0);

      for (const [move, count] of Object.entries(mon.Moves)) {
        const id = toID(move);
        const share = count / weight;
        if (!id || share < 0.01) continue;
        expect(
          learnset.has(id),
          `${name} runs ${move} in ${(share * 100).toFixed(1)}% of sets but the loader says it cannot learn it`,
        ).toBe(true);
      }
    }
  });
});
