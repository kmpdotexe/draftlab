import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ID } from '../domain/id';
import type { Snapshot } from '../domain/types';
import { ROLES, rosterLacks, speciesRoles } from './roles';

const snapshot = JSON.parse(
  readFileSync(new URL('../../data/gen9championsvgc2026regmb/snapshot.json', import.meta.url), 'utf8'),
) as Snapshot;
const legal = Object.keys(snapshot.species);

describe('the role table on the real snapshot', () => {
  it('lists only move ids that exist in the legal move table', () => {
    for (const role of ROLES) {
      for (const move of [...role.moves, ...role.signatureMoves]) expect(Object.hasOwn(snapshot.moves, move), `${role.id} ${move}`).toBe(true);
    }
  });

  it('lists only ability names that some legal species can have', () => {
    for (const role of ROLES) {
      for (const ability of role.abilities) {
        expect(legal.some((id) => snapshot.species[id].abilities.includes(ability)), `${role.id} ${ability}`).toBe(true);
      }
    }
  });

  /**
   * Tag-count floors measured on the committed Reg M-B snapshot: `runs` counts are the ones in the stage 2 spec's
   * "Facts established" section. Intimidate's `ability` tag (10) needed `expectedAbility`'s 50%-share rule, which is
   * stricter than the spec's "19 legal species have Intimidate available"; the floor here (8) is that measured count
   * with margin, not the spec's informal "at least 15" (a plan-time finding, not a code defect).
   */
  it('tags a realistic number of species for each role, by source', () => {
    const counts = Object.fromEntries(ROLES.map((role) => [role.id, { runs: 0, ability: 0, 'can-learn': 0 }]));
    for (const id of legal) {
      for (const tag of speciesRoles(id, snapshot)) counts[tag.role][tag.source] += 1;
    }
    expect(counts.fakeOut.runs).toBeGreaterThanOrEqual(20); // 28 when this was written
    expect(counts.redirection.runs).toBeGreaterThanOrEqual(5); // 7 when this was written
    expect(counts.speedControl.runs).toBeGreaterThanOrEqual(50); // 70 when this was written
    expect(counts.pivot.runs).toBeGreaterThanOrEqual(20); // 29 when this was written
    expect(counts.intimidate.ability).toBeGreaterThanOrEqual(8); // 10 when this was written
    expect(counts.weatherTerrain.ability).toBeGreaterThanOrEqual(8); // 14 when this was written
    expect(counts.redirection['can-learn']).toBeGreaterThanOrEqual(15); // 28 when this was written
  });
});

describe('rosterLacks and speciesRoles on real rosters', () => {
  const pair: ID[] = ['incineroar', 'kingambit'];
  const topSix: ID[] = ['kingambit', 'basculegion', 'garchomp', 'incineroar', 'sneasler', 'whimsicott'];

  it('lacks some roles but not all, for real rosters that already cover several', () => {
    for (const roster of [pair, topSix]) {
      const lacked = rosterLacks(roster, snapshot);
      expect(lacked.length, roster.join('+')).toBeGreaterThan(0);
      expect(lacked.length, roster.join('+')).toBeLessThan(ROLES.length);
    }
  });

  it('gives every real species at most one tag per role, in table order', () => {
    for (const id of ['incineroar', 'kingambit', 'rotomwash', 'whimsicott', 'landorustherian']) {
      const tags = speciesRoles(id, snapshot);
      expect(new Set(tags.map((t) => t.role)).size, id).toBe(tags.length);
      const order = tags.map((t) => ROLES.findIndex((role) => role.id === t.role));
      expect(order, id).toEqual([...order].sort((a, b) => a - b));
    }
  });
});
