import type { Snapshot, SnapshotMeta } from '../../domain/types';

/** The data the app runs on: the one shipped format's snapshot and its metadata. */
export interface AppData {
  snapshot: Snapshot;
  meta: SnapshotMeta;
}

/** Loads the snapshot and its metadata as separate chunks, so the app shell renders before the 1.3 MB of data arrives. */
export async function loadAppData(): Promise<AppData> {
  const [snapshot, meta] = await Promise.all([
    import('../../../data/gen9championsvgc2026regmb/snapshot.json'),
    import('../../../data/gen9championsvgc2026regmb/meta.json'),
  ]);
  return { snapshot: snapshot.default as unknown as Snapshot, meta: meta.default as unknown as SnapshotMeta };
}
