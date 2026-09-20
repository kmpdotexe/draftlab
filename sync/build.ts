import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Snapshot, SnapshotMeta, UsageData } from '../src/domain/types';
import type { FormatConfig } from './formats.config';
import type { ShowdownFormatData } from './showdown/source';
import { DEFAULT_PRUNE, parseChaos, pruneChaos } from './smogon/chaos';
import type { ChaosSource } from './smogon/fetch';

export interface Limits {
  minSpecies: number;
  minMoves: number;
}

export const DEFAULT_LIMITS: Limits = { minSpecies: 150, minMoves: 100 };

export interface BuildInputs {
  config: FormatConfig;
  showdown: ShowdownFormatData;
  chaos: ChaosSource | null;
  now: Date;
  limits?: Limits;
}

const MAX_LISTED_PROBLEMS = 20;

export function validateSnapshot(snapshot: Snapshot, limits: Limits = DEFAULT_LIMITS): void {
  const problems: string[] = [];
  const speciesCount = Object.keys(snapshot.species).length;
  const moveCount = Object.keys(snapshot.moves).length;

  if (speciesCount < limits.minSpecies) {
    problems.push(`only ${speciesCount} species (expected at least ${limits.minSpecies})`);
  }
  if (moveCount < limits.minMoves) {
    problems.push(`only ${moveCount} moves (expected at least ${limits.minMoves})`);
  }
  for (const [speciesId, moveIds] of Object.entries(snapshot.learnsets)) {
    if (!snapshot.species[speciesId]) problems.push(`learnset for unknown species "${speciesId}"`);
    for (const moveId of moveIds) {
      if (!snapshot.moves[moveId]) problems.push(`learnset of "${speciesId}" references unknown move "${moveId}"`);
    }
  }
  if (snapshot.usage) {
    if (!(snapshot.usage.teams > 0)) problems.push('usage.teams must be a positive number');
    for (const [id, entry] of Object.entries(snapshot.usage.species)) {
      if (!snapshot.species[id]) problems.push(`usage mentions unknown species "${id}"`);
      for (const [teammateId] of entry.teammates) {
        if (!snapshot.species[teammateId]) {
          problems.push(`usage of "${id}" lists teammate "${teammateId}" which is not a known species`);
        }
      }
      if (!(Number.isFinite(entry.weight) && entry.weight > 0)) {
        problems.push(`usage of "${id}" has weight ${String(entry.weight)} (must be a finite number above 0)`);
      }
      if (!(Number.isFinite(entry.usage) && entry.usage > 0)) {
        problems.push(`usage of "${id}" has usage ${String(entry.usage)} (must be a finite number above 0)`);
      }
    }
  }

  if (problems.length > 0) {
    const listed = problems.slice(0, MAX_LISTED_PROBLEMS);
    const extra = problems.length - listed.length;
    const tail = extra > 0 ? `\n- ...and ${extra} more` : '';
    throw new Error(`Invalid snapshot for ${snapshot.formatId}:\n- ${listed.join('\n- ')}${tail}`);
  }
}

export function buildSnapshot({ config, showdown, chaos, now, limits = DEFAULT_LIMITS }: BuildInputs): {
  snapshot: Snapshot;
  meta: SnapshotMeta;
} {
  const warnings: string[] = [];
  let usage: UsageData | null = null;
  let usageMeta: SnapshotMeta['usage'] = null;

  if (chaos) {
    const pruned = pruneChaos(parseChaos(chaos.text), DEFAULT_PRUNE);
    const dropped: string[] = [];
    const species: UsageData['species'] = {};
    for (const [id, entry] of Object.entries(pruned.species)) {
      if (!showdown.species[id]) {
        dropped.push(id);
        continue;
      }
      species[id] = { ...entry, teammates: entry.teammates.filter(([other]) => showdown.species[other]) };
    }
    if (Object.keys(species).length === 0) {
      throw new Error(`Usage from ${chaos.statsFormatId} (${chaos.month}) has no species legal in ${config.id}`);
    }
    usage = { ...pruned, species };

    if (dropped.length > 0) {
      const shown = dropped.slice(0, 10).join(', ');
      warnings.push(
        `Dropped usage for ${dropped.length} species not legal in ${config.id}: ${shown}${dropped.length > 10 ? ', ...' : ''}`,
      );
    }
    const isFallback = chaos.statsFormatId !== config.statsFormatIds[0];
    if (isFallback) {
      warnings.push(
        `Usage comes from ${chaos.statsFormatId} (${chaos.month}) because ${config.statsFormatIds[0]} has no published stats yet.`,
      );
    }
    usageMeta = {
      statsFormatId: chaos.statsFormatId,
      month: chaos.month,
      cutoff: chaos.cutoff,
      battles: pruned.battles,
      teams: pruned.teams,
      url: chaos.url,
      isFallback,
    };
  } else {
    warnings.push(
      `No usage data found for ${config.statsFormatIds.join(', ')} at cutoff ${config.cutoff}; suggestions will use non-usage signals only.`,
    );
  }

  const snapshot: Snapshot = {
    schemaVersion: 1,
    formatId: config.id,
    species: showdown.species,
    moves: showdown.moves,
    learnsets: showdown.learnsets,
    usage,
  };
  validateSnapshot(snapshot, limits);

  const meta: SnapshotMeta = {
    schemaVersion: 1,
    formatId: config.id,
    label: config.label,
    generatedAt: now.toISOString(),
    showdown: {
      packageVersion: showdown.packageVersion,
      mod: showdown.mod,
      formatName: showdown.formatName,
      rules: showdown.rules,
    },
    usage: usageMeta,
    warnings,
  };
  return { snapshot, meta };
}

function writeFileAtomic(path: string, contents: string): void {
  const temp = `${path}.tmp`;
  writeFileSync(temp, contents);
  renameSync(temp, path);
}

/** Writes data/<formatId>/snapshot.json then meta.json. Call only with an already-validated snapshot. */
export function writeSnapshot(dataDir: string, snapshot: Snapshot, meta: SnapshotMeta): string {
  const dir = join(dataDir, snapshot.formatId);
  mkdirSync(dir, { recursive: true });
  writeFileAtomic(join(dir, 'snapshot.json'), JSON.stringify(snapshot));
  writeFileAtomic(join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  return dir;
}
