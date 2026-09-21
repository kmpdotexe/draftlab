import { describe, expect, it } from 'vitest';
import { parsePaste, pasteToTeam, type ParsedSet } from './paste';
import { setSnapshot, speciesEntry } from './test-support';

const snapshot = setSnapshot();
const parse = (text: string, from = snapshot) => parsePaste(text, from);
const one = (text: string, from = snapshot): ParsedSet => {
  const result = parse(text, from);
  expect(result).toHaveLength(1);
  return result[0];
};
const lines = (...rows: string[]) => rows.join('\n');
const paths = (parsed: ParsedSet) => parsed.problems.map((p) => p.path);

const FULL = lines(
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
const FULL_SET = {
  species: 'incineroar',
  item: 'sitrusberry',
  ability: 'intimidate',
  points: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
  nature: 'Jolly',
  moves: ['fakeout', 'flareblitz', 'partingshot', 'throatchop'],
};

describe('parsePaste', () => {
  it('reads a full block into the exact set, with no problems and no notes', () => {
    expect(one(FULL)).toEqual({ set: FULL_SET, problems: [], notes: [] });
  });

  it('does not care what order the body lines come in', () => {
    const shuffled = lines(
      'Incineroar @ Sitrus Berry',
      '- Fake Out',
      '- Flare Blitz',
      '- Parting Shot',
      '- Throat Chop',
      'Jolly Nature',
      'EVs: 2 HP / 32 Atk / 32 Spe',
      'Ability: Intimidate',
    );
    expect(one(shuffled)).toEqual({ set: FULL_SET, problems: [], notes: [] });
  });

  it('reads labels and natures without regard to case', () => {
    const text = lines(
      'incineroar @ sitrus berry',
      'ability: intimidate',
      'evs: 2 hp / 32 ATK',
      'jolly nature',
      '- fake out',
    );
    expect(one(text)).toEqual({
      set: {
        species: 'incineroar',
        item: 'sitrusberry',
        ability: 'intimidate',
        points: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 0 },
        nature: 'Jolly',
        moves: ['fakeout'],
      },
      problems: [],
      notes: [],
    });
  });

  it('lets a later ability, EVs or nature line override an earlier one', () => {
    const parsed = one(lines('Incineroar', 'Ability: Blaze', 'Ability: Intimidate', 'Jolly Nature', 'Timid Nature'));
    expect(parsed.set).toEqual({ species: 'incineroar', ability: 'intimidate', nature: 'Timid' });
    expect(parsed.problems).toEqual([]);
  });

  it('reads an EVs line that names only some stats, with the others at 0', () => {
    expect(one('Incineroar\nEVs: 32 Atk').set?.points).toEqual({ hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 0 });
    expect(one('Incineroar\nEVs: 4 SpA / 4 SpD').set?.points).toEqual({ hp: 0, atk: 0, def: 0, spa: 4, spd: 4, spe: 0 });
  });

  it('reads a species-only block, and a block with an empty "@"', () => {
    expect(one('Incineroar')).toEqual({ set: { species: 'incineroar' }, problems: [], notes: [] });
    expect(one('Incineroar @')).toEqual({ set: { species: 'incineroar' }, problems: [], notes: [] });
  });

  describe('first line and ignored lines', () => {
    it('reads a messy block: nickname, gender, Level 100, Shiny, Tera, IVs, CRLF and trailing spaces', () => {
      const messy = [
        'Kitty (Incineroar) (F) @ Sitrus Berry  ',
        'Ability: Intimidate  ',
        'Level: 100',
        'Shiny: Yes',
        'Tera Type: Fire',
        'EVs: 2 HP / 32 Atk / 32 Spe',
        'Jolly Nature',
        'IVs: 0 Atk',
        '- Fake Out',
        '- Flare Blitz  ',
      ].join('\r\n');
      expect(one(messy)).toEqual({
        set: {
          species: 'incineroar',
          item: 'sitrusberry',
          ability: 'intimidate',
          points: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
          nature: 'Jolly',
          moves: ['fakeout', 'flareblitz'],
        },
        problems: [],
        notes: [
          'nickname "Kitty"',
          'gender F',
          'Level 100 ignored (Champions battles are level 50)',
          'Shiny: Yes',
          'Tera Type: Fire',
          'IVs: 0 Atk',
        ],
      });
    });

    it('reads a gender on its own, and says nothing about Level: 50', () => {
      expect(one('Incineroar (M)\nLevel: 50')).toEqual({
        set: { species: 'incineroar' },
        problems: [],
        notes: ['gender M'],
      });
    });

    it('notes every ignorable line and every line it does not recognize, in reading order', () => {
      const parsed = one(
        lines(
          'Incineroar',
          'Some random text',
          'Happiness: 255',
          'Hidden Power: Fire',
          'Pokeball: Ultra Ball',
          'Dynamax Level: 10',
          'Gigantamax: Yes',
          'Gender: F',
          'Mystery: thing',
          '-',
        ),
      );
      expect(parsed.set).toEqual({ species: 'incineroar' });
      expect(parsed.problems).toEqual([]);
      expect(parsed.notes).toEqual([
        'unrecognized line: Some random text',
        'Happiness: 255',
        'Hidden Power: Fire',
        'Pokeball: Ultra Ball',
        'Dynamax Level: 10',
        'Gigantamax: Yes',
        'Gender: F',
        'unrecognized line: Mystery: thing',
        'empty move line skipped',
      ]);
    });
  });

  describe('blocks', () => {
    it('returns nothing for empty text, blank text and non-string input', () => {
      expect(parse('')).toEqual([]);
      expect(parse('  \n\r\n \n')).toEqual([]);
      expect(parsePaste(5 as unknown as string, snapshot)).toEqual([]);
      expect(parsePaste(null as unknown as string, snapshot)).toEqual([]);
      expect(parsePaste(undefined as unknown as string, snapshot)).toEqual([]);
    });

    it('keeps blocks in paste order', () => {
      // The reverse of the fixture's own order, so an implementation that sorts or re-orders fails.
      const result = parse(lines('Garchomp', '', 'Kingambit', '', 'Incineroar'));
      expect(result.map((entry) => entry.set?.species)).toEqual(['garchomp', 'kingambit', 'incineroar']);
    });

    it('splits on === header lines as well as blank lines, and copes with CRLF', () => {
      const text = [
        '=== [fmt] Folder/Team ===',
        '',
        'Incineroar @ Sitrus Berry',
        '- Fake Out',
        '',
        '=== [fmt] Other ===',
        'Kingambit',
        '',
      ].join('\r\n');
      const result = parse(text);
      expect(result).toHaveLength(2);
      expect(result[0].set).toEqual({ species: 'incineroar', item: 'sitrusberry', moves: ['fakeout'] });
      expect(result[1].set).toEqual({ species: 'kingambit' });
    });

    it('numbers problem paths by block', () => {
      const result = parse(lines('Incineroar', '', 'Ghost', '', 'Kingambit', '- Fake Out'));
      expect(result.map(paths)).toEqual([[], ['paste[1].species'], ['paste[2].moves[0]']]);
    });

    it('returns a null set with a "no species found" problem when there is nothing to read as a species', () => {
      expect(one('@ Sitrus Berry')).toEqual({
        set: null,
        problems: [{ path: 'paste[0]', message: 'no species found' }],
        notes: [],
      });
      expect(one('???').set).toBeNull();
    });
  });

  describe('Mega rewrite', () => {
    it('turns a base species holding its stone into the Mega form and says so', () => {
      expect(one('Staraptor @ Staraptite')).toEqual({
        set: { species: 'staraptormega', item: 'staraptite' },
        problems: [],
        notes: ['read "Staraptor" holding Staraptite as Staraptor-Mega'],
      });
      expect(one('Charizard @ Charizardite X')).toEqual({
        set: { species: 'charizardmegax', item: 'charizarditex' },
        problems: [],
        notes: ['read "Charizard" holding Charizardite X as Charizard-Mega-X'],
      });
    });

    it('matches on the base species, so Floette-Eternal holding Floettite becomes Floette-Mega', () => {
      // In the real data floetteeternal.baseSpecies is 'Floette'; the shared fixture says 'Floette-Eternal'.
      const real = setSnapshot();
      real.species.floetteeternal = { ...real.species.floetteeternal, baseSpecies: 'Floette', forme: 'Eternal' };
      expect(one('Floette-Eternal @ Floettite', real)).toEqual({
        set: { species: 'floettemega', item: 'floettite' },
        problems: [],
        notes: ['read "Floette-Eternal" holding Floettite as Floette-Mega'],
      });
      // With the fixture as it is the base species differs, so there is no rewrite (proves the comparison is on baseSpecies).
      expect(one('Floette-Eternal @ Floettite').set).toEqual({ species: 'floetteeternal', item: 'floettite' });
    });

    it('does not rewrite a species that is already a Mega form', () => {
      expect(one('Staraptor-Mega @ Staraptite')).toEqual({
        set: { species: 'staraptormega', item: 'staraptite' },
        problems: [],
        notes: [],
      });
    });

    it('does not rewrite when the stone belongs to a different Pokémon, and reports the stone as illegal for it', () => {
      const parsed = one('Incineroar @ Staraptite');
      expect(parsed.set).toEqual({ species: 'incineroar', item: 'staraptite' });
      expect(parsed.problems).toEqual([
        { path: 'paste[0].item', message: '"Staraptite" can only be held by Staraptor' },
      ]);
      expect(parsed.notes).toEqual([]);
      expect(one('Staraptor @ Charizardite X').set).toEqual({ species: 'staraptor', item: 'charizarditex' });
    });

    it('does not rewrite an unknown species', () => {
      expect(one('Ghost @ Staraptite')).toEqual({
        set: { species: 'ghost', item: 'staraptite' },
        problems: [{ path: 'paste[0].species', message: '"ghost" is not legal in fmt' }],
        notes: [],
      });
    });

    it('does not rewrite when two forms want the same stone, and the base set stays legal', () => {
      const twoForms = setSnapshot();
      twoForms.species.staraptormegab = speciesEntry('staraptormegab', 'Staraptor-Mega-B', {
        num: 398,
        abilities: ['Intimidate'],
        baseSpecies: 'Staraptor',
        forme: 'Mega-B',
        requiredItem: 'Staraptite',
      });
      expect(one('Staraptor @ Staraptite', twoForms)).toEqual({
        set: { species: 'staraptor', item: 'staraptite' },
        problems: [],
        notes: [],
      });
    });

    it('does not fill in a missing stone: a Mega form with no item is imported as written and flagged', () => {
      expect(one('Staraptor-Mega')).toEqual({
        set: { species: 'staraptormega' },
        problems: [{ path: 'paste[0].item', message: 'Staraptor-Mega must hold Staraptite' }],
        notes: [],
      });
    });
  });

  describe('problems', () => {
    it('reports an EVs line it cannot read, and gives the set no points', () => {
      for (const value of ['lots', '5 Foo', '2 HP / 3 HP', '2 HP / / 3 Atk']) {
        const parsed = one(`Incineroar\nEVs: ${value}`);
        expect(parsed.problems, value).toEqual([
          { path: 'paste[0].points', message: `could not read EVs "${value}"` },
        ]);
        expect(parsed.set, value).toEqual({ species: 'incineroar' });
      }
    });

    it('reports an unknown nature and leaves the nature out', () => {
      const parsed = one('Incineroar\nFoo Nature');
      expect(parsed.problems).toEqual([{ path: 'paste[0].nature', message: 'unknown nature "Foo"' }]);
      expect(parsed.set).toEqual({ species: 'incineroar' });
    });

    it('reports five moves, and a repeated move, through the existing structural check', () => {
      const five = one(lines('Incineroar', '- Fake Out', '- Flare Blitz', '- Parting Shot', '- Throat Chop', '- Earthquake'));
      expect(five.problems).toEqual([{ path: 'paste[0].moves', message: 'at most 4 moves (found 5)' }]);
      const repeated = one(lines('Incineroar', '- Fake Out', '- Fake Out'));
      expect(repeated.problems).toEqual([{ path: 'paste[0].moves[1]', message: 'duplicate move "fakeout"' }]);
    });

    it('keeps an unknown species and reports it', () => {
      expect(one('Ghost')).toEqual({
        set: { species: 'ghost' },
        problems: [{ path: 'paste[0].species', message: '"ghost" is not legal in fmt' }],
        notes: [],
      });
    });

    it('reports illegal ability, move and item together, in rule order, and keeps the set as written', () => {
      const parsed = one(lines('Incineroar @ Assault Vest', 'Ability: Levitate', '- Close Combat'));
      expect(parsed.set).toEqual({
        species: 'incineroar',
        item: 'assaultvest',
        ability: 'levitate',
        moves: ['closecombat'],
      });
      expect(paths(parsed)).toEqual(['paste[0].ability', 'paste[0].moves[0]', 'paste[0].item']);
    });

    it('reports over-limit points alone (structural problems come first and stop the legality check)', () => {
      const parsed = one(lines('Incineroar', 'EVs: 252 HP / 252 Atk / 4 Spe', '- Close Combat'));
      expect(parsed.problems).toEqual([
        { path: 'paste[0].points.hp', message: 'hp must be a whole number from 0 to 32 (found 252)' },
        { path: 'paste[0].points.atk', message: 'atk must be a whole number from 0 to 32 (found 252)' },
      ]);
    });

    it('lists parse problems before legality problems', () => {
      const parsed = one(lines('Incineroar', 'Foo Nature', '- Close Combat'));
      expect(paths(parsed)).toEqual(['paste[0].nature', 'paste[0].moves[0]']);
    });
  });

  describe('robustness', () => {
    it('reads a long run of interior whitespace in linear time', () => {
      const line = 'x' + ' '.repeat(40000) + 'x';
      const start = performance.now();
      const parsed = parse(lines('Incineroar', line));
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(500);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].notes).toEqual(['unrecognized line: ' + line]);
    });

    it('still notes an ignored label written with two spaces', () => {
      const parsed = one('Incineroar\nTera  Type: Fire');
      expect(parsed.notes).toEqual(['Tera  Type: Fire']);
      expect(parsed.problems).toEqual([]);
    });

    it('notes an Ability line with no readable value instead of dropping it silently', () => {
      const parsed = one('Incineroar\nAbility:');
      expect(parsed.notes).toEqual(['empty Ability line skipped']);
      expect(parsed.set).toEqual({ species: 'incineroar' });
    });

    it('words the Level note by what the line holds', () => {
      expect(one('Incineroar\nLevel:').notes).toEqual(['empty Level line skipped']);
      expect(one('Incineroar\nLevel: 050').notes).toEqual([]);
      expect(one('Incineroar\nLevel: 100').notes).toEqual(['Level 100 ignored (Champions battles are level 50)']);
    });

    it('splits blocks on a lone carriage return', () => {
      expect(parse('Incineroar\r\rKingambit').map((p) => p.set?.species)).toEqual(['incineroar', 'kingambit']);
    });
  });

  it('does not modify the snapshot and keeps no state between calls', () => {
    const before = JSON.stringify(snapshot);
    const first = parse(lines(FULL, '', 'Staraptor @ Staraptite'));
    const second = parse(lines(FULL, '', 'Staraptor @ Staraptite'));
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(second).toEqual(first);
  });
});

