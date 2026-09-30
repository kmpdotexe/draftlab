import type { ID } from '../../domain/id';
import type { Snapshot } from '../../domain/types';
import type { ComboId, RoleId } from '../../engine';

/** Display names from the snapshot. An id the snapshot does not have is shown as it is. */
export interface Names {
  species(id: ID): string;
  move(id: ID): string;
  types(id: ID): string[];
}

export function makeNames(snapshot: Pick<Snapshot, 'species' | 'moves'>): Names {
  return {
    species: (id) => (Object.hasOwn(snapshot.species, id) ? snapshot.species[id].name : id),
    move: (id) => (Object.hasOwn(snapshot.moves, id) ? snapshot.moves[id].name : id),
    types: (id) => (Object.hasOwn(snapshot.species, id) ? [...snapshot.species[id].types] : []),
  };
}

export const ROLE_LABELS: Readonly<Record<RoleId, string>> = {
  fakeOut: 'Fake Out',
  redirection: 'redirection',
  speedControl: 'speed control',
  intimidate: 'Intimidate',
  weatherTerrain: 'weather or terrain',
  pivot: 'pivoting',
  screens: 'screens',
  support: 'support moves',
  priority: 'priority moves',
  disruption: 'disruption',
};

export const COMBO_LABELS: Readonly<Record<ComboId, string>> = {
  trickRoom: 'Trick Room',
  redirectSetup: 'redirection and setup',
  rain: 'rain',
  sun: 'sun',
  sand: 'sand',
  snow: 'snow',
  electricTerrain: 'Electric Terrain',
  helpingHand: 'Helping Hand and a spread attack',
};

/** "A", "A and B", "A, B and C" (or "or" instead of "and"). An empty list gives "". */
export function joinList(items: readonly string[], conjunction: 'and' | 'or' = 'and'): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}
