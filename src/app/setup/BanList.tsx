import { useMemo } from 'react';
import type { ID } from '../../domain/id';
import type { SpeciesEntry } from '../../domain/types';
import { OptionPicker } from '../team/OptionPicker';
import { speciesOptions } from './tiers';

interface Props {
  species: Readonly<Record<ID, SpeciesEntry>>;
  bans: readonly ID[];
  onBans(bans: ID[]): void;
}

/** The league's extra bans: search to add, × to remove. */
export function BanList({ species, bans, onBans }: Props) {
  const options = useMemo(() => speciesOptions(species, (id) => bans.includes(id)), [species, bans]);
  const nameOf = (id: ID) => (Object.hasOwn(species, id) ? species[id].name : id);

  return (
    <section className="ban-list" aria-labelledby="ban-list-title">
      <h3 id="ban-list-title">Banned in this league</h3>
      <p className="note">A banned Pokémon cannot be drafted even if it has a price.</p>
      <OptionPicker
        label="Ban a Pokémon"
        options={options}
        value={undefined}
        valueName=""
        noneLabel="Ban a Pokémon…"
        onChange={(id) => {
          if (id !== undefined) onBans([...bans, id]);
        }}
      />
      {bans.length === 0 ? (
        <p>No extra bans.</p>
      ) : (
        <ul className="tags">
          {[...bans]
            .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
            .map((id) => (
              <li key={id}>
                {nameOf(id)}{' '}
                <button type="button" aria-label={`Unban ${nameOf(id)}`} onClick={() => onBans(bans.filter((b) => b !== id))}>
                  ×
                </button>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