describe('pasteToTeam', () => {
  it('lists members in paste order and keeps the first block for a repeated species', () => {
    // Paste order is the reverse of alphabetical, and the repeated Kingambit has a move the first one lacks.
    const parsed = parse(lines('Kingambit', '', 'Incineroar', '', 'Kingambit', '- Sucker Punch'));
    const result = pasteToTeam(parsed, 'Mine');
    expect(result.team).toEqual({ name: 'Mine', members: ['kingambit', 'incineroar'] });
    expect(result.sets).toEqual({ kingambit: { species: 'kingambit' }, incineroar: { species: 'incineroar' } });
    expect(result.problems).toEqual([
      { path: 'paste[2]', message: '"kingambit" already appears in block 1 of this paste; this one is ignored' },
    ]);
  });

  it('skips a block with no species but reports it', () => {
    const result = pasteToTeam(parse(lines('@ Sitrus Berry', '', 'Incineroar')), 'T');
    expect(result.team.members).toEqual(['incineroar']);
    expect(Object.keys(result.sets)).toEqual(['incineroar']);
    expect(result.problems).toEqual([{ path: 'paste[0]', message: 'no species found' }]);
  });

  it('has no size limit: a paste of seven gives seven members', () => {
    const names = ['Incineroar', 'Staraptor', 'Charizard', 'Kingambit', 'Garchomp', 'Sinistcha', 'Floette-Eternal'];
    const result = pasteToTeam(parse(names.join('\n\n')), 'Roster');
    expect(result.team.members).toEqual([
      'incineroar', 'staraptor', 'charizard', 'kingambit', 'garchomp', 'sinistcha', 'floetteeternal',
    ]);
    expect(result.problems).toEqual([]);
  });

  it('flattens every set problem in block order, with repeated-species problems after them', () => {
    const parsed = parse(lines('Ghost', '', 'Incineroar', '- Close Combat', '', 'Ghost'));
    const result = pasteToTeam(parsed, 'T');
    expect(result.team.members).toEqual(['ghost', 'incineroar']);
    expect(result.problems.map((p) => p.path)).toEqual([
      'paste[0].species',
      'paste[1].moves[0]',
      'paste[2].species',
      'paste[2]',
    ]);
  });

  it('puts every repeated-species problem after all block problems, even a later block\'s own', () => {
    // Block 1 repeats Incineroar; block 2 (Ghost) has its own species problem. The repeat is reported last.
    const result = pasteToTeam(parse(lines('Incineroar', '', 'Incineroar', '', 'Ghost')), 'T');
    expect(result.problems.map((p) => p.path)).toEqual(['paste[2].species', 'paste[1]']);
  });

  it('returns an empty team for an empty paste', () => {
    expect(pasteToTeam([], 'Empty')).toEqual({ team: { name: 'Empty', members: [] }, sets: {}, problems: [] });
  });

  it('gives an empty team for something that is not a list', () => {
    expect(pasteToTeam(null as unknown as ParsedSet[], 'x')).toEqual({
      team: { name: 'x', members: [] },
      sets: {},
      problems: [],
    });
  });

  it('skips list entries that are not parsed sets', () => {
    const messy = [null, 5, { set: null, problems: [], notes: [] }, ...parse('Incineroar')] as unknown as ParsedSet[];
    const result = pasteToTeam(messy, 'x');
    expect(result.team.members).toEqual(['incineroar']);
    expect(result.problems).toEqual([]);
  });
});
