import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { toID, type ID } from '../../src/domain/id';
import type { FormatRules, ItemEntry, MoveEntry, SpeciesEntry, StatTable } from '../../src/domain/types';

// The slice of the pokemon-showdown API this loader relies on. Kept local so the rest of the
// codebase never depends on the package's own (large) type surface.
interface SdSpecies {
  exists: boolean;
  id: string;
  name: string;
  num: number;
  types: string[];
  baseStats: StatTable;
  abilities: Record<string, string>;
  tags: string[];
  isNonstandard?: string | null;
  baseSpecies: string;
  forme: string;
  requiredItem?: string;
  prevo: string;
  /** Set on battle-only formes (e.g. megas): the forme they change from. */
  changesFrom?: string;
  battleOnly?: string | string[];
}
interface SdMove {
  exists: boolean;
  id: string;
  name: string;
  type: string;
  category: MoveEntry['category'];
  basePower: number;
  accuracy: number | true;
  priority: number;
  target: string;
  flags: Record<string, number | undefined>;
  isNonstandard?: string | null;
}
interface SdItem {
  exists: boolean;
  id: string;
  name: string;
  isNonstandard?: string | null;
  /** Species names allowed to hold the item (Mega stones and similar). */
  itemUser?: string[];
}
interface SdFormat {
  exists: boolean;
  name: string;
  mod: string;
  ruleset: string[];
}
interface SdRuleTable {
  adjustLevel?: number | null;
  minTeamSize: number;
  pickedTeamSize?: number | null;
  isBannedSpecies(species: SdSpecies): boolean;
}
interface SdDex {
  species: {
    all(): SdSpecies[];
    get(name: string): SdSpecies;
    getLearnsetData(id: string): { learnset?: Record<string, string[]> };
  };
  moves: { get(name: string): SdMove };
  items: { all(): SdItem[] };
  formats: { get(name: string): SdFormat; getRuleTable(format: SdFormat): SdRuleTable };
  mod(name: string): SdDex;
}

export interface ShowdownFormatData {
  formatName: string;
  mod: string;
  packageVersion: string;
  rules: FormatRules;
  species: Record<ID, SpeciesEntry>;
  moves: Record<ID, MoveEntry>;
  learnsets: Record<ID, ID[]>;
  items: Record<ID, ItemEntry>;
  /** Non-fatal findings worth surfacing in meta.json. */
  warnings: string[];
}

function loadDex(): SdDex {
  // The package is CommonJS; require() avoids ESM named-export interop problems.
  const req = createRequire(import.meta.url);
  return (req('pokemon-showdown') as { Dex: SdDex }).Dex;
}

function packageVersion(): string {
  const url = new URL('../../node_modules/pokemon-showdown/package.json', import.meta.url);
  return (JSON.parse(readFileSync(url, 'utf8')) as { version: string }).version;
}

/** The species a forme without its own learnset takes its moves from, if it is a forme of another species. */
function inheritsFrom(species: SdSpecies): string | undefined {
  if (species.changesFrom) return species.changesFrom;
  const battleOnly = Array.isArray(species.battleOnly) ? species.battleOnly[0] : species.battleOnly;
  if (battleOnly) return battleOnly;
  return species.baseSpecies !== species.name ? species.baseSpecies : undefined;
}

/**
 * Moves a species can learn, following pre-evolutions and, for formes without their own learnset data,
 * the species they are a battle-only forme of. That is `changesFrom`/`battleOnly`, not `baseSpecies`:
 * Mega Floette must use Floette-Eternal's moves, but its base species Floette is non-standard here.
 */
function learnsetOf(dex: SdDex, start: SdSpecies): Set<ID> {
  const moves = new Set<ID>();
  const seen = new Set<string>();
  let current: SdSpecies | undefined = start;
  while (current && current.exists && !seen.has(current.id)) {
    seen.add(current.id);
    const data = dex.species.getLearnsetData(current.id);
    for (const [moveId, sources] of Object.entries(data.learnset ?? {})) {
      if (sources.length > 0) moves.add(moveId);
    }
    const formeSource = data.learnset ? undefined : inheritsFrom(current);
    if (formeSource) {
      current = dex.species.get(formeSource);
    } else {
      current = current.prevo ? dex.species.get(current.prevo) : undefined;
    }
  }
  return moves;
}

