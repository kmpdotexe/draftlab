import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toID } from '../src/domain/id';
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

  it('is a version 2 snapshot with the legal item table', () => {
    expect(snapshot.schemaVersion).toBe(2);
    expect(Object.keys(snapshot.items).length).toBeGreaterThanOrEqual(100);
    expect(snapshot.items.sitrusberry?.name).toBe('Sitrus Berry');
    expect(snapshot.items.assaultvest).toBeUndefined(); // marked Past in the Champions mod
    expect(snapshot.items.staraptite?.usableBy).toContain('staraptor');
  });

  it('every item a species runs in at least 1% of real sets is in the item table', () => {
    const violations: string[] = [];
    let checked = 0;
    for (const [speciesId, entry] of Object.entries(snapshot.usage?.species ?? {})) {
      for (const [itemId, share] of entry.items) {
        if (share < 0.01 || itemId === 'nothing') continue; // Smogon's id for "no item"
        checked += 1;
        if (!Object.hasOwn(snapshot.items, itemId)) {
          violations.push(`${speciesId} runs ${itemId} in ${percent(share)} of sets but it is not in the item table`);
        }
      }
    }
    // Floor so this cannot pass vacuously (977 pairs when this was written).
    expect(checked).toBeGreaterThanOrEqual(500);
    expect(violations).toEqual([]);
  });

  it('no species that appears in real usage requires an item the table lacks', () => {
    const problems: string[] = [];
    let withRequiredItem = 0;
    for (const speciesId of Object.keys(snapshot.usage?.species ?? {})) {
      const required = snapshot.species[speciesId]?.requiredItem;
      if (!required) continue;
      withRequiredItem += 1;
      if (!Object.hasOwn(snapshot.items, toID(required))) {
        problems.push(`${speciesId} requires ${required}, which is not in the item table`);
      }
    }
    expect(withRequiredItem).toBeGreaterThanOrEqual(20); // 73 when this was written
    expect(problems).toEqual([]);
  });
});
