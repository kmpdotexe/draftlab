import { toID, type ID } from './id';
import { isNatureName } from './natures';
import type { Problem } from './problem';
import type { PokemonSet, StatPoints } from './set';
import { validateSetAgainstSnapshot, type SetSnapshot } from './set-check';
import type { MatchTeam, RosterSets } from './team';
import type { SpeciesEntry, StatName } from './types';

export interface ParsedSet {
  /** null only when the block has no readable species. */
  set: PokemonSet | null;
  /** Parse problems first, then the legality problems from `validateSetAgainstSnapshot`. Paths start "paste[i]". */
  problems: Problem[];
  /** Things dropped or rewritten, in reading order. */
  notes: string[];
}

export interface PastedTeam {
  team: MatchTeam;
  sets: RosterSets;
  problems: Problem[];
}

/** The labels on an EVs line. Champions writes stat points there, 1:1. */
const STAT_LABELS: Record<string, StatName> = { hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe' };

/** Lines the set model has no place for: noted and ignored. */
const IGNORED_LABELS = new Set([
  'ivs',
  'shiny',
  'tera type',
  'gender',
  'happiness',
  'hidden power',
  'pokeball',
  'dynamax level',
  'gigantamax',
]);

/** Blocks of non-blank lines. A line starting with "===" separates blocks like a blank line does. */
function splitBlocks(text: string): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const raw of text.split(/\r\n|[\n\r]/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('===')) {
      if (current.length > 0) blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

/** `[Nickname (]Species[)] [(M|F)] [@ Item]`. */
function parseFirstLine(line: string): { species: string; item: string; notes: string[] } {
  const at = line.indexOf('@');
  const item = at === -1 ? '' : line.slice(at + 1).trim();
  let name = (at === -1 ? line : line.slice(0, at)).trim();
  const gender = /\s\(([MF])\)$/.exec(name);
  if (gender) name = name.slice(0, gender.index).trim();
  const nickname = /^(.*)\s\(([^()]+)\)$/.exec(name);
  if (nickname) name = nickname[2].trim();
  const notes: string[] = [];
  if (nickname) notes.push(`nickname "${nickname[1].trim()}"`);
  if (gender) notes.push(`gender ${gender[1]}`);
  return { species: name, item, notes };
}

/**
 * The Mega form a legal base species turns into when it holds that form's stone: exactly one legal species
 * that requires the item and shares the base species. Compared on `baseSpecies`, not the species name, so
 * Floette-Eternal holding Floettite finds Floette-Mega.
 */
function megaFormFor(speciesId: ID, itemId: ID, snapshot: SetSnapshot): SpeciesEntry | null {
  if (itemId === '' || !Object.hasOwn(snapshot.species, speciesId)) return null;
  const base = snapshot.species[speciesId];
  if (base.requiredItem) return null;
  const baseSpecies = toID(base.baseSpecies);
  const candidates = Object.values(snapshot.species).filter(
    (s) => s.id !== base.id && s.requiredItem && toID(s.requiredItem) === itemId && toID(s.baseSpecies) === baseSpecies,
  );
  return candidates.length === 1 ? candidates[0] : null;
}

/** "2 HP / 32 Atk / 32 Spe" -> points (stats not named are 0), or null if any part cannot be read. */
function parseEvs(value: string): StatPoints | null {
  const points: StatPoints = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const seen = new Set<StatName>();
  for (const part of value.split('/')) {
    const match = /^(\d+)\s*([a-z]+)$/i.exec(part.trim());
    if (!match) return null;
    const label = match[2].toLowerCase();
    if (!Object.hasOwn(STAT_LABELS, label)) return null;
    const stat = STAT_LABELS[label];
    if (seen.has(stat)) return null;
    seen.add(stat);
    points[stat] = Number(match[1]);
  }
  return points;
}

function parseBlock(blockLines: string[], index: number, snapshot: SetSnapshot): ParsedSet {
  const at = `paste[${index}]`;
  const first = parseFirstLine(blockLines[0]);
  const notes = [...first.notes];

  const speciesId = toID(first.species);
  if (speciesId === '') {
    return { set: null, problems: [{ path: at, message: 'no species found' }], notes };
  }

  const set: PokemonSet = { species: speciesId };
  const itemId = toID(first.item);
  if (itemId !== '') set.item = itemId;

  const mega = megaFormFor(speciesId, itemId, snapshot);
  if (mega !== null) {
    notes.push(`read "${snapshot.species[speciesId].name}" holding ${first.item} as ${mega.name}`);
    set.species = mega.id;
  }

  const parseProblems: Problem[] = [];
  const moves: ID[] = [];
  for (const line of blockLines.slice(1)) {
    const move = /^-\s*(.*)$/.exec(line);
    if (move) {
      const id = toID(move[1]);
      if (id === '') notes.push('empty move line skipped');
      else moves.push(id);
      continue;
    }

    const nature = /^([A-Za-z]+) Nature$/i.exec(line);
    if (nature) {
      const name = nature[1].charAt(0).toUpperCase() + nature[1].slice(1).toLowerCase();
      if (isNatureName(name)) set.nature = name;
      else parseProblems.push({ path: `${at}.nature`, message: `unknown nature "${nature[1]}"` });
      continue;
    }

    const labelled = /^([A-Za-z]+(?:\s+[A-Za-z]+)*)\s*:\s*(.*)$/.exec(line);
    if (!labelled) {
      notes.push(`unrecognized line: ${line}`);
      continue;
    }
    const label = labelled[1].toLowerCase().replace(/\s+/g, ' ');
    const value = labelled[2].trim();
    if (label === 'ability') {
      if (toID(value) !== '') set.ability = toID(value);
      else notes.push('empty Ability line skipped');
    } else if (label === 'level') {
      if (value === '') notes.push('empty Level line skipped');
      else if (Number(value) !== 50) notes.push(`Level ${value} ignored (Champions battles are level 50)`);
    } else if (label === 'evs') {
      const points = parseEvs(value);
      if (points !== null) {
        set.points = points;
      } else {
        delete set.points;
        parseProblems.push({ path: `${at}.points`, message: `could not read EVs "${value}"` });
      }
    } else if (IGNORED_LABELS.has(label)) {
      notes.push(line);
    } else {
      notes.push(`unrecognized line: ${line}`);
    }
  }
  if (moves.length > 0) set.moves = moves;

  return { set, problems: [...parseProblems, ...validateSetAgainstSnapshot(set, snapshot, at)], notes };
}

/**
 * Reads Showdown-format text into one `ParsedSet` per block. Lenient: names become ids as written and legality
 * problems are reported beside the set instead of rejecting it. Never throws; text that is not a string gives [].
 *
 * A base species holding a stone that one legal form of the same base species requires is read as that Mega
 * form, with a note (`read "Staraptor" holding Staraptite as Staraptor-Mega`). So a valid `{ species:
 * 'staraptor', item: 'staraptite' }` exported and re-imported comes back as `staraptormega`: each form is its
 * own pick, and the user could equally have written the Mega form.
 */
export function parsePaste(text: string, snapshot: SetSnapshot): ParsedSet[] {
  if (typeof text !== 'string') return [];
  return splitBlocks(text).map((blockLines, index) => parseBlock(blockLines, index, snapshot));
}

/**
 * Turns parsed blocks into a team: members are the species of the readable sets in paste order. A species that
 * appears in more than one block keeps its first block; the later ones are left out and reported. No size limit
 * (`validateTeam` applies it, and a pasted roster may be longer than a team). `problems` is every block's
 * problems in block order, followed by the repeated-species problems.
 */
export function pasteToTeam(parsed: ParsedSet[], name: string): PastedTeam {
  const members: ID[] = [];
  const sets: RosterSets = {};
  const problems: Problem[] = [];
  const repeats: Problem[] = [];
  const firstBlock = new Map<ID, number>();

  const list: unknown[] = Array.isArray(parsed) ? parsed : [];
  list.forEach((raw, index) => {
    if (typeof raw !== 'object' || raw === null) return;
    const entry = raw as Partial<ParsedSet>;
    if (Array.isArray(entry.problems)) problems.push(...entry.problems);
    const set = entry.set;
    if (typeof set !== 'object' || set === null || typeof set.species !== 'string') return;
    const id = set.species;
    const earlier = firstBlock.get(id);
    if (earlier !== undefined) {
      repeats.push({
        path: `paste[${index}]`,
        message: `"${id}" already appears in block ${earlier + 1} of this paste; this one is ignored`,
      });
      return;
    }
    firstBlock.set(id, index);
    members.push(id);
    sets[id] = set;
  });

  return { team: { name, members }, sets, problems: [...problems, ...repeats] };
}
