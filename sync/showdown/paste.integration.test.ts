import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { toID, type ID } from '../../src/domain/id';
import { isNatureName } from '../../src/domain/natures';
import { parsePaste } from '../../src/domain/paste';
import { exportSet, exportSets } from '../../src/domain/paste-export';
import type { PokemonSet } from '../../src/domain/set';
import type { Snapshot } from '../../src/domain/types';

// The slice of the pokemon-showdown API this test relies on. Kept local, like the loader does.
interface ShowdownSet {
  name: string;
  species: string;
  item: string;
  ability: string;
  moves: string[];
  nature: string;
  evs?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  level: number;
  gender: string;
}
interface ShowdownTeams {
  export(sets: ShowdownSet[]): string;
  import(text: string): Array<Partial<ShowdownSet>> | null;
}
const { Teams } = createRequire(import.meta.url)('pokemon-showdown') as { Teams: ShowdownTeams };

const snapshot = JSON.parse(
  readFileSync(new URL('../../data/gen9championsvgc2026regmb/snapshot.json', import.meta.url), 'utf8'),
) as Snapshot;
if (!snapshot.usage) throw new Error('the committed snapshot has no usage data');
const usage = snapshot.usage;
const ranked = Object.values(usage.species).sort((a, b) => b.usage - a.usage);

/** A set built from what real ladder teams run on the species (same builder as the unit tests). */
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

const nameOf = (table: Record<string, { name: string }>, id: string): string => {
  if (!Object.hasOwn(table, id)) throw new Error(`"${id}" is not in the snapshot`);
  return table[id].name;
};

/** The same set in Showdown's own shape, using display names. */
function toShowdownSet(set: PokemonSet): ShowdownSet {
  const species = snapshot.species[set.species];
  const abilityName = set.ability ? species.abilities.find((name) => toID(name) === set.ability) : '';
  if (set.ability && !abilityName) throw new Error(`${set.species} has no ability "${set.ability}"`);
  return {
    name: '',
    species: species.name,
    item: set.item ? nameOf(snapshot.items, set.item) : '',
    ability: abilityName ?? '',
    moves: (set.moves ?? []).map((move) => nameOf(snapshot.moves, move)),
    nature: set.nature ?? '',
    evs: set.points ? { ...set.points } : undefined,
    level: 50,
    gender: '',
  };
}

/** Showdown writes two trailing spaces on each line and blank lines at the end; ours has neither. */
const normalize = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

const sets = ranked.slice(0, 40).map(({ id }) => setFromUsage(id));

describe('paste format against the real pokemon-showdown package', () => {
  it('writes the same text as Teams.export for each of the 40 most used sets', () => {
    expect(sets).toHaveLength(40);
    const mismatches: string[] = [];
    for (const set of sets) {
      const ours = exportSet(set, snapshot);
      const theirs = normalize(Teams.export([toShowdownSet(set)]));
      if (ours !== theirs) mismatches.push(`${set.species}\nours:\n${ours}\ntheirs:\n${theirs}`);
    }
    expect(mismatches).toEqual([]);
  });

  it('writes the same text as Teams.export for a whole team that includes a Mega form', () => {
    const mega = sets.find((set) => snapshot.species[set.species].requiredItem);
    if (!mega) throw new Error('no Mega form among the 40 most used sets');
    const team = [mega, ...sets.filter((set) => set !== mega).slice(0, 5)];
    expect(team).toHaveLength(6);
    expect(exportSets(team, snapshot)).toBe(normalize(Teams.export(team.map(toShowdownSet))));
  });

  it('lets Teams.import read our text back to the same data', () => {
    const mismatches: string[] = [];
    for (const set of sets) {
      const imported = Teams.import(exportSet(set, snapshot));
      const expected = toShowdownSet(set);
      const got = imported?.[0];
      const same =
        imported?.length === 1 &&
        got?.species === expected.species &&
        (got.item ?? '') === expected.item &&
        (got.ability ?? '') === expected.ability &&
        JSON.stringify(got.moves) === JSON.stringify(expected.moves) &&
        (got.nature ?? '') === expected.nature &&
        got.level === 50 &&
        JSON.stringify(got.evs) === JSON.stringify(expected.evs);
      if (!same) mismatches.push(`${set.species}: ${JSON.stringify(got)}`);
    }
    expect(mismatches).toEqual([]);
  });

  it('reads Teams.export output back to the original set', () => {
    for (const set of sets) {
      const parsed = parsePaste(Teams.export([toShowdownSet(set)]), snapshot);
      expect(parsed, set.species).toEqual([{ set, problems: [], notes: [] }]);
    }
  });

  it('agrees with Teams.export on a species-only set and on all-zero points', () => {
    const bare: ShowdownSet = { name: '', species: 'Incineroar', item: '', ability: '', moves: [], nature: '', level: 50, gender: '' };
    expect(exportSet({ species: 'incineroar' }, snapshot)).toBe(normalize(Teams.export([bare])));

    const zero: PokemonSet = {
      species: 'incineroar',
      item: 'sitrusberry',
      ability: 'intimidate',
      nature: 'Jolly',
      moves: ['fakeout'],
      points: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    };
    expect(exportSet(zero, snapshot)).toBe(normalize(Teams.export([toShowdownSet(zero)])));
    expect(exportSet(zero, snapshot)).not.toContain('EVs');
  });
});
