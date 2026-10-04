import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Snapshot, SnapshotMeta } from '../domain/types';
import type { BrowserActions } from './browser';
import type { AppData } from './data/snapshot';
import type { DraftStorage } from './state/storage';

let cached: AppData | null = null;

/**
 * The committed Reg M-B snapshot and meta, read once per test file. Read relative to the working directory (Vitest runs
 * from the repo root): under jsdom `import.meta.url` is a server path, not a file URL.
 */
export function realData(): AppData {
  if (cached === null) {
    const read = (name: string) => JSON.parse(readFileSync(join(process.cwd(), 'data', 'gen9championsvgc2026regmb', name), 'utf8'));
    cached = { snapshot: read('snapshot.json') as Snapshot, meta: read('meta.json') as SnapshotMeta };
  }
  return cached;
}

/** An in-memory Storage; `failRead` / `failWrite` make the matching calls throw like a blocked or full browser store. */
export function fakeStorage(initial: Record<string, string> = {}, options: { failRead?: boolean; failWrite?: boolean } = {}) {
  const data = new Map(Object.entries(initial));
  const storage: DraftStorage = {
    getItem: (key) => {
      if (options.failRead) throw new Error('blocked');
      return data.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (options.failWrite) throw new Error('QuotaExceededError');
      data.set(key, value);
    },
    removeItem: (key) => {
      if (options.failWrite) throw new Error('blocked');
      data.delete(key);
    },
  };
  return { storage, data };
}

/**
 * Browser actions that record downloads, confirm questions and copies. Confirms answer from `answers` in order
 * (default yes); with `copyFails` every copy reports failure.
 */
export function fakeActions(answers: boolean[] = [], options: { copyFails?: boolean } = {}) {
  const downloads: Array<{ filename: string; text: string }> = [];
  const questions: string[] = [];
  const copies: string[] = [];
  const actions: BrowserActions = {
    download: (filename, text) => {
      downloads.push({ filename, text });
    },
    confirm: (message) => {
      questions.push(message);
      return answers.length > 0 ? (answers.shift() as boolean) : true;
    },
    copy: async (text) => {
      if (options.copyFails) return false;
      copies.push(text);
      return true;
    },
  };
  return { actions, downloads, questions, copies };
}
