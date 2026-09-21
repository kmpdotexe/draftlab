import type { MoveEntry, SpeciesEntry, UsageData, UsageEntry } from '../domain/types';
import type { EngineSnapshot } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Only the fields the engine reads are checked. */
const isSpeciesEntry = (value: unknown): value is SpeciesEntry =>
  isRecord(value) && isFiniteNumber(value.num) && Array.isArray(value.types);

const isMoveEntry = (value: unknown): value is MoveEntry =>
  isRecord(value) && typeof value.type === 'string' && typeof value.category === 'string' && isFiniteNumber(value.basePower);

const isUsageEntry = (value: unknown): value is UsageEntry =>
  isRecord(value) &&
  isFiniteNumber(value.usage) &&
  isFiniteNumber(value.weight) &&
  Array.isArray(value.moves) &&
  Array.isArray(value.teammates);

/** A copy of `table` with only the entries `keep` accepts. Entries are kept by reference. */
function filterEntries<T>(table: Record<string, unknown>, keep: (value: unknown) => value is T): Record<string, T> {
  // `Object.fromEntries` defines own properties, so an id such as `__proto__` cannot rewrite the result's prototype.
  return Object.fromEntries(Object.entries(table).filter((entry): entry is [string, T] => keep(entry[1])));
}

/**
 * The part of a snapshot the engine can read safely, or null when the `species` or `moves` table is missing. Entries
 * the engine could not read (a species without a numeric `num` and a `types` array, a move without a string `type`,
 * a string `category` and a numeric `basePower`, a usage entry without numeric `usage` and `weight` and `moves` and
 * `teammates` arrays) are dropped. A `usage` that is not an object with a `species` table becomes null. Never
 * throws and never modifies the input; the result is a new object whose entries are the input's own.
 */
export function sanitizeSnapshot(snapshot: unknown): EngineSnapshot | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.species) || !isRecord(snapshot.moves)) return null;

  let usage: UsageData | null = null;
  const given = snapshot.usage;
  if (isRecord(given) && isRecord(given.species)) {
    usage = { ...(given as unknown as UsageData), species: filterEntries(given.species, isUsageEntry) };
  }

  return {
    species: filterEntries(snapshot.species, isSpeciesEntry),
    moves: filterEntries(snapshot.moves, isMoveEntry),
    usage,
  };
}
