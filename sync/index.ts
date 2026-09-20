import { join } from 'node:path';
import { FORMATS } from './formats.config';
import { runSync } from './run';
import { loadShowdownFormat } from './showdown/source';
import { fetchLatestChaos } from './smogon/fetch';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flagIndex = args.indexOf('--format');
  const wanted = flagIndex >= 0 ? args[flagIndex + 1] : undefined;
  const targets = wanted ? FORMATS.filter((format) => format.id === wanted) : FORMATS;

  if (targets.length === 0) {
    console.error(`Unknown format "${wanted}". Known formats: ${FORMATS.map((f) => f.id).join(', ')}`);
    process.exit(1);
  }

  let failed = false;
  for (const config of targets) {
    try {
      const { dir, warnings } = await runSync(config, {
        loadShowdown: loadShowdownFormat,
        fetchChaos: (statsFormatId, cutoff) => fetchLatestChaos(statsFormatId, cutoff),
        now: () => new Date(),
        dataDir: join(process.cwd(), 'data'),
      });
      console.log(`OK   ${config.id} -> ${dir}`);
      for (const warning of warnings) console.log(`     warning: ${warning}`);
    } catch (error) {
      failed = true;
      console.error(`FAIL ${config.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failed) process.exitCode = 1;
}

void main();
