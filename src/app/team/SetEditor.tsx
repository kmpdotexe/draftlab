import { useMemo } from 'react';
import type { ID } from '../../domain/id';
import { isNatureName } from '../../domain/natures';
import type { Problem } from '../../domain/problem';
import type { PokemonSet } from '../../domain/set';
import { computeSetStats } from '../../domain/stats';
import type { Snapshot } from '../../domain/types';
import type { Names } from '../text/names';
import { setProblemText } from '../text/problems';
import { OptionPicker } from './OptionPicker';
import { NATURE_OPTIONS, abilityOptions, commonSet, itemOptions, moveOptions, natureLabel, requiredItemOf, shareText } from './options';
import { StatPoints } from './StatPoints';

interface Props {
  species: ID;
  /** The saved set, or undefined when there is none yet. */
  set: PokemonSet | undefined;
  price: number | undefined;
  snapshot: Snapshot;
  names: Names;
  /** The set's problems from `validateSetAgainstSnapshot`. */
  problems: Problem[];
  onChange(set: PokemonSet): void;
  onClear(): void;
  onCopy(): void;
}

const MOVE_SLOTS = 4;

/** Drops the fields that are undefined, so a cleared choice leaves no key behind. */
const withoutEmpty = (set: PokemonSet): PokemonSet =>
  Object.fromEntries(Object.entries(set).filter(([, value]) => value !== undefined)) as unknown as PokemonSet;

/** The form for one roster Pokémon's set. Every change is handed to `onChange` at once. */
export function SetEditor({ species, set, price, snapshot, names, problems, onChange, onClear, onCopy }: Props) {
  const name = names.species(species);
  const current: PokemonSet = set ?? { species };
  const required = requiredItemOf(species, snapshot);
  const abilities = useMemo(() => abilityOptions(species, snapshot), [species, snapshot]);
  const items = useMemo(() => itemOptions(species, snapshot), [species, snapshot]);
  const moves = useMemo(() => moveOptions(species, snapshot), [species, snapshot]);
  const common = useMemo(() => commonSet(species, snapshot), [species, snapshot]);
  const stats = computeSetStats(current, snapshot);
  const empty = set === undefined || Object.keys(set).every((key) => key === 'species');
  const itemName = (id: ID) => (Object.hasOwn(snapshot.items, id) ? snapshot.items[id].name : id);

  const update = (patch: Partial<PokemonSet>) => {
    const next: PokemonSet = { ...current, ...patch, species };
    if (required !== null) next.item = required;
    onChange(withoutEmpty(next));
  };

  const setMove = (slot: number, id: ID | undefined) => {
    const list = [...(current.moves ?? [])];
    if (id === undefined) list.splice(slot, 1);
    else if (slot < list.length) list[slot] = id;
    else list.push(id);
    update({ moves: list.length > 0 ? list : undefined });
  };

  const abilityKnown = current.ability === undefined || abilities.some((option) => option.id === current.ability);

  return (
    <section className="set-editor" aria-labelledby="set-editor-title">
      <h2 id="set-editor-title">{name}</h2>
      <p className="types">
        {names.types(species).join(' / ')}
        {price !== undefined && ` · ${price} pts`}
      </p>
      <div className="row">
        {empty && common !== null && (
          <button type="button" onClick={() => onChange(common)}>
            Start from the common set
          </button>
        )}
        {empty && common === null && <p className="note">No ladder data for this Pokémon.</p>}
        {set !== undefined && (
          <>
            <button type="button" onClick={onCopy}>
              Copy set
            </button>
            <button type="button" className="danger" onClick={onClear}>
              Clear set
            </button>
          </>
        )}
      </div>

      <div className="field">
        <label htmlFor="set-ability">{name}'s ability</label>
        <select
          id="set-ability"
          value={current.ability ?? ''}
          onChange={(event) => update({ ability: event.target.value === '' ? undefined : event.target.value })}
        >
          {abilities.map((option) => (
            <option key={option.id} value={option.id}>
              {option.share === null ? option.name : `${option.name} (${shareText(option.share)})`}
            </option>
          ))}
          {!abilityKnown && <option value={current.ability}>{current.ability} (not its ability)</option>}
          <option value="">No ability chosen</option>
        </select>
      </div>

      {required !== null ? (
        <p className="field">
          Item: {itemName(required)} <span className="note">({name} must hold {itemName(required)})</span>
        </p>
      ) : (
        <OptionPicker
          label={`${name}'s item`}
          options={items}
          value={current.item}
          valueName={current.item === undefined ? '' : itemName(current.item)}
          noneLabel="No item"
          onChange={(id) => update({ item: id })}
        />
      )}

      <fieldset className="moves">
        <legend>Moves</legend>
        {Array.from({ length: MOVE_SLOTS }, (_, slot) => {
          const chosen = current.moves?.[slot];
          const others = new Set((current.moves ?? []).filter((_, i) => i !== slot));
          return (
            <OptionPicker
              key={slot}
              label={`Move ${slot + 1}`}
              options={moves.filter((option) => !others.has(option.id))}
              value={chosen}
              valueName={chosen === undefined ? '' : names.move(chosen)}
              noneLabel="No move"
              onChange={(id) => setMove(slot, id)}
            />
          );
        })}
      </fieldset>

      <div className="field">
        <label htmlFor="set-nature">Nature</label>
        <select
          id="set-nature"
          value={current.nature ?? ''}
          onChange={(event) => update({ nature: isNatureName(event.target.value) ? event.target.value : undefined })}
        >
          {NATURE_OPTIONS.map((nature) => (
            <option key={nature} value={nature}>
              {natureLabel(nature)}
            </option>
          ))}
          <option value="">No nature chosen</option>
        </select>
      </div>

      <StatPoints points={current.points} nature={current.nature} stats={stats} onChange={(points) => update({ points })} />

      <ul className="problems" aria-live="polite">
        {problems.map((problem) => (
          <li key={`${problem.path}:${problem.message}`}>{setProblemText(problem, current, snapshot)}</li>
        ))}
      </ul>
    </section>
  );
}
