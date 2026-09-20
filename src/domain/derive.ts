import type { ID } from './id';
import type { LeagueConfig, LegalSpeciesSource } from './league';

export interface PickRecord {
  /** 1-based pick number. */
  number: number;
  /** 1-based round. */
  round: number;
  /** Index into `league.drafters`. */
  drafter: number;
  species: ID;
  /** 0 if the species has no price (only possible for a pick that was not validated). */
  price: number;
}

export interface DrafterState {
  name: string;
  /** Species in pick order. */
  roster: ID[];
  spent: number;
  /** budget - spent. */
  remaining: number;
  /** rounds - roster.length. */
  openSlots: number;
  /**
   * Sum of the cheapest `openSlots` prices left in the pool; 0 when openSlots is 0;
   * null when the pool has fewer species than openSlots.
   */
  pointsNeededToFill: number | null;
  /** True when pointsNeededToFill is null or more than `remaining`. A warning flag, not a rule. */
  cannotFillRoster: boolean;
}

export interface DraftState {
  picks: PickRecord[];
  /** Same order as `league.drafters`. */
  drafters: DrafterState[];
  /** Legal, priced, not banned, not picked. Sorted by price descending, then id ascending. */
  pool: ID[];
  /** Whose pick is next, or null when the draft is complete. */
  onTheClock: { number: number; round: number; drafter: number } | null;
  complete: boolean;
}

/**
 * Which drafter makes pick `n`. Both `n` and the returned `round` are 0-based.
 * Throws RangeError if `n` is not an integer in 0 .. drafters*rounds-1.
 */
export function drafterAt(league: LeagueConfig, n: number): { round: number; drafter: number } {
  const count = league.drafters.length;
  const total = count * league.rounds;
  if (!Number.isInteger(n) || n < 0 || n >= total) {
    throw new RangeError(`pick index ${n} is outside 0..${total - 1}`);
  }
  const round = Math.floor(n / count);
  const position = n % count;
  const drafter = league.order === 'snake' && round % 2 === 1 ? count - 1 - position : position;
  return { round, drafter };
}

/**
 * Recomputes the whole draft state from the league and the ordered picks. Assumes the picks are valid
 * (they come from `applyPick`); throws RangeError only when there are more picks than slots.
 */
export function deriveDraft(league: LeagueConfig, picks: ID[], snapshot: LegalSpeciesSource): DraftState {
  const total = league.drafters.length * league.rounds;
  if (picks.length > total) {
    throw new RangeError(`${picks.length} picks exceed the ${total} slots in this draft`);
  }

  const priceOf = (id: ID): number => league.prices[id] ?? 0;

  const records: PickRecord[] = picks.map((species, i) => {
    const { round, drafter } = drafterAt(league, i);
    return { number: i + 1, round: round + 1, drafter, species, price: priceOf(species) };
  });

  const taken = new Set(picks);
  const banned = new Set(league.extraBans);
  const pool = Object.keys(snapshot.species).filter(
    (id) => Object.hasOwn(league.prices, id) && !banned.has(id) && !taken.has(id),
  );
  pool.sort((a, b) => priceOf(b) - priceOf(a) || (a < b ? -1 : a > b ? 1 : 0));
  const cheapestFirst = pool.map(priceOf).sort((a, b) => a - b);

  const drafters: DrafterState[] = league.drafters.map((name, index) => {
    const mine = records.filter((record) => record.drafter === index);
    const spent = mine.reduce((sum, record) => sum + record.price, 0);
    const openSlots = league.rounds - mine.length;
    const remaining = league.budget - spent;
    const pointsNeededToFill =
      openSlots === 0
        ? 0
        : openSlots > cheapestFirst.length
          ? null
          : cheapestFirst.slice(0, openSlots).reduce((sum, price) => sum + price, 0);
    return {
      name,
      roster: mine.map((record) => record.species),
      spent,
      remaining,
      openSlots,
      pointsNeededToFill,
      cannotFillRoster: pointsNeededToFill === null || pointsNeededToFill > remaining,
    };
  });

  let onTheClock: DraftState['onTheClock'] = null;
  if (picks.length < total) {
    const { round, drafter } = drafterAt(league, picks.length);
    onTheClock = { number: picks.length + 1, round: round + 1, drafter };
  }

  return { picks: records, drafters, pool, onTheClock, complete: picks.length === total };
}
