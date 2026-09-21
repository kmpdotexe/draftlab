import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toID, type ID } from './id';
import { isNatureName } from './natures';
import type { PokemonSet } from './set';
import { validateSetAgainstSnapshot } from './set-check';
import { computeSetStats } from './stats';
import { validateTeam, type RosterSets } from './team';
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

describe('teambuilder logic on the real Reg M-B snapshot', () => {
  it('accepts a set built from real usage for each of the 40 most used species', () => {
    const problems: string[] = [];
    let withStone = 0;
    for (const { id } of ranked.slice(0, 40)) {
      if (snapshot.species[id].requiredItem) withStone += 1;
      for (const p of validateSetAgainstSnapshot(setFromUsage(id), snapshot, id)) problems.push(`${p.path}: ${p.message}`);
    }
    expect(withStone).toBeGreaterThanOrEqual(5); // 15 when this was written: Mega forms are common
    expect(problems).toEqual([]);
  });

  it('computes finite, positive stats for those sets', () => {
    for (const { id } of ranked.slice(0, 40)) {
      const stats = computeSetStats(setFromUsage(id), snapshot);
      expect(stats, id).not.toBeNull();
      for (const value of Object.values(stats ?? {})) {
        expect(Number.isFinite(value) && value > 0, `${id} stat ${value}`).toBe(true);
      }
    }
  });

  it('refuses a real set with an illegal move, ability and item at once', () => {
    const problems = validateSetAgainstSnapshot(
      { species: 'incineroar', ability: 'levitate', item: 'assaultvest', moves: ['fakeout', 'hydropump'] },
      snapshot,
      'set',
    );
    expect(problems.map((p) => p.path)).toEqual(['set.ability', 'set.moves[1]', 'set.item']);
  });

  it('accepts a full six-member team built from real usage, including a Mega form and its stone', () => {
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

    expect(validateTeam({ name: 'Real', members }, members, sets, snapshot, 6)).toEqual({ problems: [], complete: true });
  });

  it('refuses Charizard together with Charizard-Mega-X (Species Clause, same dex number)', () => {
    expect(snapshot.species.charizard.num).toBe(snapshot.species.charizardmegax.num);
    const sets: RosterSets = { charizardmegax: { species: 'charizardmegax', item: 'charizarditex' } };
    const result = validateTeam(
      { name: 'Clones', members: ['charizard', 'charizardmegax'] },
      ['charizard', 'charizardmegax'],
      sets,
      snapshot,
      6,
    );
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].path).toBe('team.members[1]');
    expect(result.problems[0].message).toContain('Species Clause');
    expect(result.complete).toBe(false);
  });

  it('refuses two real members holding the same item (Item Clause)', () => {
    const sets: RosterSets = {
      incineroar: { species: 'incineroar', item: 'sitrusberry' },
      kingambit: { species: 'kingambit', item: 'sitrusberry' },
    };
    const result = validateTeam({ name: 'Twins', members: ['incineroar', 'kingambit'] }, ['incineroar', 'kingambit'], sets, snapshot, 6);
    expect(result.problems.map((p) => p.path)).toEqual(['team.members[1].item']);
    expect(result.problems[0].message).toContain('Sitrus Berry');
    expect(result.problems[0].message).toContain('Item Clause');
  });
});
