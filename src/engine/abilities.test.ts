import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { speciesEntry } from '../domain/test-support';
import type { Snapshot } from '../domain/types';
import { EXPECTED_ABILITY_MIN_SHARE, IMMUNITY_ABILITIES, expectedAbility, immunityOf } from './abilities';
import { usageData, usageEntry } from './test-support';
import type { EngineSnapshot } from './types';

/** A snapshot of species with the given ability lists (id -> ability names) and optional usage. */
const snap = (abilities: Record<string, string[]>, usage: EngineSnapshot['usage'] = null): Pick<EngineSnapshot, 'species' | 'usage'> => ({
  species: Object.fromEntries(Object.entries(abilities).map(([id, list]) => [id, speciesEntry(id, id, { abilities: list })])),
  usage,
});

describe('expectedAbility: with ability usage', () => {
  it('takes the top-used ability at exactly 50% and refuses it at 49%', () => {
    expect(EXPECTED_ABILITY_MIN_SHARE).toBe(0.5);
    const at = (share: number) => snap({ a: ['Levitate', 'Pressure'] }, usageData([usageEntry('a', { abilities: [['levitate', share], ['pressure', 0.3]] })]));
    expect(expectedAbility('a', at(0.5))).toBe('Levitate');
    expect(expectedAbility('a', at(0.49))).toBeNull();
  });

  it('breaks a tie between top abilities by id ascending, whatever the row order', () => {
    const rows = (order: Array<[string, number]>) => snap({ a: ['Pressure', 'Levitate'] }, usageData([usageEntry('a', { abilities: order })]));
    expect(expectedAbility('a', rows([['pressure', 0.5], ['levitate', 0.5]]))).toBe('Levitate');
    expect(expectedAbility('a', rows([['levitate', 0.5], ['pressure', 0.5]]))).toBe('Levitate');
  });

  it('matches the usage id to a listed name by id ("Earth Eater" is "eartheater") and returns the listed spelling', () => {
    const s = snap({ a: ['Earth Eater', 'Static'] }, usageData([usageEntry('a', { abilities: [['eartheater', 0.9]] })]));
    expect(expectedAbility('a', s)).toBe('Earth Eater');
  });

  it('gives null when the top ability is not one of the species\' listed abilities, and does not fall back to a single listed ability', () => {
    const s = snap({ a: ['Pressure'] }, usageData([usageEntry('a', { abilities: [['levitate', 0.9]] })]));
    expect(expectedAbility('a', s)).toBeNull();
  });

  it('uses the single-ability rule when the usage entry has no ability rows', () => {
    const one = snap({ a: ['Pressure'] }, usageData([usageEntry('a', { abilities: [] })]));
    const two = snap({ a: ['Pressure', 'Levitate'] }, usageData([usageEntry('a', { abilities: [] })]));
    expect(expectedAbility('a', one)).toBe('Pressure');
    expect(expectedAbility('a', two)).toBeNull();
  });
});

describe('expectedAbility: without ability usage', () => {
  it('is the only ability of a single-ability species, with or without usage data', () => {
    expect(expectedAbility('a', snap({ a: ['Levitate'] }))).toBe('Levitate');
    expect(expectedAbility('a', snap({ a: ['Levitate'] }, usageData([usageEntry('other')])))).toBe('Levitate');
  });

  it('is null for a multi-ability species and for a species with no abilities', () => {
    expect(expectedAbility('a', snap({ a: ['Levitate', 'Pressure'] }))).toBeNull();
    expect(expectedAbility('a', snap({ a: [] }))).toBeNull();
  });

  it('is null for an id that is not in the snapshot, including names on the prototype', () => {
    const s = snap({ a: ['Levitate'] });
    expect(expectedAbility('ghost', s)).toBeNull();
    expect(expectedAbility('constructor', s)).toBeNull();
  });

  it('does not throw on a species whose abilities are not a list of strings', () => {
    const s = snap({ a: ['Levitate'] });
    (s.species.a as unknown as Record<string, unknown>).abilities = 'Levitate';
    expect(expectedAbility('a', s)).toBeNull();
    (s.species.a as unknown as Record<string, unknown>).abilities = [5, 'Levitate'];
    expect(expectedAbility('a', s)).toBe('Levitate');
  });
});

