import type { ID } from '../domain/id';
import { moveEntry } from '../domain/test-support';
import type { MoveEntry, UsageData, UsageEntry } from '../domain/types';

/** A usage entry with harmless defaults; override any field. */
export function usageEntry(id: ID, overrides: Partial<UsageEntry> = {}): UsageEntry {
  return { id, weight: 100, usage: 0.1, abilities: [], items: [], moves: [], spreads: [], teammates: [], ...overrides };
}

export function usageData(entries: UsageEntry[]): UsageData {
  return {
    teams: 1000,
    cutoff: 1630,
    battles: 1000,
    species: Object.fromEntries(entries.map((entry) => [entry.id, entry])),
  };
}

/** A move with a chosen type, category and base power. */
export function typedMove(id: string, type: string, category: MoveEntry['category'], basePower: number): MoveEntry {
  return { ...moveEntry(id, id), type, category, basePower };
}
