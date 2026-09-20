# Draft Lab: Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the sync pipeline that turns Pokémon Showdown's Champions data and Smogon's ladder usage stats into a normalized, versioned snapshot per format (`data/<formatId>/snapshot.json` + `meta.json`), plus the shared domain types and usage math that later increments build on.

**Architecture:** A Node script (`sync/`) loads legal species, moves, learnsets, and rules from the `pokemon-showdown` npm package (via `Dex.mod(...)`), fetches and prunes Smogon's gzipped chaos JSON, validates the combination in memory, and only then writes the two snapshot files (write-to-temp, then rename), so a failed sync never damages the last good snapshot. Shared types and pure usage math live in `src/domain/` so the future engine and app can import them without touching sync code. Dependencies point one way: `sync → domain`.

**Tech Stack:** TypeScript (ESM), Node 20+, Vitest, tsx, `pokemon-showdown` (npm).

**Spec:** `docs/superpowers/specs/2026-09-20-draft-lab-design.md` (read its "Findings that shaped the design" section first; it documents the verified data semantics this plan depends on).

## Global Constraints

- One TypeScript repository; dependencies point one way: `app → engine → domain`, and `sync → domain`. The engine never imports from `app`. (This plan builds only `domain` and `sync`.)
- Everything is keyed by a format id such as `gen9championsvgc2026regmc`; adding a regulation is a config change, not a code change.
- Default rating cutoff is 1630, configurable per format.
- The app never fetches Smogon directly; it reads only the snapshot.
- Sync fails loudly and keeps the last good snapshot. Snapshot files are written only after in-memory validation passes.
- Missing usage data is an expected state: the snapshot has `usage: null` and `meta.json` says so.
- A format may list several stats format ids in priority order; `meta.json` records which was used and whether it was a fallback; usage for species not legal in the target format is dropped with a warning.
- The set model uses a nature plus six stat points (0–32 each, total 66); no EVs or IVs. (Set validation is a later increment; this plan only parses spreads.)
- Smogon semantics: `usage` = fraction of teams containing the species (sums to 6); `W` = `sum(Abilities values)`; `Teammates` = raw symmetric weighted co-occurrence in `W` units; `Raw count` is not used; `lift(candidate | given) = co(given, candidate) / (W_given × usage_candidate)`; a missing co-occurrence entry is "no data", not lift 0.
- Ability and item description tables are not fetched in v1.
- Commits end with the trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## Prerequisites (do once, before Task 1)

- [ ] **Install Node 20+.** Node is not installed on the development machine.

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

Close and reopen the terminal, then verify:

```powershell
node --version
npm --version
```

Expected: `node` prints `v20.x` or higher; `npm` prints a version.

- [ ] **Work in a permanent project folder, not a temporary one.** Create or choose a folder (for example `draft-lab`), copy `docs/superpowers/specs/2026-09-20-draft-lab-design.md` and this plan into the same relative paths there, and run `git init` in it. All later paths are relative to that folder.

---

## File Structure

```
package.json, tsconfig.json, vitest.config.ts, vitest.integration.config.ts, .gitignore
src/domain/id.ts                 toID and the ID type
src/domain/id.test.ts
src/domain/types.ts              Snapshot, SnapshotMeta, SpeciesEntry, UsageData, ... (types only)
src/domain/usage.ts              cooccurrence(), teammateLift()
src/domain/usage.test.ts
sync/smogon/chaos.ts             parseChaos(), pruneChaos(), parseSpread()
sync/smogon/chaos.test.ts
sync/smogon/fetch.ts             fetchLatestChaos(): finds and downloads the latest chaos file
sync/smogon/fetch.test.ts
sync/showdown/source.ts          loadShowdownFormat(): legal species/moves/learnsets/rules from the npm package
sync/showdown/source.integration.test.ts   (slow; uses the real package)
sync/build.ts                    buildSnapshot(), validateSnapshot(), writeSnapshot()
sync/build.test.ts
sync/formats.config.ts           FORMATS: which formats exist and where their usage comes from
sync/run.ts                      runSync(): orchestration with injected dependencies
sync/run.test.ts
sync/index.ts                    CLI entry (npm run sync)
scripts/probe-showdown.cjs       throwaway probe used in Task 5, deleted after
data/<formatId>/snapshot.json, meta.json   generated output, committed
```

---

### Task 1: Project scaffold, `toID`, and shared types

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `vitest.integration.config.ts`, `.gitignore`
- Create: `src/domain/id.ts`, `src/domain/types.ts`
- Test: `src/domain/id.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ID = string`; `toID(text: unknown): ID` (lowercase, letters and digits only; `''` for non-string/number input).
  - Types in `src/domain/types.ts`: `StatName`, `StatTable`, `SpeciesEntry`, `MoveEntry`, `FormatRules`, `Spread`, `UsageEntry`, `UsageData`, `Snapshot`, `UsageMeta`, `SnapshotMeta` (exact shapes in Step 4).

- [ ] **Step 1: Write the config files**

`package.json`:

```json
{
  "name": "draft-lab",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "typecheck": "tsc --noEmit",
    "sync": "tsx sync/index.ts"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src", "sync", "vitest.config.ts", "vitest.integration.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'sync/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
  },
});
```

`vitest.integration.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['sync/**/*.integration.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
```

`.gitignore` (already exists from repo setup; make sure it contains exactly these lines):

```
node_modules/
dist/
*.tmp
.superpowers/
```

- [ ] **Step 2: Install dependencies**

```powershell
npm install pokemon-showdown
npm install --save-dev typescript vitest tsx @types/node
```

Expected: both succeed (the `pokemon-showdown` install is large, about 147 MB unpacked, and can take a minute). `package.json` now lists them and `package-lock.json` exists.

- [ ] **Step 3: Write the failing test**

`src/domain/id.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toID } from './id';

describe('toID', () => {
  it('lowercases and strips punctuation and spaces', () => {
    expect(toID('Raichu-Mega-Y')).toBe('raichumegay');
    expect(toID('Mr. Mime')).toBe('mrmime');
    expect(toID('Farfetch’d')).toBe('farfetchd');
  });

  it('returns an empty string for empty or non-string input', () => {
    expect(toID('')).toBe('');
    expect(toID(undefined)).toBe('');
    expect(toID(null)).toBe('');
  });

  it('accepts numbers', () => {
    expect(toID(25)).toBe('25');
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

```powershell
npx vitest run src/domain/id.test.ts
```

Expected: FAIL (cannot resolve `./id`).

- [ ] **Step 5: Implement `toID` and the shared types**

`src/domain/id.ts`:

```ts
export type ID = string;

/** Showdown-style id: lowercase, letters and digits only. */
export function toID(text: unknown): ID {
  if (typeof text !== 'string' && typeof text !== 'number') return '';
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '');
}
```

`src/domain/types.ts`:

```ts
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
  schemaVersion: 1;
  formatId: string;
  /** Legal species only. */
  species: Record<ID, SpeciesEntry>;
  /** Legal moves referenced by at least one legal learnset. */
  moves: Record<ID, MoveEntry>;
  /** Legal species id -> legal move ids. */
  learnsets: Record<ID, ID[]>;
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
  schemaVersion: 1;
  formatId: string;
  label: string;
  generatedAt: string;
  showdown: { packageVersion: string; mod: string; formatName: string; rules: FormatRules };
  usage: UsageMeta | null;
  warnings: string[];
}
```

- [ ] **Step 6: Run the test and typecheck**

```powershell
npx vitest run src/domain/id.test.ts
npm run typecheck
```

Expected: 3 tests PASS; typecheck prints no errors.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json tsconfig.json vitest.config.ts vitest.integration.config.ts .gitignore src docs
git commit -m "chore: scaffold project with toID and snapshot types" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Smogon chaos parsing and pruning

**Files:**
- Create: `sync/smogon/chaos.ts`
- Test: `sync/smogon/chaos.test.ts`

**Interfaces:**
- Consumes: `toID`, `ID` from `src/domain/id`; `Spread`, `UsageData`, `UsageEntry` from `src/domain/types`.
- Produces:
  - `interface RawChaosMon { usage: number; Abilities: Record<string, number>; Items: Record<string, number>; Moves: Record<string, number>; Spreads: Record<string, number>; Teammates: Record<string, number> }`
  - `interface RawChaos { info: { metagame: string; cutoff: number; 'number of battles': number }; data: Record<string, RawChaosMon> }`
  - `parseChaos(text: string): RawChaos` (throws loudly on invalid JSON or unexpected shape)
  - `parseSpread(key: string): { nature: string; points: Spread['points'] } | null`
  - `interface PruneOptions { minUsage; topMoves; topItems; topAbilities; topSpreads; topTeammates }` (all numbers)
  - `const DEFAULT_PRUNE: PruneOptions` (`minUsage: 0.0005, topMoves: 12, topItems: 8, topAbilities: 3, topSpreads: 6, topTeammates: 80`)
  - `pruneChaos(raw: RawChaos, options?: PruneOptions): UsageData`

- [ ] **Step 1: Write the failing tests**

`sync/smogon/chaos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRUNE,
  parseChaos,
  parseSpread,
  pruneChaos,
  type RawChaos,
  type RawChaosMon,
} from './chaos';

