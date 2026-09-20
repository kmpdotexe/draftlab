import type { ID } from './id';
import type { Problem } from './problem';
import type { Snapshot } from './types';

/** The only part of the snapshot the draft logic needs. */
export type LegalSpeciesSource = Pick<Snapshot, 'formatId' | 'species'>;

export type DraftOrder = 'snake' | 'linear';

export interface LeagueConfig {
  name: string;
  /** The Showdown format id the league drafts for, e.g. "gen9championsvgc2026regmb". */
  formatId: string;
  /** Drafter names in first-round order. */
  drafters: string[];
  order: DraftOrder;
  /** Number of rounds; also the roster size. */
  rounds: number;
  /** Index into `drafters`: the user's own slot. */
  me: number;
  /** Points available to each roster. */
  budget: number;
  /** Species id -> points. A species with no entry is unavailable. */
  prices: Record<ID, number>;
  /** Species this league bans on top of the regulation's own rules. */
  extraBans: ID[];
}

export const MIN_DRAFTERS = 2;
export const MAX_DRAFTERS = 32;
export const MAX_ROUNDS = 30;

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function validateLeague(league: LeagueConfig, path: string): Problem[] {
  if (typeof league !== 'object' || league === null || Array.isArray(league)) {
    return [{ path, message: 'league must be an object' }];
  }

  const problems: Problem[] = [];
  const add = (sub: string, message: string) => problems.push({ path: `${path}${sub}`, message });

  if (!isNonEmptyString(league.name)) add('.name', 'name is required');
  if (!isNonEmptyString(league.formatId)) add('.formatId', 'formatId is required');

  if (!Array.isArray(league.drafters)) {
    add('.drafters', 'drafters must be a list of names');
  } else {
    if (league.drafters.length < MIN_DRAFTERS || league.drafters.length > MAX_DRAFTERS) {
      add('.drafters', `need ${MIN_DRAFTERS} to ${MAX_DRAFTERS} drafters (found ${league.drafters.length})`);
    }
    const firstSeen = new Map<string, number>();
    league.drafters.forEach((name, i) => {
      if (!isNonEmptyString(name)) {
        add(`.drafters[${i}]`, 'drafter name is required');
        return;
      }
      const key = name.trim().toLowerCase();
      const first = firstSeen.get(key);
      if (first !== undefined) add(`.drafters[${i}]`, `duplicate name "${name}" (same as drafters[${first}])`);
      else firstSeen.set(key, i);
    });
  }

  if (league.order !== 'snake' && league.order !== 'linear') {
    add('.order', `order must be "snake" or "linear" (found ${JSON.stringify(league.order)})`);
  }

  if (!Number.isInteger(league.rounds) || league.rounds < 1 || league.rounds > MAX_ROUNDS) {
    add('.rounds', `rounds must be a whole number from 1 to ${MAX_ROUNDS}`);
  }

  if (
    !Number.isInteger(league.me) ||
    league.me < 0 ||
    !Array.isArray(league.drafters) ||
    league.me >= league.drafters.length
  ) {
    add('.me', 'me must be the index of one of the drafters');
  }

  if (!Number.isInteger(league.budget) || league.budget < 1) {
    add('.budget', 'budget must be a positive whole number');
  }

  if (!isRecord(league.prices)) {
    add('.prices', 'prices must be an object of species id to points');
  } else {
    for (const [id, price] of Object.entries(league.prices)) {
      if (!Number.isInteger(price) || price < 0) {
        add(`.prices.${id}`, `price must be a non-negative whole number (found ${String(price)})`);
      }
    }
  }

  if (!Array.isArray(league.extraBans)) {
    add('.extraBans', 'extraBans must be a list of species ids');
  } else {
    league.extraBans.forEach((id, i) => {
      if (!isNonEmptyString(id)) add(`.extraBans[${i}]`, 'banned species id is required');
    });
  }

  return problems;
}
