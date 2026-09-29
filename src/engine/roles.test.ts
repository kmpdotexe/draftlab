import { describe, expect, it } from 'vitest';
import { CAN_LEARN_FACTOR, ROLES, RUN_MIN_SHARE, rosterLacks, speciesRoles } from './roles';
import { roleSnapshot, typedMove } from './test-support';
import type { RoleId } from './types';

const ALL_ROLES: RoleId[] = [
  'fakeOut', 'redirection', 'speedControl', 'intimidate', 'weatherTerrain', 'pivot', 'screens', 'support', 'priority', 'disruption',
];

describe('the role table', () => {
  it('has the ten roles in order, with their importance', () => {
    expect(ROLES.map((role) => role.id)).toEqual(ALL_ROLES);
    expect(ROLES.map((role) => role.importance)).toEqual([1, 1, 1, 0.75, 0.75, 0.5, 0.5, 0.5, 0.5, 0.5]);
    expect(RUN_MIN_SHARE).toBe(0.1);
    expect(CAN_LEARN_FACTOR).toBe(0.5);
  });

  it('gives every role a move or an ability, and only signature moves that are among its moves', () => {
    for (const role of ROLES) {
      expect(role.moves.length + role.abilities.length, role.id).toBeGreaterThan(0);
      for (const move of role.signatureMoves) expect(role.moves, `${role.id} ${move}`).toContain(move);
      expect(new Set(role.moves).size, role.id).toBe(role.moves.length);
    }
    const byId = Object.fromEntries(ROLES.map((role) => [role.id, role]));
    expect(byId.speedControl.moves).toEqual(['tailwind', 'trickroom', 'icywind', 'electroweb']);
    expect(byId.speedControl.signatureMoves).toEqual(['tailwind', 'trickroom']);
    expect(byId.intimidate.abilities).toEqual(['Intimidate']);
    expect(byId.weatherTerrain.abilities).toEqual(['Drought', 'Drizzle', 'Sand Stream', 'Snow Warning', 'Electric Surge']);
    expect(byId.fakeOut.signatureMoves).toEqual(['fakeout']);
    expect(byId.support.signatureMoves).toEqual([]);
  });
});

describe('speciesRoles: runs', () => {
  it('tags a role move at 10% of sets and not at 9%', () => {
    const s = roleSnapshot({
      at: { usage: { moves: [['fakeout', 0.1]] } },
      below: { usage: { moves: [['fakeout', 0.09]] } },
    });
    expect(speciesRoles('at', s)).toEqual([{ role: 'fakeOut', source: 'runs', via: 'fakeout', from: 'ladder' }]);
    expect(speciesRoles('below', s)).toEqual([]);
  });

  it('names the most-run move of the role, and breaks a tie by id ascending', () => {
    const s = roleSnapshot({
      top: { usage: { moves: [['tailwind', 0.2], ['trickroom', 0.5], ['icywind', 0.05]] } },
      tie: { usage: { moves: [['trickroom', 0.3], ['tailwind', 0.3]] } },
      tieReversed: { usage: { moves: [['tailwind', 0.3], ['trickroom', 0.3]] } },
    });
    expect(speciesRoles('top', s)).toEqual([{ role: 'speedControl', source: 'runs', via: 'trickroom', from: 'ladder' }]);
    expect(speciesRoles('tie', s)).toEqual([{ role: 'speedControl', source: 'runs', via: 'tailwind', from: 'ladder' }]);
    expect(speciesRoles('tieReversed', s)).toEqual([{ role: 'speedControl', source: 'runs', via: 'tailwind', from: 'ladder' }]);
  });

  it('gives one tag per role, in table order, whatever the order of the usage rows', () => {
    const s = roleSnapshot({
      a: {
        abilities: ['Intimidate', 'Blaze'],
        usage: {
          moves: [['suckerpunch', 0.4], ['fakeout', 0.9], ['tailwind', 0.2], ['icywind', 0.15], ['gonemove', 0.9]],
          abilities: [['intimidate', 0.8], ['blaze', 0.2]],
        },
      },
    });
    expect(speciesRoles('a', s)).toEqual([
      { role: 'fakeOut', source: 'runs', via: 'fakeout', from: 'ladder' },
      { role: 'speedControl', source: 'runs', via: 'tailwind', from: 'ladder' },
      { role: 'intimidate', source: 'ability', via: 'Intimidate', from: 'ladder' },
      { role: 'priority', source: 'runs', via: 'suckerpunch', from: 'ladder' },
    ]);
  });
});

