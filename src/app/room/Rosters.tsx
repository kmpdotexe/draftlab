import type { DraftState } from '../../domain/derive';
import type { LeagueConfig } from '../../domain/league';
import type { Names } from '../text/names';

/** Every drafter's roster, points left and open slots; yours is marked. */
export function Rosters({ league, draft, names }: { league: LeagueConfig; draft: DraftState; names: Names }) {
  return (
    <section className="rosters" aria-labelledby="rosters-title">
      <h2 id="rosters-title">Rosters</h2>
      {draft.drafters.map((drafter, index) => (
        <article key={drafter.name} className={index === league.me ? 'roster mine' : 'roster'} aria-label={`${drafter.name}'s roster`}>
          <h3>
            {drafter.name}
            {index === league.me && ' (you)'}
          </h3>
          <p>
            {drafter.remaining} of {league.budget} points left · {drafter.openSlots} open {drafter.openSlots === 1 ? 'slot' : 'slots'}
          </p>
          {drafter.cannotFillRoster && drafter.openSlots > 0 && <p className="warning">Can't fill the roster with the points left.</p>}
          <ul>
            {drafter.roster.map((id) => (
              <li key={id}>
                {names.species(id)} ({league.prices[id] ?? 0})
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
