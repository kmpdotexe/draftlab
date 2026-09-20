import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSnapshot, validateSnapshot, writeSnapshot } from './build';
import type { FormatConfig } from './formats.config';
import type { RawChaos, RawChaosMon } from './smogon/chaos';
import type { ChaosSource } from './smogon/fetch';
import type { ShowdownFormatData } from './showdown/source';
import type { MoveEntry, SpeciesEntry } from '../src/domain/types';

const config: FormatConfig = { id: 'fmt', label: 'Fmt', statsFormatIds: ['statsA', 'statsB'], cutoff: 1630 };
const limits = { minSpecies: 2, minMoves: 1 };
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

function showdownData(): ShowdownFormatData {
  return {
    formatName: '[Gen 9 Champions] Fmt',
    mod: 'champions',
    packageVersion: '0.0.0-test',
    rules: { ruleset: ['Flat Rules'], adjustLevel: 50, minTeamSize: 6, pickedTeamSize: null },
    species: { incineroar: species('incineroar', 'Incineroar'), kingambit: species('kingambit', 'Kingambit') },
    moves: { fakeout: move('fakeout', 'Fake Out') },
    learnsets: { incineroar: ['fakeout'], kingambit: [] },
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

  it('refuses to build when there are too few species', () => {
    expect(() =>
      buildSnapshot({ config, showdown: showdownData(), chaos: null, now, limits: { minSpecies: 5, minMoves: 1 } }),
    ).toThrow(/only 2 species/);
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