describe('speciesRoles: ability', () => {
  it('tags a role ability when it is the expected ability, not when it is merely available', () => {
    const s = roleSnapshot({
      likely: { abilities: ['Intimidate', 'Blaze'], usage: { abilities: [['intimidate', 0.8], ['blaze', 0.2]] } },
      unlikely: { abilities: ['Intimidate', 'Blaze'], usage: { abilities: [['intimidate', 0.4], ['blaze', 0.6]] } },
      unused: { abilities: ['Intimidate', 'Blaze'], usage: { abilities: [['intimidate', 0.3], ['blaze', 0.3]] } },
    });
    expect(speciesRoles('likely', s)).toEqual([{ role: 'intimidate', source: 'ability', via: 'Intimidate', from: 'ladder' }]);
    expect(speciesRoles('unlikely', s)).toEqual([]);
    expect(speciesRoles('unused', s)).toEqual([]);
  });

  it('tags the only ability of a species that has no usage entry', () => {
    const s = roleSnapshot({ ninetails: { abilities: ['Drought'] }, other: { abilities: ['Drought', 'Blaze'] } });
    expect(speciesRoles('ninetails', s)).toEqual([{ role: 'weatherTerrain', source: 'ability', via: 'Drought', from: 'ladder' }]);
    expect(speciesRoles('other', s)).toEqual([]);
  });
});

describe('speciesRoles: can-learn', () => {
  it('tags a signature move for a species with no usage entry, naming the first signature move in table order', () => {
    const s = roleSnapshot({
      a: { learnset: ['tackle', 'fakeout', 'trickroom'] },
      b: { learnset: ['ragepowder', 'followme'] },
    });
    expect(speciesRoles('a', s)).toEqual([
      { role: 'fakeOut', source: 'can-learn', via: 'fakeout', from: 'ladder' },
      { role: 'speedControl', source: 'can-learn', via: 'trickroom', from: 'ladder' },
    ]);
    expect(speciesRoles('b', s)).toEqual([{ role: 'redirection', source: 'can-learn', via: 'followme', from: 'ladder' }]);
  });

  it('never tags a species that has a usage entry for a role it merely can learn', () => {
    const s = roleSnapshot({
      none: { usage: {}, learnset: ['fakeout'] },
      rare: { usage: { moves: [['fakeout', 0.05]] }, learnset: ['fakeout'] },
    });
    expect(speciesRoles('none', s)).toEqual([]);
    expect(speciesRoles('rare', s)).toEqual([]);
  });

  it('ignores learnable moves that are not signature moves, and gives nothing without learnsets', () => {
    const s = roleSnapshot({ a: { learnset: ['helpinghand', 'suckerpunch', 'icywind', 'uturn'] }, b: { learnset: ['fakeout'] } });
    expect(speciesRoles('a', s)).toEqual([]);
    const withoutLearnsets = { species: s.species, moves: s.moves, usage: s.usage };
    expect(speciesRoles('b', withoutLearnsets)).toEqual([]);
  });

  it('credits every species with no usage entry when there is no usage data at all', () => {
    const s = roleSnapshot({ a: { learnset: ['fakeout'] } }, false);
    expect(s.usage).toBeNull();
    expect(speciesRoles('a', s)).toEqual([{ role: 'fakeOut', source: 'can-learn', via: 'fakeout', from: 'ladder' }]);
  });
});

describe('speciesRoles and rosterLacks: entered sets', () => {
  /** `lead` runs Fake Out on 90% of ladder sets and has Intimidate as its expected ability; the move table has the set moves. */
  const withMoves = () => {
    const s = roleSnapshot({
      lead: { abilities: ['Intimidate', 'Blaze'], usage: { moves: [['fakeout', 0.9]], abilities: [['intimidate', 0.9]] } },
      learner: { learnset: ['fakeout'] },
    });
    s.moves = {
      fakeout: typedMove('fakeout', 'Normal', 'Physical', 40),
      tailwind: typedMove('tailwind', 'Flying', 'Status', 0),
      flareblitz: typedMove('flareblitz', 'Fire', 'Physical', 120),
    };
    return s;
  };

  it('reads the set\'s moves instead of the ladder\'s, and says so', () => {
    const sets = { lead: { moves: ['flareblitz', 'tailwind'] } };
    expect(speciesRoles('lead', withMoves(), sets)).toEqual([
      { role: 'speedControl', source: 'runs', via: 'tailwind', from: 'set' },
      { role: 'intimidate', source: 'ability', via: 'Intimidate', from: 'ladder' },
    ]);
  });

  it('reads the set\'s ability instead of the expected one', () => {
    const sets = { lead: { ability: 'blaze' } };
    expect(speciesRoles('lead', withMoves(), sets)).toEqual([{ role: 'fakeOut', source: 'runs', via: 'fakeout', from: 'ladder' }]);
  });

  it('never credits can-learn to a species whose set gives its moves', () => {
    expect(speciesRoles('learner', withMoves())).toEqual([{ role: 'fakeOut', source: 'can-learn', via: 'fakeout', from: 'ladder' }]);
    expect(speciesRoles('learner', withMoves(), { learner: { moves: ['flareblitz'] } })).toEqual([]);
  });

  it('makes a role lacked again when the set drops it (a lead without Fake Out)', () => {
    const s = withMoves();
    expect(rosterLacks(['lead'], s)).not.toContain('fakeOut');
    expect(rosterLacks(['lead'], s, { lead: { moves: ['flareblitz'] } })).toContain('fakeOut');
  });

  it('changes nothing with an empty set table, a set for another species, or a set with no usable field', () => {
    const s = withMoves();
    const ladder = speciesRoles('lead', s);
    expect(speciesRoles('lead', s, {})).toEqual(ladder);
    expect(speciesRoles('lead', s, { learner: { moves: ['tailwind'] } })).toEqual(ladder);
    expect(speciesRoles('lead', s, { lead: { moves: ['gonemove'], ability: 'levitate' } })).toEqual(ladder);
    expect(speciesRoles('lead', s, { lead: { species: 'learner', moves: ['tailwind'] } })).toEqual(ladder);
  });
});

