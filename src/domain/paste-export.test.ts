import { describe, expect, it } from 'vitest';
import { parsePaste } from './paste';
import { exportSet, exportSets, exportTeam } from './paste-export';
import type { PokemonSet, StatPoints } from './set';
import type { NatureName } from './natures';
import type { MatchTeam, RosterSets } from './team';
import { setSnapshot } from './test-support';

const snapshot = setSnapshot();
const lines = (...rows: string[]) => rows.join('\n');
const points = (overrides: Partial<StatPoints> = {}): StatPoints => ({
  hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...overrides,
});

const FULL_SET: PokemonSet = {
  species: 'incineroar',
  item: 'sitrusberry',
  ability: 'intimidate',
  points: points({ hp: 2, atk: 32, spe: 32 }),
  nature: 'Jolly',
  moves: ['fakeout', 'flareblitz', 'partingshot', 'throatchop'],
};
const FULL_TEXT = lines(
  'Incineroar @ Sitrus Berry',
  'Ability: Intimidate',
  'Level: 50',
  'EVs: 2 HP / 32 Atk / 32 Spe',
  'Jolly Nature',
  '- Fake Out',
  '- Flare Blitz',
  '- Parting Shot',
  '- Throat Chop',
);

describe('exportSet', () => {
  it('writes the full example exactly, with display names and no trailing spaces', () => {
    const text = exportSet(FULL_SET, snapshot);
    expect(text).toBe(FULL_TEXT);
    expect(text.split('\n').every((line) => line === line.trimEnd())).toBe(true);
  });

  it('writes only the lines the set has, and always Level: 50', () => {
    expect(exportSet({ species: 'incineroar' }, snapshot)).toBe(lines('Incineroar', 'Level: 50'));
    expect(exportSet({ species: 'incineroar', ability: 'blaze' }, snapshot)).toBe(
      lines('Incineroar', 'Ability: Blaze', 'Level: 50'),
    );
    expect(exportSet({ species: 'incineroar', item: 'leftovers' }, snapshot)).toBe(
      lines('Incineroar @ Leftovers', 'Level: 50'),
    );
    expect(exportSet({ species: 'incineroar', nature: 'Timid' }, snapshot)).toBe(
      lines('Incineroar', 'Level: 50', 'Timid Nature'),
    );
    expect(exportSet({ species: 'incineroar', moves: ['fakeout'] }, snapshot)).toBe(
      lines('Incineroar', 'Level: 50', '- Fake Out'),
    );
  });

  it('ignores a nature that is not a non-empty string, and never throws on one', () => {
    const expected = lines('Incineroar', 'Level: 50');
    for (const nature of [null, '', 5, Object.create(null), Symbol('x')] as unknown[]) {
      expect(exportSet({ species: 'incineroar', nature: nature as unknown as NatureName }, snapshot)).toBe(expected);
    }
  });

  it('writes no EVs line for absent or all-zero points', () => {
    expect(exportSet({ species: 'incineroar', points: points() }, snapshot)).toBe(lines('Incineroar', 'Level: 50'));
  });

  it('lists only non-zero stats, in the order HP, Atk, Def, SpA, SpD, Spe', () => {
    expect(exportSet({ species: 'incineroar', points: points({ def: 4, spa: 32, spe: 30 }) }, snapshot)).toBe(
      lines('Incineroar', 'Level: 50', 'EVs: 4 Def / 32 SpA / 30 Spe'),
    );
    // Keys inserted in the reverse of the display order: the order must come from the stat list, not the object.
    const reversed = { spe: 1, spd: 2, spa: 3, def: 4, atk: 5, hp: 6 } as StatPoints;
    expect(exportSet({ species: 'incineroar', points: reversed }, snapshot)).toBe(
      lines('Incineroar', 'Level: 50', 'EVs: 6 HP / 5 Atk / 4 Def / 3 SpA / 2 SpD / 1 Spe'),
    );
  });

  it('writes a Mega form with its stone and never rewrites the set', () => {
    expect(exportSet({ species: 'staraptormega', item: 'staraptite' }, snapshot)).toBe(
      lines('Staraptor-Mega @ Staraptite', 'Level: 50'),
    );
    expect(exportSet({ species: 'staraptor', item: 'staraptite' }, snapshot)).toBe(
      lines('Staraptor @ Staraptite', 'Level: 50'),
    );
  });

  it('falls back to the id as written when a name cannot be found', () => {
    expect(exportSet({ species: 'incineroar', ability: 'levitate', item: 'zzz', moves: ['notamove'] }, snapshot)).toBe(
      lines('Incineroar @ zzz', 'Ability: levitate', 'Level: 50', '- notamove'),
    );
    expect(exportSet({ species: 'ghost', item: 'sitrusberry' }, snapshot)).toBe(
      lines('ghost @ Sitrus Berry', 'Level: 50'),
    );
    expect(exportSet({ species: 'ghost', ability: 'levitate' }, snapshot)).toBe(
      lines('ghost', 'Ability: levitate', 'Level: 50'),
    );
    expect(exportSet({ species: 'constructor', item: 'constructor', moves: ['constructor'] }, snapshot)).toBe(
      lines('constructor @ constructor', 'Level: 50', '- constructor'),
    );
  });

  it('returns an empty string for something that is not a usable set', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { species: 5 }, { species: '' }]) {
      expect(exportSet(bad as unknown as PokemonSet, snapshot), JSON.stringify(bad)).toBe('');
    }
  });

  it('does not modify its inputs', () => {
    const set: PokemonSet = { ...FULL_SET };
    const before = JSON.stringify({ set, snapshot });
    exportSet(set, snapshot);
    expect(JSON.stringify({ set, snapshot })).toBe(before);
  });
});

