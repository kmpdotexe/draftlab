import { toID, type ID } from './id';
import type { LegalSpeciesSource } from './league';
import type { Problem } from './problem';

export interface PriceImport {
  /** Species id -> points, for every row that matched a legal species. */
  prices: Record<ID, number>;
  /** Names (as written) that matched no species. Not problems. */
  unmatched: string[];
  problems: Problem[];
}

const WHOLE_NUMBER = /^\d+$/;

/** Removes one pair of surrounding double quotes, then trims. */
function clean(field: string): string {
  const trimmed = field.trim();
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).trim()
    : trimmed;
}

/** Splits at the last tab if the line has one, otherwise at the last comma. */
function splitLine(line: string): [name: string, points: string] | null {
  const tab = line.lastIndexOf('\t');
  const at = tab >= 0 ? tab : line.lastIndexOf(',');
  if (at < 0) return null;
  return [clean(line.slice(0, at)), clean(line.slice(at + 1))];
}

/**
 * Reads a price list ("name,points" or "name<TAB>points" per line). The first non-blank line is skipped
 * as a header when its points field is not a whole number. Names are matched by `toID` against the
 * snapshot's species; there is no fuzzy matching.
 */
export function parsePriceCsv(text: string, snapshot: LegalSpeciesSource): PriceImport {
  const prices: Record<ID, number> = {};
  const unmatched: string[] = [];
  const problems: Problem[] = [];
  const firstSeenOnLine = new Map<ID, number>();
  let sawContent = false;

  text.split(/\r?\n/).forEach((raw, index) => {
    const lineNumber = index + 1;
    if (raw.trim() === '') return;
    const isFirstContentLine = !sawContent;
    sawContent = true;
    const path = `line ${lineNumber}`;

    const fields = splitLine(raw);
    if (fields === null) {
      problems.push({ path, message: 'expected "name,points"' });
      return;
    }
    const [name, points] = fields;

    if (!WHOLE_NUMBER.test(points)) {
      if (!isFirstContentLine) problems.push({ path, message: `"${points}" is not a whole number of points` });
      return;
    }

    const id = toID(name);
    if (!Object.hasOwn(snapshot.species, id)) {
      unmatched.push(name);
      return;
    }
    const earlier = firstSeenOnLine.get(id);
    if (earlier !== undefined) {
      problems.push({ path, message: `"${name}" is listed twice (first on line ${earlier})` });
      return;
    }
    firstSeenOnLine.set(id, lineNumber);
    prices[id] = Number(points);
  });

  return { prices, unmatched, problems };
}
