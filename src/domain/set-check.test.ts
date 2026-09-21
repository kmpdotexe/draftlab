import { describe, expect, it } from 'vitest';
import type { NatureName } from './natures';
import type { PokemonSet, StatPoints } from './set';
import { validateSetAgainstSnapshot } from './set-check';
import { setSnapshot } from './test-support';

const snapshot = setSnapshot();
const check = (set: PokemonSet, path = 'set') => validateSetAgainstSnapshot(set, snapshot, path);
const paths = (set: PokemonSet) => check(set).map((p) => p.path);
const messages = (set: PokemonSet) => check(set).map((p) => p.message);

const points = (overrides: Partial<StatPoints> = {}): StatPoints => ({
  hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...overrides,
});

describe('validateSetAgainstSnapshot', () => {
  it('accepts a full legal set', () => {
    const set: PokemonSet = {
      species: 'incineroar',
      ability: 'intimidate',
      item: 'sitrusberry',
      moves: ['fakeout', 'flareblitz', 'partingshot', 'throatchop'],
      nature: 'Jolly',
      points: points({ hp: 2, atk: 32, spe: 32 }),
    };
    expect(check(set)).toEqual([]);
  });

  it('accepts a species-only set for an ordinary species', () => {
    expect(check({ species: 'incineroar' })).toEqual([]);
  });

  it('accepts the ability by id, whichever slot it is in', () => {
    expect(check({ species: 'incineroar', ability: 'blaze' })).toEqual([]);
    expect(check({ species: 'incineroar', ability: 'intimidate' })).toEqual([]);
  });

  describe('species', () => {
    it('refuses a species that is not legal, and reports nothing else', () => {
      const problems = check({ species: 'ghost', ability: 'levitate', moves: ['fakeout'], item: 'nope' });
      expect(problems).toEqual([{ path: 'set.species', message: '"ghost" is not legal in fmt' }]);
    });

    it('does not treat inherited object properties as species', () => {
      expect(paths({ species: 'constructor' })).toEqual(['set.species']);
      expect(paths({ species: 'toString' })).toEqual(['set.species']);
    });
  });

  describe('ability', () => {
    it('refuses an ability the species does not have and lists the real options', () => {
      expect(check({ species: 'incineroar', ability: 'levitate' })).toEqual([
        { path: 'set.ability', message: '"levitate" is not an ability of Incineroar (Blaze, Intimidate)' },
      ]);
    });
  });

  describe('moves', () => {
    it('refuses a move the species cannot learn, at its slot', () => {
      expect(check({ species: 'incineroar', moves: ['fakeout', 'closecombat'] })).toEqual([
        { path: 'set.moves[1]', message: '"closecombat" is not a legal move for Incineroar in fmt' },
      ]);
    });

    it('refuses a move id the snapshot does not know at all, in the same way', () => {
      expect(messages({ species: 'incineroar', moves: ['notamove'] })).toEqual([
        '"notamove" is not a legal move for Incineroar in fmt',
      ]);
    });

    it('accepts a species with an empty learnset and no moves', () => {
      expect(check({ species: 'sinistcha' })).toEqual([]);
      expect(paths({ species: 'sinistcha', moves: ['fakeout'] })).toEqual(['set.moves[0]']);
    });
  });

  describe('item', () => {
    it('refuses an item that is not legal in the format', () => {
      expect(check({ species: 'incineroar', item: 'assaultvest' })).toEqual([
        { path: 'set.item', message: '"assaultvest" is not a legal item in fmt' },
      ]);
      expect(paths({ species: 'incineroar', item: 'constructor' })).toEqual(['set.item']);
    });

    it('refuses a restricted item on the wrong species, naming who can hold it', () => {
      expect(check({ species: 'incineroar', item: 'staraptite' })).toEqual([
        { path: 'set.item', message: '"Staraptite" can only be held by Staraptor' },
      ]);
    });

    it('accepts a stone on the base species it belongs to', () => {
      expect(check({ species: 'staraptor', item: 'staraptite' })).toEqual([]);
    });
  });

  describe('required item (Mega forms)', () => {
    it('accepts a Mega form holding its own stone', () => {
      expect(check({ species: 'staraptormega', item: 'staraptite' })).toEqual([]);
      expect(check({ species: 'charizardmegax', item: 'charizarditex' })).toEqual([]);
    });

    it('accepts a Mega form whose stone lists the form it changes from, not its base species', () => {
      // Floettite is restricted to Floette-Eternal, but Floette-Mega's base species is Floette.
      expect(check({ species: 'floettemega', item: 'floettite' })).toEqual([]);
    });

    it('refuses a Mega form with no item', () => {
      expect(check({ species: 'staraptormega' })).toEqual([
        { path: 'set.item', message: 'Staraptor-Mega must hold Staraptite' },
      ]);
    });

    it('refuses a Mega form holding a different legal item with exactly one problem', () => {
      expect(check({ species: 'staraptormega', item: 'sitrusberry' })).toEqual([
        { path: 'set.item', message: 'Staraptor-Mega must hold Staraptite' },
      ]);
    });

    it('reports both problems when a Mega form holds another species\' stone', () => {
      expect(messages({ species: 'staraptormega', item: 'charizarditex' })).toEqual([
        '"Charizardite X" can only be held by Charizard',
        'Staraptor-Mega must hold Staraptite',
      ]);
    });
  });

  describe('robustness', () => {
    it('collects every problem, in rule order', () => {
      expect(
        paths({ species: 'incineroar', ability: 'levitate', moves: ['closecombat'], item: 'assaultvest' }),
      ).toEqual(['set.ability', 'set.moves[0]', 'set.item']);
    });

    it('returns the structural problems and stops when the set is malformed, without throwing', () => {
      expect(check(null as unknown as PokemonSet)).toEqual([{ path: 'set', message: 'set must be an object' }]);
      expect(paths({ species: 'incineroar', nature: 'Bogus' as unknown as NatureName, moves: ['closecombat'] })).toEqual([
        'set.nature',
      ]);
      expect(paths({ species: 5 } as unknown as PokemonSet)).toEqual(['set.species']);
    });

    it('prefixes every path with the path it is given', () => {
      expect(
        validateSetAgainstSnapshot({ species: 'incineroar', moves: ['closecombat'] }, snapshot, 'team.members[2]').map(
          (p) => p.path,
        ),
      ).toEqual(['team.members[2].moves[0]']);
    });

    it('does not modify its inputs', () => {
      const set: PokemonSet = { species: 'incineroar', moves: ['fakeout'] };
      const before = JSON.stringify({ set, snapshot });
      validateSetAgainstSnapshot(set, snapshot, 'set');
      expect(JSON.stringify({ set, snapshot })).toBe(before);
    });
  });
});
