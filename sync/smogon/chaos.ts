import { toID, type ID } from '../../src/domain/id';
import type { Spread, UsageData, UsageEntry } from '../../src/domain/types';

export interface RawChaosMon {
  usage: number;
  Abilities: Record<string, number>;
  Items: Record<string, number>;
  Moves: Record<string, number>;
  Spreads: Record<string, number>;
  Teammates: Record<string, number>;
}

export interface RawChaos {
  info: { metagame: string; cutoff: number; 'number of battles': number };
  data: Record<string, RawChaosMon>;
}

export interface PruneOptions {
  minUsage: number;
  topMoves: number;
  topItems: number;
  topAbilities: number;
  topSpreads: number;
  topTeammates: number;
}

export const DEFAULT_PRUNE: PruneOptions = {
  minUsage: 0.0005,
  topMoves: 12,
  topItems: 8,
  topAbilities: 3,
  topSpreads: 6,
  topTeammates: 80,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const COUNT_TABLES = ['Abilities', 'Items', 'Moves', 'Spreads', 'Teammates'] as const;

function assertChaosShape(json: unknown): asserts json is RawChaos {
  if (!isRecord(json) || !isRecord(json.info) || !isRecord(json.data)) {
    throw new Error('Smogon chaos file: expected top-level "info" and "data" objects');
  }
  const info = json.info;
  if (
    typeof info.metagame !== 'string' ||
    typeof info.cutoff !== 'number' ||
    typeof info['number of battles'] !== 'number'
  ) {
    throw new Error('Smogon chaos file: "info" must have string metagame and numeric cutoff and "number of battles"');
  }
  const names = Object.keys(json.data);
  if (names.length === 0) throw new Error('Smogon chaos file: "data" is empty');
  for (const name of names) {
    const mon = json.data[name];
    if (!isRecord(mon)) throw new Error(`Smogon chaos file: malformed entry for "${name}"`);
    if (!Number.isFinite(mon.usage)) {
      throw new Error(`Smogon chaos file: malformed entry for "${name}": usage is not a finite number`);
    }
    // Every count must be a real number: sumValues would otherwise concatenate strings or count null as 0.
    for (const table of COUNT_TABLES) {
      const counts = mon[table];
      if (!isRecord(counts)) {
        throw new Error(`Smogon chaos file: malformed entry for "${name}": ${table} is not an object`);
      }
      for (const [key, value] of Object.entries(counts)) {
        if (!Number.isFinite(value)) {
          throw new Error(
            `Smogon chaos file: malformed entry for "${name}": ${table}[${JSON.stringify(key)}] is not a finite number`,
          );
        }
      }
    }
  }
}

export function parseChaos(text: string): RawChaos {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`Smogon chaos file is not valid JSON: ${(error as Error).message}`);
  }
  assertChaosShape(json);
  return json;
}

const SPREAD_KEY = /^([A-Za-z]+):(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)$/;

export function parseSpread(key: string): { nature: string; points: Spread['points'] } | null {
  const match = SPREAD_KEY.exec(key);
  if (!match) return null;
  const points = match.slice(2, 8).map(Number) as Spread['points'];
  return { nature: match[1], points };
}

function sumValues(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, value) => total + value, 0);
}

function topShares(counts: Record<string, number>, weight: number, limit: number): Array<[ID, number]> {
  const merged = new Map<ID, number>();
  for (const [name, value] of Object.entries(counts)) {
    const id = toID(name);
    if (!id) continue; // Smogon uses "" for "no item"
    merged.set(id, (merged.get(id) ?? 0) + value);
  }
  return [...merged]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, value]) => [id, value / weight]);
}

function topSpreads(counts: Record<string, number>, weight: number, limit: number): Spread[] {
  const spreads: Spread[] = [];
  for (const [key, value] of Object.entries(counts)) {
    const parsed = parseSpread(key);
    if (parsed) spreads.push({ ...parsed, share: value / weight });
  }
  return spreads.sort((a, b) => b.share - a.share).slice(0, limit);
}

function topTeammates(counts: Record<string, number>, keep: Set<ID>, limit: number): Array<[ID, number]> {
  const merged = new Map<ID, number>();
  for (const [name, value] of Object.entries(counts)) {
    const id = toID(name);
    if (!keep.has(id)) continue;
    merged.set(id, (merged.get(id) ?? 0) + value);
  }
  return [...merged].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

export function pruneChaos(raw: RawChaos, options: PruneOptions = DEFAULT_PRUNE): UsageData {
  const mons = Object.entries(raw.data)
    .map(([name, mon]) => ({ id: toID(name), mon, weight: sumValues(mon.Abilities) }))
    .filter((m) => m.id && m.weight > 0);

  const totalWeight = mons.reduce((total, m) => total + m.weight, 0);
  const totalUsage = mons.reduce((total, m) => total + m.mon.usage, 0);
  const teams = totalUsage > 0 ? totalWeight / totalUsage : 0;

  const kept = mons.filter((m) => m.mon.usage >= options.minUsage);
  const keptIds = new Set(kept.map((m) => m.id));

  const species: Record<ID, UsageEntry> = {};
  for (const { id, mon, weight } of kept) {
    species[id] = {
      id,
      weight,
      usage: mon.usage,
      abilities: topShares(mon.Abilities, weight, options.topAbilities),
      items: topShares(mon.Items, weight, options.topItems),
      moves: topShares(mon.Moves, weight, options.topMoves),
      spreads: topSpreads(mon.Spreads, weight, options.topSpreads),
      teammates: topTeammates(mon.Teammates, keptIds, options.topTeammates),
    };
  }

  return {
    teams,
    cutoff: raw.info.cutoff,
    battles: raw.info['number of battles'],
    species,
  };
}
