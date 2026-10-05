import type { ID } from '../../domain/id';
import type { Snapshot } from '../../domain/types';

/** How to turn ladder usage into prices: the most used Pokémon fill the tiers in order. */
export interface PriceSuggestion {
  tiers: ReadonlyArray<{ count: number; points: number }>;
  /** Points for every other Pokémon with ladder use, or null to leave them out of the draft. */
  restPoints: number | null;
}

export const DEFAULT_SUGGESTION: PriceSuggestion = {
  tiers: [
    { count: 10, points: 20 },
    { count: 20, points: 15 },
    { count: 30, points: 10 },
    { count: 60, points: 5 },
  ],
  restPoints: 1,
};

type UsageSnapshot = Pick<Snapshot, 'species' | 'usage'>;

/** Legal Pokémon with ladder usage, most used first; ties by display name. */
export function rankedByUsage(snapshot: UsageSnapshot): ID[] {
  const usage = snapshot.usage;
  if (usage === null) return [];
  return Object.values(usage.species)
    .filter((entry) => Object.hasOwn(snapshot.species, entry.id))
    .sort((a, b) => b.usage - a.usage || snapshot.species[a.id].name.localeCompare(snapshot.species[b.id].name))
    .map((entry) => entry.id);
}

/** A whole price list from ladder usage. Pokémon without usage get no price; no usage data gives an empty list. */
export function suggestedPrices(snapshot: UsageSnapshot, suggestion: PriceSuggestion): Record<ID, number> {
  const ranked = rankedByUsage(snapshot);
  const prices: Record<ID, number> = {};
  let next = 0;
  for (const { count, points } of suggestion.tiers) {
    for (const id of ranked.slice(next, next + Math.max(0, count))) prices[id] = points;
    next += Math.max(0, count);
  }
  if (suggestion.restPoints !== null) for (const id of ranked.slice(next)) prices[id] = suggestion.restPoints;
  return prices;
}

export interface SuggestionSummary {
  /** Pokémon placed in the listed tiers. */
  tiered: number;
  /** Listed tiers that receive at least one Pokémon. */
  tierCount: number;
  /** Other Pokémon with ladder use, priced at `restPoints` (0 when it is null). */
  rest: number;
  /** Legal Pokémon left out of the draft. */
  left: number;
}

/** What `suggestedPrices` would do, for the preview line. */
export function suggestionSummary(snapshot: UsageSnapshot, suggestion: PriceSuggestion): SuggestionSummary {
  const ranked = rankedByUsage(snapshot).length;
  const legal = Object.keys(snapshot.species).length;
  let tiered = 0;
  let tierCount = 0;
  for (const { count } of suggestion.tiers) {
    const placed = Math.min(Math.max(0, count), ranked - tiered);
    if (placed > 0) tierCount++;
    tiered += placed;
  }
  const rest = suggestion.restPoints === null ? 0 : ranked - tiered;
  return { tiered, tierCount, rest, left: legal - tiered - rest };
}
