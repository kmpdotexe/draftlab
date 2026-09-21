import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toID, type ID } from './id';
import { isNatureName } from './natures';
import { parsePaste, pasteToTeam } from './paste';
import { exportSet, exportTeam } from './paste-export';
import type { PokemonSet } from './set';
import type { RosterSets } from './team';
import type { Snapshot } from './types';

const snapshot = JSON.parse(
  readFileSync(new URL('../../data/gen9championsvgc2026regmb/snapshot.json', import.meta.url), 'utf8'),
) as Snapshot;
if (!snapshot.usage) throw new Error('the committed snapshot has no usage data');
const usage = snapshot.usage;
const ranked = Object.values(usage.species).sort((a, b) => b.usage - a.usage);

/** A set built from what real ladder teams run on the species: top ability, top real item, top four moves, top spread. */
function setFromUsage(id: ID): PokemonSet {
  const entry = usage.species[id];
  const set: PokemonSet = { species: id, moves: entry.moves.slice(0, 4).map(([move]) => move) };
  const ability = entry.abilities[0]?.[0];
  if (ability) set.ability = ability;
  const item = entry.items.find(([itemId]) => itemId !== 'nothing')?.[0]; // Smogon's id for "no item"
  if (item) set.item = item;
  const spread = entry.spreads[0];
  if (spread) {
    if (isNatureName(spread.nature)) set.nature = spread.nature;
    const [hp, atk, def, spa, spd, spe] = spread.points;
    set.points = { hp, atk, def, spa, spd, spe };
  }
  return set;
}

describe('Showdown paste on the real Reg M-B snapshot', () => {
  it('writes and re-reads a set built from real usage for each of the 40 most used species', () => {
    let withStone = 0;
    let checked = 0;
    for (const { id } of ranked.slice(0, 40)) {
      const set = setFromUsage(id);
      if (snapshot.species[id].requiredItem) withStone += 1;
      const parsed = parsePaste(exportSet(set, snapshot), snapshot);
      expect(parsed, id).toHaveLength(1);
      expect(parsed[0], id).toEqual({ set, problems: [], notes: [] });
      checked += 1;
    }
    expect(checked).toBe(40);
    expect(withStone).toBeGreaterThanOrEqual(5); // 15 when this was written: Mega forms are common
  });

  it('round-trips a full six-member team through exportTeam and pasteToTeam', () => {
    // The most used Mega form first, then the most used non-Mega species with a new dex number and a new item.
    const mega = ranked.find((entry) => snapshot.species[entry.id].requiredItem);
    if (!mega) throw new Error('no Mega form in the usage data');
    const candidates = [mega, ...ranked.filter((entry) => entry !== mega && !snapshot.species[entry.id].requiredItem)];

    const sets: RosterSets = {};
    const members: ID[] = [];
    const numbers = new Set<number>();
    const items = new Set<string>();
    for (const { id } of candidates) {
      const set = setFromUsage(id);
      const num = snapshot.species[id].num;
      if (numbers.has(num) || (set.item !== undefined && items.has(set.item))) continue;
      numbers.add(num);
      if (set.item !== undefined) items.add(set.item);
      sets[id] = set;
      members.push(id);
      if (members.length === 6) break;
    }
    expect(members).toHaveLength(6);
    expect(sets[members[0]].item).toBe(toID(snapshot.species[members[0]].requiredItem));

    const text = exportTeam({ name: 'Real', members }, sets, snapshot);
    const parsed = parsePaste(text, snapshot);
    expect(parsed).toHaveLength(6);
    expect(pasteToTeam(parsed, 'Real')).toEqual({ team: { name: 'Real', members }, sets, problems: [] });
  });

  it('turns a base species holding a Mega stone into that Mega form, except where two forms share the stone', () => {
    let rewritten = 0;
    const unchanged = new Set<string>();
    for (const mega of Object.values(snapshot.species)) {
      if (!mega.requiredItem) continue;
      for (const base of Object.values(snapshot.species)) {
        if (base.requiredItem || toID(base.baseSpecies) !== toID(mega.baseSpecies)) continue;
        const label = `${base.name} @ ${mega.requiredItem}`;
        const parsed = parsePaste(label, snapshot);
        expect(parsed, label).toHaveLength(1);
        const species = parsed[0].set?.species;
        if (species === base.id) {
          unchanged.add(base.id);
        } else {
          expect(species, label).toBe(mega.id);
          rewritten += 1;
        }
      }
    }
    expect(rewritten).toBeGreaterThanOrEqual(50); // 80 when this was written, so the sweep cannot pass vacuously
    // Meowsticite is required by both Meowstic-M-Mega and Meowstic-F-Mega, so these two stay as written.
    // If a data update adds another shared stone this fails: review it, then update the list.
    expect([...unchanged].sort()).toEqual(['meowstic', 'meowsticf']);
  });
});
