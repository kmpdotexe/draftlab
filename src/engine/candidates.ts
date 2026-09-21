import type { DraftState } from '../domain/derive';
import type { ID } from '../domain/id';
import type { LeagueConfig } from '../domain/league';
import type { Snapshot } from '../domain/types';
import { compareIds } from './math';
import type { SuggestContext, SuggestOptions } from './types';

export interface Candidate {
  species: ID;
  price: number;
}

export interface CandidateSelection {
  /** In price-then-id order. */
  candidates: Candidate[];
  /** Pool species that have a finite price (whether or not they are in the snapshot). */
  pricedPoolSize: number;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * The context for one drafter, from a derived `DraftState`. Derive the draft once and call this for each
 * question. Returns null when the drafter index is not an integer in range or the inputs are malformed.
 */
export function contextFor(league: LeagueConfig, draft: DraftState, drafterIndex: number): SuggestContext | null {
  if (typeof league !== 'object' || league === null || typeof league.prices !== 'object' || league.prices === null) {
    return null;
  }
  if (typeof draft !== 'object' || draft === null || !Array.isArray(draft.drafters) || !Array.isArray(draft.pool)) {
    return null;
  }
  if (!Number.isInteger(drafterIndex) || drafterIndex < 0 || drafterIndex >= draft.drafters.length) return null;
  const drafter = draft.drafters[drafterIndex];
  return {
    roster: drafter.roster,
    pool: draft.pool,
    prices: league.prices,
    remaining: drafter.remaining,
    openSlots: drafter.openSlots,
  };
}

/** The usage fraction of a species, or 0 when it has no usage entry or there is no usage data. */
export function usageOf(snapshot: Pick<Snapshot, 'usage'>, id: ID): number {
  const usage = snapshot.usage;
  return usage !== null && Object.hasOwn(usage.species, id) ? usage.species[id].usage : 0;
}

/**
 * The pool species that can be suggested. A species is a candidate when it is in the snapshot, not on the roster,
 * shares no dex number with a roster member, passes the usage filters, and is affordable: its price plus the
 * cheapest prices of the OTHER priced pool species for the other open slots (`openSlots - 1` of them) fits in
 * `remaining`. `roster` must already be limited to ids in `snapshot.species`.
 */
export function selectCandidates(
  ctx: SuggestContext,
  roster: ID[],
  snapshot: Pick<Snapshot, 'species' | 'usage'>,
  options: SuggestOptions,
): CandidateSelection {
  const priced: Candidate[] = [];
  const seen = new Set<ID>();
  for (const id of ctx.pool) {
    if (typeof id !== 'string' || seen.has(id)) continue;
    seen.add(id);
    if (Object.hasOwn(ctx.prices, id) && isFiniteNumber(ctx.prices[id])) priced.push({ species: id, price: ctx.prices[id] });
  }
  priced.sort((a, b) => a.price - b.price || compareIds(a.species, b.species));

  // prefix[i] is the sum of the i cheapest prices.
  const prefix = [0];
  for (const entry of priced) prefix.push(prefix[prefix.length - 1] + entry.price);
  const reserveSlots = ctx.openSlots - 1;
  const take = Math.min(reserveSlots, priced.length - 1);

  const onRoster = new Set(roster);
  const rosterNumbers = new Set(roster.map((id) => snapshot.species[id].num));
  const maxUsage = isFiniteNumber(options.maxUsage) ? options.maxUsage : null;
  const minUsage = isFiniteNumber(options.minUsage) ? options.minUsage : null;

  const candidates: Candidate[] = [];
  priced.forEach((entry, index) => {
    if (!Object.hasOwn(snapshot.species, entry.species) || onRoster.has(entry.species)) return;
    if (rosterNumbers.has(snapshot.species[entry.species].num)) return;
    const usage = usageOf(snapshot, entry.species);
    if (maxUsage !== null && usage > maxUsage) return;
    if (minUsage !== null && usage < minUsage) return;
    // The `take` cheapest others: if this candidate is among the `take` cheapest overall, take one more and drop it.
    const reserve = index < take ? prefix[take + 1] - entry.price : prefix[take];
    if (entry.price + reserve <= ctx.remaining) candidates.push(entry);
  });
  return { candidates, pricedPoolSize: priced.length };
}