function mon(overrides: Partial<RawChaosMon> = {}): RawChaosMon {
  return { usage: 0.1, Abilities: { a: 100 }, Items: {}, Moves: {}, Spreads: {}, Teammates: {}, ...overrides };
}

function chaos(data: Record<string, RawChaosMon>): RawChaos {
  return {
    info: { metagame: 'gen9championsvgc2026regmb', cutoff: 1630, 'number of battles': 1000 },
    data,
  };
}

const fixture = chaos({
  Kingambit: mon({
    usage: 0.4074192,
    Abilities: { defiant: 79122.1, supremeoverlord: 547.9, pressure: 7.6 },
    Items: { chopleberry: 28882.26, occaberry: 1831.44, '': 100 },
    Moves: { suckerpunch: 70000, kowtowcleave: 60000 },
    Spreads: { 'Adamant:4/31/11/0/0/20': 873.67, garbage: 5 },
    Teammates: { Incineroar: 14648, Rampardos: 12, Unknownmon: 5 },
  }),
  Incineroar: mon({
    usage: 0.2684631,
    Abilities: { intimidate: 52000, blaze: 277 },
    Teammates: { Kingambit: 14648 },
  }),
  Rampardos: mon({ usage: 0.0001, Abilities: { sheerforce: 10 } }),
});

describe('parseChaos', () => {
  it('returns the parsed structure for a valid file', () => {
    const parsed = parseChaos(JSON.stringify(fixture));
    expect(parsed.info.cutoff).toBe(1630);
    expect(Object.keys(parsed.data)).toEqual(['Kingambit', 'Incineroar', 'Rampardos']);
  });

  it('throws on text that is not JSON', () => {
    expect(() => parseChaos('<html>nope</html>')).toThrow(/not valid JSON/);
  });

  it('throws when the top-level shape is wrong', () => {
    expect(() => parseChaos(JSON.stringify({ info: {} }))).toThrow(/top-level "info" and "data"/);
  });

  it('throws when info lacks a numeric cutoff and battle count', () => {
    expect(() => parseChaos(JSON.stringify({ info: { metagame: 'x' }, data: { A: mon() } }))).toThrow(
      /info/,
    );
  });

  it('throws when data is empty', () => {
    expect(() => parseChaos(JSON.stringify(chaos({})))).toThrow(/empty/);
  });

  it('names the species when an entry is malformed', () => {
    const broken = { info: fixture.info, data: { Kingambit: { usage: 'lots' } } };
    expect(() => parseChaos(JSON.stringify(broken))).toThrow(/"Kingambit"/);
  });
});

describe('parseSpread', () => {
  it('parses a nature and six stat points', () => {
    expect(parseSpread('Adamant:4/31/11/0/0/20')).toEqual({
      nature: 'Adamant',
      points: [4, 31, 11, 0, 0, 20],
    });
  });

  it('returns null for keys that are not spreads', () => {
    expect(parseSpread('garbage')).toBeNull();
    expect(parseSpread('Jolly:1/2/3')).toBeNull();
  });
});

