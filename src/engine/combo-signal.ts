import type { ID } from '../domain/id';
import { COMBOS, sideMatch, type ComboSide } from './combos';
import { compareIds } from './math';
import { profileOf, setFor, type Profile } from './profile';
import type { ComboId, ComboSource, EngineSnapshot, Reason, SignalOutput } from './types';

const MAX_COMPLETES = 3;

type ComboSnapshot = Pick<EngineSnapshot, 'species' | 'moves' | 'usage'>;

interface Member {
  id: ID;
  profile: Profile;
}

/** The roster members that are in the snapshot, in roster order, each read through its set where `sets` has one. */
function members(roster: readonly ID[], snapshot: ComboSnapshot, sets?: Record<ID, unknown>): Member[] {
  const seen = new Set<ID>();
  const result: Member[] = [];
  for (const id of roster) {
    if (seen.has(id) || !Object.hasOwn(snapshot.species, id)) continue;
    seen.add(id);
    result.push({ id, profile: profileOf(id, snapshot, setFor(sets, id)) });
  }
  return result;
}

/** The combos (table order) for which at least one roster member is on the enabler side or the beneficiary side. */
export function openCombos(roster: readonly ID[], snapshot: ComboSnapshot, sets?: Record<ID, unknown>): ComboId[] {
  const team = members(roster, snapshot, sets);
  return COMBOS.filter((combo) =>
    team.some(
      (m) =>
        sideMatch(combo.enabler, m.id, m.profile, snapshot) !== null || sideMatch(combo.beneficiary, m.id, m.profile, snapshot) !== null,
    ),
  ).map((combo) => combo.id);
}

/** The first roster member (roster order) other than `candidate` on `side`, with how that was known. */
function partner(
  team: readonly Member[],
  candidate: ID,
  side: ComboSide,
  snapshot: ComboSnapshot,
): { with: ID; from: ComboSource } | null {
  for (const m of team) {
    if (m.id === candidate) continue;
    const from = sideMatch(side, m.id, m.profile, snapshot);
    if (from !== null) return { with: m.id, from };
  }
  return null;
}

/**
 * Combo fit: how much of the roster's open combos the candidate completes. `open` is `openCombos` for the roster
 * (computed once by the caller). The candidate completes a combo as beneficiary when it is on the beneficiary side and
 * another roster member is on the enabler side, or as enabler the other way round. The score is the summed importance
 * of the completed combos over the summed importance of the open ones, in [0, 1]. Roster members are read through
 * `sets`; the candidate always uses its ladder profile. No data when nothing is open, the roster has no member in the
 * snapshot, or the candidate is not in the snapshot.
 */
export function comboSignal(
  roster: ID[],
  candidate: ID,
  snapshot: ComboSnapshot,
  open: readonly ComboId[],
  sets?: Record<ID, unknown>,
): SignalOutput {
  if (!Object.hasOwn(snapshot.species, candidate)) return { score: null, reasons: [] };
  const team = members(roster, snapshot, sets);
  if (team.length === 0) return { score: null, reasons: [] };
  const openSet = new Set(open);
  if (openSet.size === 0) return { score: null, reasons: [] };

  const own = profileOf(candidate, snapshot);
  let total = 0;
  let earned = 0;
  const completed: Array<{ importance: number; combo: ComboId; reason: Reason }> = [];
  for (const combo of COMBOS) {
    if (!openSet.has(combo.id)) continue;
    total += combo.importance;
    let found: { side: 'enabler' | 'beneficiary'; with: ID; from: ComboSource } | null = null;
    if (sideMatch(combo.beneficiary, candidate, own, snapshot) !== null) {
      const p = partner(team, candidate, combo.enabler, snapshot);
      if (p !== null) found = { side: 'beneficiary', ...p };
    }
    if (found === null && sideMatch(combo.enabler, candidate, own, snapshot) !== null) {
      const p = partner(team, candidate, combo.beneficiary, snapshot);
      if (p !== null) found = { side: 'enabler', ...p };
    }
    if (found === null) continue;
    earned += combo.importance;
    completed.push({
      importance: combo.importance,
      combo: combo.id,
      reason: { kind: 'completes-combo', combo: combo.id, side: found.side, with: found.with, from: found.from },
    });
  }

  if (total === 0) return { score: null, reasons: [] };

  completed.sort((a, b) => b.importance - a.importance || compareIds(a.combo, b.combo));
  return { score: earned / total, reasons: completed.slice(0, MAX_COMPLETES).map((entry) => entry.reason) };
}
