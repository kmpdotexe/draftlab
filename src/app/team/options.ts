import { toID, type ID } from '../../domain/id';
import { NATURES, NATURE_NAMES, isNatureName, type NatureName } from '../../domain/natures';
import { STAT_NAMES, type PokemonSet, type StatPoints } from '../../domain/set';
import type { ItemEntry, Snapshot, SpeciesEntry, StatName, UsageEntry } from '../../domain/types';

/** One choice in a picker: ladder choices carry their share of this species' teams; the rest have null. */
export interface Option {
  id: ID;
  name: string;
  share: number | null;
}

export type OptionSnapshot = Pick<Snapshot, 'species' | 'moves' | 'learnsets' | 'items' | 'usage'>;

export const STAT_LABELS: Readonly<Record<StatName, string>> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

function speciesOf(id: ID, snapshot: Pick<Snapshot, 'species'>): SpeciesEntry | null {
  return Object.hasOwn(snapshot.species, id) ? snapshot.species[id] : null;
}

function usageOf(id: ID, snapshot: Pick<Snapshot, 'usage'>): UsageEntry | null {
  return snapshot.usage !== null && Object.hasOwn(snapshot.usage.species, id) ? snapshot.usage.species[id] : null;
}

/** Ladder rows first (in share order, each candidate once), then the remaining candidates in the order given. */
function ladderFirst(candidates: Array<{ id: ID; name: string }>, rows: ReadonlyArray<[ID, number]>): Option[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const used = new Set<ID>();
  const out: Option[] = [];
  for (const [id, share] of rows) {
    const candidate = byId.get(id);
    if (candidate === undefined || used.has(id)) continue;
    used.add(id);
    out.push({ id, name: candidate.name, share });
  }
  for (const candidate of candidates) if (!used.has(candidate.id)) out.push({ ...candidate, share: null });
  return out;
}

/** "97.8%". */
export function shareText(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/** The species' abilities: ladder ones by share, then the others in the species' own order. */
export function abilityOptions(species: ID, snapshot: OptionSnapshot): Option[] {
  const entry = speciesOf(species, snapshot);
  if (entry === null) return [];
  const candidates = entry.abilities.map((name) => ({ id: toID(name), name }));
  return ladderFirst(candidates, usageOf(species, snapshot)?.abilities ?? []);
}

/** The item a species must hold (Mega forms and similar), or null. */
export function requiredItemOf(species: ID, snapshot: Pick<Snapshot, 'species'>): ID | null {
  const entry = speciesOf(species, snapshot);
  return entry !== null && entry.requiredItem ? toID(entry.requiredItem) : null;
}

/** Whether `species` may hold `item` under the item's holder restriction (the set check's holder rule, without the exemption for a form's own required stone: forms with a required item show it fixed, so the editor never offers a choice for them). */
function canHold(item: ItemEntry, species: SpeciesEntry): boolean {
  if (!item.usableBy) return true;
  return item.usableBy.includes(species.id) || item.usableBy.includes(toID(species.baseSpecies));
}

/** Legal items this species can hold: ladder ones by share, then the rest alphabetically. */
export function itemOptions(species: ID, snapshot: OptionSnapshot): Option[] {
  const entry = speciesOf(species, snapshot);
  if (entry === null) return [];
  const candidates = Object.values(snapshot.items)
    .filter((item) => canHold(item, entry))
    .map((item) => ({ id: item.id, name: item.name }))
    .sort(byName);
  return ladderFirst(candidates, usageOf(species, snapshot)?.items ?? []);
}

/** The species' learnset: ladder moves by share, then the rest alphabetically. */
export function moveOptions(species: ID, snapshot: OptionSnapshot): Option[] {
  const learnset = Object.hasOwn(snapshot.learnsets, species) ? snapshot.learnsets[species] : [];
  const candidates = learnset
    .filter((id) => Object.hasOwn(snapshot.moves, id))
    .map((id) => ({ id, name: snapshot.moves[id].name }))
    .sort(byName);
  return ladderFirst(candidates, usageOf(species, snapshot)?.moves ?? []);
}

/** "Adamant (+Atk, −SpA)", or "Hardy (neutral)". */
export function natureLabel(nature: NatureName): string {
  const { plus, minus } = NATURES[nature];
  return plus === null || minus === null ? `${nature} (neutral)` : `${nature} (+${STAT_LABELS[plus]}, −${STAT_LABELS[minus]})`;
}

/** Every nature in alphabetical order. */
export const NATURE_OPTIONS: readonly NatureName[] = [...NATURE_NAMES].sort();

/**
 * The ladder's most common set for a species: its top ability, its required item or else its top legal holdable
 * item, its top four learnable moves, and its top spread. Null when the species has no ladder usage.
 */
export function commonSet(species: ID, snapshot: OptionSnapshot): PokemonSet | null {
  const usage = usageOf(species, snapshot);
  if (usage === null || speciesOf(species, snapshot) === null) return null;
  const set: PokemonSet = { species };

  const ability = abilityOptions(species, snapshot).find((option) => option.share !== null);
  if (ability) set.ability = ability.id;

  const item = requiredItemOf(species, snapshot) ?? itemOptions(species, snapshot).find((option) => option.share !== null)?.id;
  if (item) set.item = item;

  const moves = moveOptions(species, snapshot)
    .filter((option) => option.share !== null)
    .slice(0, 4)
    .map((option) => option.id);
  if (moves.length > 0) set.moves = moves;

  const spread = usage.spreads.find((candidate) => isNatureName(candidate.nature));
  if (spread) {
    set.nature = spread.nature as NatureName;
    set.points = Object.fromEntries(STAT_NAMES.map((stat, i) => [stat, spread.points[i]])) as StatPoints;
  }
  return set;
}
