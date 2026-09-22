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

/**
 * True when `rows` is an array whose every row is an `[id, number]` pair. A plain loop, not `every`, so a hole in a
 * sparse array counts as a bad row instead of being skipped.
 */
function isPairList(rows: unknown): boolean {
  if (!Array.isArray(rows)) return false;
  for (let i = 0; i < rows.length; i++) {
    const row: unknown = rows[i];
    if (!Array.isArray(row) || row.length < 2 || typeof row[0] !== 'string' || !isFiniteNumber(row[1])) return false;
  }
  return true;
}

/** True for an array of strings; a hole counts as a bad element, as in `isPairList`. */
function isStringList(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') return false;
  }
  return true;
}

const isUsageEntry = (value: unknown): value is UsageEntry =>
  isRecord(value) &&
  isFiniteNumber(value.usage) &&
  isFiniteNumber(value.weight) &&
  isPairList(value.abilities) &&
  isPairList(value.moves) &&
  isPairList(value.teammates);

/** A copy of `table` with only the entries `keep` accepts. Entries are kept by reference. */
function filterEntries<T>(table: Record<string, unknown>, keep: (value: unknown) => value is T): Record<string, T> {
  // `Object.fromEntries` defines own properties, so an id such as `__proto__` cannot rewrite the result's prototype.
  return Object.fromEntries(Object.entries(table).filter((entry): entry is [string, T] => keep(entry[1])));
}

/**
 * The part of a snapshot the engine can read safely, or null when the `species` or `moves` table is missing. Entries
 * the engine could not read (a species without a numeric `num` and a `types` array, a move without a string `type`,
 * a string `category` and a numeric `basePower`, a usage entry without numeric `usage` and `weight` and `abilities`,
 * `moves` and `teammates` arrays whose rows are all `[id, number]` pairs) are dropped. A `usage` that is not an object
 * with a `species` table becomes null. A `learnsets` table is kept (minus entries that are not arrays of strings) only
 * when the input has one. Never throws on a plain-data (JSON) snapshot (an object with a throwing getter or a Proxy can
 * still throw) and never modifies the input; the result is a new object whose entries are the input's own.
 */
export function sanitizeSnapshot(snapshot: unknown): EngineSnapshot | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.species) || !isRecord(snapshot.moves)) return null;

  let usage: UsageData | null = null;
  const given = snapshot.usage;
  if (isRecord(given) && isRecord(given.species)) {
    usage = { ...(given as unknown as UsageData), species: filterEntries(given.species, isUsageEntry) };
  }

  const result: EngineSnapshot = {
    species: filterEntries(snapshot.species, isSpeciesEntry),
    moves: filterEntries(snapshot.moves, isMoveEntry),
    usage,
  };
  if (isRecord(snapshot.learnsets)) result.learnsets = filterEntries(snapshot.learnsets, isStringList);
  return result;
}
