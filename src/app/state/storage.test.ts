import { describe, expect, it } from 'vitest';
import { serializeDraftFile, type DraftFile } from '../../domain/file';
import { leagueOf, snapshotOf } from '../../domain/test-support';
import { fakeStorage } from '../test-support';
import { STORAGE_KEY, loadDraft, saveDraft } from './storage';

const snapshot = snapshotOf();
const file: DraftFile = { schemaVersion: 2, league: leagueOf(), picks: ['a', 'b'], sets: {}, teams: [] };

describe('loadDraft', () => {
  it('is empty when nothing is stored', () => {
    expect(loadDraft(fakeStorage().storage, snapshot)).toEqual({ kind: 'empty' });
  });

  it('reads a good file with its warnings', () => {
    const stored = serializeDraftFile({ ...file, league: leagueOf({ extraBans: ['e', 'zz'] }) });
    const result = loadDraft(fakeStorage({ [STORAGE_KEY]: stored }).storage, snapshot);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.file.picks).toEqual(['a', 'b']);
    expect(result.warnings.map((w) => w.path)).toEqual(['league.extraBans[1]']);
  });

  it('reports corrupt text, keeping the raw text for download', () => {
    for (const raw of ['{not json', JSON.stringify({ schemaVersion: 9 }), serializeDraftFile({ ...file, picks: ['a', 'a'] })]) {
      const result = loadDraft(fakeStorage({ [STORAGE_KEY]: raw }).storage, snapshot);
      expect(result.kind, raw).toBe('corrupt');
      if (result.kind !== 'corrupt') continue;
      expect(result.raw).toBe(raw);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('is unavailable when reading throws', () => {
    expect(loadDraft(fakeStorage({}, { failRead: true }).storage, snapshot)).toEqual({ kind: 'unavailable' });
  });
});

describe('saveDraft', () => {
  it('saves the serialized file and round-trips through loadDraft', () => {
    const { storage, data } = fakeStorage();
    expect(saveDraft(storage, file)).toBe(true);
    expect(data.get(STORAGE_KEY)).toBe(serializeDraftFile(file));
    const loaded = loadDraft(storage, snapshot);
    expect(loaded).toEqual({ kind: 'ok', file, warnings: [] });
  });

  it('removes the file for null', () => {
    const { storage, data } = fakeStorage({ [STORAGE_KEY]: 'x' });
    expect(saveDraft(storage, null)).toBe(true);
    expect(data.has(STORAGE_KEY)).toBe(false);
  });

  it('returns false instead of throwing when the storage refuses', () => {
    const { storage } = fakeStorage({}, { failWrite: true });
    expect(saveDraft(storage, file)).toBe(false);
    expect(saveDraft(storage, null)).toBe(false);
  });
});
