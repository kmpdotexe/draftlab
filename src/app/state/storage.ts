import { parseDraftFile, serializeDraftFile, type DraftFile } from '../../domain/file';
import type { LegalSpeciesSource } from '../../domain/league';
import type { Problem } from '../../domain/problem';

/** The browser storage key of the one draft file. */
export const STORAGE_KEY = 'draftlab.draft.v1';

/** The part of `Storage` the app uses. Any of the three may throw (private mode, quota, blocked storage). */
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'ok'; file: DraftFile; warnings: Problem[] }
  | { kind: 'corrupt'; raw: string; errors: Problem[] }
  | { kind: 'unavailable' };

/** Reads the stored draft file. Never throws. */
export function loadDraft(storage: DraftStorage, snapshot: LegalSpeciesSource): LoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { kind: 'unavailable' };
  }
  if (raw === null) return { kind: 'empty' };
  const parsed = parseDraftFile(raw, snapshot);
  return parsed.ok ? { kind: 'ok', file: parsed.file, warnings: parsed.warnings } : { kind: 'corrupt', raw, errors: parsed.errors };
}

/** Writes the draft file (or removes it for null). True when it was saved; false when the storage refused. */
export function saveDraft(storage: DraftStorage, file: DraftFile | null): boolean {
  try {
    if (file === null) storage.removeItem(STORAGE_KEY);
    else storage.setItem(STORAGE_KEY, serializeDraftFile(file));
    return true;
  } catch {
    return false;
  }
}

/** The browser's localStorage, or a storage whose every call throws when the browser refuses access to it. */
export function browserStorage(): DraftStorage {
  try {
    const storage = window.localStorage;
    if (storage) return storage;
  } catch {
    // Accessing localStorage itself can throw (blocked cookies, some private modes).
  }
  const refuse = (): never => {
    throw new Error('storage unavailable');
  };
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
}
