import { describe, expect, it } from 'vitest';
import type { PokemonSet } from './set';
import { validateTeam, type MatchTeam, type RosterSets } from './team';
import { itemEntry, setSnapshot, speciesEntry } from './test-support';

const snapshot = setSnapshot();
const ALL = ['incineroar', 'staraptor', 'staraptormega', 'charizard', 'charizardmegax', 'kingambit', 'garchomp', 'sinistcha'];
const team = (...members: string[]): MatchTeam => ({ name: 'Team', members });
const run = (members: string[], sets: RosterSets = {}, roster: string[] = ALL, teamSize = 6) =>
  validateTeam(team(...members), roster, sets, snapshot, teamSize);
const paths = (members: string[], sets: RosterSets = {}, roster: string[] = ALL, teamSize = 6) =>
  run(members, sets, roster, teamSize).problems.map((p) => p.path);

describe('validateTeam', () => {
  it('accepts a legal full team and reports it complete', () => {
    const sets: RosterSets = {
      incineroar: { species: 'incineroar', item: 'sitrusberry', moves: ['fakeout'] },
      kingambit: { species: 'kingambit', item: 'leftovers', moves: ['suckerpunch'] },
    };
    const result = run(['incineroar', 'staraptor', 'charizard', 'kingambit', 'garchomp', 'sinistcha'], sets);
    expect(result).toEqual({ problems: [], complete: true });
  });

  it('is not complete, but has no problems, with fewer members than the team size', () => {
    expect(run(['incineroar', 'staraptor', 'charizard', 'kingambit', 'garchomp'])).toEqual({
      problems: [],
      complete: false,
    });
    expect(run([])).toEqual({ problems: [], complete: false });
  });

  it('is not complete when there are problems, even at full size', () => {
    const result = run(['incineroar', 'staraptor', 'charizard', 'kingambit', 'garchomp', 'ghost'], {}, [...ALL, 'ghost']);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.complete).toBe(false);
  });

  describe('size', () => {
    it('refuses more members than the team size, reporting it first', () => {
      const result = run(['incineroar', 'staraptor', 'charizard', 'kingambit', 'garchomp', 'sinistcha', 'staraptormega']);
      expect(result.problems[0]).toEqual({ path: 'team.members', message: 'at most 6 members (found 7)' });
      expect(result.complete).toBe(false);
    });

    it('uses the team size it is given', () => {
      expect(run(['incineroar', 'kingambit', 'garchomp'], {}, ALL, 3).complete).toBe(true);
      expect(paths(['incineroar', 'kingambit', 'garchomp'], {}, ALL, 2)).toEqual(['team.members']);
    });
  });

  describe('members', () => {
    it('refuses a repeated member on the later occurrence and gives it no further checks', () => {
      expect(run(['incineroar', 'incineroar']).problems).toEqual([
        { path: 'team.members[1]', message: '"incineroar" is listed twice' },
      ]);
    });

    it('refuses a member that is not on the roster, and still checks its set', () => {
      const result = run(['garchomp', 'kingambit'], { garchomp: { species: 'garchomp', moves: ['fakeout'] } }, ['kingambit']);
      expect(result.problems.map((p) => [p.path, p.message])).toEqual([
        ['team.members[0]', '"garchomp" is not on your roster'],
        ['team.members[0].moves[0]', '"fakeout" is not a legal move for Garchomp in fmt'],
      ]);
    });

    it('checks each member\'s set with a path under the member', () => {
      const sets: RosterSets = { incineroar: { species: 'incineroar', moves: ['fakeout', 'closecombat'] } };
      expect(paths(['staraptor', 'incineroar'], sets)).toEqual(['team.members[1].moves[1]']);
    });

    it('checks a member with no set as a species-only set', () => {
      expect(run(['staraptormega']).problems).toEqual([
        { path: 'team.members[0].item', message: 'Staraptor-Mega must hold Staraptite' },
      ]);
    });

    it('refuses a member whose saved set is for a different species', () => {
      const sets = { incineroar: { species: 'kingambit' } } as RosterSets;
      const result = run(['incineroar'], sets);
      expect(result.problems).toHaveLength(1);
      expect(result.problems[0].path).toBe('team.members[0]');
      expect(result.problems[0].message).toContain('is for "kingambit"');
    });

    it('does not throw for a member the snapshot does not know', () => {
      expect(paths(['ghost'], {}, ['ghost'])).toEqual(['team.members[0].species']);
    });
  });

  describe('Species Clause', () => {
    it('refuses two forms of the same Pokémon, naming both and the dex number', () => {
      const sets: RosterSets = { charizardmegax: { species: 'charizardmegax', item: 'charizarditex' } };
      expect(run(['charizard', 'charizardmegax'], sets).problems).toEqual([
        {
          path: 'team.members[1]',
          message: '"charizardmegax" and "charizard" are the same Pokémon (dex number 6); Species Clause',
        },
      ]);
    });

    it('reports each later member once, naming the first earlier member it conflicts with', () => {
      const sets: RosterSets = {
        staraptormega: { species: 'staraptormega', item: 'staraptite' },
        charizardmegax: { species: 'charizardmegax', item: 'charizarditex' },
      };
      const result = run(['staraptor', 'charizard', 'staraptormega', 'charizardmegax'], sets);
      expect(result.problems.map((p) => [p.path, p.message])).toEqual([
        ['team.members[2]', '"staraptormega" and "staraptor" are the same Pokémon (dex number 398); Species Clause'],
        ['team.members[3]', '"charizardmegax" and "charizard" are the same Pokémon (dex number 6); Species Clause'],
      ]);
    });

    it('names the first earlier member, not the previous one, when three share a dex number', () => {
      const three = setSnapshot();
      three.species.charizardmegay = speciesEntry('charizardmegay', 'Charizard-Mega-Y', {
        num: 6,
        abilities: ['Drought'],
        baseSpecies: 'Charizard',
        forme: 'Mega-Y',
        requiredItem: 'Charizardite Y',
      });
      three.learnsets.charizardmegay = ['flareblitz'];
      three.items.charizarditey = itemEntry('charizarditey', 'Charizardite Y', ['charizard']);
      const sets: RosterSets = {
        charizardmegax: { species: 'charizardmegax', item: 'charizarditex' },
        charizardmegay: { species: 'charizardmegay', item: 'charizarditey' },
      };
      const roster = ['charizard', 'charizardmegax', 'charizardmegay'];
      const result = validateTeam(team('charizard', 'charizardmegax', 'charizardmegay'), roster, sets, three, 6);
      expect(result.problems).toEqual([
        {
          path: 'team.members[1]',
          message: '"charizardmegax" and "charizard" are the same Pokémon (dex number 6); Species Clause',
        },
        {
          path: 'team.members[2]',
          message: '"charizardmegay" and "charizard" are the same Pokémon (dex number 6); Species Clause',
        },
      ]);
    });

    it('allows different Pokémon', () => {
      expect(run(['incineroar', 'kingambit']).problems).toEqual([]);
    });
  });

  describe('Item Clause', () => {
    it('refuses two members holding the same item, naming both and the item', () => {
      const sets: RosterSets = {
        incineroar: { species: 'incineroar', item: 'leftovers' },
        kingambit: { species: 'kingambit', item: 'leftovers' },
      };
      expect(run(['incineroar', 'kingambit'], sets).problems).toEqual([
        { path: 'team.members[1].item', message: '"kingambit" and "incineroar" both hold Leftovers; Item Clause' },
      ]);
    });

    it('names the first holder, not the previous one, when three members hold the same item', () => {
      const sets: RosterSets = {
        incineroar: { species: 'incineroar', item: 'leftovers' },
        kingambit: { species: 'kingambit', item: 'leftovers' },
        garchomp: { species: 'garchomp', item: 'leftovers' },
      };
      expect(run(['incineroar', 'kingambit', 'garchomp'], sets).problems).toEqual([
        { path: 'team.members[1].item', message: '"kingambit" and "incineroar" both hold Leftovers; Item Clause' },
        { path: 'team.members[2].item', message: '"garchomp" and "incineroar" both hold Leftovers; Item Clause' },
      ]);
    });

    it('ignores members with no item', () => {
      const sets: RosterSets = { incineroar: { species: 'incineroar', item: 'leftovers' } };
      expect(run(['incineroar', 'kingambit', 'garchomp'], sets).problems).toEqual([]);
    });

    it('allows different items', () => {
      const sets: RosterSets = {
        incineroar: { species: 'incineroar', item: 'leftovers' },
        kingambit: { species: 'kingambit', item: 'sitrusberry' },
      };
      expect(run(['incineroar', 'kingambit'], sets).problems).toEqual([]);
    });

    it('falls back to the id in the message when the item is unknown', () => {
      const sets: RosterSets = {
        incineroar: { species: 'incineroar', item: 'zzz' },
        kingambit: { species: 'kingambit', item: 'zzz' },
      };
      const messages = run(['incineroar', 'kingambit'], sets).problems.map((p) => p.message);
      expect(messages).toContain('"kingambit" and "incineroar" both hold zzz; Item Clause');
    });
  });

  describe('order and robustness', () => {
    it('reports member problems before Species Clause problems before Item Clause problems', () => {
      const sets: RosterSets = {
        charizard: { species: 'charizard', item: 'leftovers', moves: ['closecombat'] },
        charizardmegax: { species: 'charizardmegax', item: 'charizarditex' },
        kingambit: { species: 'kingambit', item: 'leftovers' },
      };
      expect(paths(['charizard', 'charizardmegax', 'kingambit'], sets)).toEqual([
        'team.members[0].moves[0]',
        'team.members[1]',
        'team.members[2].item',
      ]);
    });

    it('does not throw on malformed input', () => {
      expect(validateTeam(null as unknown as MatchTeam, ALL, {}, snapshot, 6)).toEqual({
        problems: [{ path: 'team', message: 'team must have a list of members' }],
        complete: false,
      });
      expect(validateTeam({ name: 'x' } as unknown as MatchTeam, ALL, {}, snapshot, 6).complete).toBe(false);
      const odd = validateTeam({ name: 'x', members: [5, ''] } as unknown as MatchTeam, ALL, null as unknown as RosterSets, snapshot, 6);
      expect(odd.problems.map((p) => p.path)).toEqual(['team.members[0]', 'team.members[1]']);
      const badSet = { incineroar: 5 as unknown as PokemonSet };
      expect(paths(['incineroar'], badSet)).toEqual(['team.members[0]']);
    });

    it('roots every path at the path it is given', () => {
      expect(validateTeam({ name: 'T', members: ['incineroar', 'incineroar'] }, ALL, {}, snapshot, 6, 'teams[2]').problems).toEqual([
        { path: 'teams[2].members[1]', message: '"incineroar" is listed twice' },
      ]);
      const oversize = validateTeam(team('incineroar', 'kingambit', 'garchomp'), ALL, {}, snapshot, 2, 'teams[2]');
      expect(oversize.problems[0].path).toBe('teams[2].members');
      const malformed = validateTeam(null as unknown as MatchTeam, ALL, {}, snapshot, 6, 'teams[2]');
      expect(malformed.problems).toEqual([{ path: 'teams[2]', message: 'team must have a list of members' }]);
    });

    it('does not modify its inputs', () => {
      const members = ['incineroar', 'kingambit'];
      const sets: RosterSets = { incineroar: { species: 'incineroar', item: 'leftovers' } };
      const before = JSON.stringify({ members, sets, ALL });
      validateTeam({ name: 'T', members }, ALL, sets, snapshot, 6);
      expect(JSON.stringify({ members, sets, ALL })).toBe(before);
    });
  });
});
