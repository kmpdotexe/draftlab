import type { Note, Reason } from '../../engine';
import { COMBO_LABELS, ROLE_LABELS, joinList, type Names } from './names';

const times = (lift: number): string => `${lift.toFixed(1)}×`;
const percent = (share: number): string => `${(share * 100).toFixed(1)}%`;

/** ", which A is weak to" / ", which A and B are weak to"; nothing when no member is weak. */
function weakClause(members: readonly string[], names: Names): string {
  if (members.length === 0) return '';
  const who = joinList(members.map((id) => names.species(id)));
  return `, which ${who} ${members.length === 1 ? 'is' : 'are'} weak to`;
}

/** One English sentence for an engine reason. */
export function reasonText(reason: Reason, names: Names): string {
  switch (reason.kind) {
    case 'pairs-often-with':
      return `Paired with ${names.species(reason.with)} ${times(reason.lift)} more often than expected on ladder.`;
    case 'pairs-rarely-with':
      return `Rarely paired with ${names.species(reason.with)} (${times(reason.lift)} the expected rate).`;
    case 'lift-coverage':
      return `Ladder pairing data covers ${reason.covered} of your ${reason.of} Pokémon.`;
    case 'covers-weakness': {
      const clause = weakClause(reason.weakMembers, names);
      if (reason.by === 'resists') return `Resists ${reason.type}${clause}.`;
      if (reason.by === 'immune') return `Immune to ${reason.type} by typing${clause}.`;
      return `Immune to ${reason.type} through ${reason.ability ?? 'its ability'}${clause}.`;
    }
    case 'adds-weakness':
      return reason.weakMembers.length === 0
        ? `Also weak to ${reason.type}.`
        : `Also weak to ${reason.type}, like ${joinList(reason.weakMembers.map((id) => names.species(id)))}.`;
    case 'adds-coverage':
      return `Hits ${joinList(reason.types)} super effectively, which your roster can't yet.`;
    case 'fills-role': {
      const role = ROLE_LABELS[reason.role];
      if (reason.source === 'ability') return `Fills ${role}: its ability is ${reason.via}.`;
      if (reason.source === 'can-learn') return `Could fill ${role}: it can learn ${names.move(reason.via)} (no ladder data).`;
      return `Fills ${role}: runs ${names.move(reason.via)}${reason.from === 'set' ? ' (from your set)' : ''}.`;
    }
    case 'completes-combo': {
      const combo = COMBO_LABELS[reason.combo];
      const partner = names.species(reason.with);
      const suffix = reason.from === 'set' ? ` (${partner}'s half is from your set)` : '';
      return reason.side === 'beneficiary'
        ? `Completes ${combo} with ${partner}${suffix}.`
        : `Sets up ${combo} for ${partner}${suffix}.`;
    }
    case 'low-usage':
      return `Rarely used on ladder (${percent(reason.usage)} of teams).`;
    case 'no-ladder-usage':
      return 'No ladder usage data.';
    default: {
      const unknown: never = reason;
      return String((unknown as { kind: unknown }).kind);
    }
  }
}

/** One English sentence for an engine note. */
export function noteText(note: Note): string {
  switch (note.kind) {
    case 'invalid-context':
    case 'invalid-snapshot':
      return 'Suggestions are unavailable (the draft data could not be read).';
    case 'roster-full':
      return 'Your roster is full.';
    case 'empty-roster':
      return 'Suggestions start after your first pick.';
    case 'cannot-fill-roster':
      return `Only ${note.poolSize} Pokémon are left for your ${note.openSlots} open slots.`;
    case 'no-affordable-candidates':
      return 'Nothing left fits your remaining points.';
    case 'no-usage-data':
      return 'No ladder usage data is loaded, so pairing data is not used.';
    case 'roster-lacks-roles':
      return `Your roster has no ${joinList(note.roles.map((role) => ROLE_LABELS[role]), 'or')} yet.`;
    case 'unscored-candidates':
      return `${note.count} Pokémon could not be scored with the current settings.`;
    default: {
      const unknown: never = note;
      return String((unknown as { kind: unknown }).kind);
    }
  }
}
