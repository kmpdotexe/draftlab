import { describe, expect, it } from 'vitest';
import { speciesEntry } from '../domain/test-support';
import { abilityOf, profileOf, readSets, runsMove, setFor } from './profile';
import { typedMove, usageData, usageEntry } from './test-support';
import type { EngineSnapshot } from './types';

/**
 * `pel` has two abilities and a ladder entry: Drizzle in 80% of sets, moves Hurricane 0.6, Tailwind 0.4, Protect 0.05.
 * `solo` has one ability (Levitate) and no usage entry.
 */
const snapshot = (): EngineSnapshot => ({
  species: {
    pel: speciesEntry('pel', 'Pel', { abilities: ['Drizzle', 'Rain Dish'] }),
    solo: speciesEntry('solo', 'Solo', { abilities: ['Levitate'] }),
  },
  moves: {
    hurricane: typedMove('hurricane', 'Flying', 'Special', 110),
    tailwind: typedMove('tailwind', 'Flying', 'Status', 0),
    protect: typedMove('protect', 'Normal', 'Status', 0),
    surf: typedMove('surf', 'Water', 'Special', 90),
  },
  usage: usageData([
    usageEntry('pel', {
      moves: [['hurricane', 0.6], ['tailwind', 0.4], ['protect', 0.05]],
      abilities: [['drizzle', 0.8], ['raindish', 0.2]],
    }),
  ]),
});
const entries = (profile: ReturnType<typeof profileOf>) => [...profile.moves.entries()];

describe('profileOf: ladder', () => {
  it('reads the ladder moves and the expected ability without a set', () => {
    const profile = profileOf('pel', snapshot());
    expect(entries(profile)).toEqual([['hurricane', 0.6], ['tailwind', 0.4], ['protect', 0.05]]);
    expect(profile).toMatchObject({ movesFrom: 'ladder', ability: 'Drizzle', abilityFrom: 'ladder' });
  });

  it('has no moves without a usage entry, and the only ability of a one-ability species', () => {
    const profile = profileOf('solo', snapshot());
    expect(entries(profile)).toEqual([]);
    expect(profile).toMatchObject({ movesFrom: 'ladder', ability: 'Levitate', abilityFrom: 'ladder' });
  });

  it('keeps the largest share of a repeated ladder row and skips rows that are not [id, number] pairs', () => {
    const s = snapshot();
    (s.usage!.species.pel as unknown as Record<string, unknown>).moves = [['surf', 0.2], null, ['surf', 0.5], ['x'], ['surf', 0.3]];
    expect(entries(profileOf('pel', s))).toEqual([['surf', 0.5]]);
  });

  it('gives an empty ladder profile for an id that is not in the snapshot, including prototype names', () => {
    const empty = { movesFrom: 'ladder', ability: null, abilityFrom: 'ladder' };
    expect(profileOf('ghost', snapshot())).toMatchObject(empty);
    expect(profileOf('constructor', snapshot())).toMatchObject(empty);
    expect(profileOf('ghost', snapshot()).moves.size).toBe(0);
  });
});