describe('exportSets', () => {
  const kingambit: PokemonSet = { species: 'kingambit', item: 'leftovers', moves: ['suckerpunch'] };

  it('joins blocks with one blank line, in the order given, skipping anything unusable', () => {
    // Order is the reverse of the fixture's own, so re-ordering fails.
    const text = exportSets([kingambit, null as unknown as PokemonSet, FULL_SET], snapshot);
    expect(text).toBe(
      lines('Kingambit @ Leftovers', 'Level: 50', '- Sucker Punch', '', FULL_TEXT),
    );
  });

  it('returns an empty string for an empty list or something that is not a list', () => {
    expect(exportSets([], snapshot)).toBe('');
    expect(exportSets(5 as unknown as PokemonSet[], snapshot)).toBe('');
  });
});

describe('exportTeam', () => {
  const sets: RosterSets = { incineroar: { species: 'incineroar', item: 'leftovers', moves: ['fakeout'] } };

  it('writes the members in team order, with a species-only block for a member that has no saved set', () => {
    const team: MatchTeam = { name: 'T', members: ['kingambit', 'incineroar'] };
    expect(exportTeam(team, sets, snapshot)).toBe(
      lines('Kingambit', 'Level: 50', '', 'Incineroar @ Leftovers', 'Level: 50', '- Fake Out'),
    );
  });

  it('falls back to a species-only block when the saved set cannot be written, or there are no sets at all', () => {
    const team: MatchTeam = { name: 'T', members: ['kingambit'] };
    expect(exportTeam(team, { kingambit: 5 } as unknown as RosterSets, snapshot)).toBe(lines('Kingambit', 'Level: 50'));
    expect(exportTeam(team, null as unknown as RosterSets, snapshot)).toBe(lines('Kingambit', 'Level: 50'));
  });

  it('does not treat inherited object properties as saved sets', () => {
    const team: MatchTeam = { name: 'T', members: ['constructor'] };
    expect(exportTeam(team, {}, snapshot)).toBe(lines('constructor', 'Level: 50'));
  });

  it('skips members that are not species ids, and returns an empty string for a malformed team', () => {
    const odd = { name: 'T', members: [5, '', 'incineroar'] } as unknown as MatchTeam;
    expect(exportTeam(odd, {}, snapshot)).toBe(lines('Incineroar', 'Level: 50'));
    expect(exportTeam(null as unknown as MatchTeam, {}, snapshot)).toBe('');
    expect(exportTeam({ name: 'x' } as unknown as MatchTeam, {}, snapshot)).toBe('');
  });

  it('does not modify its inputs', () => {
    const team: MatchTeam = { name: 'T', members: ['kingambit', 'incineroar'] };
    const before = JSON.stringify({ team, sets, snapshot });
    exportTeam(team, sets, snapshot);
    expect(JSON.stringify({ team, sets, snapshot })).toBe(before);
  });
});

describe('round trip: parsePaste(exportSet(set)) gives the set back', () => {
  const roundTrip = (set: PokemonSet) => {
    const parsed = parsePaste(exportSet(set, snapshot), snapshot);
    expect(parsed).toHaveLength(1);
    return parsed[0];
  };

  it('for a set with every field', () => {
    expect(roundTrip(FULL_SET)).toEqual({ set: FULL_SET, problems: [], notes: [] });
  });

  it('for a set with only some stats spent', () => {
    const set: PokemonSet = { species: 'kingambit', points: points({ atk: 5 }) };
    expect(roundTrip(set)).toEqual({ set, problems: [], notes: [] });
  });

  it('for a Mega form with its stone', () => {
    const set: PokemonSet = { species: 'staraptormega', item: 'staraptite', moves: ['bravebird'] };
    expect(roundTrip(set)).toEqual({ set, problems: [], notes: [] });
  });

  it('except that a base species holding its own Mega stone comes back as the Mega form, with a note', () => {
    expect(roundTrip({ species: 'staraptor', item: 'staraptite' })).toEqual({
      set: { species: 'staraptormega', item: 'staraptite' },
      problems: [],
      notes: ['read "Staraptor" holding Staraptite as Staraptor-Mega'],
    });
  });

  it('for a species-only set', () => {
    expect(roundTrip({ species: 'incineroar' })).toEqual({ set: { species: 'incineroar' }, problems: [], notes: [] });
  });

  it('except that all-zero points come back as no points', () => {
    const parsed = roundTrip({ species: 'incineroar', item: 'leftovers', points: points() });
    expect(parsed.set).toEqual({ species: 'incineroar', item: 'leftovers' });
    expect(parsed.set !== null && 'points' in parsed.set).toBe(false);
    expect(parsed.problems).toEqual([]);
    expect(parsed.notes).toEqual([]);
  });
});
