import { describe, expect, it } from 'vitest';
import { setSnapshot } from '../../domain/test-support';
import type { UsageEntry } from '../../domain/types';
import { validateSetAgainstSnapshot } from '../../domain/set-check';
import { realData } from '../test-support';
import { NATURE_OPTIONS, abilityOptions, commonSet, itemOptions, moveOptions, natureLabel, requiredItemOf, shareText, type OptionSnapshot } from './options';

const incineroarUsage: UsageEntry = {
  id: 'incineroar',
  weight: 100,
  usage: 0.5,
  abilities: [['intimidate', 0.9], ['blaze', 0.1]],
  // 'nothing' and 'staraptite' (not holdable) are skipped; 'leftovers' and 'sitrusberry' are kept in share order.
  items: [['nothing', 0.3], ['staraptite', 0.25], ['leftovers', 0.2], ['sitrusberry', 0.15]],
  // 'closecombat' is not in Incineroar's learnset.
  moves: [['closecombat', 0.95], ['partingshot', 0.9], ['fakeout', 0.85], ['flareblitz', 0.4]],
  spreads: [
    { nature: 'Nope', points: [1, 1, 1, 1, 1, 1], share: 0.5 },
    { nature: 'Careful', points: [32, 4, 0, 0, 30, 0], share: 0.3 },
  ],
  teammates: [],
};

const snapshot: OptionSnapshot = {
  ...setSnapshot(),
  usage: { teams: 10, cutoff: 0, battles: 5, species: { incineroar: incineroarUsage } },
};

describe('pickers', () => {
  it('orders abilities by ladder share, then the rest in the species order', () => {
    expect(abilityOptions('incineroar', snapshot)).toEqual([
      { id: 'intimidate', name: 'Intimidate', share: 0.9 },
      { id: 'blaze', name: 'Blaze', share: 0.1 },
    ]);
    expect(abilityOptions('kingambit', snapshot).map((o) => [o.name, o.share])).toEqual([
      ['Defiant', null],
      ['Supreme Overlord', null],
      ['Pressure', null],
    ]);
    expect(abilityOptions('missingno', snapshot)).toEqual([]);
  });

  it('offers only items the species can hold: ladder ones by share, then the rest alphabetically', () => {
    expect(itemOptions('incineroar', snapshot).map((o) => [o.id, o.share])).toEqual([
      ['leftovers', 0.2],
      ['sitrusberry', 0.15],
      ['choicescarf', null],
      ['passhoberry', null],
    ]);
    // The base species may hold its stone; Kingambit may not.
    expect(itemOptions('staraptor', snapshot).map((o) => o.id)).toContain('staraptite');
    expect(itemOptions('kingambit', snapshot).map((o) => o.id)).not.toContain('staraptite');
  });

  it('offers only learnable moves: ladder ones by share, then the rest alphabetically', () => {
    expect(moveOptions('incineroar', snapshot)).toEqual([
      { id: 'partingshot', name: 'Parting Shot', share: 0.9 },
      { id: 'fakeout', name: 'Fake Out', share: 0.85 },
      { id: 'flareblitz', name: 'Flare Blitz', share: 0.4 },
      { id: 'throatchop', name: 'Throat Chop', share: null },
    ]);
    expect(moveOptions('sinistcha', snapshot)).toEqual([]);
  });

  it('knows the required item of a Mega form', () => {
    expect(requiredItemOf('staraptormega', snapshot)).toBe('staraptite');
    expect(requiredItemOf('staraptor', snapshot)).toBeNull();
  });

  it('labels natures with their effect and shares as percentages', () => {
    expect(natureLabel('Adamant')).toBe('Adamant (+Atk, −SpA)');
    expect(natureLabel('Hardy')).toBe('Hardy (neutral)');
    expect(NATURE_OPTIONS).toHaveLength(25);
    expect(NATURE_OPTIONS[0]).toBe('Adamant');
    expect(shareText(0.978299)).toBe('97.8%');
  });
});

describe('commonSet', () => {
  it('builds the top ability, holdable item, learnable moves and the first valid spread', () => {
    expect(commonSet('incineroar', snapshot)).toEqual({
      species: 'incineroar',
      ability: 'intimidate',
      item: 'leftovers',
      moves: ['partingshot', 'fakeout', 'flareblitz'],
      nature: 'Careful',
      points: { hp: 32, atk: 4, def: 0, spa: 0, spd: 30, spe: 0 },
    });
  });

  it('is null without ladder usage', () => {
    expect(commonSet('kingambit', snapshot)).toBeNull();
    expect(commonSet('incineroar', { ...snapshot, usage: null })).toBeNull();
  });

  it('gives legal sets on the real snapshot, with a Mega form holding its stone', () => {
    const { snapshot: real } = realData();
    expect(commonSet('garchomp', real)).toEqual({
      species: 'garchomp',
      ability: 'roughskin',
      item: 'lifeorb',
      moves: ['dragonclaw', 'earthquake', 'rockslide', 'protect'],
      nature: 'Jolly',
      points: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
    });
    expect(commonSet('charizardmegay', real)?.item).toBe('charizarditey');
    expect(commonSet('charizard', real)).toBeNull();
    const withUsage = Object.keys(real.usage!.species);
    expect(withUsage.length).toBeGreaterThan(200);
    const illegal = withUsage.filter((id) => validateSetAgainstSnapshot(commonSet(id, real)!, real, id).length > 0);
    expect(illegal).toEqual([]);
  });
});