describe('profileOf: sets', () => {
  it('replaces the ladder moves with the set\'s moves, at share 1, in set order', () => {
    const profile = profileOf('pel', snapshot(), { species: 'pel', moves: ['surf', 'protect'] });
    expect(entries(profile)).toEqual([['surf', 1], ['protect', 1]]);
    expect(profile.movesFrom).toBe('set');
    // The ability is untouched by a set without one.
    expect(profile).toMatchObject({ ability: 'Drizzle', abilityFrom: 'ladder' });
  });

  it('drops set moves that are not strings or not in the move table, and duplicates', () => {
    const profile = profileOf('pel', snapshot(), { moves: ['surf', 5, 'gonemove', 'surf', null, 'constructor'] });
    expect(entries(profile)).toEqual([['surf', 1]]);
  });

  it('keeps the ladder moves when no set move is usable, or the set has no moves', () => {
    for (const set of [{ moves: [] }, { moves: ['gonemove'] }, { moves: 'surf' }, {}]) {
      const profile = profileOf('pel', snapshot(), set);
      expect(profile.movesFrom, JSON.stringify(set)).toBe('ladder');
      expect(profile.moves.get('hurricane'), JSON.stringify(set)).toBe(0.6);
    }
  });

  it('takes the set\'s ability when the species can have it, matched by id and returned as the listed name', () => {
    const profile = profileOf('pel', snapshot(), { ability: 'raindish' });
    expect(profile).toMatchObject({ ability: 'Rain Dish', abilityFrom: 'set', movesFrom: 'ladder' });
    expect(profileOf('pel', snapshot(), { ability: 'Rain Dish' }).ability).toBe('Rain Dish');
  });

  it('ignores a set ability the species cannot have, or one that is not a string', () => {
    for (const ability of ['levitate', 5, null]) {
      const profile = profileOf('pel', snapshot(), { ability });
      expect(profile, String(ability)).toMatchObject({ ability: 'Drizzle', abilityFrom: 'ladder' });
    }
  });

  it('ignores a set for another species entirely, and a set that is not a plain object', () => {
    const ladder = profileOf('pel', snapshot());
    expect(profileOf('pel', snapshot(), { species: 'solo', moves: ['surf'], ability: 'raindish' })).toEqual(ladder);
    for (const set of [null, 'x', 5, ['surf']]) expect(profileOf('pel', snapshot(), set), JSON.stringify(set)).toEqual(ladder);
  });

  it('uses a set for a species with no usage entry', () => {
    const profile = profileOf('solo', snapshot(), { moves: ['surf'] });
    expect(entries(profile)).toEqual([['surf', 1]]);
    expect(profile.movesFrom).toBe('set');
  });

  it('does not modify the set or the snapshot', () => {
    const s = snapshot();
    const set = { species: 'pel', moves: ['surf', 'surf'], ability: 'raindish' };
    const before = JSON.stringify({ s, set });
    profileOf('pel', s, set);
    expect(JSON.stringify({ s, set })).toBe(before);
  });
});

describe('abilityOf', () => {
  it('follows the same rules as profileOf, without needing a move table', () => {
    const s = { species: snapshot().species, usage: snapshot().usage };
    expect(abilityOf('pel', s)).toEqual({ ability: 'Drizzle', from: 'ladder' });
    expect(abilityOf('pel', s, { ability: 'raindish' })).toEqual({ ability: 'Rain Dish', from: 'set' });
    expect(abilityOf('pel', s, { species: 'solo', ability: 'raindish' })).toEqual({ ability: 'Drizzle', from: 'ladder' });
    expect(abilityOf('ghost', s)).toEqual({ ability: null, from: 'ladder' });
  });
});

describe('readSets and setFor', () => {
  it('keeps the roster members\' entries only, as own keys', () => {
    const given = { pel: { moves: ['surf'] }, other: { moves: ['surf'] } };
    expect(readSets(given, ['pel', 'solo'])).toEqual({ pel: { moves: ['surf'] } });
  });

  it('gives {} for anything that is not a plain object', () => {
    for (const given of [undefined, null, 5, 'x', [{ moves: [] }]]) expect(readSets(given, ['pel']), JSON.stringify(given)).toEqual({});
  });

  it('does not pick up prototype names as sets', () => {
    expect(readSets({}, ['constructor', 'toString'])).toEqual({});
    expect(setFor({}, 'constructor')).toBeUndefined();
    expect(setFor(undefined, 'pel')).toBeUndefined();
    expect(setFor({ pel: 1 }, 'pel')).toBe(1);
  });
});

describe('runsMove', () => {
  it('is true at or above the share, false below it or for a move the profile does not have', () => {
    const profile = profileOf('pel', snapshot());
    expect(runsMove(profile, 'tailwind', 0.4)).toBe(true);
    expect(runsMove(profile, 'tailwind', 0.41)).toBe(false);
    expect(runsMove(profile, 'surf', 0)).toBe(false);
  });
});
