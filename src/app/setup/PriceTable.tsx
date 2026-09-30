import { useMemo, useState } from 'react';
import type { ID } from '../../domain/id';
import type { Snapshot } from '../../domain/types';

interface Props {
  snapshot: Pick<Snapshot, 'species'>;
  prices: Record<ID, number>;
  bans: readonly ID[];
  onPrice(id: ID, price: number | null): void;
  onBan(id: ID, banned: boolean): void;
}

/** Every legal species with a price box (blank = no price = unavailable) and a Ban checkbox; searchable. */
export function PriceTable({ snapshot, prices, bans, onPrice, onBan }: Props) {
  const [search, setSearch] = useState('');
  const [pricedOnly, setPricedOnly] = useState(false);
  const all = useMemo(
    () => Object.values(snapshot.species).sort((a, b) => a.name.localeCompare(b.name)),
    [snapshot],
  );
  const needle = search.trim().toLowerCase();
  const rows = all.filter(
    (species) =>
      (needle === '' || species.name.toLowerCase().includes(needle)) &&
      (!pricedOnly || Object.hasOwn(prices, species.id)),
  );
  const pricedCount = all.filter((species) => Object.hasOwn(prices, species.id)).length;

  return (
    <section className="price-table" aria-labelledby="price-table-title">
      <h3 id="price-table-title">Prices and bans</h3>
      <div className="row">
        <label>
          Search <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label>
          <input type="checkbox" checked={pricedOnly} onChange={(event) => setPricedOnly(event.target.checked)} /> Priced only
        </label>
        <span>
          {pricedCount} of {all.length} priced
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Pokémon</th>
              <th scope="col">Types</th>
              <th scope="col">Points</th>
              <th scope="col">Ban</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((species) => (
              <tr key={species.id}>
                <th scope="row">{species.name}</th>
                <td>{species.types.join(' / ')}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    aria-label={`Points for ${species.name}`}
                    value={Object.hasOwn(prices, species.id) ? prices[species.id] : ''}
                    onChange={(event) => onPrice(species.id, event.target.value === '' ? null : Number(event.target.value))}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Ban ${species.name}`}
                    checked={bans.includes(species.id)}
                    onChange={(event) => onBan(species.id, event.target.checked)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
