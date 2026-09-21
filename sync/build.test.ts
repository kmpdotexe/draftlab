import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSnapshot, validateSnapshot, writeSnapshot } from './build';
import type { FormatConfig } from './formats.config';
import type { RawChaos, RawChaosMon } from './smogon/chaos';
import type { ChaosSource } from './smogon/fetch';
import type { ShowdownFormatData } from './showdown/source';
import type { ItemEntry, MoveEntry, Snapshot, SpeciesEntry, UsageData, UsageEntry } from '../src/domain/types';

const config: FormatConfig = { id: 'fmt', label: 'Fmt', statsFormatIds: ['statsA', 'statsB'], cutoff: 1630 };
const limits = { minSpecies: 2, minMoves: 1, minItems: 1 };
const now = new Date('2026-09-20T12:00:00.000Z');

function species(id: string, name: string): SpeciesEntry {
  return {
    id,
    name,
    num: 1,
    types: ['Normal'],
    baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    abilities: ['Pressure'],
    tags: [],
    baseSpecies: name,
    forme: '',
    requiredItem: null,
  };
}

function move(id: string, name: string): MoveEntry {
  return {
    id,
    name,
    type: 'Normal',
    category: 'Physical',
    basePower: 40,
    accuracy: 100,
    priority: 0,
    target: 'normal',
    flags: ['contact'],
  };
}

function item(id: string, name: string, usableBy?: string[]): ItemEntry {
  return usableBy ? { id, name, usableBy } : { id, name };
}

function showdownData(): ShowdownFormatData {
  return {
    formatName: '[Gen 9 Champions] Fmt',
    mod: 'champions',
    packageVersion: '0.0.0-test',
    rules: { ruleset: ['Flat Rules'], adjustLevel: 50, minTeamSize: 6, pickedTeamSize: null },
    species: { incineroar: species('incineroar', 'Incineroar'), kingambit: species('kingambit', 'Kingambit') },
    moves: { fakeout: move('fakeout', 'Fake Out') },
    learnsets: { incineroar: ['fakeout'], kingambit: [] },
    items: {
      sitrusberry: item('sitrusberry', 'Sitrus Berry'),
      staraptite: item('staraptite', 'Staraptite', ['incineroar']),
    },
    warnings: [],
  };
}

function mon(overrides: Partial<RawChaosMon> = {}): RawChaosMon {
  return { usage: 0.1, Abilities: { a: 100 }, Items: {}, Moves: {}, Spreads: {}, Teammates: {}, ...overrides };
}

function chaosSource(statsFormatId: string): ChaosSource {
  const raw: RawChaos = {
    info: { metagame: statsFormatId, cutoff: 1630, 'number of battles': 1000 },
    data: {
      Kingambit: mon({ usage: 0.4, Abilities: { defiant: 100 }, Teammates: { Incineroar: 50, Mewtwo: 30 } }),
      Incineroar: mon({ usage: 0.3, Abilities: { intimidate: 100 }, Teammates: { Kingambit: 50 } }),
      Mewtwo: mon({ usage: 0.2, Abilities: { pressure: 100 } }),
    },
  };
  return { statsFormatId, cutoff: 1630, month: '2026-08', url: 'https://example.test/x.json.gz', text: JSON.stringify(raw) };
}

