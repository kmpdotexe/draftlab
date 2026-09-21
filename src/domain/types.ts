import type { ID } from './id';

export type StatName = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type StatTable = Record<StatName, number>;

export interface SpeciesEntry {
  id: ID;
  name: string;
  num: number;
  types: string[];
  baseStats: StatTable;
  /** Ability names in slot order (including hidden ability). */
  abilities: string[];
  /** Showdown species tags, e.g. "Sub-Legendary". */
  tags: string[];
  baseSpecies: string;
  forme: string;
  requiredItem: string | null;
}

export interface MoveEntry {
  id: ID;
  name: string;
  type: string;
  category: 'Physical' | 'Special' | 'Status';
  basePower: number;
  accuracy: number | true;
  priority: number;
  target: string;
  /** Names of the truthy Showdown move flags, sorted. */
  flags: string[];
}

export interface ItemEntry {
  id: ID;
  /** Display name, e.g. "Sitrus Berry". */
  name: string;
  /** Species ids allowed to hold it (Mega stones and similar). Absent means anyone. */
  usableBy?: ID[];
}

export interface FormatRules {
  /** The format's `ruleset` verbatim, e.g. ["Flat Rules", "VGC Timer", "Open Team Sheets"]. */
  ruleset: string[];
  adjustLevel: number | null;
  minTeamSize: number;
  /** null when the format picks automatically ("Picked Team Size = Auto"). */
  pickedTeamSize: number | null;
}

/** Champions spreads: a nature plus six stat points (hp, atk, def, spa, spd, spe). */
export interface Spread {
  nature: string;
  points: [number, number, number, number, number, number];
  /** Share of this species' weighted appearances (0..1). */
  share: number;
}

export interface UsageEntry {
  id: ID;
  /** W: weighted appearance count (sum of the chaos "Abilities" values). */
  weight: number;
  /** Fraction of teams containing this species. */
  usage: number;
  /** [id, share of W]. */
  abilities: Array<[ID, number]>;
  items: Array<[ID, number]>;
  moves: Array<[ID, number]>;
  spreads: Spread[];
  /** [other species id, co-occurrence weight in W units]. Top entries only. */
  teammates: Array<[ID, number]>;
}

export interface UsageData {
  /** Weighted number of teams in the sample (sum of W divided by sum of usage). */
  teams: number;
  cutoff: number;
  battles: number;
  species: Record<ID, UsageEntry>;
}

export interface Snapshot {
  schemaVersion: 2;
  formatId: string;
  /** Legal species only. */
  species: Record<ID, SpeciesEntry>;
  /** Legal moves referenced by at least one legal learnset. */
  moves: Record<ID, MoveEntry>;
  /** Legal species id -> legal move ids. */
  learnsets: Record<ID, ID[]>;
  /** Legal items. */
  items: Record<ID, ItemEntry>;
  usage: UsageData | null;
}

export interface UsageMeta {
  statsFormatId: string;
  month: string;
  cutoff: number;
  battles: number;
  teams: number;
  url: string;
  /** True when statsFormatId is not the format's first-choice stats id. */
  isFallback: boolean;
}

export interface SnapshotMeta {
  schemaVersion: 2;
  formatId: string;
  label: string;
  generatedAt: string;
  showdown: { packageVersion: string; mod: string; formatName: string; rules: FormatRules };
  usage: UsageMeta | null;
  warnings: string[];
}
