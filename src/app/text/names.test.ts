import { describe, expect, it } from 'vitest';
import { moveEntry, speciesEntry } from '../../domain/test-support';
import { COMBOS, ROLES } from '../../engine';
import { COMBO_LABELS, ROLE_LABELS, joinList, makeNames } from './names';

const names = makeNames({
  species: { incineroar: speciesEntry('incineroar', 'Incineroar', { types: ['Fire', 'Dark'] }) },
  moves: { fakeout: moveEntry('fakeout', 'Fake Out') },
});

describe('makeNames', () => {
  it('gives display names and types from the snapshot', () => {
    expect(names.species('incineroar')).toBe('Incineroar');
    expect(names.move('fakeout')).toBe('Fake Out');
    expect(names.types('incineroar')).toEqual(['Fire', 'Dark']);
  });

  it('falls back to the id, and to no types, for something the snapshot does not have', () => {
    expect(names.species('missingno')).toBe('missingno');
    expect(names.move('gonemove')).toBe('gonemove');
    expect(names.types('missingno')).toEqual([]);
    // Prototype names are not species.
    expect(names.species('constructor')).toBe('constructor');
    expect(names.types('toString')).toEqual([]);
  });
});

describe('labels', () => {
  it('labels every role and every combo in the engine tables', () => {
    for (const role of ROLES) expect(ROLE_LABELS[role.id], role.id).toMatch(/\S/);
    for (const combo of COMBOS) expect(COMBO_LABELS[combo.id], combo.id).toMatch(/\S/);
    expect(Object.keys(ROLE_LABELS)).toHaveLength(ROLES.length);
    expect(Object.keys(COMBO_LABELS)).toHaveLength(COMBOS.length);
  });
});

describe('joinList', () => {
  it('joins zero, one, two and three items', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['A'])).toBe('A');
    expect(joinList(['A', 'B'])).toBe('A and B');
    expect(joinList(['A', 'B', 'C'])).toBe('A, B and C');
    expect(joinList(['A', 'B', 'C'], 'or')).toBe('A, B or C');
  });
});
