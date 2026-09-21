import type { ID } from '../domain/id';
import type { UsageData } from '../domain/types';
import { teammateLift } from '../domain/usage';
import { clamp, compareIds } from './math';
import type { Reason, SignalOutput } from './types';

/** A lift of 2^-3 maps to score 0, 1 to 0.5 and 2^3 to 1; anything beyond is clamped. */
export const LIFT_LOG_RANGE = 3;

const MAX_OFTEN = 3;

/**
 * How much more often the candidate appears with the roster's Pokémon than its overall usage predicts
 * (`teammateLift`), averaged in log space over the roster members with a stored pair. `roster` must already be
 * limited to ids in the snapshot. No data when there is no usage data or no member has a pair with the candidate.
 */
export function liftSignal(roster: ID[], candidate: ID, usage: UsageData | null): SignalOutput {
  if (usage === null || !Object.hasOwn(usage.species, candidate)) return { score: null, reasons: [] };

  const lifts: Array<{ member: ID; lift: number }> = [];
  for (const member of roster) {
    if (!Object.hasOwn(usage.species, member)) continue;
    const lift = teammateLift(usage, member, candidate);
    if (lift !== null && Number.isFinite(lift) && lift > 0) lifts.push({ member, lift });
  }
  if (lifts.length === 0) return { score: null, reasons: [] };

  const meanLog = lifts.reduce((sum, { lift }) => sum + Math.log2(lift), 0) / lifts.length;
  const score = clamp((meanLog + LIFT_LOG_RANGE) / (2 * LIFT_LOG_RANGE), 0, 1);

  const reasons: Reason[] = [];
  const strongestFirst = [...lifts].sort((a, b) => b.lift - a.lift || compareIds(a.member, b.member));
  for (const { member, lift } of strongestFirst.filter((entry) => entry.lift > 1).slice(0, MAX_OFTEN)) {
    reasons.push({ kind: 'pairs-often-with', with: member, lift });
  }
  const weakest = [...lifts].sort((a, b) => a.lift - b.lift || compareIds(a.member, b.member))[0];
  if (weakest.lift < 1) reasons.push({ kind: 'pairs-rarely-with', with: weakest.member, lift: weakest.lift });
  if (lifts.length < roster.length) reasons.push({ kind: 'lift-coverage', covered: lifts.length, of: roster.length });
  return { score, reasons };
}
