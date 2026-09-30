import { useId, useState } from 'react';
import type { DraftState } from '../../domain/derive';
import type { LeagueConfig } from '../../domain/league';
import type { Names } from '../text/names';

interface Props {
  league: LeagueConfig;
  draft: DraftState;
  names: Names;
  onPick(species: string): void;
}

const MAX_OPTIONS = 8;

/**
 * Records the next pick for whoever is on the clock: a combobox over the pool by display name. Species the
 * on-the-clock drafter cannot afford are listed but cannot be chosen, with "costs N, has M".
 */
export function PickEntry({ league, draft, names, onPick }: Props) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const clock = draft.onTheClock;

  if (clock === null) {
    return (
      <section className="pick-entry" aria-labelledby="pick-entry-title">
        <h2 id="pick-entry-title">Record a pick</h2>
        <p>The draft is complete.</p>
      </section>
    );
  }

  const remaining = draft.drafters[clock.drafter].remaining;
  const needle = query.trim().toLowerCase();
  const options =
    needle === ''
      ? []
      : draft.pool
          .filter((id) => names.species(id).toLowerCase().includes(needle))
          .sort((a, b) => names.species(a).localeCompare(names.species(b)))
          .slice(0, MAX_OPTIONS)
          .map((id) => ({ id, price: league.prices[id], affordable: league.prices[id] <= remaining }));
  const current = Math.min(active, Math.max(options.length - 1, 0));

  const choose = (index: number) => {
    const option = options[index];
    if (!option || !option.affordable) return;
    onPick(option.id);
    setQuery('');
    setActive(0);
  };

  return (
    <section className="pick-entry" aria-labelledby="pick-entry-title">
      <h2 id="pick-entry-title">Record a pick</h2>
      <label htmlFor={`${listId}-input`}>
        Pick for {league.drafters[clock.drafter]} ({remaining} points left)
      </label>
      <input
        id={`${listId}-input`}
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={options.length > 0 ? `${listId}-${current}` : undefined}
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive(Math.min(current + 1, options.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(Math.max(current - 1, 0));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            choose(current);
          } else if (event.key === 'Escape') {
            setQuery('');
          }
        }}
      />
      {options.length > 0 && (
        <ul id={listId} role="listbox" className="options">
          {options.map((option, index) => (
            <li
              key={option.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === current}
              aria-disabled={!option.affordable}
              className={option.affordable ? '' : 'unaffordable'}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              {names.species(option.id)} — {option.price} pts
              {!option.affordable && ` (costs ${option.price}, has ${remaining})`}
            </li>
          ))}
        </ul>
      )}
      {needle !== '' && options.length === 0 && <p>No available Pokémon matches "{query}".</p>}
    </section>
  );
}