describe('speciesRoles: malformed input (it is exported and callable on a raw, unsanitized snapshot)', () => {
  it('never throws when a usage entry\'s moves is not an array of pairs, or a learnset is not an array', () => {
    const s = roleSnapshot({ a: { usage: { moves: [['fakeout', 0.6]] } } });
    (s.usage!.species.a as unknown as Record<string, unknown>).moves = 'fakeout';
    expect(() => speciesRoles('a', s)).not.toThrow();
    expect(speciesRoles('a', s)).toEqual([]);
    (s.usage!.species.a as unknown as Record<string, unknown>).moves = [null, 5, ['fakeout']];
    expect(() => speciesRoles('a', s)).not.toThrow();
    expect(speciesRoles('a', s)).toEqual([]); // no row is a valid [id, number] pair
    const b = roleSnapshot({ b: { learnset: ['fakeout'] } });
    (b as unknown as Record<string, unknown>).learnsets = { b: 'fakeout' };
    expect(() => speciesRoles('b', b)).not.toThrow();
    expect(speciesRoles('b', b)).toEqual([]);
  });
});

describe('speciesRoles: unknown species', () => {
  it('has no tags for an id that is not in the snapshot, including names on the prototype', () => {
    const s = roleSnapshot({ a: { learnset: ['fakeout'] } });
    expect(speciesRoles('ghost', s)).toEqual([]);
    expect(speciesRoles('constructor', s)).toEqual([]);
    expect(speciesRoles('__proto__', s)).toEqual([]);
  });
});

describe('rosterLacks', () => {
  const s = roleSnapshot({
    lead: { abilities: ['Intimidate', 'Blaze'], usage: { moves: [['fakeout', 0.6]], abilities: [['intimidate', 0.9]] } },
    fast: { usage: { moves: [['tailwind', 0.7]] } },
    learner: { learnset: ['fakeout', 'followme'] },
  });

  it('is every role, in table order, for an empty roster', () => {
    expect(rosterLacks([], s)).toEqual(ALL_ROLES);
  });

  it('drops the roles the roster covers by a move it runs or its expected ability', () => {
    expect(rosterLacks(['lead', 'fast'], s)).toEqual(['redirection', 'weatherTerrain', 'pivot', 'screens', 'support', 'priority', 'disruption']);
    expect(rosterLacks(['lead'], s)).toEqual(ALL_ROLES.filter((role) => role !== 'fakeOut' && role !== 'intimidate'));
  });

  it('does not let a can-learn tag cover a role', () => {
    // The learner really has can-learn tags for Fake Out and redirection ...
    expect(speciesRoles('learner', s).map((tag) => tag.source)).toEqual(['can-learn', 'can-learn']);
    // ... and they do not count.
    expect(rosterLacks(['learner'], s)).toEqual(ALL_ROLES);
  });

  it('ignores roster ids that are not in the snapshot, and does not depend on roster order', () => {
    expect(rosterLacks(['ghost'], s)).toEqual(ALL_ROLES);
    expect(rosterLacks(['ghost', 'lead', 'fast'], s)).toEqual(rosterLacks(['lead', 'fast'], s));
    expect(rosterLacks(['fast', 'lead'], s)).toEqual(rosterLacks(['lead', 'fast'], s));
  });

  it('does not modify the roster', () => {
    const roster = ['fast', 'lead'];
    rosterLacks(roster, s);
    expect(roster).toEqual(['fast', 'lead']);
  });
});
