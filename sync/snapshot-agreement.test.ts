import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../src/domain/types';

// Cross-checks the committed snapshot against itself, so a loader/legality bug that makes the
// learnsets disagree with what real ladder teams run is caught without loading pokemon-showdown.
const snapshot = JSON.parse(
  readFileSync(new URL('../data/gen9championsvgc2026regmb/snapshot.json', import.meta.url), 'utf8'),
) as Snapshot;

function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

describe('committed snapshot: usage and legality agree', () => {
  it('has usage data to check', () => {
    expect(snapshot.usage).not.toBeNull();
  });

  it('every move a species runs in real sets is in its learnset', () => {
    const violations: string[] = [];
    let checked = 0;
    for (const [speciesId, entry] of Object.entries(snapshot.usage?.species ?? {})) {
      const learnset = new Set(snapshot.learnsets[speciesId] ?? []);
      for (const [moveId, share] of entry.moves) {
        checked += 1;
        if (!learnset.has(moveId)) {
          violations.push(`${speciesId} runs ${moveId} in ${percent(share)} of sets but its learnset lacks it`);
        }
      }
    }
    // Floor so this cannot pass vacuously if the usage data ever goes missing or empty.
    expect(checked).toBeGreaterThanOrEqual(2000);
    expect(violations).toEqual([]);
  });

  it('every usage species and every teammate exists in the species table', () => {
    const problems: string[] = [];
    for (const [speciesId, entry] of Object.entries(snapshot.usage?.species ?? {})) {
      if (!snapshot.species[speciesId]) problems.push(`usage species "${speciesId}" is not in snapshot.species`);
      for (const [teammateId] of entry.teammates) {
        if (!snapshot.species[teammateId]) {
          problems.push(`${speciesId} lists teammate "${teammateId}" which is not in snapshot.species`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('every usage weight and usage share is a finite number greater than 0', () => {
    const problems: string[] = [];
    for (const [speciesId, entry] of Object.entries(snapshot.usage?.species ?? {})) {
      if (!(Number.isFinite(entry.weight) && entry.weight > 0)) {
        problems.push(`${speciesId} has weight ${String(entry.weight)}`);
      }
      if (!(Number.isFinite(entry.usage) && entry.usage > 0)) {
        problems.push(`${speciesId} has usage ${String(entry.usage)}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
