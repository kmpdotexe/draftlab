import { deriveDraft, drafterAt } from './derive';
import type { ID } from './id';
import type { LeagueConfig, LegalSpeciesSource } from './league';
import type { Problem } from './problem';

/**
 * Why `species` cannot be picked next, or null if it can. The reasons are tested in this order and the
 * first one that applies is returned. A pick that leaves the drafter unable to fill their roster is
 * allowed; it shows up as `cannotFillRoster` in the derived state.
 */
export function checkPick(
  league: LeagueConfig,
  picks: ID[],
  species: ID,
  snapshot: LegalSpeciesSource,
): Problem | null {
  const problem = (message: string): Problem => ({ path: `picks[${picks.length}]`, message });

  if (picks.length >= league.drafters.length * league.rounds) return problem('the draft is already complete');
  if (!Object.hasOwn(snapshot.species, species)) return problem(`"${species}" is not legal in ${snapshot.formatId}`);
  if (!Object.hasOwn(league.prices, species)) return problem(`"${species}" has no price in this league`);
  if (league.extraBans.includes(species)) return problem(`"${species}" is banned in this league`);
  if (picks.includes(species)) return problem(`"${species}" has already been picked`);

  const { drafter } = drafterAt(league, picks.length);
  const onTheClock = deriveDraft(league, picks, snapshot).drafters[drafter];
  const price = league.prices[species];
  if (price > onTheClock.remaining) {
    return problem(`"${species}" costs ${price} points but ${onTheClock.name} has ${onTheClock.remaining} left`);
  }
  return null;
}

export function applyPick(
  league: LeagueConfig,
  picks: ID[],
  species: ID,
  snapshot: LegalSpeciesSource,
): { ok: true; picks: ID[] } | { ok: false; problem: Problem } {
  const problem = checkPick(league, picks, species, snapshot);
  return problem ? { ok: false, problem } : { ok: true, picks: [...picks, species] };
}

/** A copy of `picks` without the last pick; an empty list stays empty. */
export function undoPick(picks: ID[]): ID[] {
  return picks.slice(0, -1);
}