export function loadShowdownFormat(formatId: string): ShowdownFormatData {
  const root = loadDex();
  const format = root.formats.get(formatId);
  if (!format.exists) {
    throw new Error(`Showdown has no format "${formatId}" (pokemon-showdown ${packageVersion()})`);
  }
  const dex = root.mod(format.mod);
  const ruleTable = dex.formats.getRuleTable(format);

  const species: Record<ID, SpeciesEntry> = {};
  const legalSpecies: SdSpecies[] = [];
  for (const s of dex.species.all()) {
    if (!s.exists || s.isNonstandard || ruleTable.isBannedSpecies(s)) continue;
    legalSpecies.push(s);
    species[s.id] = {
      id: s.id,
      name: s.name,
      num: s.num,
      types: [...s.types],
      baseStats: { ...s.baseStats },
      abilities: Object.values(s.abilities),
      tags: [...s.tags],
      baseSpecies: s.baseSpecies,
      forme: s.forme,
      requiredItem: s.requiredItem ?? null,
    };
  }

  const moves: Record<ID, MoveEntry> = {};
  const learnsets: Record<ID, ID[]> = {};
  for (const s of legalSpecies) {
    const legalMoves: ID[] = [];
    for (const moveId of learnsetOf(dex, s)) {
      const m = dex.moves.get(moveId);
      if (!m.exists || m.isNonstandard) continue;
      legalMoves.push(m.id);
      moves[m.id] ??= {
        id: m.id,
        name: m.name,
        type: m.type,
        category: m.category,
        basePower: m.basePower,
        accuracy: m.accuracy,
        priority: m.priority,
        target: m.target,
        flags: Object.entries(m.flags)
          .filter(([, value]) => value)
          .map(([flag]) => flag)
          .sort(),
      };
    }
    learnsets[s.id] = legalMoves.sort();
  }

  // Legal items. A restricted item (a Mega stone) keeps only the species that are legal in this format.
  const items: Record<ID, ItemEntry> = {};
  const droppedRestrictions: Array<[itemId: string, count: number]> = [];
  for (const item of dex.items.all()) {
    if (!item.exists || item.isNonstandard) continue;
    if (!item.itemUser) {
      items[item.id] = { id: item.id, name: item.name };
      continue;
    }
    const usableBy = item.itemUser.map((name) => toID(name)).filter((id) => Object.hasOwn(species, id));
    const dropped = item.itemUser.length - usableBy.length;
    if (dropped > 0) droppedRestrictions.push([item.id, dropped]);
    if (usableBy.length > 0) items[item.id] = { id: item.id, name: item.name, usableBy };
  }

  const warnings: string[] = [];
  if (droppedRestrictions.length > 0) {
    const total = droppedRestrictions.reduce((sum, [, count]) => sum + count, 0);
    const detail = droppedRestrictions.map(([id, count]) => `${id}: ${count}`).join(', ');
    warnings.push(`Dropped ${total} restricted-species entries that are not legal in ${formatId} (${detail})`);
  }
  for (const s of legalSpecies) {
    if (s.requiredItem && !Object.hasOwn(items, toID(s.requiredItem))) {
      warnings.push(`${s.id} requires "${s.requiredItem}", which is not a legal item in ${formatId}`);
    }
  }

  return {
    formatName: format.name,
    mod: format.mod,
    packageVersion: packageVersion(),
    rules: {
      ruleset: [...format.ruleset],
      adjustLevel: ruleTable.adjustLevel ?? null,
      minTeamSize: ruleTable.minTeamSize,
      pickedTeamSize: ruleTable.pickedTeamSize ?? null,
    },
    species,
    moves,
    learnsets,
    items,
    warnings,
  };
}