describe('buildSnapshot', () => {
  it('keeps usage only for species legal in the format and records a fallback', () => {
    const { snapshot, meta } = buildSnapshot({ config, showdown: showdownData(), chaos: chaosSource('statsB'), now, limits });

    expect(snapshot.formatId).toBe('fmt');
    expect(Object.keys(snapshot.usage?.species ?? {}).sort()).toEqual(['incineroar', 'kingambit']);
    expect(snapshot.usage?.species.kingambit.teammates).toEqual([['incineroar', 50]]);

    expect(meta.generatedAt).toBe('2026-09-20T12:00:00.000Z');
    expect(meta.usage).toMatchObject({ statsFormatId: 'statsB', month: '2026-08', isFallback: true });
    expect(meta.warnings.some((w) => w.includes('Dropped usage for 1 species') && w.includes('mewtwo'))).toBe(true);
    expect(meta.warnings.some((w) => w.includes('statsB') && w.includes('statsA'))).toBe(true);
    expect(meta.showdown).toMatchObject({ packageVersion: '0.0.0-test', mod: 'champions' });
  });

  it('marks the first-choice stats id as not a fallback', () => {
    const { meta } = buildSnapshot({ config, showdown: showdownData(), chaos: chaosSource('statsA'), now, limits });
    expect(meta.usage?.isFallback).toBe(false);
    expect(meta.warnings.some((w) => w.includes('Usage comes from'))).toBe(false);
  });

  it('builds a snapshot without usage when no stats exist, and says so', () => {
    const { snapshot, meta } = buildSnapshot({ config, showdown: showdownData(), chaos: null, now, limits });
    expect(snapshot.usage).toBeNull();
    expect(meta.usage).toBeNull();
    expect(meta.warnings[0]).toContain('No usage data found');
  });

  it('refuses to build when a learnset references an unknown move', () => {
    const showdown = showdownData();
    showdown.learnsets.kingambit = ['ghostmove'];
    expect(() => buildSnapshot({ config, showdown, chaos: null, now, limits })).toThrow(/unknown move "ghostmove"/);
  });

  it('refuses to build when usage exists but none of its species are legal in the format', () => {
    const raw: RawChaos = {
      info: { metagame: 'statsA', cutoff: 1630, 'number of battles': 1000 },
      data: { Mewtwo: mon({ usage: 0.5, Abilities: { pressure: 100 } }), Mew: mon({ usage: 0.4, Abilities: { synchronize: 90 } }) },
    };
    const chaos: ChaosSource = { ...chaosSource('statsA'), text: JSON.stringify(raw) };
    expect(() => buildSnapshot({ config, showdown: showdownData(), chaos, now, limits })).toThrow(
      'Usage from statsA (2026-08) has no species legal in fmt',
    );
  });

  it('refuses to build when there are too few species', () => {
    expect(() =>
      buildSnapshot({ config, showdown: showdownData(), chaos: null, now, limits: { minSpecies: 5, minMoves: 1, minItems: 1 } }),
    ).toThrow(/only 2 species/);
  });

  it('puts the item table in the snapshot and marks both files schemaVersion 2', () => {
    const { snapshot, meta } = buildSnapshot({ config, showdown: showdownData(), chaos: null, now, limits });
    expect(snapshot.schemaVersion).toBe(2);
    expect(meta.schemaVersion).toBe(2);
    expect(Object.keys(snapshot.items).sort()).toEqual(['sitrusberry', 'staraptite']);
    expect(snapshot.items.staraptite).toEqual({ id: 'staraptite', name: 'Staraptite', usableBy: ['incineroar'] });
  });

  it('appends the loader warnings to meta.warnings, after the usage warnings', () => {
    const showdown = { ...showdownData(), warnings: ['Dropped 2 restricted-species entries'] };
    const { meta } = buildSnapshot({ config, showdown, chaos: null, now, limits });
    expect(meta.warnings).toHaveLength(2);
    expect(meta.warnings[0]).toContain('No usage data found');
    expect(meta.warnings[1]).toBe('Dropped 2 restricted-species entries');
  });

  it('refuses to build when there are too few items', () => {
    expect(() =>
      buildSnapshot({ config, showdown: showdownData(), chaos: null, now, limits: { ...limits, minItems: 5 } }),
    ).toThrow(/only 2 items/);
  });

  it('does not refuse a legal species whose required item is missing from the table (the loader warns instead)', () => {
    const showdown = showdownData();
    showdown.species.kingambit = { ...species('kingambit', 'Kingambit'), requiredItem: 'Ghost Stone' };
    expect(() => buildSnapshot({ config, showdown, chaos: null, now, limits })).not.toThrow();
  });
});

