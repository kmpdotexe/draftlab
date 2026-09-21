import { checkPick } from './draft';
import type { ID } from './id';
import { validateLeague, type LeagueConfig, type LegalSpeciesSource } from './league';
import type { Problem } from './problem';

export interface DraftFile {
  schemaVersion: 1;
  league: LeagueConfig;
  /** Species ids in the order they were picked. */
  picks: ID[];
}

export type ParseResult =
  | { ok: true; file: DraftFile; warnings: Problem[] }
  | { ok: false; errors: Problem[] };

export function serializeDraftFile(file: DraftFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringList = (value: unknown): boolean => Array.isArray(value) && value.every((item) => typeof item === 'string');

/** Layer 1: is the JSON the right shape, and is every field the right JSON type? */
function shapeProblems(json: unknown): Problem[] {
  if (!isRecord(json)) return [{ path: 'file', message: 'the file must contain a JSON object' }];
  if (json.schemaVersion !== 1) {
    return [
      { path: 'schemaVersion', message: `unsupported schemaVersion ${JSON.stringify(json.schemaVersion)} (this version reads 1)` },
    ];
  }

  const problems: Problem[] = [];
  const add = (path: string, message: string) => problems.push({ path, message });

  const league = json.league;
  if (!isRecord(league)) {
    add('league', 'league must be an object');
  } else {
    if (typeof league.name !== 'string') add('league.name', 'name must be text');
    if (typeof league.formatId !== 'string') add('league.formatId', 'formatId must be text');
    if (!isStringList(league.drafters)) add('league.drafters', 'drafters must be a list of names');
    if (typeof league.order !== 'string') add('league.order', 'order must be text');
    for (const key of ['rounds', 'me', 'budget'] as const) {
      if (typeof league[key] !== 'number') add(`league.${key}`, `${key} must be a number`);
    }
    if (!isRecord(league.prices) || Object.values(league.prices).some((price) => typeof price !== 'number')) {
      add('league.prices', 'prices must be an object of species id to number');
    }
    if (!isStringList(league.extraBans)) add('league.extraBans', 'extraBans must be a list of species ids');
  }

  if (!isStringList(json.picks)) add('picks', 'picks must be a list of species ids');
  return problems;
}

/**
 * Reads a saved draft. Three layers, stopping at the first that has errors: (1) JSON shape, (2) league
 * rules, (3) replaying every pick with `checkPick`. A file with any error is refused whole. Prices or
 * bans for species the snapshot does not have, and a format id that differs from the snapshot's, are
 * returned as warnings.
 */
export function parseDraftFile(text: string, snapshot: LegalSpeciesSource): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [{ path: 'file', message: `not valid JSON: ${(error as Error).message}` }] };
  }

  const shape = shapeProblems(json);
  if (shape.length > 0) return { ok: false, errors: shape };
  const parsed = json as DraftFile;
  const file: DraftFile = { schemaVersion: 1, league: parsed.league, picks: parsed.picks };

  const leagueProblems = validateLeague(file.league, 'league');
  if (leagueProblems.length > 0) return { ok: false, errors: leagueProblems };

  for (let i = 0; i < file.picks.length; i++) {
    const problem = checkPick(file.league, file.picks.slice(0, i), file.picks[i], snapshot);
    if (problem) {
      return { ok: false, errors: [{ path: `picks[${i}]`, message: `pick ${i + 1}: ${problem.message}` }] };
    }
  }

  const warnings: Problem[] = [];
  if (file.league.formatId !== snapshot.formatId) {
    warnings.push({
      path: 'league.formatId',
      message: `league is for "${file.league.formatId}" but the loaded data is "${snapshot.formatId}"`,
    });
  }
  for (const id of Object.keys(file.league.prices)) {
    if (!Object.hasOwn(snapshot.species, id)) {
      warnings.push({ path: `league.prices.${id}`, message: `"${id}" is not legal in ${snapshot.formatId}; its price is ignored` });
    }
  }
  file.league.extraBans.forEach((id, i) => {
    if (!Object.hasOwn(snapshot.species, id)) {
      warnings.push({ path: `league.extraBans[${i}]`, message: `"${id}" is not legal in ${snapshot.formatId}; the ban is ignored` });
    }
  });

  return { ok: true, file, warnings };
}
