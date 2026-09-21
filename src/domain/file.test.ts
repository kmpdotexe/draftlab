import { describe, expect, it } from 'vitest';
import { parseDraftFile, serializeDraftFile, type DraftFile } from './file';
import { leagueOf, snapshotOf } from './test-support';

const snapshot = snapshotOf(); // a..h; 'e' is banned and 'h' unpriced in leagueOf()
// Picks a, b, c go to Ana, Ben, Cy (snake, 3 drafters); the user is Ben (me = 1), whose roster is ['b'].
const goodFile = (): DraftFile => ({
  schemaVersion: 2,
  league: leagueOf(),
  picks: ['a', 'b', 'c'],
  sets: { b: { species: 'b', moves: ['m1'] } },
  teams: [{ name: 'Team 1', members: ['b'] }],
});

/** Parse a file object after editing it into a bad shape. */
const parseEdited = (edit: (file: Record<string, unknown>) => void) => {
  const file = JSON.parse(serializeDraftFile(goodFile())) as Record<string, unknown>;
  edit(file);
  return parseDraftFile(JSON.stringify(file), snapshot);
};
const errorsOf = (result: ReturnType<typeof parseDraftFile>) => (result.ok ? [] : result.errors);

describe('serializeDraftFile', () => {
  it('writes two-space-indented JSON with a trailing newline', () => {
    const text = serializeDraftFile(goodFile());
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "schemaVersion": 2');
  });
});