describe('validateSnapshot', () => {
  it('caps how many problems it lists', () => {
    const showdown = showdownData();
    showdown.learnsets.kingambit = Array.from({ length: 50 }, (_, i) => `ghost${i}`);
    const { snapshot } = buildSnapshot({ config, showdown: showdownData(), chaos: null, now, limits });
    const broken = { ...snapshot, learnsets: { ...snapshot.learnsets, kingambit: showdown.learnsets.kingambit } };
    expect(() => validateSnapshot(broken, limits)).toThrow(/and 30 more/);
  });

  function validSnapshot(): Snapshot {
    return buildSnapshot({ config, showdown: showdownData(), chaos: chaosSource('statsA'), now, limits }).snapshot;
  }

  function corruptKingambit(snapshot: Snapshot, patch: Partial<UsageEntry>): Snapshot {
    const usage = snapshot.usage as UsageData;
    return { ...snapshot, usage: { ...usage, species: { ...usage.species, kingambit: { ...usage.species.kingambit, ...patch } } } };
  }

  it('accepts a valid snapshot with usage', () => {
    expect(() => validateSnapshot(validSnapshot(), limits)).not.toThrow();
  });

  it('rejects a usage teammate that is not in the species table', () => {
    const broken = corruptKingambit(validSnapshot(), { teammates: [['ghostmon', 12]] });
    expect(() => validateSnapshot(broken, limits)).toThrow(/kingambit.*teammate "ghostmon"/);
  });

  it('rejects a usage weight that is not a finite number above 0', () => {
    for (const weight of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '0100200' as never]) {
      const broken = corruptKingambit(validSnapshot(), { weight });
      expect(() => validateSnapshot(broken, limits), String(weight)).toThrow(/kingambit.*weight/);
    }
  });

  it('rejects a usage share that is not a finite number above 0', () => {
    for (const usage of [0, -0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const broken = corruptKingambit(validSnapshot(), { usage });
      expect(() => validateSnapshot(broken, limits), String(usage)).toThrow(/kingambit.*usage/);
    }
  });

  it('rejects an item whose table key differs from its id', () => {
    const snapshot = validSnapshot();
    const broken = { ...snapshot, items: { ...snapshot.items, wrongkey: item('sitrusberry', 'Sitrus Berry') } };
    expect(() => validateSnapshot(broken, limits)).toThrow(/item table key "wrongkey" does not match its id "sitrusberry"/);
  });

  it('rejects an item restricted to a species that is not legal', () => {
    const snapshot = validSnapshot();
    const broken = {
      ...snapshot,
      items: { ...snapshot.items, staraptite: item('staraptite', 'Staraptite', ['ghostmon']) },
    };
    expect(() => validateSnapshot(broken, limits)).toThrow(/item "staraptite" is restricted to "ghostmon"/);
  });

  it('rejects an item restricted to a species like "constructor" (prototype pollution check)', () => {
    const snapshot = validSnapshot();
    const broken = {
      ...snapshot,
      items: { ...snapshot.items, staraptite: item('staraptite', 'Staraptite', ['constructor']) },
    };
    expect(() => validateSnapshot(broken, limits)).toThrow(/item "staraptite" is restricted to "constructor"/);
  });
});

describe('writeSnapshot', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('writes snapshot.json and meta.json under data/<formatId>/', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'draft-lab-'));
    dirs.push(dataDir);
    const { snapshot, meta } = buildSnapshot({ config, showdown: showdownData(), chaos: null, now, limits });

    const dir = writeSnapshot(dataDir, snapshot, meta);

    expect(dir).toBe(join(dataDir, 'fmt'));
    expect(JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8')).formatId).toBe('fmt');
    expect(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')).label).toBe('Fmt');
  });
});
