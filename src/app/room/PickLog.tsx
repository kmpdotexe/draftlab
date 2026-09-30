import type { DraftState } from '../../domain/derive';
import type { Names } from '../text/names';

/** Every recorded pick, newest first. */
export function PickLog({ draft, names }: { draft: DraftState; names: Names }) {
  return (
    <section className="pick-log" aria-labelledby="pick-log-title">
      <h2 id="pick-log-title">Picks</h2>
      {draft.picks.length === 0 ? (
        <p>No picks yet.</p>
      ) : (
        <ol reversed>
          {[...draft.picks].reverse().map((pick) => (
            <li key={pick.number}>
              <span className="pick-number">#{pick.number}</span> R{pick.round} · {draft.drafters[pick.drafter].name} —{' '}
              {names.species(pick.species)} ({pick.price})
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
