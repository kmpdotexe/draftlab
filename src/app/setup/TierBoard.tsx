import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ID } from '../../domain/id';
import type { SpeciesEntry } from '../../domain/types';
import { OptionPicker } from '../team/OptionPicker';
import type { Option } from '../team/options';
import { nextTierPoints, parseWholePoints, speciesOptions, tiersOf, unpricedOf, type Tier } from './tiers';

type SpeciesTable = Readonly<Record<ID, SpeciesEntry>>;

interface Props {
  species: SpeciesTable;
  prices: Readonly<Record<ID, number>>;
  bans: readonly ID[];
  /** Drafter name per drafted species, to explain refusals before they happen. */
  draftedBy: Readonly<Record<ID, string>>;
  /** Tiers with no Pokémon yet (view state, kept by the setup view). */
  emptyTiers: readonly number[];
  onEmptyTiers(points: number[]): void;
  onPrices(prices: Record<ID, number>): void;
  confirm(message: string): boolean;
}

const POINTS_HINT = 'Whole points, 0 or more';

const pokemon = (n: number) => `${n} Pokémon`;

interface CardProps {
  tier: Tier;
  props: Props;
  options: readonly Option[];
  taken: readonly number[];
  note(text: string): void;
  focusPoints: number | null;
  setFocusPoints(points: number | null): void;
}

function TierCard({ tier, props, options, taken, note, focusPoints, setFocusPoints }: CardProps) {
  const { species, prices, bans, draftedBy, emptyTiers, onEmptyTiers, onPrices, confirm } = props;
  const [draft, setDraft] = useState<string | null>(null);
  const title = `${tier.points}-point tier`;
  const hintId = `tier-hint-${useId()}`;
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusPoints === tier.points) {
      inputRef.current?.focus();
      setFocusPoints(null);
    }
  }, [focusPoints, tier.points, setFocusPoints]);
  const others = useMemo(() => options.filter((option) => prices[option.id] !== tier.points), [options, prices, tier.points]);

  const commitPoints = () => {
    if (draft === null) return;
    const points = parseWholePoints(draft);
    if (points === null) return;
    setDraft(null);
    if (points === tier.points) return;
    setFocusPoints(points);
    const merging = taken.includes(points);
    const rest = emptyTiers.filter((p) => p !== tier.points && !(merging && tier.members.length > 0 && p === points));
    onEmptyTiers(tier.members.length === 0 && !merging ? [...rest, points] : rest);
    if (tier.members.length > 0) {
      const next = { ...prices };
      for (const id of tier.members) next[id] = points;
      onPrices(next);
    }
    if (merging) note(`Merged into the ${points}-point tier.`);
  };

  const remove = () => {
    if (tier.members.length > 0 && !confirm(`Remove the ${title}? Its ${pokemon(tier.members.length)} will not be in this draft.`)) return;
    onEmptyTiers(emptyTiers.filter((p) => p !== tier.points));
    if (tier.members.length > 0) {
      const next = { ...prices };
      for (const id of tier.members) delete next[id];
      onPrices(next);
    }
  };

  const add = (id: ID | undefined) => {
    if (id === undefined) return;
    const before = Object.hasOwn(prices, id) ? prices[id] : undefined;
    onPrices({ ...prices, [id]: tier.points });
    onEmptyTiers(emptyTiers.filter((p) => p !== tier.points));
    if (before !== undefined && before !== tier.points) note(`${species[id].name} moved from ${before} to ${tier.points} points.`);
  };

  return (
    <section className="tier" role="group" aria-label={`${title}, ${pokemon(tier.members.length)}`}>
      <div className="tier-head">
        <h4>
          {tier.points} points · {tier.members.length === 1 ? '1 Pokémon' : pokemon(tier.members.length)}
        </h4>
        <label>
          Points for this tier{' '}
          <input
            ref={inputRef}
            type="number"
            min={0}
            step={1}
            value={draft ?? String(tier.points)}
            onChange={(event) => setDraft(event.target.value)}
            aria-describedby={hintId}
            aria-invalid={draft !== null && parseWholePoints(draft) === null}
            onBlur={commitPoints}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitPoints();
              }
            }}
          />
        </label>
        <span id={hintId} className="field-error" aria-live="polite">{draft !== null && parseWholePoints(draft) === null ? POINTS_HINT : ''}</span>
        <button type="button" className="danger" onMouseDown={(event) => event.preventDefault()} onClick={remove}>
          Remove tier
        </button>
      </div>
      <ul className="tags">
        {tier.members.map((id) => (
          <li key={id}>
            {species[id].name}
            {draftedBy[id] !== undefined && <span className="tag-note"> · drafted by {draftedBy[id]}</span>}
            {bans.includes(id) && <span className="tag-note"> · banned</span>}{' '}
            <button
              type="button"
              aria-label={`Remove ${species[id].name} from the ${title}`}
              onClick={() => {
                const next = { ...prices };
                delete next[id];
                onPrices(next);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <OptionPicker label={`Add a Pokémon to the ${title}`} options={others} value={undefined} valueName="" noneLabel="Add a Pokémon…" onChange={add} />
    </section>
  );
}

/**
 * The prices as tiers (Pokémon grouped by points), with the unpriced Pokémon in a collapsed group. Memoised, and
 * the unpriced list is only rendered while open: typing in the league fields must not re-render ~350 rows.
 */
export const TierBoard = memo(function TierBoard(props: Props) {
  const { species, prices, emptyTiers, onEmptyTiers, onPrices } = props;
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [focusPoints, setFocusPoints] = useState<number | null>(null);
  const options = useMemo<Option[]>(() => speciesOptions(species), [species]);
  const priced = tiersOf(prices, species);
  const tiers: Tier[] = [...priced, ...emptyTiers.filter((p) => !priced.some((t) => t.points === p)).map((points) => ({ points, members: [] }))].sort(
    (a, b) => b.points - a.points,
  );
  const unpriced = unpricedOf(prices, species);
  const needle = search.trim().toLowerCase();
  const shown = unpriced.filter((id) => needle === '' || species[id].name.toLowerCase().includes(needle));

  return (
    <section className="tier-board" aria-labelledby="tier-board-title">
      <h3 id="tier-board-title">Prices</h3>
      <p aria-live="polite" className="note">
        {message}
      </p>
      {tiers.map((tier) => (
        <TierCard key={tier.points} tier={tier} props={props} options={options} taken={tiers.map((t) => t.points)} note={setMessage} focusPoints={focusPoints} setFocusPoints={setFocusPoints} />
      ))}
      <button type="button" onClick={() => onEmptyTiers([...emptyTiers, nextTierPoints(tiers.map((t) => t.points))])}>
        Add tier
      </button>
      <details className="unpriced" onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>Not in this draft ({unpriced.length})</summary>
        <label>
          Search Pokémon not in this draft <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        {!open ? null : tiers.length === 0 ? (
          <p>Add a tier first.</p>
        ) : (
          <ul>
            {shown.map((id) => (
              <li key={id}>
                {species[id].name} <span className="types">{species[id].types.join(' / ')}</span>{' '}
                <select
                  aria-label={`Add ${species[id].name} to a tier`}
                  value=""
                  onChange={(event) => {
                    if (event.target.value === '') return;
                    const points = Number(event.target.value);
                    onPrices({ ...prices, [id]: points });
                    onEmptyTiers(emptyTiers.filter((p) => p !== points));
                  }}
                >
                  <option value="">Add to tier…</option>
                  {tiers.map((tier) => (
                    <option key={tier.points} value={tier.points}>
                      {tier.points} points
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
});
