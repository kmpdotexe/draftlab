import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ID } from '../domain/id';
import type { Snapshot } from '../domain/types';
import { openCombos } from './combo-signal';
import { COMBOS, sideMatch } from './combos';
import { profileOf } from './profile';
import { suggest } from './suggest';
import type { SuggestContext } from './types';

const snapshot = JSON.parse(
  readFileSync(new URL('../../data/gen9championsvgc2026regmb/snapshot.json', import.meta.url), 'utf8'),
) as Snapshot;
if (!snapshot.usage) throw new Error('the committed snapshot has no usage data');
const usage = snapshot.usage;
const legal = Object.keys(snapshot.species);
const topUsage = Math.max(...Object.values(usage.species).map((entry) => entry.usage));
const usageOf = (id: ID) => (Object.hasOwn(usage.species, id) ? usage.species[id].usage : 0);
/** The same synthetic prices as suggest-real.test.ts: 1 to 21 points, rising with usage. */
const PRICES: Record<ID, number> = Object.fromEntries(legal.map((id) => [id, 1 + Math.round((20 * usageOf(id)) / topUsage)]));
const rosterContext = (roster: ID[], sets?: SuggestContext['sets']): SuggestContext => ({
  roster,
  pool: legal.filter((id) => !roster.includes(id)),
  prices: PRICES,
  remaining: 12,
  openSlots: 3,
  ...(sets === undefined ? {} : { sets }),
});
const byId = Object.fromEntries(COMBOS.map((combo) => [combo.id, combo]));

describe('the combo table on the real snapshot', () => {
  it('lists only move ids in the legal move table and abilities some legal species can have', () => {
    for (const combo of COMBOS) {
      for (const side of [combo.enabler, combo.beneficiary]) {
        for (const move of side.moves) expect(Object.hasOwn(snapshot.moves, move), `${combo.id} ${move}`).toBe(true);
        for (const ability of side.abilities) {
          expect(legal.some((id) => snapshot.species[id].abilities.includes(ability)), `${combo.id} ${ability}`).toBe(true);
        }
      }
    }
  });

  /** Floors with margin below the counts measured 2026-09-29 (ladder profiles, every legal species), in the comments. */
  it('puts a realistic number of species on each side of each combo', () => {
    const count = (id: string, side: 'enabler' | 'beneficiary') =>
      legal.filter((species) => sideMatch(byId[id][side], species, profileOf(species, snapshot), snapshot) !== null).length;
    const floors: Array<[string, number, number]> = [
      ['trickRoom', 25, 40], // 35 | 58
      ['redirectSetup', 5, 30], // 7 | 47
      ['rain', 5, 5], // 8 | 9
      ['sun', 3, 5], // 4 | 8
      ['sand', 3, 3], // 4 | 5
      ['snow', 3, 5], // 5 | 8
      ['electricTerrain', 1, 3], // 1 | 5
      ['helpingHand', 10, 80], // 15 | 118
    ];
    for (const [id, enabler, beneficiary] of floors) {
      expect(count(id, 'enabler'), `${id} enabler`).toBeGreaterThanOrEqual(enabler);
      expect(count(id, 'beneficiary'), `${id} beneficiary`).toBeGreaterThanOrEqual(beneficiary);
    }
  });

  it('keeps utility spread moves out of the Helping Hand side: Icy Wind alone does not make a spread attacker', () => {
    const icyWindOnly = profileOf('ninetalesalola', snapshot, { moves: ['icywind', 'protect'] });
    expect(sideMatch(byId.helpingHand.beneficiary, 'ninetalesalola', icyWindOnly, snapshot)).toBeNull();
    const withBlizzard = profileOf('ninetalesalola', snapshot, { moves: ['blizzard', 'protect'] });
    expect(sideMatch(byId.helpingHand.beneficiary, 'ninetalesalola', withBlizzard, snapshot)).toBe('set');
  });
});

describe('combos in real suggestions', () => {
  it('surfaces a Swift Swim partner for a Pelipper roster through rain', () => {
    const result = suggest(rosterContext(['pelipper']), snapshot, { limit: 1000 });
    const swampert = result.suggestions.find((s) => s.species === 'swampertmega');
    expect(swampert).toBeDefined();
    expect(swampert?.signals[3].reasons).toContainEqual({ kind: 'completes-combo', combo: 'rain', side: 'beneficiary', with: 'pelipper', from: 'ladder' });
    expect(result.suggestions.indexOf(swampert!)).toBeLessThan(20); // 11th when this was written
  });

  it('credits a Chlorophyll partner for a Torkoal roster through sun', () => {
    const result = suggest(rosterContext(['torkoal']), snapshot, { limit: 1000 });
    const venusaur = result.suggestions.find((s) => s.species === 'venusaur');
    expect(venusaur).toBeDefined();
    expect(venusaur?.signals[3].reasons).toContainEqual({ kind: 'completes-combo', combo: 'sun', side: 'beneficiary', with: 'torkoal', from: 'ladder' });
    expect(venusaur?.signals[3].rank).toBeGreaterThanOrEqual(0.8); // 0.89 when this was written
  });

  it('opens the combos a real roster supports, and gives combo reasons to much of the top 20', () => {
    const pair: ID[] = ['incineroar', 'kingambit'];
    expect(openCombos(pair, snapshot)).toEqual(expect.arrayContaining(['trickRoom', 'helpingHand'])); // also redirectSetup when written
    const top20 = suggest(rosterContext(pair), snapshot).suggestions;
    expect(top20.filter((s) => s.signals[3].reasons.length > 0).length).toBeGreaterThanOrEqual(8); // 18 when this was written
  });
});

describe('entered sets on the real snapshot', () => {
  const pair: ID[] = ['incineroar', 'kingambit'];

  it('gives the same result for no sets and an empty set table', () => {
    expect(suggest(rosterContext(pair, {}), snapshot, { limit: 1000 })).toEqual(suggest(rosterContext(pair), snapshot, { limit: 1000 }));
  });

  it('makes Fake Out a lacked role again when the entered Incineroar set does not run it', () => {
    const lacks = (sets?: SuggestContext['sets']) => {
      const note = suggest(rosterContext(pair, sets), snapshot).notes.find((n) => n.kind === 'roster-lacks-roles');
      return note?.kind === 'roster-lacks-roles' ? note.roles : [];
    };
    expect(lacks()).not.toContain('fakeOut'); // 90%+ of ladder Incineroar run Fake Out
    const set = { species: 'incineroar', ability: 'intimidate', moves: ['flareblitz', 'knockoff', 'partingshot', 'protect'] };
    expect(lacks({ incineroar: set })).toContain('fakeOut');
  });
});
