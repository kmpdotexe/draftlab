import type { ID } from '../domain/id';
import { moveEntry, speciesEntry } from '../domain/test-support';
import type { MoveEntry, UsageData, UsageEntry } from '../domain/types';
import type { EngineSnapshot } from './types';

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

/** One species of a `roleSnapshot`. */
export interface RoleSpecies {
  /** Ability names; default `['Pressure']`. */
  abilities?: string[];
  /** Give the species a usage entry with these rows (and usage 0.1); omit for a species with no usage entry. */
  usage?: { moves?: Array<[ID, number]>; abilities?: Array<[ID, number]> };
  /** Move ids the species can learn; default none. */
  learnset?: ID[];
}

/** A small snapshot for role and ability tests. `withUsage: false` makes `usage` null. */
export function roleSnapshot(species: Record<ID, RoleSpecies>, withUsage = true): EngineSnapshot & { learnsets: Record<ID, ID[]> } {
  const ids = Object.keys(species);
  return {
    species: Object.fromEntries(ids.map((id) => [id, speciesEntry(id, id, { abilities: species[id].abilities ?? ['Pressure'] })])),
    moves: {},
    usage: withUsage
      ? usageData(ids.flatMap((id) => (species[id].usage ? [usageEntry(id, { moves: [], abilities: [], ...species[id].usage })] : [])))
      : null,
    learnsets: Object.fromEntries(ids.map((id) => [id, species[id].learnset ?? []])),
  };
}

/** A move with a chosen type, category and base power. */
export function typedMove(id: string, type: string, category: MoveEntry['category'], basePower: number): MoveEntry {
  return { ...moveEntry(id, id), type, category, basePower };
}
