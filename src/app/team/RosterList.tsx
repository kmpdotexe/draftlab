import type { ID } from '../../domain/id';
import type { Problem } from '../../domain/problem';
import type { RosterSets } from '../../domain/team';
import type { Names } from '../text/names';

interface Props {
  roster: readonly ID[];
  sets: RosterSets;
  /** Each roster Pokémon's set problems (empty for one without a set). */
  problems: Readonly<Record<ID, Problem[]>>;
  selected: ID | null;
  names: Names;
  onSelect(species: ID): void;
}

/** "No set", "Set ready" or "N problems". */
export function setStatus(hasSet: boolean, problemCount: number): string {
  if (!hasSet) return 'No set';
  if (problemCount === 0) return 'Set ready';
  return `${problemCount} problem${problemCount === 1 ? '' : 's'}`;
}

/** Your drafted Pokémon in pick order, each with its set status; choosing one opens it in the editor. */
export function RosterList({ roster, sets, problems, selected, names, onSelect }: Props) {
  return (
    <section className="roster-list" aria-labelledby="roster-list-title">
      <h2 id="roster-list-title">Your roster</h2>
      {roster.length === 0 ? (
        <p>Your roster is empty: draft a Pokémon first.</p>
      ) : (
        <ul>
          {roster.map((id) => (
            <li key={id}>
              <button type="button" aria-current={id === selected ? 'true' : undefined} onClick={() => onSelect(id)}>
                <span className="name">{names.species(id)}</span>{' '}
                <span className="types">{names.types(id).join(' / ')}</span>{' '}
                <span className="set-status">{setStatus(Object.hasOwn(sets, id), problems[id]?.length ?? 0)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
