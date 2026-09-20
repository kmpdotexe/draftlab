import { buildSnapshot, writeSnapshot, type Limits } from './build';
import type { FormatConfig } from './formats.config';
import type { ShowdownFormatData } from './showdown/source';
import type { ChaosSource } from './smogon/fetch';

export interface SyncDeps {
  loadShowdown(formatId: string): ShowdownFormatData;
  fetchChaos(statsFormatId: string, cutoff: number): Promise<ChaosSource | null>;
  now(): Date;
  dataDir: string;
  limits?: Limits;
}

/** Loads, builds and validates everything in memory first; files are written only if all of that succeeds. */
export async function runSync(
  config: FormatConfig,
  deps: SyncDeps,
): Promise<{ dir: string; warnings: string[] }> {
  const showdown = deps.loadShowdown(config.id);

  let chaos: ChaosSource | null = null;
  for (const statsFormatId of config.statsFormatIds) {
    chaos = await deps.fetchChaos(statsFormatId, config.cutoff);
    if (chaos) break;
  }

  const { snapshot, meta } = buildSnapshot({
    config,
    showdown,
    chaos,
    now: deps.now(),
    limits: deps.limits,
  });
  const dir = writeSnapshot(deps.dataDir, snapshot, meta);
  return { dir, warnings: meta.warnings };
}
