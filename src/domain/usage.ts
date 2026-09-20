import type { ID } from './id';
import type { UsageData } from './types';

/**
 * Weighted co-occurrence of two species. Smogon's teammate data is symmetric, so either
 * species' stored list can answer. Returns null when neither stores the pair (it fell
 * outside the pruned top teammates, or was never observed).
 */
export function cooccurrence(usage: UsageData, a: ID, b: ID): number | null {
  const fromA = usage.species[a]?.teammates.find(([id]) => id === b);
  if (fromA) return fromA[1];
  const fromB = usage.species[b]?.teammates.find(([id]) => id === a);
  return fromB ? fromB[1] : null;
}

/**
 * How much more (>1) or less (<1) often `candidate` appears with `given` than chance alone
 * would give: co / (W_given × usage_candidate). Null means "no data for this pair".
 */
export function teammateLift(usage: UsageData, given: ID, candidate: ID): number | null {
  const givenEntry = usage.species[given];
  const candidateEntry = usage.species[candidate];
  if (!givenEntry || !candidateEntry) return null;
  const co = cooccurrence(usage, given, candidate);
  if (co === null) return null;
  const expected = givenEntry.weight * candidateEntry.usage;
  return expected > 0 ? co / expected : null;
}
