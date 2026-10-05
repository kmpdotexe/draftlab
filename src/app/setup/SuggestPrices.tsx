import { useState } from 'react';
import type { ID } from '../../domain/id';
import type { Snapshot } from '../../domain/types';
import { DEFAULT_SUGGESTION, suggestedPrices, suggestionSummary, type PriceSuggestion } from './suggest-prices';

interface Props {
  snapshot: Pick<Snapshot, 'species' | 'usage'>;
  /** Whether prices are set already (Apply then asks before replacing them). */
  hasPrices: boolean;
  confirm(message: string): boolean;
  onApply(prices: Record<ID, number>): void;
}

const whole = (text: string): number | null => (/^\s*\d+\s*$/.test(text) ? Number(text) : null);

/** A starting price list from ladder usage: editable tier sizes and points, a preview, then Apply. */
export function SuggestPrices({ snapshot, hasPrices, confirm, onApply }: Props) {
  const [rows, setRows] = useState(DEFAULT_SUGGESTION.tiers.map((tier) => ({ count: String(tier.count), points: String(tier.points) })));
  const [rest, setRest] = useState(String(DEFAULT_SUGGESTION.restPoints));
  const [leaveOut, setLeaveOut] = useState(false);

  if (snapshot.usage === null) {
    return (
      <section className="suggest-prices" aria-labelledby="suggest-title">
        <h3 id="suggest-title">Suggested prices</h3>
        <p>No ladder data to suggest from.</p>
      </section>
    );
  }

  const tiers = rows.map((row) => ({ count: whole(row.count), points: whole(row.points) }));
  const restPoints = leaveOut ? null : whole(rest);
  const valid = tiers.every((tier) => tier.count !== null && tier.points !== null) && (leaveOut || restPoints !== null);
  const suggestion: PriceSuggestion | null = valid
    ? { tiers: tiers.map((tier) => ({ count: tier.count!, points: tier.points! })), restPoints }
    : null;
  const summary = suggestion === null ? null : suggestionSummary(snapshot, suggestion);
  const update = (index: number, field: 'count' | 'points', value: string) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  return (
    <section className="suggest-prices" aria-labelledby="suggest-title">
      <h3 id="suggest-title">Suggested prices</h3>
      <p className="note">Prices from how often each Pokémon is used on the ladder: the most used cost the most.</p>
      {rows.map((row, index) => (
        <div className="row" key={index}>
          <label>
            Top <input type="number" min={0} aria-label={`Tier ${index + 1}: how many`} value={row.count} onChange={(event) => update(index, 'count', event.target.value)} />
          </label>
          <label>
            at <input type="number" min={0} aria-label={`Tier ${index + 1}: points`} value={row.points} onChange={(event) => update(index, 'points', event.target.value)} /> points
          </label>
        </div>
      ))}
      <div className="row">
        <label>
          Everyone else with ladder use at{' '}
          <input type="number" min={0} aria-label="Everyone else: points" value={rest} disabled={leaveOut} onChange={(event) => setRest(event.target.value)} /> points
        </label>
        <label>
          <input type="checkbox" checked={leaveOut} onChange={(event) => setLeaveOut(event.target.checked)} /> leave them out
        </label>
      </div>
      <p aria-live="polite">
        {summary === null
          ? 'Whole numbers only, 0 or more.'
          : `${summary.tiered} Pokémon in ${summary.tierCount} tiers` +
            (summary.rest > 0 ? `, ${summary.rest} more at ${restPoints} point${restPoints === 1 ? '' : 's'}` : '') +
            `; ${summary.left} ${leaveOut ? 'others' : 'without ladder use'} are left out.`}
      </p>
      <button
        type="button"
        disabled={suggestion === null}
        onClick={() => {
          if (suggestion === null) return;
          if (hasPrices && !confirm('Replace the current prices with the suggested ones?')) return;
          onApply(suggestedPrices(snapshot, suggestion));
        }}
      >
        Apply
      </button>
    </section>
  );
}