describe('parseDraftFile', () => {
  it('round-trips a saved version 2 file exactly, sets and teams included', () => {
    const result = parseDraftFile(serializeDraftFile(goodFile()), snapshot);
    expect(result).toEqual({ ok: true, file: goodFile(), warnings: [] });
  });

  it('accepts a file with no picks, sets or teams yet', () => {
    const result = parseDraftFile(serializeDraftFile({ ...goodFile(), picks: [], sets: {}, teams: [] }), snapshot);
    expect(result.ok).toBe(true);
  });

  it('drops unknown top-level keys', () => {
    const result = parseEdited((file) => {
      file.extra = 'ignored';
    });
    expect(result.ok).toBe(true);
    expect(result.ok && 'extra' in result.file).toBe(false);
  });

  describe('version 1 files', () => {
    const v1 = (extra: Record<string, unknown> = {}) =>
      JSON.stringify({ schemaVersion: 1, league: leagueOf(), picks: ['a', 'b', 'c'], ...extra });

    it('opens and migrates to version 2 with empty sets and teams', () => {
      const result = parseDraftFile(v1(), snapshot);
      expect(result).toEqual({
        ok: true,
        file: { schemaVersion: 2, league: leagueOf(), picks: ['a', 'b', 'c'], sets: {}, teams: [] },
        warnings: [],
      });
    });

    it('ignores sets and teams that a version 1 file happens to contain', () => {
      const result = parseDraftFile(v1({ sets: { b: { species: 'zzz' } }, teams: [5] }), snapshot);
      expect(result.ok).toBe(true);
      expect(result.ok && result.file.sets).toEqual({});
      expect(result.ok && result.file.teams).toEqual([]);
    });
  });

  describe('layer 1: shape', () => {
    it('refuses text that is not JSON', () => {
      const result = parseDraftFile('{ nope', snapshot);
      expect(errorsOf(result)).toHaveLength(1);
      expect(errorsOf(result)[0].path).toBe('file');
      expect(errorsOf(result)[0].message).toContain('not valid JSON');
    });

    it.each(['[]', 'null', '5'])('refuses %s (not an object)', (text) => {
      expect(errorsOf(parseDraftFile(text, snapshot)).map((e) => e.path)).toEqual(['file']);
    });

    it('refuses a schemaVersion other than 1 or 2, naming the version found', () => {
      const result = parseEdited((file) => {
        file.schemaVersion = 3;
      });
      expect(errorsOf(result).map((e) => e.path)).toEqual(['schemaVersion']);
      expect(errorsOf(result)[0].message).toContain('3');
      expect(errorsOf(result)[0].message).toContain('reads 1 and 2');
      expect(errorsOf(parseEdited((file) => delete file.schemaVersion)).map((e) => e.path)).toEqual(['schemaVersion']);
    });

    it('refuses fields of the wrong JSON type', () => {
      const cases: Array<[string, (file: Record<string, unknown>) => void]> = [
        ['league', (f) => { f.league = 'x'; }],
        ['league.name', (f) => { (f.league as Record<string, unknown>).name = 5; }],
        ['league.formatId', (f) => { (f.league as Record<string, unknown>).formatId = null; }],
        ['league.drafters', (f) => { (f.league as Record<string, unknown>).drafters = [1, 2]; }],
        ['league.order', (f) => { (f.league as Record<string, unknown>).order = 3; }],
        ['league.rounds', (f) => { (f.league as Record<string, unknown>).rounds = '2'; }],
        ['league.me', (f) => { (f.league as Record<string, unknown>).me = null; }],
        ['league.budget', (f) => { (f.league as Record<string, unknown>).budget = 'x'; }],
        ['league.prices', (f) => { (f.league as Record<string, unknown>).prices = { a: 'x' }; }],
        ['league.extraBans', (f) => { (f.league as Record<string, unknown>).extraBans = [1]; }],
        ['picks', (f) => { f.picks = 'a,b'; }],
        ['picks', (f) => { f.picks = [1]; }],
        ['sets', (f) => { f.sets = 'x'; }],
        ['sets', (f) => { delete f.sets; }],
        ['sets.b', (f) => { (f.sets as Record<string, unknown>).b = 5; }],
        ['teams', (f) => { f.teams = 'x'; }],
        ['teams', (f) => { delete f.teams; }],
        ['teams[0]', (f) => { f.teams = [5]; }],
        ['teams[0]', (f) => { f.teams = [{ name: 5, members: [] }]; }],
        ['teams[0]', (f) => { f.teams = [{ name: 'x', members: [1] }]; }],
      ];
      for (const [path, edit] of cases) {
        expect(errorsOf(parseEdited(edit)).map((e) => e.path), path).toEqual([path]);
      }
    });
  });

  describe('layer 2: league', () => {
    it('reports every league problem with its path', () => {
      const result = parseEdited((file) => {
        const league = file.league as Record<string, unknown>;
        league.name = '';
        league.budget = 0;
      });
      expect(errorsOf(result).map((e) => e.path)).toEqual(['league.name', 'league.budget']);
    });

    it('stops before replaying picks when the league is invalid', () => {
      const result = parseEdited((file) => {
        (file.league as Record<string, unknown>).budget = 0;
        file.picks = ['zzz'];
      });
      expect(errorsOf(result).map((e) => e.path)).toEqual(['league.budget']);
    });
  });

  describe('layer 3: picks replay', () => {
    it('refuses the whole file at the first bad pick, with the pick number', () => {
      const result = parseEdited((file) => {
        file.picks = ['a', 'a'];
      });
      expect(result.ok).toBe(false);
      expect(errorsOf(result)).toHaveLength(1);
      expect(errorsOf(result)[0].path).toBe('picks[1]');
      expect(errorsOf(result)[0].message.startsWith('pick 2: ')).toBe(true);
      expect(errorsOf(result)[0].message).toContain('already been picked');
      expect('file' in result).toBe(false);
    });

    it('refuses an illegal species', () => {
      const result = parseEdited((file) => {
        file.picks = ['zzz'];
      });
      expect(errorsOf(result)[0].message).toContain('pick 1: ');
      expect(errorsOf(result)[0].message).toContain('not legal');
    });

    it('refuses more picks than the draft has slots', () => {
      const result = parseEdited((file) => {
        file.picks = ['a', 'b', 'c', 'd', 'f', 'g', 'h'];
      });
      expect(errorsOf(result)[0].path).toBe('picks[6]');
      expect(errorsOf(result)[0].message).toContain('already complete');
    });

    it('refuses a pick the drafter cannot afford', () => {
      const result = parseEdited((file) => {
        (file.league as Record<string, unknown>).budget = 25;
        file.picks = ['a'];
      });
      expect(errorsOf(result)[0].message).toContain('costs 30 points but Ana has 25 left');
    });
  });

  describe('layer 4: sets (structure only)', () => {
    it('refuses a structurally invalid set, naming its path', () => {
      const result = parseEdited((file) => {
        file.sets = { b: { species: 'b', moves: ['x', 'x'] } };
      });
      expect(errorsOf(result).map((e) => e.path)).toEqual(['sets.b.moves[1]']);
    });

    it('refuses a set filed under the wrong species', () => {
      const result = parseEdited((file) => {
        file.sets = { b: { species: 'c' } };
      });
      expect(errorsOf(result).map((e) => e.path)).toEqual(['sets.b']);
      expect(errorsOf(result)[0].message).toContain('"c"');
    });

    it('is only reached when the picks replay cleanly', () => {
      const result = parseEdited((file) => {
        file.picks = ['zzz'];
        file.sets = { b: { species: 'c' } };
      });
      expect(errorsOf(result).map((e) => e.path)).toEqual(['picks[0]']);
    });

    it('does not check sets against the snapshot at load, so a regulation change cannot lock the user out', () => {
      const result = parseEdited((file) => {
        file.sets = { b: { species: 'b', moves: ['notarealmove'], item: 'notanitem', ability: 'nope' } };
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('warnings', () => {
    it('warns when the league is for a different format than the loaded data', () => {
      const result = parseEdited((file) => {
        (file.league as Record<string, unknown>).formatId = 'other';
      });
      expect(result.ok).toBe(true);
      expect(result.ok && result.warnings.map((w) => w.path)).toEqual(['league.formatId']);
    });

    it('warns about priced or banned species the snapshot does not have', () => {
      const result = parseEdited((file) => {
        const league = file.league as Record<string, unknown>;
        league.prices = { ...(league.prices as Record<string, number>), ghost: 3 };
        league.extraBans = ['e', 'phantom'];
      });
      expect(result.ok).toBe(true);
      expect(result.ok && result.warnings.map((w) => w.path)).toEqual(['league.prices.ghost', 'league.extraBans[1]']);
    });

    it('warns about a set or a team member that is not on your roster, after the league warnings', () => {
      const result = parseEdited((file) => {
        (file.league as Record<string, unknown>).formatId = 'other';
        file.sets = { a: { species: 'a' } }; // 'a' went to Ana, not to Ben
        file.teams = [{ name: 'T', members: ['c', 'b'] }]; // 'c' went to Cy
      });
      expect(result.ok).toBe(true);
      expect(result.ok && result.warnings.map((w) => w.path)).toEqual([
        'league.formatId',
        'sets.a',
        'teams[0].members[0]',
      ]);
      expect(result.ok && result.warnings[1].message).toContain('not on your roster');
      expect(result.ok && result.warnings[2].message).toContain('not on your roster');
    });
  });
});