describe('immunityOf', () => {
  it('maps each table ability to its type, for a species whose only ability it is', () => {
    const expected: Record<string, string> = {
      Levitate: 'Ground',
      'Earth Eater': 'Ground',
      'Flash Fire': 'Fire',
      'Water Absorb': 'Water',
      'Dry Skin': 'Water',
      'Volt Absorb': 'Electric',
      'Lightning Rod': 'Electric',
      'Motor Drive': 'Electric',
      'Sap Sipper': 'Grass',
    };
    expect(IMMUNITY_ABILITIES).toEqual(expected);
    for (const [ability, type] of Object.entries(expected)) {
      expect(immunityOf('a', snap({ a: [ability] })), ability).toEqual({ type, ability });
    }
  });

  it('is null for an ability outside the table, and for an ability that is available but not the expected one', () => {
    expect(immunityOf('a', snap({ a: ['Intimidate'] }))).toBeNull();
    // Levitate is listed, but the species runs Pressure in 90% of sets.
    const s = snap({ a: ['Levitate', 'Pressure'] }, usageData([usageEntry('a', { abilities: [['pressure', 0.9], ['levitate', 0.1]] })]));
    expect(immunityOf('a', s)).toBeNull();
    // Without usage a two-ability species has no expected ability.
    expect(immunityOf('a', snap({ a: ['Levitate', 'Pressure'] }))).toBeNull();
    expect(immunityOf('ghost', snap({ a: ['Levitate'] }))).toBeNull();
  });

  it('follows the usage data: the same species is immune or not depending on its top ability', () => {
    const list = ['Levitate', 'Pressure'];
    const levitating = snap({ a: list }, usageData([usageEntry('a', { abilities: [['levitate', 0.8], ['pressure', 0.2]] })]));
    expect(immunityOf('a', levitating)).toEqual({ type: 'Ground', ability: 'Levitate' });
  });

  it('does not treat names on the prototype as table abilities', () => {
    expect(immunityOf('a', snap({ a: ['constructor'] }))).toBeNull();
    expect(immunityOf('a', snap({ a: ['toString'] }))).toBeNull();
  });
});

describe('the immunity table on the real snapshot', () => {
  const snapshot = JSON.parse(
    readFileSync(new URL('../../data/gen9championsvgc2026regmb/snapshot.json', import.meta.url), 'utf8'),
  ) as Snapshot;
  const legal = Object.values(snapshot.species);

  it('lists only abilities that some legal species can have', () => {
    for (const ability of Object.keys(IMMUNITY_ABILITIES)) {
      expect(legal.filter((entry) => entry.abilities.includes(ability)).length, ability).toBeGreaterThanOrEqual(1);
    }
  });

  it('gives Rotom-Wash a Levitate immunity and Incineroar none', () => {
    expect(immunityOf('rotomwash', snapshot)).toEqual({ type: 'Ground', ability: 'Levitate' });
    expect(immunityOf('incineroar', snapshot)).toBeNull();
  });

  it('finds an expected ability for most species with usage data, and an immunity for a handful', () => {
    const withUsage = Object.keys(snapshot.usage?.species ?? {});
    const expected = withUsage.filter((id) => expectedAbility(id, snapshot) !== null).length;
    const immune = Object.keys(snapshot.species).filter((id) => immunityOf(id, snapshot) !== null).length;
    expect(expected).toBeGreaterThanOrEqual(150); // 220 of 223 when this was written
    expect(immune).toBeGreaterThanOrEqual(12); // 22 when this was written
    expect(immune).toBeLessThanOrEqual(40);
  });
});
