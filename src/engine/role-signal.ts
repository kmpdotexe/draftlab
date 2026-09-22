import type { ID } from '../domain/id';
import { compareIds } from './math';
import { CAN_LEARN_FACTOR, ROLES, rosterLacks, speciesRoles } from './roles';
import type { EngineSnapshot, Reason, SignalOutput } from './types';

const MAX_FILLS = 3;

/**
 * Role fit: how much of what the roster lacks the candidate supplies. `lacked` is the roles no roster member covers
 * (`rosterLacks`); each role the candidate has a tag for earns its importance (half of it for a `can-learn` tag), and the
 * score is the earned sum over the summed importance of the lacked roles, in [0, 1]. No data when the roster lacks
 * nothing, has no member in the snapshot, or the candidate is not in the snapshot. `roster` is limited to ids in the
 * snapshot by the caller; other ids are ignored anyway.
 */
export function roleSignal(roster: ID[], candidate: ID, snapshot: Pick<EngineSnapshot, 'species' | 'usage' | 'learnsets'>): SignalOutput {
  if (!Object.hasOwn(snapshot.species, candidate)) return { score: null, reasons: [] };
  if (!roster.some((id) => Object.hasOwn(snapshot.species, id))) return { score: null, reasons: [] };
  const lacked = new Set(rosterLacks(roster, snapshot));
  if (lacked.size === 0) return { score: null, reasons: [] };

  const tags = speciesRoles(candidate, snapshot);
  let total = 0;
  let earned = 0;
  const filled: Array<{ importance: number; role: string; reason: Reason }> = [];
  for (const role of ROLES) {
    if (!lacked.has(role.id)) continue;
    total += role.importance;
    const tag = tags.find((entry) => entry.role === role.id);
    if (tag === undefined) continue;
    earned += role.importance * (tag.source === 'can-learn' ? CAN_LEARN_FACTOR : 1);
    filled.push({
      importance: role.importance,
      role: role.id,
      reason: { kind: 'fills-role', role: tag.role, source: tag.source, via: tag.via },
    });
  }

  filled.sort((a, b) => b.importance - a.importance || compareIds(a.role, b.role));
  return { score: earned / total, reasons: filled.slice(0, MAX_FILLS).map((entry) => entry.reason) };
}
