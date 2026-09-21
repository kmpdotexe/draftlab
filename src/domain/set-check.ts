import { toID } from './id';
import type { Problem } from './problem';
import { validateSet, type PokemonSet } from './set';
import type { Snapshot } from './types';

/** The parts of the snapshot needed to check a set. */
export type SetSnapshot = Pick<Snapshot, 'formatId' | 'species' | 'moves' | 'learnsets' | 'items'>;

/**
 * Whether a set is legal as written in the snapshot's format. A problem means "not legal as written",
 * not "incomplete": a species-only set for an ordinary species has none. Structural problems (from
 * `validateSet`) are returned alone; the snapshot rules only run on a structurally valid set. Never throws.
 */
export function validateSetAgainstSnapshot(set: PokemonSet, snapshot: SetSnapshot, path: string): Problem[] {
  const structural = validateSet(set, path);
  if (structural.length > 0) return structural;

  const problems: Problem[] = [];
  const add = (sub: string, message: string) => problems.push({ path: `${path}${sub}`, message });

  if (!Object.hasOwn(snapshot.species, set.species)) {
    add('.species', `"${set.species}" is not legal in ${snapshot.formatId}`);
    return problems;
  }
  const species = snapshot.species[set.species];

  if (set.ability !== undefined && !species.abilities.some((name) => toID(name) === set.ability)) {
    add('.ability', `"${set.ability}" is not an ability of ${species.name} (${species.abilities.join(', ')})`);
  }

  const learnset = new Set(Object.hasOwn(snapshot.learnsets, set.species) ? snapshot.learnsets[set.species] : []);
  (set.moves ?? []).forEach((move, i) => {
    if (!learnset.has(move)) {
      add(`.moves[${i}]`, `"${move}" is not a legal move for ${species.name} in ${snapshot.formatId}`);
    }
  });

  const requiredItem = species.requiredItem ? toID(species.requiredItem) : null;

  if (set.item !== undefined) {
    if (!Object.hasOwn(snapshot.items, set.item)) {
      add('.item', `"${set.item}" is not a legal item in ${snapshot.formatId}`);
    } else {
      const item = snapshot.items[set.item];
      // A Mega form's own stone is exempt: its restriction can name the form the Mega changes from
      // (Floettite lists Floette-Eternal) instead of the base species.
      const isOwnStone = requiredItem !== null && item.id === requiredItem;
      if (
        item.usableBy &&
        !isOwnStone &&
        !item.usableBy.includes(set.species) &&
        !item.usableBy.includes(toID(species.baseSpecies))
      ) {
        const names = item.usableBy.map((id) => (Object.hasOwn(snapshot.species, id) ? snapshot.species[id].name : id));
        add('.item', `"${item.name}" can only be held by ${names.join(', ')}`);
      }
    }
  }

  if (requiredItem !== null && set.item !== requiredItem) {
    add('.item', `${species.name} must hold ${species.requiredItem}`);
  }

  return problems;
}
