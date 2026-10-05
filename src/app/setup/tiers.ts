import type { ID } from '../../domain/id';
import type { SpeciesEntry } from '../../domain/types';

/** All the Pokémon with the same price: a tier is a view of `league.prices`, not stored. */
export interface Tier {
  points: number;
  /** Species ids in display-name order. */
  members: ID[];
}

type SpeciesTable = Readonly<Record<ID, Pick<SpeciesEntry, 'name'>>>;

const byName = (species: SpeciesTable) => (a: ID, b: ID) => species[a].name.localeCompare(species[b].name);

/** The priced legal Pokémon grouped by points, highest first. Prices for ids that are not legal are ignored. */
export function tiersOf(prices: Readonly<Record<ID, number>>, species: SpeciesTable): Tier[] {
  const groups = new Map<number, ID[]>();
  for (const [id, points] of Object.entries(prices)) {
    if (!Object.hasOwn(species, id)) continue;
    groups.set(points, [...(groups.get(points) ?? []), id]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([points, members]) => ({ points, members: members.sort(byName(species)) }));
}

/** The legal Pokémon with no price (not in this draft), in display-name order. */
export function unpricedOf(prices: Readonly<Record<ID, number>>, species: SpeciesTable): ID[] {
  return Object.keys(species)
    .filter((id) => !Object.hasOwn(prices, id))
    .sort(byName(species));
}

/**
 * The points for a new, empty tier: 10 with no tiers; half the lowest tier (rounded down) when that is lower
 * than it; otherwise (the lowest tier is 0 or 1) the highest tier plus 5.
 */
export function nextTierPoints(points: readonly number[]): number {
  if (points.length === 0) return 10;
  const lowest = Math.min(...points);
  return lowest >= 2 ? Math.floor(lowest / 2) : Math.max(...points) + 5;
}

/** A price-list template: every legal Pokémon's display name with an empty points column, sorted by name. */
export function templateCsv(species: SpeciesTable): string {
  const names = Object.values(species)
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  return ['Pokemon,Points', ...names.map((name) => `${name},`)].join('\n') + '\n';
}
