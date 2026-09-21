import { describe, expect, it } from 'vitest';
import { parseDraftFile, serializeDraftFile, type DraftFile } from './file';
import { leagueOf, snapshotOf } from './test-support';

const snapshot = snapshotOf(); // a..h; 'e' is banned and 'h' unpriced in leagueOf()
const goodFile = (): DraftFile => ({ schemaVersion: 1, league: leagueOf(), picks: ['a', 'b', 'c'] });

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
    expect(text).toContain('\n  "schemaVersion": 1');
  });
});

describe('parseDraftFile', () => {
  it('round-trips a saved file exactly', () => {
    const result = parseDraftFile(serializeDraftFile(goodFile()), snapshot);
    expect(result).toEqual({ ok: true, file: goodFile(), warnings: [] });
  });

  it('accepts a file with no picks yet', () => {
    const result = parseDraftFile(serializeDraftFile({ ...goodFile(), picks: [] }), snapshot);
    expect(result.ok).toBe(true);
  });

  it('drops unknown top-level keys', () => {
    const result = parseEdited((file) => {
      file.extra = 'ignored';
    });
    expect(result.ok && 'extra' in result.file).toBe(false);
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

    it('refuses a different schemaVersion, naming the version found', () => {
      const result = parseEdited((file) => {
        file.schemaVersion = 2;
      });
      expect(errorsOf(result).map((e) => e.path)).toEqual(['schemaVersion']);
      expect(errorsOf(result)[0].message).toContain('2');
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
  });
});