describe('pruneChaos', () => {
  it('keeps species at or above minUsage and drops the rest', () => {
    const usage = pruneChaos(fixture);
    expect(Object.keys(usage.species).sort()).toEqual(['incineroar', 'kingambit']);
  });

  it('carries cutoff and battle count from info', () => {
    const usage = pruneChaos(fixture);
    expect(usage.cutoff).toBe(1630);
    expect(usage.battles).toBe(1000);
  });

  it('computes weight as the sum of Abilities and shares as value / weight', () => {
    const king = pruneChaos(fixture).species.kingambit;
    expect(king.weight).toBeCloseTo(79677.6, 1);
    expect(king.usage).toBeCloseTo(0.4074192, 6);
    expect(king.abilities[0][0]).toBe('defiant');
    expect(king.abilities[0][1]).toBeCloseTo(79122.1 / 79677.6, 6);
    expect(king.items[0][0]).toBe('chopleberry');
    expect(king.items[0][1]).toBeCloseTo(28882.26 / 79677.6, 6);
  });

  it('drops the empty-string key Smogon uses for "no item"', () => {
    const king = pruneChaos(fixture).species.kingambit;
    expect(king.items.map(([id]) => id)).toEqual(['chopleberry', 'occaberry']);
  });

  it('parses spreads and drops unparsable keys', () => {
    const king = pruneChaos(fixture).species.kingambit;
    expect(king.spreads).toHaveLength(1);
    expect(king.spreads[0].nature).toBe('Adamant');
    expect(king.spreads[0].points).toEqual([4, 31, 11, 0, 0, 20]);
    expect(king.spreads[0].share).toBeCloseTo(873.67 / 79677.6, 6);
  });

  it('keeps only teammates that survived pruning, keyed by id', () => {
    const king = pruneChaos(fixture).species.kingambit;
    expect(king.teammates).toEqual([['incineroar', 14648]]);
  });

  it('limits teammates to the top N by co-occurrence', () => {
    const raw = chaos({
      A: mon({ Teammates: { B: 5, C: 9 } }),
      B: mon(),
      C: mon(),
    });
    const usage = pruneChaos(raw, { ...DEFAULT_PRUNE, topTeammates: 1 });
    expect(usage.species.a.teammates).toEqual([['c', 9]]);
  });

  it('computes the weighted team count as total weight over total usage', () => {
    const usage = pruneChaos(fixture);
    const expected = (79677.6 + 52277 + 10) / (0.4074192 + 0.2684631 + 0.0001);
    expect(usage.teams).toBeCloseTo(expected, 3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx vitest run sync/smogon/chaos.test.ts
```

Expected: FAIL (cannot resolve `./chaos`).

- [ ] **Step 3: Implement**

`sync/smogon/chaos.ts`:

```ts
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
    if (
      !isRecord(mon) ||
      typeof mon.usage !== 'number' ||
      !isRecord(mon.Abilities) ||
      !isRecord(mon.Items) ||
      !isRecord(mon.Moves) ||
      !isRecord(mon.Spreads) ||
      !isRecord(mon.Teammates)
    ) {
      throw new Error(`Smogon chaos file: malformed entry for "${name}"`);
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
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run sync/smogon/chaos.test.ts
npm run typecheck
```

Expected: all tests PASS; no type errors.

- [ ] **Step 5: Commit**

```powershell
git add sync/smogon/chaos.ts sync/smogon/chaos.test.ts
git commit -m "feat(sync): parse and prune Smogon chaos usage data" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Usage math (co-occurrence and lift)

**Files:**
- Create: `src/domain/usage.ts`
- Test: `src/domain/usage.test.ts`

**Interfaces:**
- Consumes: `ID`; `UsageData` (from Task 1).
- Produces:
  - `cooccurrence(usage: UsageData, a: ID, b: ID): number | null` (symmetric; looks in both species' stored teammate lists; `null` when neither stores the pair)
  - `teammateLift(usage: UsageData, given: ID, candidate: ID): number | null` (`co / (W_given × usage_candidate)`; `null` when either species or the pair is missing)

- [ ] **Step 1: Write the failing tests**

`src/domain/usage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cooccurrence, teammateLift } from './usage';
import type { UsageData, UsageEntry } from './types';

function entry(id: string, weight: number, usage: number, teammates: Array<[string, number]>): UsageEntry {
  return { id, weight, usage, abilities: [], items: [], moves: [], spreads: [], teammates };
}

// Numbers taken from the real gen9championsvgc2026regmb-1630 data (2026-08).
const usage: UsageData = {
  teams: 195_000,
  cutoff: 1630,
  battles: 1_269_250,
  species: {
    kingambit: entry('kingambit', 79_678, 0.4074192, [['incineroar', 14_648]]),
    incineroar: entry('incineroar', 52_277, 0.2684631, []),
    whimsicott: entry('whimsicott', 47_595, 0.2439747, [['incineroar', 5_612]]),
  },
};

describe('cooccurrence', () => {
  it('reads the pair from the first species list', () => {
    expect(cooccurrence(usage, 'kingambit', 'incineroar')).toBe(14_648);
  });

  it('falls back to the other species list because co-occurrence is symmetric', () => {
    expect(cooccurrence(usage, 'incineroar', 'kingambit')).toBe(14_648);
  });

  it('returns null when neither list stores the pair', () => {
    expect(cooccurrence(usage, 'kingambit', 'whimsicott')).toBeNull();
  });

  it('returns null for unknown species', () => {
    expect(cooccurrence(usage, 'kingambit', 'missingno')).toBeNull();
  });
});

describe('teammateLift', () => {
  it('divides co-occurrence by what chance alone would give', () => {
    // 14648 / (79678 * 0.2684631) ≈ 0.685: the pair appears together LESS than chance.
    expect(teammateLift(usage, 'kingambit', 'incineroar')).toBeCloseTo(0.685, 2);
  });

  it('uses the given species weight and the candidate usage, so swapping them changes the denominator', () => {
    // forward:  14648 / (79678 * 0.2684631) ≈ 0.685
    // backward: 14648 / (52277 * 0.4074192) ≈ 0.688
    expect(teammateLift(usage, 'kingambit', 'incineroar')).toBeCloseTo(0.685, 2);
    expect(teammateLift(usage, 'incineroar', 'kingambit')).toBeCloseTo(0.688, 2);
  });

  it('returns null, not 0, when the pair was not observed among stored teammates', () => {
    expect(teammateLift(usage, 'kingambit', 'whimsicott')).toBeNull();
  });

  it('returns null when either species has no usage entry', () => {
    expect(teammateLift(usage, 'kingambit', 'missingno')).toBeNull();
    expect(teammateLift(usage, 'missingno', 'kingambit')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx vitest run src/domain/usage.test.ts
```

Expected: FAIL (cannot resolve `./usage`).

- [ ] **Step 3: Implement**

`src/domain/usage.ts`:

```ts
import type { ID } from './id';
import type { UsageData } from './types';

/**
 * Weighted co-occurrence of two species. Smogon's teammate data is symmetric, so either
 * species' stored list can answer. Returns null when neither stores the pair (it fell
 * outside the pruned top teammates, or was never observed).
 */
export function cooccurrence(usage: UsageData, a: ID, b: ID): number | null {
  const fromA = usage.species[a]?.teammates.find(([id]) => id === b);
  if (fromA) return fromA[1];
  const fromB = usage.species[b]?.teammates.find(([id]) => id === a);
  return fromB ? fromB[1] : null;
}

/**
 * How much more (>1) or less (<1) often `candidate` appears with `given` than chance alone
 * would give: co / (W_given × usage_candidate). Null means "no data for this pair".
 */
export function teammateLift(usage: UsageData, given: ID, candidate: ID): number | null {
  const givenEntry = usage.species[given];
  const candidateEntry = usage.species[candidate];
  if (!givenEntry || !candidateEntry) return null;
  const co = cooccurrence(usage, given, candidate);
  if (co === null) return null;
  const expected = givenEntry.weight * candidateEntry.usage;
  return expected > 0 ? co / expected : null;
}
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run src/domain/usage.test.ts
npm run typecheck
```

Expected: all tests PASS; no type errors.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/usage.ts src/domain/usage.test.ts
git commit -m "feat(domain): add co-occurrence and teammate lift" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Smogon chaos fetcher

**Files:**
- Create: `sync/smogon/fetch.ts`
- Test: `sync/smogon/fetch.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `interface FetchResponse { ok: boolean; status: number; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }`
  - `type Fetcher = (url: string) => Promise<FetchResponse>`
  - `interface ChaosSource { statsFormatId: string; cutoff: number; month: string; url: string; text: string }`
  - `parseIndex(html: string): string[]`, `listMonths(html: string): string[]` (ascending, e.g. `['2026-07', '2026-08']`)
  - `fetchLatestChaos(statsFormatId: string, cutoff: number, fetcher?: Fetcher, maxMonthsBack?: number): Promise<ChaosSource | null>`; walks months newest-first (default 6), returns the first month whose `chaos/` listing contains `<statsFormatId>-<cutoff>.json.gz` (with the gunzipped text), or `null`. Throws on HTTP errors other than a 404 month listing.

- [ ] **Step 1: Write the failing tests**

`sync/smogon/fetch.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { fetchLatestChaos, listMonths, parseIndex, type Fetcher } from './fetch';

const ROOT = 'https://www.smogon.com/stats';

function fakeFetcher(routes: Record<string, { status?: number; body?: string | Buffer }>): Fetcher {
  return async (url) => {
    const route = routes[url];
    const status = route ? (route.status ?? 200) : 404;
    const body = route?.body ?? '';
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => buffer.toString('utf8'),
      arrayBuffer: async () =>
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    };
  };
}

function indexHtml(entries: string[]): string {
  return `<html><body><a href="../">../</a>${entries.map((e) => `<a href="${e}">${e}</a>`).join('')}</body></html>`;
}

const FILE = 'gen9championsvgc2026regmb-1630.json.gz';
const PAYLOAD = JSON.stringify({ hello: 'chaos' });

describe('parseIndex / listMonths', () => {
  it('extracts hrefs and keeps only YYYY-MM/ directories, oldest first', () => {
    const html = indexHtml(['2026-08/', '2026-06/', 'readme.txt', '2026-07/']);
    expect(parseIndex(html)).toContain('readme.txt');
    expect(listMonths(html)).toEqual(['2026-06', '2026-07', '2026-08']);
  });
});

describe('fetchLatestChaos', () => {
  it('returns the newest month whose chaos listing contains the file', async () => {
    const fetcher = fakeFetcher({
      [`${ROOT}/`]: { body: indexHtml(['2026-06/', '2026-07/', '2026-08/']) },
      [`${ROOT}/2026-08/chaos/`]: { body: indexHtml(['gen9championsbssregmb-1630.json.gz']) },
      [`${ROOT}/2026-07/chaos/`]: { body: indexHtml([FILE]) },
      [`${ROOT}/2026-07/chaos/${FILE}`]: { body: gzipSync(PAYLOAD) },
    });
    const result = await fetchLatestChaos('gen9championsvgc2026regmb', 1630, fetcher);
    expect(result).toEqual({
      statsFormatId: 'gen9championsvgc2026regmb',
      cutoff: 1630,
      month: '2026-07',
      url: `${ROOT}/2026-07/chaos/${FILE}`,
      text: PAYLOAD,
    });
  });

  it('returns null when no recent month has the file', async () => {
    const fetcher = fakeFetcher({
      [`${ROOT}/`]: { body: indexHtml(['2026-08/']) },
      [`${ROOT}/2026-08/chaos/`]: { body: indexHtml(['other-1630.json.gz']) },
    });
    expect(await fetchLatestChaos('gen9championsvgc2026regmc', 1630, fetcher)).toBeNull();
  });

  it('treats a month with no chaos directory as "not there" and keeps looking', async () => {
    const fetcher = fakeFetcher({
      [`${ROOT}/`]: { body: indexHtml(['2026-07/', '2026-08/']) },
      // 2026-08/chaos/ is absent, so the fake returns 404
      [`${ROOT}/2026-07/chaos/`]: { body: indexHtml([FILE]) },
      [`${ROOT}/2026-07/chaos/${FILE}`]: { body: gzipSync(PAYLOAD) },
    });
    const result = await fetchLatestChaos('gen9championsvgc2026regmb', 1630, fetcher);
    expect(result?.month).toBe('2026-07');
  });

  it('only looks back maxMonthsBack months', async () => {
    const months = ['2026-01/', '2026-02/', '2026-03/', '2026-04/', '2026-05/', '2026-06/'];
    const routes: Record<string, { body: string | Buffer }> = {
      [`${ROOT}/`]: { body: indexHtml(months) },
      [`${ROOT}/2026-01/chaos/`]: { body: indexHtml([FILE]) },
      [`${ROOT}/2026-01/chaos/${FILE}`]: { body: gzipSync(PAYLOAD) },
    };
    const fetcher = fakeFetcher(routes);
    expect(await fetchLatestChaos('gen9championsvgc2026regmb', 1630, fetcher, 3)).toBeNull();
  });

  it('throws when the stats index itself fails', async () => {
    const fetcher = fakeFetcher({ [`${ROOT}/`]: { status: 500 } });
    await expect(fetchLatestChaos('x', 1630, fetcher)).rejects.toThrow(/HTTP 500/);
  });

  it('throws when the file download fails after it was listed', async () => {
    const fetcher = fakeFetcher({
      [`${ROOT}/`]: { body: indexHtml(['2026-08/']) },
      [`${ROOT}/2026-08/chaos/`]: { body: indexHtml([FILE]) },
      [`${ROOT}/2026-08/chaos/${FILE}`]: { status: 500 },
    });
    await expect(fetchLatestChaos('gen9championsvgc2026regmb', 1630, fetcher)).rejects.toThrow(/HTTP 500/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx vitest run sync/smogon/fetch.test.ts
```

Expected: FAIL (cannot resolve `./fetch`).

- [ ] **Step 3: Implement**

`sync/smogon/fetch.ts`:

```ts
import { gunzipSync } from 'node:zlib';

export interface FetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export type Fetcher = (url: string) => Promise<FetchResponse>;

export interface ChaosSource {
  statsFormatId: string;
  cutoff: number;
  month: string;
  url: string;
  text: string;
}

const STATS_ROOT = 'https://www.smogon.com/stats';

export function parseIndex(html: string): string[] {
  return [...html.matchAll(/href="([^"?#]+)"/g)].map((match) => match[1]);
}

/** Months (YYYY-MM) listed on the stats index, oldest first. */
export function listMonths(html: string): string[] {
  return parseIndex(html)
    .filter((href) => /^\d{4}-\d{2}\/$/.test(href))
    .map((href) => href.slice(0, -1))
    .sort();
}

async function getTextIfPresent(fetcher: Fetcher, url: string): Promise<string | null> {
  const response = await fetcher(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Smogon stats: ${url} returned HTTP ${response.status}`);
  return response.text();
}

async function getText(fetcher: Fetcher, url: string): Promise<string> {
  const text = await getTextIfPresent(fetcher, url);
  if (text === null) throw new Error(`Smogon stats: ${url} returned HTTP 404`);
  return text;
}

/**
 * Finds the newest stats month that has `<statsFormatId>-<cutoff>.json.gz` under `chaos/`
 * and returns its decompressed text, or null if none of the last `maxMonthsBack` months has it.
 */
export async function fetchLatestChaos(
  statsFormatId: string,
  cutoff: number,
  fetcher: Fetcher = fetch as unknown as Fetcher,
  maxMonthsBack = 6,
): Promise<ChaosSource | null> {
  const index = await getText(fetcher, `${STATS_ROOT}/`);
  const months = listMonths(index).reverse().slice(0, maxMonthsBack);
  const file = `${statsFormatId}-${cutoff}.json.gz`;

  for (const month of months) {
    const listing = await getTextIfPresent(fetcher, `${STATS_ROOT}/${month}/chaos/`);
    if (listing === null || !parseIndex(listing).includes(file)) continue;

    const url = `${STATS_ROOT}/${month}/chaos/${file}`;
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`Smogon stats: ${url} returned HTTP ${response.status}`);
    const text = gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');
    return { statsFormatId, cutoff, month, url, text };
  }
  return null;
}
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run sync/smogon/fetch.test.ts
npm run typecheck
```

Expected: all tests PASS; no type errors.

- [ ] **Step 5: Commit**

```powershell
git add sync/smogon/fetch.ts sync/smogon/fetch.test.ts
git commit -m "feat(sync): fetch the latest Smogon chaos file for a format" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Showdown format loader

This is the one task that depends on a real package's API, so it starts with a probe. Everything else in this plan is testable against fixtures.

**Files:**
- Create: `scripts/probe-showdown.cjs` (deleted at the end of this task)
- Create: `sync/showdown/source.ts`
- Test: `sync/showdown/source.integration.test.ts`

**Interfaces:**
- Consumes: `toID`, `ID`; `SpeciesEntry`, `MoveEntry`, `FormatRules` from `src/domain/types`.
- Produces:
  - `interface ShowdownFormatData { formatName: string; mod: string; packageVersion: string; rules: FormatRules; species: Record<ID, SpeciesEntry>; moves: Record<ID, MoveEntry>; learnsets: Record<ID, ID[]> }`
  - `loadShowdownFormat(formatId: string): ShowdownFormatData`; synchronous; throws if Showdown has no such format. `species` holds only legal species (`exists`, not `isNonstandard`, not banned by the format's rules); `learnsets` maps each to legal move ids (including moves from pre-evolutions and base species); `moves` holds every move referenced by a learnset.

- [ ] **Step 1: Probe the package**

`scripts/probe-showdown.cjs`:

```js
const { Dex } = require('pokemon-showdown');

const formats = Dex.formats.all().filter((f) => /champions/i.test(f.name));
for (const f of formats) console.log(`${f.id}\t${f.name}\tmod=${f.mod}`);

const dex = Dex.mod('champions');
console.log('incineroar exists:', dex.species.get('incineroar').exists, '| isNonstandard:', dex.species.get('incineroar').isNonstandard);
console.log('bulbasaur isNonstandard:', dex.species.get('bulbasaur').isNonstandard);

const format = Dex.formats.get('gen9championsvgc2026regmc');
console.log('format exists:', format.exists, '| mod:', format.mod, '| ruleset:', format.ruleset);
const table = dex.formats.getRuleTable(format);
console.log('ruleTable:', {
  adjustLevel: table.adjustLevel,
  minTeamSize: table.minTeamSize,
  pickedTeamSize: table.pickedTeamSize,
  isBannedSpecies: typeof table.isBannedSpecies,
});
console.log('mewtwo banned:', table.isBannedSpecies(dex.species.get('mewtwo')), '| mew banned:', table.isBannedSpecies(dex.species.get('mew')));
console.log('incineroar learnset sample:', Object.keys(dex.species.getLearnsetData('incineroar').learnset ?? {}).slice(0, 5));
```

Run it:

```powershell
node scripts/probe-showdown.cjs
```

Expected output (values may differ slightly, but each of these must hold):
- A line for `gen9championsvgc2026regmc` and one for `gen9championsvgc2026regmb`, with `mod=champions` and `mod=championsregmb`.
- `incineroar exists: true` and a falsy `isNonstandard` (null, undefined, or empty).
- `bulbasaur isNonstandard: Past`.
- `format exists: true`, and a `ruleset` containing `Flat Rules`.
- `ruleTable` shows `isBannedSpecies: 'function'`, `adjustLevel: 50`, and a numeric `minTeamSize`.
- `mewtwo banned: true` and `mew banned: true` (or, if a species is excluded by being non-standard rather than banned, `false`; the loader excludes on either condition, so either result is acceptable).
- A non-empty learnset sample.

**If the M-C format line is missing, or `Dex.mod` / `getRuleTable` / `isBannedSpecies` does not exist as used here: stop and report to the human. Do not improvise.** The known options are to pin the package to a GitHub commit of `smogon/pokemon-showdown` that has Reg M-C (requires a local build step), or to ship only Reg M-B until a new package release. That is the human's call.

- [ ] **Step 2: Write the failing integration test**

`sync/showdown/source.integration.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { loadShowdownFormat, type ShowdownFormatData } from './source';

describe.each(['gen9championsvgc2026regmc', 'gen9championsvgc2026regmb'])(
  'loadShowdownFormat(%s) against the real pokemon-showdown package',
  (formatId) => {
    let data: ShowdownFormatData;

    beforeAll(() => {
      data = loadShowdownFormat(formatId);
    });

    it('reports where the data came from', () => {
      expect(data.formatName).toContain('Champions');
      expect(data.packageVersion).toMatch(/^\d+\.\d+\.\d+/);
      expect(data.mod).toMatch(/^champions/);
    });

    it('includes Incineroar with the right types', () => {
      expect(data.species.incineroar?.types).toEqual(['Fire', 'Dark']);
    });

    it('excludes species that are not legal in Champions', () => {
      expect(data.species.bulbasaur).toBeUndefined();
      expect(data.species.mew).toBeUndefined();
      expect(data.species.mewtwo).toBeUndefined();
    });

    it('has a plausible number of legal species', () => {
      const count = Object.keys(data.species).length;
      expect(count).toBeGreaterThan(150);
      expect(count).toBeLessThan(600);
    });

    it('gives Incineroar Fake Out and Knock Off', () => {
      expect(data.learnsets.incineroar).toContain('fakeout');
      expect(data.learnsets.incineroar).toContain('knockoff');
    });

    it('has a learnset for every legal species, and every learnset move is in the moves table', () => {
      for (const id of Object.keys(data.species)) {
        expect(data.learnsets[id], `learnset for ${id}`).toBeDefined();
        for (const moveId of data.learnsets[id]) {
          expect(data.moves[moveId], `move ${moveId} (learned by ${id})`).toBeDefined();
        }
      }
    });

    it('reports level 50 flat rules', () => {
      expect(data.rules.ruleset).toContain('Flat Rules');
      expect(data.rules.adjustLevel).toBe(50);
    });
  },
);
```

- [ ] **Step 3: Run to verify it fails**

```powershell
npm run test:integration
```

Expected: FAIL (cannot resolve `./source`).

- [ ] **Step 4: Implement**

`sync/showdown/source.ts`:

```ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { ID } from '../../src/domain/id';
import type { FormatRules, MoveEntry, SpeciesEntry, StatTable } from '../../src/domain/types';

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

/** Moves a species can learn, following pre-evolutions and (for formes without their own data) the base species. */
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
    if (!data.learnset && current.baseSpecies !== current.name) {
      current = dex.species.get(current.baseSpecies);
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
  };
}
```

- [ ] **Step 5: Run the integration tests and typecheck**

```powershell
npm run test:integration
npm run typecheck
```

Expected: all integration tests PASS for both formats (this loads a large package and can take up to a minute); no type errors. If a test fails, read the failing assertion:
- `species.mew`/`mewtwo` defined: the ban logic is not excluding Mythical/Restricted Legendary; check the probe's `isBannedSpecies` output and fix the filter.
- Missing learnset moves for a species: check that `learnsetOf` reached that species' data (for formes without their own learnset, verify `baseSpecies` handling).
- Anything that suggests the API differs from what the probe printed: stop and report rather than guessing.

- [ ] **Step 6: Remove the probe and commit**

```powershell
Remove-Item scripts/probe-showdown.cjs
Remove-Item scripts -ErrorAction SilentlyContinue
git add sync/showdown
git commit -m "feat(sync): load legal Champions species, moves, learnsets and rules from pokemon-showdown" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Snapshot builder, validator, and writer

**Files:**
- Create: `sync/formats.config.ts`
- Create: `sync/build.ts`
- Test: `sync/build.test.ts`

**Interfaces:**
- Consumes: `Snapshot`, `SnapshotMeta`, `UsageData`, `SpeciesEntry`, `MoveEntry` (Task 1); `parseChaos`, `pruneChaos`, `DEFAULT_PRUNE` (Task 2); `ChaosSource` (Task 4); `ShowdownFormatData` (Task 5, type import only).
- Produces:
  - `interface FormatConfig { id: string; label: string; statsFormatIds: string[]; cutoff: number }` and `const FORMATS: FormatConfig[]` in `sync/formats.config.ts`
  - `interface Limits { minSpecies: number; minMoves: number }`, `const DEFAULT_LIMITS: Limits` (`{ minSpecies: 150, minMoves: 100 }`)
  - `interface BuildInputs { config: FormatConfig; showdown: ShowdownFormatData; chaos: ChaosSource | null; now: Date; limits?: Limits }`
  - `buildSnapshot(inputs: BuildInputs): { snapshot: Snapshot; meta: SnapshotMeta }`; validates before returning; throws on an invalid snapshot
  - `validateSnapshot(snapshot: Snapshot, limits?: Limits): void`
  - `writeSnapshot(dataDir: string, snapshot: Snapshot, meta: SnapshotMeta): string`; returns the directory written

- [ ] **Step 1: Write the format config**

`sync/formats.config.ts`:

```ts
export interface FormatConfig {
  /** Showdown format id, e.g. "gen9championsvgc2026regmc". Also the data directory name. */
  id: string;
  label: string;
  /** Smogon stats format ids in priority order; the first with published stats wins. */
  statsFormatIds: string[];
  /** Rating cutoff of the chaos file to use (0, 1500, 1630, or 1760). */
  cutoff: number;
}

export const FORMATS: FormatConfig[] = [
  {
    id: 'gen9championsvgc2026regmc',
    label: 'Champions VGC 2026 Reg M-C',
    // Reg M-C has no published stats yet; fall back to Reg M-B until it does.
    statsFormatIds: ['gen9championsvgc2026regmc', 'gen9championsvgc2026regmb'],
    cutoff: 1630,
  },
  {
    id: 'gen9championsvgc2026regmb',
    label: 'Champions VGC 2026 Reg M-B',
    statsFormatIds: ['gen9championsvgc2026regmb'],
    cutoff: 1630,
  },
];
```

- [ ] **Step 2: Write the failing tests**

`sync/build.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSnapshot, validateSnapshot, writeSnapshot } from './build';
import type { FormatConfig } from './formats.config';
import type { RawChaos, RawChaosMon } from './smogon/chaos';
import type { ChaosSource } from './smogon/fetch';
import type { ShowdownFormatData } from './showdown/source';
import type { MoveEntry, SpeciesEntry } from '../src/domain/types';

const config: FormatConfig = { id: 'fmt', label: 'Fmt', statsFormatIds: ['statsA', 'statsB'], cutoff: 1630 };
const limits = { minSpecies: 2, minMoves: 1 };
const now = new Date('2026-09-20T12:00:00.000Z');

function species(id: string, name: string): SpeciesEntry {
  return {
    id,
    name,
    num: 1,
    types: ['Normal'],
    baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    abilities: ['Pressure'],
    tags: [],
    baseSpecies: name,
    forme: '',
    requiredItem: null,
  };
}

function move(id: string, name: string): MoveEntry {
  return {
    id,
    name,
    type: 'Normal',
    category: 'Physical',
    basePower: 40,
    accuracy: 100,
    priority: 0,
    target: 'normal',
    flags: ['contact'],
  };
}

function showdownData(): ShowdownFormatData {
  return {
    formatName: '[Gen 9 Champions] Fmt',
    mod: 'champions',
    packageVersion: '0.0.0-test',
    rules: { ruleset: ['Flat Rules'], adjustLevel: 50, minTeamSize: 6, pickedTeamSize: null },
    species: { incineroar: species('incineroar', 'Incineroar'), kingambit: species('kingambit', 'Kingambit') },
    moves: { fakeout: move('fakeout', 'Fake Out') },
    learnsets: { incineroar: ['fakeout'], kingambit: [] },
  };
}

function mon(overrides: Partial<RawChaosMon> = {}): RawChaosMon {
  return { usage: 0.1, Abilities: { a: 100 }, Items: {}, Moves: {}, Spreads: {}, Teammates: {}, ...overrides };
}

function chaosSource(statsFormatId: string): ChaosSource {
  const raw: RawChaos = {
    info: { metagame: statsFormatId, cutoff: 1630, 'number of battles': 1000 },
    data: {
      Kingambit: mon({ usage: 0.4, Abilities: { defiant: 100 }, Teammates: { Incineroar: 50, Mewtwo: 30 } }),
      Incineroar: mon({ usage: 0.3, Abilities: { intimidate: 100 }, Teammates: { Kingambit: 50 } }),
      Mewtwo: mon({ usage: 0.2, Abilities: { pressure: 100 } }),
    },
  };
  return { statsFormatId, cutoff: 1630, month: '2026-08', url: 'https://example.test/x.json.gz', text: JSON.stringify(raw) };
}

describe('buildSnapshot', () => {
  it('keeps usage only for species legal in the format and records a fallback', () => {
    const { snapshot, meta } = buildSnapshot({ config, showdown: showdownData(), chaos: chaosSource('statsB'), now, limits });

    expect(snapshot.formatId).toBe('fmt');
    expect(Object.keys(snapshot.usage?.species ?? {}).sort()).toEqual(['incineroar', 'kingambit']);
    expect(snapshot.usage?.species.kingambit.teammates).toEqual([['incineroar', 50]]);

    expect(meta.generatedAt).toBe('2026-09-20T12:00:00.000Z');
    expect(meta.usage).toMatchObject({ statsFormatId: 'statsB', month: '2026-08', isFallback: true });
    expect(meta.warnings.some((w) => w.includes('Dropped usage for 1 species') && w.includes('mewtwo'))).toBe(true);
    expect(meta.warnings.some((w) => w.includes('statsB') && w.includes('statsA'))).toBe(true);
    expect(meta.showdown).toMatchObject({ packageVersion: '0.0.0-test', mod: 'champions' });
  });

  it('marks the first-choice stats id as not a fallback', () => {
    const { meta } = buildSnapshot({ config, showdown: showdownData(), chaos: chaosSource('statsA'), now, limits });
    expect(meta.usage?.isFallback).toBe(false);
    expect(meta.warnings.some((w) => w.includes('Usage comes from'))).toBe(false);
  });

  it('builds a snapshot without usage when no stats exist, and says so', () => {
    const { snapshot, meta } = buildSnapshot({ config, showdown: showdownData(), chaos: null, now, limits });
    expect(snapshot.usage).toBeNull();
    expect(meta.usage).toBeNull();
    expect(meta.warnings[0]).toContain('No usage data found');
  });

  it('refuses to build when a learnset references an unknown move', () => {
    const showdown = showdownData();
    showdown.learnsets.kingambit = ['ghostmove'];
    expect(() => buildSnapshot({ config, showdown, chaos: null, now, limits })).toThrow(/unknown move "ghostmove"/);
  });

  it('refuses to build when there are too few species', () => {
    expect(() =>
      buildSnapshot({ config, showdown: showdownData(), chaos: null, now, limits: { minSpecies: 5, minMoves: 1 } }),
    ).toThrow(/only 2 species/);
  });
});

describe('validateSnapshot', () => {
  it('caps how many problems it lists', () => {
    const showdown = showdownData();
    showdown.learnsets.kingambit = Array.from({ length: 50 }, (_, i) => `ghost${i}`);
    const { snapshot } = buildSnapshot({ config, showdown: showdownData(), chaos: null, now, limits });
    const broken = { ...snapshot, learnsets: { ...snapshot.learnsets, kingambit: showdown.learnsets.kingambit } };
    expect(() => validateSnapshot(broken, limits)).toThrow(/and 30 more/);
  });
});

describe('writeSnapshot', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('writes snapshot.json and meta.json under data/<formatId>/', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'draft-lab-'));
    dirs.push(dataDir);
    const { snapshot, meta } = buildSnapshot({ config, showdown: showdownData(), chaos: null, now, limits });

    const dir = writeSnapshot(dataDir, snapshot, meta);

    expect(dir).toBe(join(dataDir, 'fmt'));
    expect(JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8')).formatId).toBe('fmt');
    expect(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')).label).toBe('Fmt');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```powershell
npx vitest run sync/build.test.ts
```

Expected: FAIL (cannot resolve `./build`).

- [ ] **Step 4: Implement**

`sync/build.ts`:

```ts
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
    for (const id of Object.keys(snapshot.usage.species)) {
      if (!snapshot.species[id]) problems.push(`usage mentions unknown species "${id}"`);
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
```

- [ ] **Step 5: Run tests and typecheck**

```powershell
npx vitest run sync/build.test.ts
npm run typecheck
```

Expected: all tests PASS; no type errors. (In the "caps how many problems" test the learnset has 50 unknown moves, giving 50 problems; 20 are listed and "...and 30 more" is appended.)

- [ ] **Step 6: Commit**

```powershell
git add sync/formats.config.ts sync/build.ts sync/build.test.ts
git commit -m "feat(sync): build, validate and write per-format snapshots" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Sync orchestration, CLI, and first real run

**Files:**
- Create: `sync/run.ts`, `sync/index.ts`
- Test: `sync/run.test.ts`
- Generated: `data/gen9championsvgc2026regmc/*`, `data/gen9championsvgc2026regmb/*`

**Interfaces:**
- Consumes: `FormatConfig` (Task 6); `buildSnapshot`, `writeSnapshot`, `Limits` (Task 6); `ChaosSource`, `fetchLatestChaos` (Task 4); `ShowdownFormatData`, `loadShowdownFormat` (Task 5).
- Produces:
  - `interface SyncDeps { loadShowdown(formatId: string): ShowdownFormatData; fetchChaos(statsFormatId: string, cutoff: number): Promise<ChaosSource | null>; now(): Date; dataDir: string; limits?: Limits }`
  - `runSync(config: FormatConfig, deps: SyncDeps): Promise<{ dir: string; warnings: string[] }>`; tries each `config.statsFormatIds` in order, builds, validates, then writes. Rejects (and writes nothing) on any failure.
  - CLI: `npm run sync` (all formats) or `npm run sync -- --format <id>`; exit code 1 if any format failed.

- [ ] **Step 1: Write the failing tests**

`sync/run.test.ts`:

```ts
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FormatConfig } from './formats.config';
import { runSync, type SyncDeps } from './run';
import type { RawChaos, RawChaosMon } from './smogon/chaos';
import type { ChaosSource } from './smogon/fetch';
import type { ShowdownFormatData } from './showdown/source';
import type { MoveEntry, SpeciesEntry } from '../src/domain/types';

const config: FormatConfig = { id: 'fmt', label: 'Fmt', statsFormatIds: ['a', 'b'], cutoff: 1630 };
const limits = { minSpecies: 2, minMoves: 1 };

function species(id: string, name: string): SpeciesEntry {
  return {
    id,
    name,
    num: 1,
    types: ['Normal'],
    baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    abilities: ['Pressure'],
    tags: [],
    baseSpecies: name,
    forme: '',
    requiredItem: null,
  };
}

function move(id: string, name: string): MoveEntry {
  return { id, name, type: 'Normal', category: 'Physical', basePower: 40, accuracy: 100, priority: 0, target: 'normal', flags: [] };
}

function showdownData(learnsetMove = 'fakeout'): ShowdownFormatData {
  return {
    formatName: '[Gen 9 Champions] Fmt',
    mod: 'champions',
    packageVersion: '0.0.0-test',
    rules: { ruleset: ['Flat Rules'], adjustLevel: 50, minTeamSize: 6, pickedTeamSize: null },
    species: { incineroar: species('incineroar', 'Incineroar'), kingambit: species('kingambit', 'Kingambit') },
    moves: { fakeout: move('fakeout', 'Fake Out') },
    learnsets: { incineroar: [learnsetMove], kingambit: [] },
  };
}

function mon(overrides: Partial<RawChaosMon> = {}): RawChaosMon {
  return { usage: 0.1, Abilities: { a: 100 }, Items: {}, Moves: {}, Spreads: {}, Teammates: {}, ...overrides };
}

function source(statsFormatId: string): ChaosSource {
  const raw: RawChaos = {
    info: { metagame: statsFormatId, cutoff: 1630, 'number of battles': 10 },
    data: { Kingambit: mon({ usage: 0.4 }), Incineroar: mon({ usage: 0.3 }) },
  };
  return { statsFormatId, cutoff: 1630, month: '2026-08', url: 'https://example.test/x', text: JSON.stringify(raw) };
}

describe('runSync', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function makeDeps(overrides: Partial<SyncDeps> = {}): SyncDeps {
    const dataDir = mkdtempSync(join(tmpdir(), 'draft-lab-run-'));
    dirs.push(dataDir);
    return {
      loadShowdown: () => showdownData(),
      fetchChaos: async (statsFormatId) => source(statsFormatId),
      now: () => new Date('2026-09-20T12:00:00.000Z'),
      dataDir,
      limits,
      ...overrides,
    };
  }

  it('falls back to the next stats id when the first has no published data', async () => {
    const deps = makeDeps({ fetchChaos: async (id) => (id === 'a' ? null : source(id)) });

    const { dir, warnings } = await runSync(config, deps);

    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
    expect(meta.usage).toMatchObject({ statsFormatId: 'b', isFallback: true });
    expect(warnings.some((w) => w.includes('Usage comes from b'))).toBe(true);
  });

  it('writes a snapshot without usage when no stats id has data', async () => {
    const deps = makeDeps({ fetchChaos: async () => null });

    const { dir } = await runSync(config, deps);

    const snapshot = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
    expect(snapshot.usage).toBeNull();
  });

  it('leaves the previous snapshot untouched when validation fails', async () => {
    const deps = makeDeps({ loadShowdown: () => showdownData('ghostmove') });
    const dir = join(deps.dataDir, 'fmt');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'snapshot.json'), 'LAST-GOOD');

    await expect(runSync(config, deps)).rejects.toThrow(/unknown move "ghostmove"/);

    expect(readFileSync(join(dir, 'snapshot.json'), 'utf8')).toBe('LAST-GOOD');
  });

  it('leaves the previous snapshot untouched when a fetch throws', async () => {
    const deps = makeDeps({
      fetchChaos: async () => {
        throw new Error('Smogon stats: HTTP 500');
      },
    });
    const dir = join(deps.dataDir, 'fmt');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'snapshot.json'), 'LAST-GOOD');

    await expect(runSync(config, deps)).rejects.toThrow(/HTTP 500/);

    expect(readFileSync(join(dir, 'snapshot.json'), 'utf8')).toBe('LAST-GOOD');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx vitest run sync/run.test.ts
```

Expected: FAIL (cannot resolve `./run`).

- [ ] **Step 3: Implement the orchestrator**

`sync/run.ts`:

```ts
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
```

- [ ] **Step 4: Run tests**

```powershell
npx vitest run sync/run.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Write the CLI**

`sync/index.ts`:

```ts
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
```

- [ ] **Step 6: Run the full unit suite and typecheck**

```powershell
npm test
npm run typecheck
```

Expected: every unit test PASSES (Tasks 1–4, 6, 7); no type errors.

- [ ] **Step 7: Run the real sync**

```powershell
npm run sync
```

Expected output (the month may be newer than 2026-08 if run later):

```
OK   gen9championsvgc2026regmc -> ...\data\gen9championsvgc2026regmc
     warning: Dropped usage for N species not legal in gen9championsvgc2026regmc: ...   (only if any)
     warning: Usage comes from gen9championsvgc2026regmb (2026-08) because gen9championsvgc2026regmc has no published stats yet.
OK   gen9championsvgc2026regmb -> ...\data\gen9championsvgc2026regmb
```

If Reg M-C stats have been published by the time this runs, the "Usage comes from" warning is absent and `isFallback` is `false`; that is correct. If either format prints `FAIL`, read the message; do not work around a validation failure by loosening `DEFAULT_LIMITS` without understanding why it tripped.

- [ ] **Step 8: Check the output**

```powershell
Get-Content data/gen9championsvgc2026regmc/meta.json
Get-ChildItem data -Recurse -File | Select-Object FullName, @{n='MB';e={[math]::Round($_.Length/1MB,2)}}
```

Expected: `meta.json` shows `usage.statsFormatId`, `usage.month`, `usage.isFallback`, `showdown.packageVersion`, and `showdown.rules.adjustLevel: 50`. Each `snapshot.json` is under 5 MB. If one is over 5 MB, lower `topTeammates` in `DEFAULT_PRUNE` (`sync/smogon/chaos.ts`) to `50`, re-run `npm test` (the `topTeammates` test uses an explicit override and is unaffected) and `npm run sync`, and check again.

- [ ] **Step 9: Sanity-check the lift on real data**

Create a throwaway script `scripts/lift-check.ts`:

```ts
import { readFileSync } from 'node:fs';
import { teammateLift } from '../src/domain/usage';
import type { Snapshot } from '../src/domain/types';

const snapshot = JSON.parse(readFileSync('data/gen9championsvgc2026regmb/snapshot.json', 'utf8')) as Snapshot;
if (!snapshot.usage) throw new Error('snapshot has no usage data');
console.log('kingambit -> incineroar lift:', teammateLift(snapshot.usage, 'kingambit', 'incineroar'));
console.log('teams:', snapshot.usage.teams);
```

Run it, then delete it:

```powershell
npx tsx scripts/lift-check.ts
Remove-Item scripts -Recurse
```

Expected: a lift near `0.68` for the 2026-08 data (it will drift slightly with newer months) and `teams` near `195000`. A value wildly different (for example above 3 or below 0.1) means the semantics in the spec have not held; stop and report.

- [ ] **Step 10: Commit code and generated data**

```powershell
git add sync/run.ts sync/run.test.ts sync/index.ts data
git commit -m "feat(sync): add sync orchestration, CLI and first generated snapshots" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Real-data chaos sample (added to satisfy the spec's fixture-testing requirement)

The spec's Testing section requires sync parser tests against saved fixture files from the real sources. Task 2's fixtures are hand-built imitations, so this task saves a trimmed real Smogon sample and locks the verified data semantics in a test. Your task ends before the "## Self-Review" heading; ignore any text after it.

**Files:**
- Create: `sync/smogon/fixtures/chaos-sample.json` (generated, then committed)
- Create: `scripts/make-chaos-sample.ts` (throwaway; deleted before committing)
- Test: `sync/smogon/chaos.real-sample.test.ts`

**Interfaces:**
- Consumes: `fetchLatestChaos` (Task 4), `parseChaos`, `pruneChaos`, `parseSpread`, `DEFAULT_PRUNE` (Task 2), `teammateLift`, `cooccurrence` (Task 3).
- Produces: nothing later tasks use.

- [ ] **Step 1: Generate the fixture from the live Smogon data**

`scripts/make-chaos-sample.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseChaos } from '../sync/smogon/chaos';
import { fetchLatestChaos } from '../sync/smogon/fetch';

const KEEP = ['Kingambit', 'Incineroar', 'Whimsicott'];

function top(counts: Record<string, number>, n: number): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n));
}

const source = await fetchLatestChaos('gen9championsvgc2026regmb', 1630);
if (!source) throw new Error('no chaos file found for gen9championsvgc2026regmb at cutoff 1630');
const raw = parseChaos(source.text);

const data = Object.fromEntries(
  KEEP.map((name) => {
    const mon = raw.data[name];
    if (!mon) throw new Error(`${name} missing from the chaos file`);
    // Abilities and Teammates stay complete (the semantics tests need them); the bulky tables are trimmed.
    return [name, { ...mon, Spreads: top(mon.Spreads, 25), Moves: top(mon.Moves, 20), Items: top(mon.Items, 20) }];
  }),
);

mkdirSync('sync/smogon/fixtures', { recursive: true });
writeFileSync('sync/smogon/fixtures/chaos-sample.json', JSON.stringify({ info: raw.info, data }));
console.log(`sample from ${source.month}: ${source.url}`);
```

Run it, then delete the script:

```powershell
npx tsx scripts/make-chaos-sample.ts
Remove-Item scripts -Recurse
Get-Item sync/smogon/fixtures/chaos-sample.json | Select-Object Name, Length
```

Expected: prints `sample from 2026-08: ...` (or a later month); the fixture exists and is well under 200 KB. If it is over 200 KB, lower the three `top(...)` limits and re-run.

- [ ] **Step 2: Write the test**

`sync/smogon/chaos.real-sample.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cooccurrence, teammateLift } from '../../src/domain/usage';
import { DEFAULT_PRUNE, parseChaos, parseSpread, pruneChaos } from './chaos';

// A trimmed real sample of Smogon's gen9championsvgc2026regmb-1630 chaos file.
// If Smogon changes the file's shape or semantics, these tests fail instead of production.
const text = readFileSync(new URL('./fixtures/chaos-sample.json', import.meta.url), 'utf8');

describe('real Smogon chaos sample', () => {
  const raw = parseChaos(text);
  const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

  it('parses with the expected metagame and cutoff', () => {
    expect(raw.info.metagame).toBe('gen9championsvgc2026regmb');
    expect(raw.info.cutoff).toBe(1630);
    expect(Object.keys(raw.data).sort()).toEqual(['Incineroar', 'Kingambit', 'Whimsicott']);
  });

  it('has usage as a fraction of teams', () => {
    for (const mon of Object.values(raw.data)) {
      expect(mon.usage).toBeGreaterThan(0);
      expect(mon.usage).toBeLessThan(1);
    }
  });

  it('gives the same weighted team count for every species (weight / usage)', () => {
    const teams = Object.values(raw.data).map((mon) => sum(mon.Abilities) / mon.usage);
    expect(Math.max(...teams) / Math.min(...teams)).toBeLessThan(1.02);
  });

  it('reports teammate co-occurrence symmetrically', () => {
    const a = raw.data.Kingambit.Teammates.Incineroar;
    const b = raw.data.Incineroar.Teammates.Kingambit;
    expect(a).toBeGreaterThan(0);
    expect(Math.abs(a - b) / a).toBeLessThan(1e-6);
  });

  it('uses nature plus six stat points of at most 32 each, totalling at most 66', () => {
    for (const mon of Object.values(raw.data)) {
      for (const key of Object.keys(mon.Spreads)) {
        const spread = parseSpread(key);
        expect(spread, `spread key ${key}`).not.toBeNull();
        expect(spread!.points.every((p) => p >= 0 && p <= 32), key).toBe(true);
        expect(spread!.points.reduce((a, b) => a + b, 0), key).toBeLessThanOrEqual(66);
      }
    }
  });

  it('prunes into usage data whose co-occurrence and lift are computable', () => {
    const usage = pruneChaos(raw, { ...DEFAULT_PRUNE, minUsage: 0 });
    expect(usage.teams).toBeGreaterThan(100_000);
    expect(cooccurrence(usage, 'kingambit', 'incineroar')).toBeGreaterThan(0);
    // Bounds rather than an exact value, so the test survives regenerating the sample from a later month.
    const lift = teammateLift(usage, 'kingambit', 'incineroar');
    expect(lift).not.toBeNull();
    expect(lift!).toBeGreaterThan(0.2);
    expect(lift!).toBeLessThan(3);
  });
});
```

- [ ] **Step 3: Run the test and typecheck**

```powershell
npx vitest run sync/smogon/chaos.real-sample.test.ts
npm run typecheck
```

Expected: all 6 tests PASS; no type errors. A failure here is a finding about the real data, not a reason to loosen the test; report it.

- [ ] **Step 4: Commit**

```powershell
git add sync/smogon/fixtures/chaos-sample.json sync/smogon/chaos.real-sample.test.ts
git commit -m "test(sync): lock Smogon chaos semantics against a real data sample" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review (spec coverage)

| Spec requirement | Where |
|---|---|
| Data layer sources: Showdown data + rules, Smogon chaos | Tasks 4, 5 |
| Snapshot per format id + `meta.json` (source month, fetch time, cutoff) | Tasks 1, 6, 7 |
| Config-driven formats, no per-regulation code | Task 6 (`FORMATS`) |
| Default cutoff 1630, configurable | Task 6 (`FormatConfig.cutoff`) |
| Missing usage is a soft state (`usage: null`, meta says so) | Task 6 tests |
| Usage fallback with meta record and dropped-species warning | Tasks 6, 7 |
| Defensive parsing; fail loudly; keep last good snapshot | Tasks 2, 4, 6, 7 (`LAST-GOOD` tests) |
| App never fetches Smogon directly | Architecture: snapshot only (no app code in this plan) |
| Snapshot stores `weight`, `usage`, weighted team count | Tasks 1, 2 |
| Lift formula and "missing pair is no data" | Task 3 |
| Set model: nature + stat points, no EVs | Task 1 (`Spread`), Task 2 (`parseSpread`); set entry/validation is a later increment |
| Sync parser fixture tests | Tasks 2, 4 (in-repo fixtures); Task 8 (saved real Smogon sample); real-package check in Task 5 |

Type names used across tasks were checked for consistency: `ID`, `toID`, `Snapshot`, `SnapshotMeta`, `UsageData`, `UsageEntry`, `Spread`, `FormatRules`, `SpeciesEntry`, `MoveEntry`, `ChaosSource`, `ShowdownFormatData`, `FormatConfig`, `Limits`, `BuildInputs`, `SyncDeps`, `parseChaos`, `pruneChaos`, `DEFAULT_PRUNE`, `fetchLatestChaos`, `loadShowdownFormat`, `buildSnapshot`, `validateSnapshot`, `writeSnapshot`, `runSync`, `cooccurrence`, `teammateLift`.

---

## Later increments (outlined; each gets its own plan)

These depend on this plan's snapshot and `src/domain` types. Details are deliberately not fixed yet.

1. **Domain models and league config.** Set model (species, nature, six stat points 0–32 summing to at most 66, moves, item, ability, tera or format equivalent), league config (basics, draft order, points, league rules), JSON export/import with validation. First step: confirm the 32/66 limits against the Showdown Champions mod's `scripts.ts`.
2. **Draft board.** Pick recording, derived pool/budget/turn, snake and linear order, undo. Pure state logic in `src/domain`, tested without UI.
3. **Teambuilder.** Roster slots, set validation against the snapshot's learnsets and rules, Showdown paste import/export.
4. **Suggestion engine, stage 1.** `suggest(...)` pipeline, candidate filtering with the budget reservation, type synergy, usage lift (using `teammateLift`), weight re-normalization for missing signals, structured reasons.
5. **Suggestion engine, stages 2 and 3.** Role/mechanics tag table, set-specific interactions.
6. **App shell and hosting.** React UI wiring (league setup, draft board, teambuilder, suggestions panel with per-signal breakdown and adjustable weights), snapshot loading with age and fallback warnings, static hosting, and the scheduled sync job that runs `npm run sync` and rebuilds.

Open items to resolve when their increment starts: how to treat a roster larger than the bring size (v1 scores the whole roster); and whether to store more than the top 80 teammates per species if lift coverage for niche pairs turns out too thin (measure on the real snapshot first).
