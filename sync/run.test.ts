import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FormatConfig } from './formats.config';
import { runSync, type SyncDeps } from './run';
import type { RawChaos, RawChaosMon } from './smogon/chaos';
import type { ChaosSource } from './smogon/fetch';
import type { ShowdownFormatData } from './showdown/source';
import type { MoveEntry, SpeciesEntry } from '../src/domain/types';

const config: FormatConfig = { id: 'fmt', label: 'Fmt', statsFormatIds: ['a', 'b'], cutoff: 1630 };
const limits = { minSpecies: 2, minMoves: 1, minItems: 1 };

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
  return { id, name, type: 'Normal', category: 'Physical', basePower: 40, accuracy: 100, priority: 0, target: 'normal', flags: [] };
}

function showdownData(learnsetMove = 'fakeout'): ShowdownFormatData {
  return {
    formatName: '[Gen 9 Champions] Fmt',
    mod: 'champions',
    packageVersion: '0.0.0-test',
    rules: { ruleset: ['Flat Rules'], adjustLevel: 50, minTeamSize: 6, pickedTeamSize: null },
    species: { incineroar: species('incineroar', 'Incineroar'), kingambit: species('kingambit', 'Kingambit') },
    moves: { fakeout: move('fakeout', 'Fake Out') },
    learnsets: { incineroar: [learnsetMove], kingambit: [] },
    items: { sitrusberry: { id: 'sitrusberry', name: 'Sitrus Berry' } },
    warnings: [],
  };
}

function mon(overrides: Partial<RawChaosMon> = {}): RawChaosMon {
  return { usage: 0.1, Abilities: { a: 100 }, Items: {}, Moves: {}, Spreads: {}, Teammates: {}, ...overrides };
}

function source(statsFormatId: string): ChaosSource {
  const raw: RawChaos = {
    info: { metagame: statsFormatId, cutoff: 1630, 'number of battles': 10 },
    data: { Kingambit: mon({ usage: 0.4 }), Incineroar: mon({ usage: 0.3 }) },
  };
  return { statsFormatId, cutoff: 1630, month: '2026-08', url: 'https://example.test/x', text: JSON.stringify(raw) };
}

describe('runSync', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function makeDeps(overrides: Partial<SyncDeps> = {}): SyncDeps {
    const dataDir = mkdtempSync(join(tmpdir(), 'draft-lab-run-'));
    dirs.push(dataDir);
    return {
      loadShowdown: () => showdownData(),
      fetchChaos: async (statsFormatId) => source(statsFormatId),
      now: () => new Date('2026-09-20T12:00:00.000Z'),
      dataDir,
      limits,
      ...overrides,
    };
  }

  it('falls back to the next stats id when the first has no published data', async () => {
    const deps = makeDeps({ fetchChaos: async (id) => (id === 'a' ? null : source(id)) });

    const { dir, warnings } = await runSync(config, deps);

    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
    expect(meta.usage).toMatchObject({ statsFormatId: 'b', isFallback: true });
    expect(warnings.some((w) => w.includes('Usage comes from b'))).toBe(true);
  });

  it('writes a snapshot without usage when no stats id has data', async () => {
    const deps = makeDeps({ fetchChaos: async () => null });

    const { dir } = await runSync(config, deps);

    const snapshot = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
    expect(snapshot.usage).toBeNull();
  });

  it('leaves the previous snapshot untouched when validation fails', async () => {
    const deps = makeDeps({ loadShowdown: () => showdownData('ghostmove') });
    const dir = join(deps.dataDir, 'fmt');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'snapshot.json'), 'LAST-GOOD');

    await expect(runSync(config, deps)).rejects.toThrow(/unknown move "ghostmove"/);

    expect(readFileSync(join(dir, 'snapshot.json'), 'utf8')).toBe('LAST-GOOD');
  });

  it('leaves the previous snapshot untouched when a fetch throws', async () => {
    const deps = makeDeps({
      fetchChaos: async () => {
        throw new Error('Smogon stats: HTTP 500');
      },
    });
    const dir = join(deps.dataDir, 'fmt');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'snapshot.json'), 'LAST-GOOD');

    await expect(runSync(config, deps)).rejects.toThrow(/HTTP 500/);

    expect(readFileSync(join(dir, 'snapshot.json'), 'utf8')).toBe('LAST-GOOD');
  });

  it('leaves the previous snapshot untouched when the item table is empty', async () => {
    const deps = makeDeps({ loadShowdown: () => ({ ...showdownData(), items: {} }) });
    const dir = join(deps.dataDir, 'fmt');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'snapshot.json'), 'LAST-GOOD');

    await expect(runSync(config, deps)).rejects.toThrow(/only 0 items/);

    expect(readFileSync(join(dir, 'snapshot.json'), 'utf8')).toBe('LAST-GOOD');
  });
});
