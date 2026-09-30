import type { SignalName, SuggestResult, Suggestion } from '../../engine';
import type { Names } from '../text/names';
import { noteText, reasonText } from '../text/reasons';

export type UsageFilter = 'all' | 'niche' | 'staples';

/** The suggest() options for a filter: niche is at most 3% usage, staples at least 5%. */
export function filterOptions(filter: UsageFilter): { maxUsage?: number; minUsage?: number } {
  if (filter === 'niche') return { maxUsage: 0.03 };
  if (filter === 'staples') return { minUsage: 0.05 };
  return {};
}

const SIGNAL_LABELS: Record<SignalName, string> = {
  usageLift: 'Ladder pairing',
  typeSynergy: 'Type synergy',
  roleFit: 'Roles',
  comboFit: 'Combos',
};

const pct = (value: number): string => `${Math.round(value * 100)}%`;

function SuggestionCard({ suggestion, names, onPick }: { suggestion: Suggestion; names: Names; onPick?(): void }) {
  const name = names.species(suggestion.species);
  return (
    <li className="card">
      <div className="card-head">
        <h3>{name}</h3>
        <span className="types">{names.types(suggestion.species).join(' / ')}</span>
        <span className="price">{suggestion.price} pts</span>
      </div>
      <label className="fit">
        Relative fit <meter min={0} max={1} value={suggestion.score} /> {pct(suggestion.score)}
      </label>
      <ul className="reasons">
        {suggestion.reasons.map((reason, i) => (
          <li key={i}>{reasonText(reason, names)}</li>
        ))}
      </ul>
      <details>
        <summary>Signal breakdown</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Signal</th>
              <th scope="col">Score</th>
              <th scope="col">Rank</th>
              <th scope="col">Weight</th>
            </tr>
          </thead>
          <tbody>
            {suggestion.signals.map((signal) => (
              <tr key={signal.signal}>
                <th scope="row">{SIGNAL_LABELS[signal.signal]}</th>
                <td>{signal.score === null ? 'no data' : pct(signal.score)}</td>
                <td>{pct(signal.rank)}</td>
                <td>{pct(signal.weight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {onPick && (
        <button type="button" onClick={onPick}>
          Pick {name}
        </button>
      )}
    </li>
  );
}

interface Props {
  result: SuggestResult;
  names: Names;
  filter: UsageFilter;
  limit: number;
  onFilter(filter: UsageFilter): void;
  onLimit(limit: number): void;
  /** Present only when you are on the clock. */
  onPick?(species: string): void;
}

/** Suggestions for your next pick: the engine's notes as sentences, then one card per suggestion. */
export function Suggestions({ result, names, filter, limit, onFilter, onLimit, onPick }: Props) {
  return (
    <section className="suggestions" aria-labelledby="suggestions-title">
      <h2 id="suggestions-title">Suggestions for you</h2>
      <div className="row">
        <label>
          Show{' '}
          <select value={filter} onChange={(event) => onFilter(event.target.value as UsageFilter)}>
            <option value="all">All</option>
            <option value="niche">Niche (under 3% usage)</option>
            <option value="staples">Ladder staples (5% and up)</option>
          </select>
        </label>
        <label>
          Count{' '}
          <select value={limit} onChange={(event) => onLimit(Number(event.target.value))}>
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {result.notes.length > 0 && (
        <ul className="notes">
          {result.notes.map((note, i) => (
            <li key={i}>{noteText(note)}</li>
          ))}
        </ul>
      )}
      <ol className="cards">
        {result.suggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.species}
            suggestion={suggestion}
            names={names}
            onPick={onPick ? () => onPick(suggestion.species) : undefined}
          />
        ))}
      </ol>
    </section>
  );
}
