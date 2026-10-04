import { useState } from 'react';
import type { DraftFile } from '../../domain/file';
import type { ID } from '../../domain/id';
import { exportTeam } from '../../domain/paste-export';
import { validateTeam, type MatchTeam } from '../../domain/team';
import type { Snapshot } from '../../domain/types';
import { fileBase, type BrowserActions } from '../browser';
import type { DraftAction, DraftStoreState } from '../state/draft-store';
import type { Names } from '../text/names';
import { teamProblemText } from '../text/problems';
import { copyWithMessage, useFlash } from './flash';

interface Props {
  file: DraftFile;
  roster: readonly ID[];
  snapshot: Snapshot;
  names: Names;
  teamSize: number;
  base: string;
  dispatch(action: DraftAction): DraftStoreState;
  actions: BrowserActions;
}

/** "Team N" with the smallest N that no team already uses. */
export function nextTeamName(teams: readonly MatchTeam[]): string {
  const used = new Set(teams.map((team) => team.name));
  let n = 1;
  while (used.has(`Team ${n}`)) n++;
  return `Team ${n}`;
}

interface TeamProps extends Omit<Props, 'file'> {
  file: DraftFile;
  team: MatchTeam;
  index: number;
}

function TeamCard({ file, team, index, roster, snapshot, names, teamSize, base, dispatch, actions }: TeamProps) {
  const [name, setName] = useState(team.name);
  const [flash, setFlash] = useFlash();
  const check = validateTeam(team, [...roster], file.sets, snapshot, teamSize, `teams[${index}]`);
  const full = team.members.length >= teamSize;
  const paste = () => exportTeam(team, file.sets, snapshot);

  const toggle = (id: ID, on: boolean) => {
    const members = on ? [...team.members, id] : team.members.filter((member) => member !== id);
    dispatch({ type: 'set-team-members', index, members });
  };

  return (
    <article className="team" aria-label={team.name}>
      <div className="field">
        <label htmlFor={`team-name-${index}`}>Name of team {index + 1}</label>
        <input
          id={`team-name-${index}`}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (event.target.value.trim() !== '') dispatch({ type: 'rename-team', index, name: event.target.value });
          }}
        />
        {name.trim() === '' && <p className="field-error">A team needs a name</p>}
      </div>
      <fieldset>
        <legend>Members</legend>
        {roster.map((id) => {
          const on = team.members.includes(id);
          return (
            <label key={id} className="check">
              <input type="checkbox" checked={on} disabled={!on && full} onChange={(event) => toggle(id, event.target.checked)} />{' '}
              {names.species(id)}
            </label>
          );
        })}
      </fieldset>
      <p className="team-status">{check.complete ? 'Complete' : `${team.members.length} of ${teamSize}`}</p>
      <ul className="problems" aria-live="polite">
        {check.problems.map((problem) => (
          <li key={`${problem.path}:${problem.message}`}>{teamProblemText(problem, team, file.sets, snapshot)}</li>
        ))}
      </ul>
      <div className="row">
        <button type="button" onClick={() => copyWithMessage(actions.copy, paste(), setFlash)}>
          Copy team
        </button>
        <button type="button" onClick={() => actions.download(`${base}.${fileBase(team.name)}.txt`, paste())}>
          Download team
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (actions.confirm(`Delete ${team.name}?`)) dispatch({ type: 'delete-team', index });
          }}
        >
          Delete team
        </button>
      </div>
      <p aria-live="polite" className="flash">
        {flash}
      </p>
    </article>
  );
}

/** Your match teams: up to `teamSize` roster Pokémon each, checked with the Species and Item Clauses. */
export function MatchTeams(props: Props) {
  const { file, dispatch } = props;
  return (
    <section className="match-teams" aria-labelledby="match-teams-title">
      <h2 id="match-teams-title">Match teams</h2>
      <button type="button" onClick={() => dispatch({ type: 'add-team', name: nextTeamName(file.teams) })}>
        New team
      </button>
      {file.teams.length === 0 && <p>No teams yet.</p>}
      {file.teams.map((team, index) => (
        <TeamCard key={`${index}:${file.teams.length}`} {...props} team={team} index={index} />
      ))}
    </section>
  );
}
