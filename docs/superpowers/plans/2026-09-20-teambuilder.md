# Teambuilder Logic (Plan 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an item table to the snapshot (via the sync), then build the pure logic on top of it: set validation against the format, stat calculation, roster sets, match teams with Item and Species Clause checks, and saved-file version 2.

**Architecture:** The sync reads legal items from the Showdown Champions mod into `snapshot.items` (`schemaVersion` 2) and regenerates the committed data once. New domain modules in `src/domain/` are pure functions that return `Problem[]` and never throw, in the same style as the league/draft code: `validateSetAgainstSnapshot`, `computeStats`, `validateTeam`. The saved file gains `sets` and `teams` and migrates version 1 files on read.

**Tech Stack:** TypeScript (ESM), Vitest, the existing `pokemon-showdown` dev dependency for the sync. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-20-teambuilder-design.md` (parents: `docs/superpowers/specs/2026-09-20-draft-lab-design.md`, `docs/superpowers/specs/2026-09-20-league-draft-design.md`). Read the teambuilder spec first; it is the binding authority for this plan.

## Global Constraints

- Scope: roster sets plus match teams. Out of scope: Showdown paste import/export (Plan 2), choosing which 4 to bring, any UI, browser storage.
- Bad input never throws; every validator returns `Problem[]` (`{ path, message }`). All new functions are pure and never modify their arguments. Use `Object.hasOwn` for every lookup keyed by a species, item, move or set id.
- `Snapshot.schemaVersion` and `SnapshotMeta.schemaVersion` become the literal `2`. `Snapshot` gains `items: Record<ID, ItemEntry>` where `ItemEntry = { id: ID; name: string; usableBy?: ID[] }`.
- Stat formula (level fixed at 50, no IVs): HP = `base + points + 75`; other stats `v = base + points + 20`, then a raised stat is `Math.floor((v * 110) / 100)` and a lowered stat `Math.floor((v * 90) / 100)`. Missing nature is neutral; missing points are 0.
- Set rules (in `validateSetAgainstSnapshot`): species legal; ability (if set) is one of the species' abilities by `toID`; every move is in `snapshot.learnsets[species]`; item (if set) is in `snapshot.items`, and a restricted item (`usableBy`) needs the species id or `toID(baseSpecies)` in `usableBy` UNLESS it is the species' own `requiredItem`; a species with a `requiredItem` must hold exactly that item.
- Team rules (in `validateTeam`): at most `teamSize` members; no repeats; members on the roster; each member's set passes; Species Clause compares `species.num`; Item Clause compares item ids. Choosing 4 to bring is not modeled.
- Sync failures stay loud: a validation failure fails the run and leaves the previous snapshot files untouched. A legal species whose `requiredItem` is not a legal item is a WARNING in `meta.warnings`, never a failure (three Ogerpon tera formes today).
- New domain files import only from `./id`, `./types`, `./natures`, `./set` and each other (no `sync/` imports). `sync/` may import from `src/domain/`.
- The item id `nothing` in Smogon usage data means "no item"; it is never a legal item id and cross-checks skip it.
- Commits end with the trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (copy it verbatim; never substitute another model name).

## Environment notes

- Windows + PowerShell. Node was installed after the Claude app started, so a fresh shell may not find `node`/`npm`. Start every PowerShell command with:
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User");`
- The repo path contains a space: quote it.
- Single test file: `npx vitest run <path>`. Whole unit suite: `npm test`. Types: `npm run typecheck`. Real-package tests (slow): `npm run test:integration`. The baseline before this plan is 182 unit tests and 9 integration tests, all passing.
- `npm run sync` (Task 2) needs network access and takes up to a couple of minutes.

---

## File Structure

```
Modify: src/domain/types.ts                     ItemEntry; Snapshot.items; schemaVersion 2 (Snapshot and SnapshotMeta)
Modify: sync/showdown/source.ts                 loader reads items and warnings
Modify: sync/build.ts                           Limits.minItems; validateSnapshot; buildSnapshot
Modify: sync/build.test.ts, sync/run.test.ts    fixtures + new tests
Modify: sync/showdown/source.integration.test.ts   real-package item tests
Modify: sync/snapshot-agreement.test.ts         item cross-checks (Task 2)
Regenerate: data/gen9championsvgc2026regmb/     snapshot.json, meta.json (Task 2)
Create: src/domain/stats.ts, stats.test.ts      LEVEL, Stats, computeStats, computeSetStats
Create: src/domain/set-check.ts, set-check.test.ts   SetSnapshot, validateSetAgainstSnapshot
Modify: src/domain/test-support.ts              speciesEntry, moveEntry, itemEntry, setSnapshot (Task 4)
Create: src/domain/team.ts, team.test.ts        RosterSets, MatchTeam, TeamCheck, validateTeam
Modify: src/domain/file.ts, file.test.ts        saved file version 2
Modify: src/domain/mock-draft.test.ts           two lines for version 2
Create: src/domain/teambuilder-real.test.ts     real-snapshot tests (Task 7)
Modify: README.md                               Task 7
```

---

### Task 1: The item table in the sync pipeline

**Files:**
- Modify: `src/domain/types.ts`, `sync/showdown/source.ts`, `sync/build.ts`
- Modify (tests): `sync/build.test.ts`, `sync/run.test.ts`, `sync/showdown/source.integration.test.ts`

**Interfaces:**
- Consumes: existing `ShowdownFormatData`, `Limits`, `buildSnapshot`, `validateSnapshot`, `toID`.
- Produces:
  - `interface ItemEntry { id: ID; name: string; usableBy?: ID[] }` and `Snapshot.items: Record<ID, ItemEntry>` in `src/domain/types.ts`; `Snapshot.schemaVersion: 2`; `SnapshotMeta.schemaVersion: 2`.
  - `ShowdownFormatData.items: Record<ID, ItemEntry>` and `ShowdownFormatData.warnings: string[]`.
  - `Limits.minItems: number`; `DEFAULT_LIMITS = { minSpecies: 150, minMoves: 100, minItems: 100 }`.
  - `validateSnapshot` also rejects: too few items; an item whose table key differs from its `id`; a `usableBy` id that is not a legal species.

- [ ] **Step 1: Update the sync tests first**

`sync/build.test.ts`: change the type import on line 10 to add `ItemEntry`:

```ts
import type { ItemEntry, MoveEntry, Snapshot, SpeciesEntry, UsageData, UsageEntry } from '../src/domain/types';
```

Change line 13 to:

```ts
const limits = { minSpecies: 2, minMoves: 1, minItems: 1 };
```

Add this helper after the `move` helper:

```ts
function item(id: string, name: string, usableBy?: string[]): ItemEntry {
  return usableBy ? { id, name, usableBy } : { id, name };
}
```

In `showdownData()` add two fields after `learnsets`:

```ts
    learnsets: { incineroar: ['fakeout'], kingambit: [] },
    items: {
      sitrusberry: item('sitrusberry', 'Sitrus Berry'),
      staraptite: item('staraptite', 'Staraptite', ['incineroar']),
    },
    warnings: [],
```

In the test `refuses to build when there are too few species`, change `limits: { minSpecies: 5, minMoves: 1 }` to `limits: { minSpecies: 5, minMoves: 1, minItems: 1 }`.

Add these tests inside `describe('buildSnapshot', ...)`, after the last existing test there:

```ts
  it('puts the item table in the snapshot and marks both files schemaVersion 2', () => {
    const { snapshot, meta } = buildSnapshot({ config, showdown: showdownData(), chaos: null, now, limits });
    expect(snapshot.schemaVersion).toBe(2);
    expect(meta.schemaVersion).toBe(2);
    expect(Object.keys(snapshot.items).sort()).toEqual(['sitrusberry', 'staraptite']);
    expect(snapshot.items.staraptite).toEqual({ id: 'staraptite', name: 'Staraptite', usableBy: ['incineroar'] });
  });

  it('appends the loader warnings to meta.warnings, after the usage warnings', () => {
    const showdown = { ...showdownData(), warnings: ['Dropped 2 restricted-species entries'] };
    const { meta } = buildSnapshot({ config, showdown, chaos: null, now, limits });
    expect(meta.warnings).toHaveLength(2);
    expect(meta.warnings[0]).toContain('No usage data found');
    expect(meta.warnings[1]).toBe('Dropped 2 restricted-species entries');
  });

  it('refuses to build when there are too few items', () => {
    expect(() =>
      buildSnapshot({ config, showdown: showdownData(), chaos: null, now, limits: { ...limits, minItems: 5 } }),
    ).toThrow(/only 2 items/);
  });

  it('does not refuse a legal species whose required item is missing from the table (the loader warns instead)', () => {
    const showdown = showdownData();
    showdown.species.kingambit = { ...species('kingambit', 'Kingambit'), requiredItem: 'Ghost Stone' };
    expect(() => buildSnapshot({ config, showdown, chaos: null, now, limits })).not.toThrow();
  });
```

Add these tests inside `describe('validateSnapshot', ...)`, after the existing `rejects a usage share ...` test:

```ts
  it('rejects an item whose table key differs from its id', () => {
    const snapshot = validSnapshot();
    const broken = { ...snapshot, items: { ...snapshot.items, wrongkey: item('sitrusberry', 'Sitrus Berry') } };
    expect(() => validateSnapshot(broken, limits)).toThrow(/item table key "wrongkey" does not match its id "sitrusberry"/);
  });

  it('rejects an item restricted to a species that is not legal', () => {
    const snapshot = validSnapshot();
    const broken = {
      ...snapshot,
      items: { ...snapshot.items, staraptite: item('staraptite', 'Staraptite', ['ghostmon']) },
    };
    expect(() => validateSnapshot(broken, limits)).toThrow(/item "staraptite" is restricted to "ghostmon"/);
  });
```

`sync/run.test.ts`: change line 13 to `const limits = { minSpecies: 2, minMoves: 1, minItems: 1 };`. In `showdownData(...)` add after the `learnsets` line:

```ts
    learnsets: { incineroar: [learnsetMove], kingambit: [] },
    items: { sitrusberry: { id: 'sitrusberry', name: 'Sitrus Berry' } },
    warnings: [],
```

Add this test inside `describe('runSync', ...)`, after the last existing `it`:

```ts
  it('leaves the previous snapshot untouched when the item table is empty', async () => {
    const deps = makeDeps({ loadShowdown: () => ({ ...showdownData(), items: {} }) });
    const dir = join(deps.dataDir, 'fmt');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'snapshot.json'), 'LAST-GOOD');

    await expect(runSync(config, deps)).rejects.toThrow(/only 0 items/);

    expect(readFileSync(join(dir, 'snapshot.json'), 'utf8')).toBe('LAST-GOOD');
  });
```

`sync/showdown/source.integration.test.ts`: add these tests inside the `describe.each` callback, before the closing `},` line (after the `reports level 50 flat rules` test):

```ts
    it('has the legal Champions items with display names', () => {
      const count = Object.keys(data.items).length;
      expect(count).toBeGreaterThanOrEqual(100);
      expect(count).toBeLessThan(400);
      expect(data.items.sitrusberry).toEqual({ id: 'sitrusberry', name: 'Sitrus Berry' });
    });

    it('leaves out items that are not legal in Champions', () => {
      expect(data.items.assaultvest).toBeUndefined(); // marked Past in the Champions mod
    });

    it('ties a Mega stone to the species that can hold it, and only to legal species', () => {
      expect(data.items.staraptite?.usableBy).toContain('staraptor');
      for (const entry of Object.values(data.items)) {
        for (const speciesId of entry.usableBy ?? []) {
          expect(data.species[speciesId], `${entry.id} usableBy ${speciesId}`).toBeDefined();
        }
      }
    });

    it('warns about restricted-species entries it dropped and about required items that are not legal items', () => {
      // Light Ball lists 15 Pikachu forms that are not legal species here.
      expect(data.warnings.some((w) => w.startsWith('Dropped') && w.includes('lightball'))).toBe(true);
      // The package data lists three Ogerpon tera formes as legal but their masks are not legal items.
      // If a package update makes these consistent this test will fail: review, then update it.
      expect(
        data.warnings.some((w) => w.includes('ogerponwellspringtera') && w.includes('Wellspring Mask')),
      ).toBe(true);
    });
```

- [ ] **Step 2: Run the sync unit tests to see them fail**

```powershell
npx vitest run sync/build.test.ts sync/run.test.ts
```

Expected: the new tests FAIL (for example `schemaVersion` is 1 and `snapshot.items` is undefined; `Object.keys(undefined)`), the pre-existing tests still pass. `npm run typecheck` also reports errors until Steps 3 to 5 are done; that is expected.

- [ ] **Step 3: Update the types**

In `src/domain/types.ts`, add before `export interface Snapshot`:

```ts
export interface ItemEntry {
  id: ID;
  /** Display name, e.g. "Sitrus Berry". */
  name: string;
  /** Species ids allowed to hold it (Mega stones and similar). Absent means anyone. */
  usableBy?: ID[];
}
```

Change `Snapshot`:

```ts
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
```

Change `SnapshotMeta.schemaVersion` from `1` to `2`.

- [ ] **Step 4: Update the builder and validator**

In `sync/build.ts`:

```ts
export interface Limits {
  minSpecies: number;
  minMoves: number;
  minItems: number;
}

export const DEFAULT_LIMITS: Limits = { minSpecies: 150, minMoves: 100, minItems: 100 };
```

In `validateSnapshot`, after the `moveCount` check block (after the `only ${moveCount} moves` push), add:

```ts
  const itemCount = Object.keys(snapshot.items).length;
  if (itemCount < limits.minItems) {
    problems.push(`only ${itemCount} items (expected at least ${limits.minItems})`);
  }
  for (const [key, item] of Object.entries(snapshot.items)) {
    if (item.id !== key) problems.push(`item table key "${key}" does not match its id "${item.id}"`);
    for (const speciesId of item.usableBy ?? []) {
      if (!snapshot.species[speciesId]) {
        problems.push(`item "${key}" is restricted to "${speciesId}", which is not a legal species`);
      }
    }
  }
```

In `buildSnapshot`, just before `const snapshot: Snapshot = {`, add:

```ts
  warnings.push(...showdown.warnings);
```

and change the snapshot and meta literals: `schemaVersion: 2` in both, and add `items: showdown.items,` to the snapshot literal after `learnsets`.

- [ ] **Step 5: Update the loader**

In `sync/showdown/source.ts`:

Change the imports:

```ts
import { toID, type ID } from '../../src/domain/id';
import type { FormatRules, ItemEntry, MoveEntry, SpeciesEntry, StatTable } from '../../src/domain/types';
```

Add after the `SdMove` interface:

```ts
interface SdItem {
  exists: boolean;
  id: string;
  name: string;
  isNonstandard?: string | null;
  /** Species names allowed to hold the item (Mega stones and similar). */
  itemUser?: string[];
}
```

In `SdDex` add after the `moves` line:

```ts
  items: { all(): SdItem[] };
```

In `ShowdownFormatData` add after `learnsets`:

```ts
  items: Record<ID, ItemEntry>;
  /** Non-fatal findings worth surfacing in meta.json. */
  warnings: string[];
```

In `loadShowdownFormat`, immediately before the final `return {`, add:

```ts
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
```

and add `items,` and `warnings,` to the returned object after `learnsets,`.

- [ ] **Step 6: Run the unit tests and typecheck**

```powershell
npx vitest run sync/build.test.ts sync/run.test.ts
npm run typecheck
npm test
```

Expected: all pass. One caveat: `src/domain/mock-draft.test.ts` and `sync/snapshot-agreement.test.ts` read the committed snapshot, which is still the version-1 file; they only use `species`, `learnsets`, `usage` and `formatId`, so they still pass. The type cast `as Snapshot` hides the missing `items` until Task 2.

- [ ] **Step 7: Run the real-package tests**

```powershell
npm run test:integration
```

Expected: PASS (the earlier 9 plus 4 new). If `ogerponwellspringtera` or the Light Ball warning assertions fail, print `data.warnings` and report the real output rather than editing the assertion.

- [ ] **Step 8: Commit**

```powershell
git add src/domain/types.ts sync/showdown/source.ts sync/build.ts sync/build.test.ts sync/run.test.ts sync/showdown/source.integration.test.ts
git commit -m "feat(sync): read legal items into the snapshot (schemaVersion 2)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Regenerate the committed snapshot and cross-check its items

**Files:**
- Modify: `sync/snapshot-agreement.test.ts`
- Regenerate: `data/gen9championsvgc2026regmb/snapshot.json`, `data/gen9championsvgc2026regmb/meta.json`

**Interfaces:**
- Consumes: Task 1's `Snapshot.items`; `toID` from `src/domain/id`.
- Produces: a committed version-2 snapshot with an item table that Tasks 4 to 7 read.

- [ ] **Step 1: Write the cross-check tests**

In `sync/snapshot-agreement.test.ts` add the import `import { toID } from '../src/domain/id';` after the existing imports, and add these tests inside the `describe(...)` block, after the last existing test:

```ts
  it('is a version 2 snapshot with the legal item table', () => {
    expect(snapshot.schemaVersion).toBe(2);
    expect(Object.keys(snapshot.items).length).toBeGreaterThanOrEqual(100);
    expect(snapshot.items.sitrusberry?.name).toBe('Sitrus Berry');
    expect(snapshot.items.assaultvest).toBeUndefined(); // marked Past in the Champions mod
    expect(snapshot.items.staraptite?.usableBy).toContain('staraptor');
  });

  it('every item a species runs in at least 1% of real sets is in the item table', () => {
    const violations: string[] = [];
    let checked = 0;
    for (const [speciesId, entry] of Object.entries(snapshot.usage?.species ?? {})) {
      for (const [itemId, share] of entry.items) {
        if (share < 0.01 || itemId === 'nothing') continue; // Smogon's id for "no item"
        checked += 1;
        if (!Object.hasOwn(snapshot.items, itemId)) {
          violations.push(`${speciesId} runs ${itemId} in ${percent(share)} of sets but it is not in the item table`);
        }
      }
    }
    // Floor so this cannot pass vacuously (977 pairs when this was written).
    expect(checked).toBeGreaterThanOrEqual(500);
    expect(violations).toEqual([]);
  });

  it('no species that appears in real usage requires an item the table lacks', () => {
    const problems: string[] = [];
    let withRequiredItem = 0;
    for (const speciesId of Object.keys(snapshot.usage?.species ?? {})) {
      const required = snapshot.species[speciesId]?.requiredItem;
      if (!required) continue;
      withRequiredItem += 1;
      if (!Object.hasOwn(snapshot.items, toID(required))) {
        problems.push(`${speciesId} requires ${required}, which is not in the item table`);
      }
    }
    expect(withRequiredItem).toBeGreaterThanOrEqual(20); // 73 when this was written
    expect(problems).toEqual([]);
  });
```

- [ ] **Step 2: Run them against the OLD snapshot to see them fail**

```powershell
npx vitest run sync/snapshot-agreement.test.ts
```

Expected: the three new tests FAIL (the committed snapshot has no `items`: `schemaVersion` is 1 and `Object.keys(undefined)` / `Object.hasOwn(undefined, ...)` throw). The older tests in the file pass.

- [ ] **Step 3: Regenerate the snapshot**

```powershell
npm run sync
```

(Network access; it loads the large package, so allow a few minutes.) Expected output: `OK   gen9championsvgc2026regmb -> ...\data\gen9championsvgc2026regmb` followed by `warning:` lines: one starting `Dropped ... restricted-species entries that are not legal in gen9championsvgc2026regmb (` that includes `lightball`, and three lines for `ogerponwellspringtera`, `ogerponhearthflametera` and `ogerponcornerstonetera` saying their mask is not a legal item. Exit code 0. If it prints `FAIL`, capture the message and stop; do not loosen any limit.

- [ ] **Step 4: Inspect the regenerated files**

```powershell
Get-Content data/gen9championsvgc2026regmb/meta.json
Get-ChildItem data -Recurse -File | Select-Object FullName, @{n='MB';e={[math]::Round($_.Length/1MB,2)}}
git diff --stat data
```

Expected: `meta.json` shows `"schemaVersion": 2` and the warnings above; `snapshot.json` is still well under 5 MB. Run this to confirm the item count and shape:

```powershell
node -e "const s=require('./data/gen9championsvgc2026regmb/snapshot.json'); console.log(s.schemaVersion, Object.keys(s.items).length, JSON.stringify(s.items.sitrusberry), JSON.stringify(s.items.staraptite))"
```

Expected: `2 148 {"id":"sitrusberry","name":"Sitrus Berry"} {"id":"staraptite","name":"Staraptite","usableBy":["staraptor"]}` (the count may differ slightly if the package changed; it must be at least 100).

- [ ] **Step 5: Run the tests**

```powershell
npx vitest run sync/snapshot-agreement.test.ts
npm test
npm run typecheck
```

Expected: PASS. A failure of the item cross-check on real data is a FINDING (report the violation list), not a reason to loosen the 1% threshold, the floors, or the `nothing` skip.

- [ ] **Step 6: Commit**

```powershell
git add sync/snapshot-agreement.test.ts data/gen9championsvgc2026regmb
git commit -m "feat(data): regenerate the Reg M-B snapshot with the item table" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Stat calculation

**Files:**
- Create: `src/domain/stats.ts`
- Test: `src/domain/stats.test.ts`

**Interfaces:**
- Consumes: `StatName`, `StatTable`, `Snapshot` from `./types`; `NatureName`, `NATURES`, `Nature` from `./natures`; `PokemonSet`, `StatPoints`, `STAT_NAMES` from `./set`.
- Produces:
  - `const LEVEL = 50`; `type Stats = Record<StatName, number>`
  - `computeStats(baseStats: StatTable, nature?: NatureName, points?: StatPoints): Stats`
  - `computeSetStats(set: PokemonSet, snapshot: Pick<Snapshot, 'species'>): Stats | null`

- [ ] **Step 1: Write the failing tests**

`src/domain/stats.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { NatureName } from './natures';
import type { PokemonSet, StatPoints } from './set';
import { computeSetStats, computeStats, LEVEL } from './stats';
import type { StatTable } from './types';

const INCINEROAR: StatTable = { hp: 95, atk: 115, def: 90, spa: 80, spd: 90, spe: 60 };
const FLAT: StatTable = { hp: 50, atk: 50, def: 50, spa: 50, spd: 50, spe: 50 };
const points = (overrides: Partial<StatPoints> = {}): StatPoints => ({
  hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...overrides,
});

describe('LEVEL', () => {
  it('is 50', () => {
    expect(LEVEL).toBe(50);
  });
});

describe('computeStats', () => {
  it('computes the worked Incineroar example (Jolly, 2 HP / 32 Atk / 32 Spe)', () => {
    // HP 95+2+75; Atk 115+32+20; Def 90+20; SpA (80+20)*0.9; SpD 90+20; Spe (60+32+20)*1.1 = 123.2 -> 123
    expect(computeStats(INCINEROAR, 'Jolly', points({ hp: 2, atk: 32, spe: 32 }))).toEqual({
      hp: 172, atk: 167, def: 110, spa: 90, spd: 110, spe: 123,
    });
  });

  it('uses base + 75 for HP and base + 20 for the rest when there is no nature and no points', () => {
    expect(computeStats(INCINEROAR)).toEqual({ hp: 170, atk: 135, def: 110, spa: 100, spd: 110, spe: 80 });
  });

  it('leaves every stat alone for a neutral nature', () => {
    expect(computeStats(INCINEROAR, 'Hardy', points())).toEqual(computeStats(INCINEROAR));
  });

  it('truncates a lowered stat that has a fractional result', () => {
    // Mild: +SpA -Def. Def 81+20 = 101 -> 101*90/100 = 90.9 -> 90. SpA 75+20 = 95 -> 95*110/100 = 104.5 -> 104.
    expect(computeStats({ hp: 50, atk: 50, def: 81, spa: 75, spd: 50, spe: 50 }, 'Mild')).toEqual({
      hp: 125, atk: 70, def: 90, spa: 104, spd: 70, spe: 70,
    });
  });

  it('adds the stat points before the nature is applied', () => {
    // Modest: +SpA -Atk. SpA 75+32+20 = 127 -> 139.7 -> 139. Atk 50+20 = 70 -> 63.
    expect(computeStats({ hp: 50, atk: 50, def: 50, spa: 75, spd: 50, spe: 50 }, 'Modest', points({ spa: 32 }))).toEqual({
      hp: 125, atk: 63, def: 70, spa: 139, spd: 70, spe: 70,
    });
  });

  it('never applies a nature to HP', () => {
    for (const nature of ['Adamant', 'Bold', 'Timid', 'Calm', 'Modest'] as NatureName[]) {
      expect(computeStats(FLAT, nature, points({ hp: 10 })).hp).toBe(50 + 10 + 75);
    }
  });

  it('treats a missing stat in a partial points object as 0', () => {
    const partial = { atk: 10 } as unknown as StatPoints;
    expect(computeStats(FLAT, undefined, partial)).toEqual({ hp: 125, atk: 80, def: 70, spa: 70, spd: 70, spe: 70 });
  });

  it('treats an unknown nature name as neutral', () => {
    expect(computeStats(FLAT, 'Bogus' as unknown as NatureName)).toEqual(computeStats(FLAT));
  });

  it('does not modify its inputs', () => {
    const base = { ...INCINEROAR };
    const spent = points({ atk: 32 });
    const before = JSON.stringify({ base, spent });
    computeStats(base, 'Jolly', spent);
    expect(JSON.stringify({ base, spent })).toBe(before);
  });
});

describe('computeSetStats', () => {
  const snapshot = { species: { incineroar: { baseStats: INCINEROAR } } } as unknown as Parameters<typeof computeSetStats>[1];

  it('looks the species up and applies its nature and points', () => {
    const set: PokemonSet = { species: 'incineroar', nature: 'Jolly', points: points({ hp: 2, atk: 32, spe: 32 }) };
    expect(computeSetStats(set, snapshot)).toEqual({ hp: 172, atk: 167, def: 110, spa: 90, spd: 110, spe: 123 });
  });

  it('works for a species-only set', () => {
    expect(computeSetStats({ species: 'incineroar' }, snapshot)).toEqual(computeStats(INCINEROAR));
  });

  it('returns null, and does not throw, for an unknown species or a malformed set', () => {
    expect(computeSetStats({ species: 'ghost' }, snapshot)).toBeNull();
    expect(computeSetStats({ species: 'constructor' }, snapshot)).toBeNull();
    expect(computeSetStats(null as unknown as PokemonSet, snapshot)).toBeNull();
    expect(computeSetStats({ species: 5 } as unknown as PokemonSet, snapshot)).toBeNull();
  });

  it('ignores a malformed points value instead of throwing', () => {
    const set = { species: 'incineroar', points: null } as unknown as PokemonSet;
    expect(computeSetStats(set, snapshot)).toEqual(computeStats(INCINEROAR));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx vitest run src/domain/stats.test.ts
```

Expected: FAIL (cannot resolve `./stats`).

- [ ] **Step 3: Implement**

`src/domain/stats.ts`:

```ts
import { NATURES, type Nature, type NatureName } from './natures';
import { STAT_NAMES, type PokemonSet, type StatPoints } from './set';
import type { Snapshot, StatName, StatTable } from './types';

/** Champions VGC battles are fixed at level 50. */
export const LEVEL = 50;

export type Stats = Record<StatName, number>;

const NO_EFFECT: Nature = { plus: null, minus: null };

/**
 * Final battle stats, using Showdown's Champions formula for the VGC formats: HP is base + points + 75,
 * every other stat is base + points + 20, and then a raised stat is floor(v * 110 / 100) and a lowered
 * stat floor(v * 90 / 100). No IVs. A missing nature is neutral; missing points are 0.
 */
export function computeStats(baseStats: StatTable, nature?: NatureName, points?: StatPoints): Stats {
  const effect = nature !== undefined && Object.hasOwn(NATURES, nature) ? NATURES[nature] : NO_EFFECT;
  const result = {} as Stats;
  for (const stat of STAT_NAMES) {
    const spent = points?.[stat] ?? 0;
    if (stat === 'hp') {
      result.hp = baseStats.hp + spent + 75;
      continue;
    }
    const value = baseStats[stat] + spent + 20;
    if (effect.plus === stat) result[stat] = Math.floor((value * 110) / 100);
    else if (effect.minus === stat) result[stat] = Math.floor((value * 90) / 100);
    else result[stat] = value;
  }
  return result;
}

/** Stats for a set, or null if the set is malformed or its species is not in the snapshot. */
export function computeSetStats(set: PokemonSet, snapshot: Pick<Snapshot, 'species'>): Stats | null {
  if (typeof set !== 'object' || set === null) return null;
  if (typeof set.species !== 'string' || !Object.hasOwn(snapshot.species, set.species)) return null;
  return computeStats(snapshot.species[set.species].baseStats, set.nature, set.points);
}
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run src/domain/stats.test.ts
npm run typecheck
```

Expected: all stats tests PASS; no type errors.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/stats.ts src/domain/stats.test.ts
git commit -m "feat(domain): add stat calculation" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Checking a set against the format

**Files:**
- Create: `src/domain/set-check.ts`
- Modify: `src/domain/test-support.ts` (add fixtures used by Tasks 4 to 6)
- Test: `src/domain/set-check.test.ts`

**Interfaces:**
- Consumes: `toID` from `./id`; `validateSet`, `PokemonSet` from `./set`; `Problem` from `./problem`; `Snapshot` and entry types from `./types`.
- Produces:
  - `type SetSnapshot = Pick<Snapshot, 'formatId' | 'species' | 'moves' | 'learnsets' | 'items'>`
  - `validateSetAgainstSnapshot(set: PokemonSet, snapshot: SetSnapshot, path: string): Problem[]`
  - test helpers (in `test-support.ts`, used by Tasks 4 to 6): `speciesEntry(id, name, overrides?)`, `moveEntry(id, name)`, `itemEntry(id, name, usableBy?)`, `setSnapshot(): SetSnapshot`. `setSnapshot()` returns `formatId: 'fmt'` and these species (`id`: name, dex num, abilities): `incineroar` (727; Blaze, Intimidate), `staraptor` (398; Intimidate, Reckless), `staraptormega` ("Staraptor-Mega", 398, base Staraptor, requires "Staraptite"; Intimidate), `charizard` (6; Blaze, Solar Power), `charizardmegax` ("Charizard-Mega-X", 6, base Charizard, requires "Charizardite X"; Tough Claws), `floetteeternal` (670; Flower Veil), `floettemega` ("Floette-Mega", 670, base Floette, requires "Floettite"; Fairy Aura), `kingambit` (983; Defiant, Supreme Overlord, Pressure), `garchomp` (445; Sand Veil, Rough Skin), `sinistcha` (1013; Hospitality, Heatproof). Moves: `fakeout`, `flareblitz`, `partingshot`, `throatchop`, `bravebird`, `closecombat`, `suckerpunch`, `kowtowcleave`, `earthquake`, `lightofruin`. Learnsets: incineroar [fakeout, flareblitz, partingshot, throatchop]; staraptor and staraptormega [bravebird, closecombat]; charizard and charizardmegax [flareblitz]; floetteeternal and floettemega [lightofruin]; kingambit [suckerpunch, kowtowcleave]; garchomp [earthquake]; sinistcha []. Items: `sitrusberry` "Sitrus Berry", `passhoberry` "Passho Berry", `leftovers` "Leftovers", `choicescarf` "Choice Scarf" (no restriction); `staraptite` "Staraptite" (usableBy `['staraptor']`), `charizarditex` "Charizardite X" (usableBy `['charizard']`), `floettite` "Floettite" (usableBy `['floetteeternal']`).

- [ ] **Step 1: Add the test fixtures**

In `src/domain/test-support.ts`, change the type import line to:

```ts
import type { ItemEntry, MoveEntry, SpeciesEntry, StatTable } from './types';
import type { SetSnapshot } from './set-check';
```

and append at the end of the file:

```ts
const FLAT_BASE: StatTable = { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 };

/** A complete species entry with harmless defaults. */
export function speciesEntry(id: string, name: string, overrides: Partial<SpeciesEntry> = {}): SpeciesEntry {
  return {
    id,
    name,
    num: 1,
    types: ['Normal'],
    baseStats: { ...FLAT_BASE },
    abilities: ['Pressure'],
    tags: [],
    baseSpecies: name,
    forme: '',
    requiredItem: null,
    ...overrides,
  };
}

export function moveEntry(id: string, name: string): MoveEntry {
  return { id, name, type: 'Normal', category: 'Physical', basePower: 40, accuracy: 100, priority: 0, target: 'normal', flags: [] };
}

export function itemEntry(id: string, name: string, usableBy?: string[]): ItemEntry {
  return usableBy ? { id, name, usableBy } : { id, name };
}

/** A small hand-built snapshot for set and team tests: ten species (three of them Mega forms), ten moves, seven items. */
export function setSnapshot(): SetSnapshot {
  return {
    formatId: 'fmt',
    species: {
      incineroar: speciesEntry('incineroar', 'Incineroar', {
        num: 727,
        abilities: ['Blaze', 'Intimidate'],
        baseStats: { hp: 95, atk: 115, def: 90, spa: 80, spd: 90, spe: 60 },
      }),
      staraptor: speciesEntry('staraptor', 'Staraptor', { num: 398, abilities: ['Intimidate', 'Reckless'] }),
      staraptormega: speciesEntry('staraptormega', 'Staraptor-Mega', {
        num: 398,
        abilities: ['Intimidate'],
        baseSpecies: 'Staraptor',
        forme: 'Mega',
        requiredItem: 'Staraptite',
      }),
      charizard: speciesEntry('charizard', 'Charizard', { num: 6, abilities: ['Blaze', 'Solar Power'] }),
      charizardmegax: speciesEntry('charizardmegax', 'Charizard-Mega-X', {
        num: 6,
        abilities: ['Tough Claws'],
        baseSpecies: 'Charizard',
        forme: 'Mega-X',
        requiredItem: 'Charizardite X',
      }),
      floetteeternal: speciesEntry('floetteeternal', 'Floette-Eternal', { num: 670, abilities: ['Flower Veil'] }),
      floettemega: speciesEntry('floettemega', 'Floette-Mega', {
        num: 670,
        abilities: ['Fairy Aura'],
        baseSpecies: 'Floette',
        forme: 'Mega',
        requiredItem: 'Floettite',
      }),
      kingambit: speciesEntry('kingambit', 'Kingambit', { num: 983, abilities: ['Defiant', 'Supreme Overlord', 'Pressure'] }),
      garchomp: speciesEntry('garchomp', 'Garchomp', { num: 445, abilities: ['Sand Veil', 'Rough Skin'] }),
      sinistcha: speciesEntry('sinistcha', 'Sinistcha', { num: 1013, abilities: ['Hospitality', 'Heatproof'] }),
    },
    moves: {
      fakeout: moveEntry('fakeout', 'Fake Out'),
      flareblitz: moveEntry('flareblitz', 'Flare Blitz'),
      partingshot: moveEntry('partingshot', 'Parting Shot'),
      throatchop: moveEntry('throatchop', 'Throat Chop'),
      bravebird: moveEntry('bravebird', 'Brave Bird'),
      closecombat: moveEntry('closecombat', 'Close Combat'),
      suckerpunch: moveEntry('suckerpunch', 'Sucker Punch'),
      kowtowcleave: moveEntry('kowtowcleave', 'Kowtow Cleave'),
      earthquake: moveEntry('earthquake', 'Earthquake'),
      lightofruin: moveEntry('lightofruin', 'Light of Ruin'),
    },
    learnsets: {
      incineroar: ['fakeout', 'flareblitz', 'partingshot', 'throatchop'],
      staraptor: ['bravebird', 'closecombat'],
      staraptormega: ['bravebird', 'closecombat'],
      charizard: ['flareblitz'],
      charizardmegax: ['flareblitz'],
      floetteeternal: ['lightofruin'],
      floettemega: ['lightofruin'],
      kingambit: ['suckerpunch', 'kowtowcleave'],
      garchomp: ['earthquake'],
      sinistcha: [],
    },
    items: {
      sitrusberry: itemEntry('sitrusberry', 'Sitrus Berry'),
      passhoberry: itemEntry('passhoberry', 'Passho Berry'),
      leftovers: itemEntry('leftovers', 'Leftovers'),
      choicescarf: itemEntry('choicescarf', 'Choice Scarf'),
      staraptite: itemEntry('staraptite', 'Staraptite', ['staraptor']),
      charizarditex: itemEntry('charizarditex', 'Charizardite X', ['charizard']),
      floettite: itemEntry('floettite', 'Floettite', ['floetteeternal']),
    },
  };
}
```

- [ ] **Step 2: Write the failing tests**

`src/domain/set-check.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { NatureName } from './natures';
import type { PokemonSet, StatPoints } from './set';
import { validateSetAgainstSnapshot } from './set-check';
import { setSnapshot } from './test-support';

const snapshot = setSnapshot();
const check = (set: PokemonSet, path = 'set') => validateSetAgainstSnapshot(set, snapshot, path);
const paths = (set: PokemonSet) => check(set).map((p) => p.path);
const messages = (set: PokemonSet) => check(set).map((p) => p.message);

const points = (overrides: Partial<StatPoints> = {}): StatPoints => ({
  hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...overrides,
});

describe('validateSetAgainstSnapshot', () => {
  it('accepts a full legal set', () => {
    const set: PokemonSet = {
      species: 'incineroar',
      ability: 'intimidate',
      item: 'sitrusberry',
      moves: ['fakeout', 'flareblitz', 'partingshot', 'throatchop'],
      nature: 'Jolly',
      points: points({ hp: 2, atk: 32, spe: 32 }),
    };
    expect(check(set)).toEqual([]);
  });

  it('accepts a species-only set for an ordinary species', () => {
    expect(check({ species: 'incineroar' })).toEqual([]);
  });

  it('accepts the ability by id, whichever slot it is in', () => {
    expect(check({ species: 'incineroar', ability: 'blaze' })).toEqual([]);
    expect(check({ species: 'incineroar', ability: 'intimidate' })).toEqual([]);
  });

  describe('species', () => {
    it('refuses a species that is not legal, and reports nothing else', () => {
      const problems = check({ species: 'ghost', ability: 'levitate', moves: ['fakeout'], item: 'nope' });
      expect(problems).toEqual([{ path: 'set.species', message: '"ghost" is not legal in fmt' }]);
    });

    it('does not treat inherited object properties as species', () => {
      expect(paths({ species: 'constructor' })).toEqual(['set.species']);
      expect(paths({ species: 'toString' })).toEqual(['set.species']);
    });
  });

  describe('ability', () => {
    it('refuses an ability the species does not have and lists the real options', () => {
      expect(check({ species: 'incineroar', ability: 'levitate' })).toEqual([
        { path: 'set.ability', message: '"levitate" is not an ability of Incineroar (Blaze, Intimidate)' },
      ]);
    });
  });

  describe('moves', () => {
    it('refuses a move the species cannot learn, at its slot', () => {
      expect(check({ species: 'incineroar', moves: ['fakeout', 'closecombat'] })).toEqual([
        { path: 'set.moves[1]', message: '"closecombat" is not a legal move for Incineroar in fmt' },
      ]);
    });

    it('refuses a move id the snapshot does not know at all, in the same way', () => {
      expect(messages({ species: 'incineroar', moves: ['notamove'] })).toEqual([
        '"notamove" is not a legal move for Incineroar in fmt',
      ]);
    });

    it('accepts a species with an empty learnset and no moves', () => {
      expect(check({ species: 'sinistcha' })).toEqual([]);
      expect(paths({ species: 'sinistcha', moves: ['fakeout'] })).toEqual(['set.moves[0]']);
    });
  });

  describe('item', () => {
    it('refuses an item that is not legal in the format', () => {
      expect(check({ species: 'incineroar', item: 'assaultvest' })).toEqual([
        { path: 'set.item', message: '"assaultvest" is not a legal item in fmt' },
      ]);
      expect(paths({ species: 'incineroar', item: 'constructor' })).toEqual(['set.item']);
    });

    it('refuses a restricted item on the wrong species, naming who can hold it', () => {
      expect(check({ species: 'incineroar', item: 'staraptite' })).toEqual([
        { path: 'set.item', message: '"Staraptite" can only be held by Staraptor' },
      ]);
    });

    it('accepts a stone on the base species it belongs to', () => {
      expect(check({ species: 'staraptor', item: 'staraptite' })).toEqual([]);
    });
  });

  describe('required item (Mega forms)', () => {
    it('accepts a Mega form holding its own stone', () => {
      expect(check({ species: 'staraptormega', item: 'staraptite' })).toEqual([]);
      expect(check({ species: 'charizardmegax', item: 'charizarditex' })).toEqual([]);
    });

    it('accepts a Mega form whose stone lists the form it changes from, not its base species', () => {
      // Floettite is restricted to Floette-Eternal, but Floette-Mega's base species is Floette.
      expect(check({ species: 'floettemega', item: 'floettite' })).toEqual([]);
    });

    it('refuses a Mega form with no item', () => {
      expect(check({ species: 'staraptormega' })).toEqual([
        { path: 'set.item', message: 'Staraptor-Mega must hold Staraptite' },
      ]);
    });

    it('refuses a Mega form holding a different legal item with exactly one problem', () => {
      expect(check({ species: 'staraptormega', item: 'sitrusberry' })).toEqual([
        { path: 'set.item', message: 'Staraptor-Mega must hold Staraptite' },
      ]);
    });

    it('reports both problems when a Mega form holds another species\' stone', () => {
      expect(messages({ species: 'staraptormega', item: 'charizarditex' })).toEqual([
        '"Charizardite X" can only be held by Charizard',
        'Staraptor-Mega must hold Staraptite',
      ]);
    });
  });

  describe('robustness', () => {
    it('collects every problem, in rule order', () => {
      expect(
        paths({ species: 'incineroar', ability: 'levitate', moves: ['closecombat'], item: 'assaultvest' }),
      ).toEqual(['set.ability', 'set.moves[0]', 'set.item']);
    });

    it('returns the structural problems and stops when the set is malformed, without throwing', () => {
      expect(check(null as unknown as PokemonSet)).toEqual([{ path: 'set', message: 'set must be an object' }]);
      expect(paths({ species: 'incineroar', nature: 'Bogus' as unknown as NatureName, moves: ['closecombat'] })).toEqual([
        'set.nature',
      ]);
      expect(paths({ species: 5 } as unknown as PokemonSet)).toEqual(['set.species']);
    });

    it('prefixes every path with the path it is given', () => {
      expect(
        validateSetAgainstSnapshot({ species: 'incineroar', moves: ['closecombat'] }, snapshot, 'team.members[2]').map(
          (p) => p.path,
        ),
      ).toEqual(['team.members[2].moves[0]']);
    });

    it('does not modify its inputs', () => {
      const set: PokemonSet = { species: 'incineroar', moves: ['fakeout'] };
      const before = JSON.stringify({ set, snapshot });
      validateSetAgainstSnapshot(set, snapshot, 'set');
      expect(JSON.stringify({ set, snapshot })).toBe(before);
    });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```powershell
npx vitest run src/domain/set-check.test.ts
```

Expected: FAIL (cannot resolve `./set-check`).

- [ ] **Step 4: Implement**

`src/domain/set-check.ts`:

```ts
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

  const requiredItem = species.requiredItem === null ? null : toID(species.requiredItem);

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
```

- [ ] **Step 5: Run tests and typecheck**

```powershell
npx vitest run src/domain/set-check.test.ts
npm run typecheck
npm test
```

Expected: all set-check tests PASS; no type errors; the whole suite passes.

- [ ] **Step 6: Commit**

```powershell
git add src/domain/set-check.ts src/domain/set-check.test.ts src/domain/test-support.ts
git commit -m "feat(domain): check a set against the format" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Match teams

**Files:**
- Create: `src/domain/team.ts`
- Test: `src/domain/team.test.ts`

**Interfaces:**
- Consumes: `ID`; `Problem`; `PokemonSet`; `validateSetAgainstSnapshot`, `SetSnapshot` from `./set-check`; test helper `setSnapshot` from `./test-support`.
- Produces:
  - `type RosterSets = Record<ID, PokemonSet>` (key equals `set.species`)
  - `interface MatchTeam { name: string; members: ID[] }`
  - `interface TeamCheck { problems: Problem[]; complete: boolean }`
  - `validateTeam(team: MatchTeam, roster: ID[], sets: RosterSets, snapshot: SetSnapshot, teamSize: number): TeamCheck`

- [ ] **Step 1: Write the failing tests**

`src/domain/team.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PokemonSet } from './set';
import { validateTeam, type MatchTeam, type RosterSets } from './team';
import { setSnapshot } from './test-support';

const snapshot = setSnapshot();
const ALL = ['incineroar', 'staraptor', 'staraptormega', 'charizard', 'charizardmegax', 'kingambit', 'garchomp', 'sinistcha'];
const team = (...members: string[]): MatchTeam => ({ name: 'Team', members });
const run = (members: string[], sets: RosterSets = {}, roster: string[] = ALL, teamSize = 6) =>
  validateTeam(team(...members), roster, sets, snapshot, teamSize);
const paths = (members: string[], sets: RosterSets = {}, roster: string[] = ALL, teamSize = 6) =>
  run(members, sets, roster, teamSize).problems.map((p) => p.path);

describe('validateTeam', () => {
  it('accepts a legal full team and reports it complete', () => {
    const sets: RosterSets = {
      incineroar: { species: 'incineroar', item: 'sitrusberry', moves: ['fakeout'] },
      kingambit: { species: 'kingambit', item: 'leftovers', moves: ['suckerpunch'] },
    };
    const result = run(['incineroar', 'staraptor', 'charizard', 'kingambit', 'garchomp', 'sinistcha'], sets);
    expect(result).toEqual({ problems: [], complete: true });
  });

  it('is not complete, but has no problems, with fewer members than the team size', () => {
    expect(run(['incineroar', 'staraptor', 'charizard', 'kingambit', 'garchomp'])).toEqual({
      problems: [],
      complete: false,
    });
    expect(run([])).toEqual({ problems: [], complete: false });
  });

  it('is not complete when there are problems, even at full size', () => {
    const result = run(['incineroar', 'staraptor', 'charizard', 'kingambit', 'garchomp', 'ghost'], {}, [...ALL, 'ghost']);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.complete).toBe(false);
  });

  describe('size', () => {
    it('refuses more members than the team size, reporting it first', () => {
      const result = run(['incineroar', 'staraptor', 'charizard', 'kingambit', 'garchomp', 'sinistcha', 'staraptormega']);
      expect(result.problems[0]).toEqual({ path: 'team.members', message: 'at most 6 members (found 7)' });
      expect(result.complete).toBe(false);
    });

    it('uses the team size it is given', () => {
      expect(run(['incineroar', 'kingambit', 'garchomp'], {}, ALL, 3).complete).toBe(true);
      expect(paths(['incineroar', 'kingambit', 'garchomp'], {}, ALL, 2)).toEqual(['team.members']);
    });
  });

  describe('members', () => {
    it('refuses a repeated member on the later occurrence and gives it no further checks', () => {
      expect(run(['incineroar', 'incineroar']).problems).toEqual([
        { path: 'team.members[1]', message: '"incineroar" is listed twice' },
      ]);
    });

    it('refuses a member that is not on the roster, and still checks its set', () => {
      const result = run(['garchomp', 'kingambit'], { garchomp: { species: 'garchomp', moves: ['fakeout'] } }, ['kingambit']);
      expect(result.problems.map((p) => [p.path, p.message])).toEqual([
        ['team.members[0]', '"garchomp" is not on your roster'],
        ['team.members[0].moves[0]', '"fakeout" is not a legal move for Garchomp in fmt'],
      ]);
    });

    it('checks each member\'s set with a path under the member', () => {
      const sets: RosterSets = { incineroar: { species: 'incineroar', moves: ['fakeout', 'closecombat'] } };
      expect(paths(['staraptor', 'incineroar'], sets)).toEqual(['team.members[1].moves[1]']);
    });

    it('checks a member with no set as a species-only set', () => {
      expect(run(['staraptormega']).problems).toEqual([
        { path: 'team.members[0].item', message: 'Staraptor-Mega must hold Staraptite' },
      ]);
    });

    it('refuses a member whose saved set is for a different species', () => {
      const sets = { incineroar: { species: 'kingambit' } } as RosterSets;
      const result = run(['incineroar'], sets);
      expect(result.problems).toHaveLength(1);
      expect(result.problems[0].path).toBe('team.members[0]');
      expect(result.problems[0].message).toContain('is for "kingambit"');
    });

    it('does not throw for a member the snapshot does not know', () => {
      expect(paths(['ghost'], {}, ['ghost'])).toEqual(['team.members[0].species']);
    });
  });

  describe('Species Clause', () => {
    it('refuses two forms of the same Pokémon, naming both and the dex number', () => {
      const sets: RosterSets = { charizardmegax: { species: 'charizardmegax', item: 'charizarditex' } };
      expect(run(['charizard', 'charizardmegax'], sets).problems).toEqual([
        {
          path: 'team.members[1]',
          message: '"charizardmegax" and "charizard" are the same Pokémon (dex number 6); Species Clause',
        },
      ]);
    });

    it('reports each later member once, naming the first earlier member it conflicts with', () => {
      const sets: RosterSets = {
        staraptormega: { species: 'staraptormega', item: 'staraptite' },
        charizardmegax: { species: 'charizardmegax', item: 'charizarditex' },
      };
      const result = run(['staraptor', 'charizard', 'staraptormega', 'charizardmegax'], sets);
      expect(result.problems.map((p) => [p.path, p.message])).toEqual([
        ['team.members[2]', '"staraptormega" and "staraptor" are the same Pokémon (dex number 398); Species Clause'],
        ['team.members[3]', '"charizardmegax" and "charizard" are the same Pokémon (dex number 6); Species Clause'],
      ]);
    });

    it('allows different Pokémon', () => {
      expect(run(['incineroar', 'kingambit']).problems).toEqual([]);
    });
  });

  describe('Item Clause', () => {
    it('refuses two members holding the same item, naming both and the item', () => {
      const sets: RosterSets = {
        incineroar: { species: 'incineroar', item: 'leftovers' },
        kingambit: { species: 'kingambit', item: 'leftovers' },
      };
      expect(run(['incineroar', 'kingambit'], sets).problems).toEqual([
        { path: 'team.members[1].item', message: '"kingambit" and "incineroar" both hold Leftovers; Item Clause' },
      ]);
    });

    it('ignores members with no item', () => {
      const sets: RosterSets = { incineroar: { species: 'incineroar', item: 'leftovers' } };
      expect(run(['incineroar', 'kingambit', 'garchomp'], sets).problems).toEqual([]);
    });

    it('allows different items', () => {
      const sets: RosterSets = {
        incineroar: { species: 'incineroar', item: 'leftovers' },
        kingambit: { species: 'kingambit', item: 'sitrusberry' },
      };
      expect(run(['incineroar', 'kingambit'], sets).problems).toEqual([]);
    });

    it('falls back to the id in the message when the item is unknown', () => {
      const sets: RosterSets = {
        incineroar: { species: 'incineroar', item: 'zzz' },
        kingambit: { species: 'kingambit', item: 'zzz' },
      };
      const messages = run(['incineroar', 'kingambit'], sets).problems.map((p) => p.message);
      expect(messages).toContain('"kingambit" and "incineroar" both hold zzz; Item Clause');
    });
  });

  describe('order and robustness', () => {
    it('reports member problems before Species Clause problems before Item Clause problems', () => {
      const sets: RosterSets = {
        charizard: { species: 'charizard', item: 'leftovers', moves: ['closecombat'] },
        charizardmegax: { species: 'charizardmegax', item: 'charizarditex' },
        kingambit: { species: 'kingambit', item: 'leftovers' },
      };
      expect(paths(['charizard', 'charizardmegax', 'kingambit'], sets)).toEqual([
        'team.members[0].moves[0]',
        'team.members[1]',
        'team.members[2].item',
      ]);
    });

    it('does not throw on malformed input', () => {
      expect(validateTeam(null as unknown as MatchTeam, ALL, {}, snapshot, 6)).toEqual({
        problems: [{ path: 'team', message: 'team must have a list of members' }],
        complete: false,
      });
      expect(validateTeam({ name: 'x' } as unknown as MatchTeam, ALL, {}, snapshot, 6).complete).toBe(false);
      const odd = validateTeam({ name: 'x', members: [5, ''] } as unknown as MatchTeam, ALL, null as unknown as RosterSets, snapshot, 6);
      expect(odd.problems.map((p) => p.path)).toEqual(['team.members[0]', 'team.members[1]']);
      const badSet = { incineroar: 5 as unknown as PokemonSet };
      expect(paths(['incineroar'], badSet)).toEqual(['team.members[0]']);
    });

    it('does not modify its inputs', () => {
      const members = ['incineroar', 'kingambit'];
      const sets: RosterSets = { incineroar: { species: 'incineroar', item: 'leftovers' } };
      const before = JSON.stringify({ members, sets, ALL });
      validateTeam({ name: 'T', members }, ALL, sets, snapshot, 6);
      expect(JSON.stringify({ members, sets, ALL })).toBe(before);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx vitest run src/domain/team.test.ts
```

Expected: FAIL (cannot resolve `./team`).

- [ ] **Step 3: Implement**

`src/domain/team.ts`:

```ts
import type { ID } from './id';
import type { Problem } from './problem';
import type { PokemonSet } from './set';
import { validateSetAgainstSnapshot, type SetSnapshot } from './set-check';

/** The user's sets, one per drafted species, keyed by species id (the key must equal `set.species`). */
export type RosterSets = Record<ID, PokemonSet>;

/** A team of species ids picked from the user's roster. Sets come from `RosterSets`. */
export interface MatchTeam {
  name: string;
  members: ID[];
}

export interface TeamCheck {
  problems: Problem[];
  /** True when the team has exactly `teamSize` members and no problems. */
  complete: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Checks a match team: size, repeats, roster membership, each member's set, then Species Clause (same dex
 * number) and Item Clause (same item). Choosing which 4 to bring is not modeled. Never throws.
 */
export function validateTeam(
  team: MatchTeam,
  roster: ID[],
  sets: RosterSets,
  snapshot: SetSnapshot,
  teamSize: number,
): TeamCheck {
  if (!isRecord(team) || !Array.isArray(team.members)) {
    return { problems: [{ path: 'team', message: 'team must have a list of members' }], complete: false };
  }

  const problems: Problem[] = [];
  const add = (path: string, message: string) => problems.push({ path, message });
  const onRoster = new Set(Array.isArray(roster) ? roster : []);
  const setFor = (id: ID): unknown => (isRecord(sets) && Object.hasOwn(sets, id) ? sets[id] : { species: id });

  if (team.members.length > teamSize) {
    add('team.members', `at most ${teamSize} members (found ${team.members.length})`);
  }

  const seen = new Set<ID>();
  const members: Array<{ index: number; id: ID; set: unknown }> = [];
  team.members.forEach((id, i) => {
    const at = `team.members[${i}]`;
    if (typeof id !== 'string' || id === '') {
      add(at, 'member must be a species id');
      return;
    }
    if (seen.has(id)) {
      add(at, `"${id}" is listed twice`);
      return;
    }
    seen.add(id);
    if (!onRoster.has(id)) add(at, `"${id}" is not on your roster`);

    const set = setFor(id);
    if (isRecord(set) && typeof set.species === 'string' && set.species !== id) {
      add(at, `the saved set for "${id}" is for "${set.species}"`);
      return;
    }
    problems.push(...validateSetAgainstSnapshot(set as PokemonSet, snapshot, at));
    members.push({ index: i, id, set });
  });

  // Species Clause: one problem per later member, naming the first earlier member with the same dex number.
  const firstByNum = new Map<number, ID>();
  for (const { index, id } of members) {
    if (!Object.hasOwn(snapshot.species, id)) continue;
    const num = snapshot.species[id].num;
    const first = firstByNum.get(num);
    if (first !== undefined) {
      add(`team.members[${index}]`, `"${id}" and "${first}" are the same Pokémon (dex number ${num}); Species Clause`);
    } else {
      firstByNum.set(num, id);
    }
  }

  // Item Clause: one problem per later member, naming the first earlier member holding the same item.
  const firstByItem = new Map<ID, ID>();
  for (const { index, id, set } of members) {
    const item = isRecord(set) ? set.item : undefined;
    if (typeof item !== 'string' || item === '') continue;
    const first = firstByItem.get(item);
    if (first !== undefined) {
      const name = Object.hasOwn(snapshot.items, item) ? snapshot.items[item].name : item;
      add(`team.members[${index}].item`, `"${id}" and "${first}" both hold ${name}; Item Clause`);
    } else {
      firstByItem.set(item, id);
    }
  }

  return { problems, complete: problems.length === 0 && team.members.length === teamSize };
}
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run src/domain/team.test.ts
npm run typecheck
```

Expected: all team tests PASS; no type errors.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/team.ts src/domain/team.test.ts
git commit -m "feat(domain): add match teams with Species and Item Clause checks" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Saved file version 2

**Files:**
- Modify: `src/domain/file.ts` (replace the whole file), `src/domain/file.test.ts` (replace the whole file), `src/domain/mock-draft.test.ts` (two lines)

**Interfaces:**
- Consumes: `deriveDraft` from `./derive`; `checkPick` from `./draft`; `validateLeague`, `LeagueConfig`, `LegalSpeciesSource` from `./league`; `validateSet` from `./set`; `RosterSets`, `MatchTeam` from `./team`; `Problem`; test helpers `leagueOf`, `snapshotOf`.
- Produces:
  - `interface DraftFile { schemaVersion: 2; league: LeagueConfig; picks: ID[]; sets: RosterSets; teams: MatchTeam[] }`
  - `parseDraftFile(text, snapshot: LegalSpeciesSource): ParseResult` (signature unchanged; accepts `schemaVersion` 1 or 2 and always returns a version 2 file); `serializeDraftFile(file: DraftFile): string` unchanged apart from the type.

- [ ] **Step 1: Replace the tests**

Replace the entire contents of `src/domain/file.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { parseDraftFile, serializeDraftFile, type DraftFile } from './file';
import { leagueOf, snapshotOf } from './test-support';

const snapshot = snapshotOf(); // a..h; 'e' is banned and 'h' unpriced in leagueOf()
// Picks a, b, c go to Ana, Ben, Cy (snake, 3 drafters); the user is Ben (me = 1), whose roster is ['b'].
const goodFile = (): DraftFile => ({
  schemaVersion: 2,
  league: leagueOf(),
  picks: ['a', 'b', 'c'],
  sets: { b: { species: 'b', moves: ['m1'] } },
  teams: [{ name: 'Team 1', members: ['b'] }],
});

/** Parse a file object after editing it into a bad shape. */
const parseEdited = (edit: (file: Record<string, unknown>) => void) => {
  const file = JSON.parse(serializeDraftFile(goodFile())) as Record<string, unknown>;
  edit(file);
  return parseDraftFile(JSON.stringify(file), snapshot);
};
const errorsOf = (result: ReturnType<typeof parseDraftFile>) => (result.ok ? [] : result.errors);

describe('serializeDraftFile', () => {
  it('writes two-space-indented JSON with a trailing newline', () => {
    const text = serializeDraftFile(goodFile());
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "schemaVersion": 2');
  });
});

describe('parseDraftFile', () => {
  it('round-trips a saved version 2 file exactly, sets and teams included', () => {
    const result = parseDraftFile(serializeDraftFile(goodFile()), snapshot);
    expect(result).toEqual({ ok: true, file: goodFile(), warnings: [] });
  });

  it('accepts a file with no picks, sets or teams yet', () => {
    const result = parseDraftFile(serializeDraftFile({ ...goodFile(), picks: [], sets: {}, teams: [] }), snapshot);
    expect(result.ok).toBe(true);
  });

  it('drops unknown top-level keys', () => {
    const result = parseEdited((file) => {
      file.extra = 'ignored';
    });
    expect(result.ok).toBe(true);
    expect(result.ok && 'extra' in result.file).toBe(false);
  });

  describe('version 1 files', () => {
    const v1 = (extra: Record<string, unknown> = {}) =>
      JSON.stringify({ schemaVersion: 1, league: leagueOf(), picks: ['a', 'b', 'c'], ...extra });

    it('opens and migrates to version 2 with empty sets and teams', () => {
      const result = parseDraftFile(v1(), snapshot);
      expect(result).toEqual({
        ok: true,
        file: { schemaVersion: 2, league: leagueOf(), picks: ['a', 'b', 'c'], sets: {}, teams: [] },
        warnings: [],
      });
    });

    it('ignores sets and teams that a version 1 file happens to contain', () => {
      const result = parseDraftFile(v1({ sets: { b: { species: 'zzz' } }, teams: [5] }), snapshot);
      expect(result.ok).toBe(true);
      expect(result.ok && result.file.sets).toEqual({});
      expect(result.ok && result.file.teams).toEqual([]);
    });
  });

  describe('layer 1: shape', () => {
    it('refuses text that is not JSON', () => {
      const result = parseDraftFile('{ nope', snapshot);
      expect(errorsOf(result)).toHaveLength(1);
      expect(errorsOf(result)[0].path).toBe('file');
      expect(errorsOf(result)[0].message).toContain('not valid JSON');
    });

    it.each(['[]', 'null', '5'])('refuses %s (not an object)', (text) => {
      expect(errorsOf(parseDraftFile(text, snapshot)).map((e) => e.path)).toEqual(['file']);
    });

    it('refuses a schemaVersion other than 1 or 2, naming the version found', () => {
      const result = parseEdited((file) => {
        file.schemaVersion = 3;
      });
      expect(errorsOf(result).map((e) => e.path)).toEqual(['schemaVersion']);
      expect(errorsOf(result)[0].message).toContain('3');
      expect(errorsOf(result)[0].message).toContain('reads 1 and 2');
      expect(errorsOf(parseEdited((file) => delete file.schemaVersion)).map((e) => e.path)).toEqual(['schemaVersion']);
    });

    it('refuses fields of the wrong JSON type', () => {
      const cases: Array<[string, (file: Record<string, unknown>) => void]> = [
        ['league', (f) => { f.league = 'x'; }],
        ['league.name', (f) => { (f.league as Record<string, unknown>).name = 5; }],
        ['league.formatId', (f) => { (f.league as Record<string, unknown>).formatId = null; }],
        ['league.drafters', (f) => { (f.league as Record<string, unknown>).drafters = [1, 2]; }],
        ['league.order', (f) => { (f.league as Record<string, unknown>).order = 3; }],
        ['league.rounds', (f) => { (f.league as Record<string, unknown>).rounds = '2'; }],
        ['league.me', (f) => { (f.league as Record<string, unknown>).me = null; }],
        ['league.budget', (f) => { (f.league as Record<string, unknown>).budget = 'x'; }],
        ['league.prices', (f) => { (f.league as Record<string, unknown>).prices = { a: 'x' }; }],
        ['league.extraBans', (f) => { (f.league as Record<string, unknown>).extraBans = [1]; }],
        ['picks', (f) => { f.picks = 'a,b'; }],
        ['picks', (f) => { f.picks = [1]; }],
        ['sets', (f) => { f.sets = 'x'; }],
        ['sets', (f) => { delete f.sets; }],
        ['sets.b', (f) => { (f.sets as Record<string, unknown>).b = 5; }],
        ['teams', (f) => { f.teams = 'x'; }],
        ['teams', (f) => { delete f.teams; }],
        ['teams[0]', (f) => { f.teams = [5]; }],
        ['teams[0]', (f) => { f.teams = [{ name: 5, members: [] }]; }],
        ['teams[0]', (f) => { f.teams = [{ name: 'x', members: [1] }]; }],
      ];
      for (const [path, edit] of cases) {
        expect(errorsOf(parseEdited(edit)).map((e) => e.path), path).toEqual([path]);
      }
    });
  });

  describe('layer 2: league', () => {
    it('reports every league problem with its path', () => {
      const result = parseEdited((file) => {
        const league = file.league as Record<string, unknown>;
        league.name = '';
        league.budget = 0;
      });
      expect(errorsOf(result).map((e) => e.path)).toEqual(['league.name', 'league.budget']);
    });

    it('stops before replaying picks when the league is invalid', () => {
      const result = parseEdited((file) => {
        (file.league as Record<string, unknown>).budget = 0;
        file.picks = ['zzz'];
      });
      expect(errorsOf(result).map((e) => e.path)).toEqual(['league.budget']);
    });
  });

  describe('layer 3: picks replay', () => {
    it('refuses the whole file at the first bad pick, with the pick number', () => {
      const result = parseEdited((file) => {
        file.picks = ['a', 'a'];
      });
      expect(result.ok).toBe(false);
      expect(errorsOf(result)).toHaveLength(1);
      expect(errorsOf(result)[0].path).toBe('picks[1]');
      expect(errorsOf(result)[0].message.startsWith('pick 2: ')).toBe(true);
      expect(errorsOf(result)[0].message).toContain('already been picked');
      expect('file' in result).toBe(false);
    });

    it('refuses an illegal species', () => {
      const result = parseEdited((file) => {
        file.picks = ['zzz'];
      });
      expect(errorsOf(result)[0].message).toContain('pick 1: ');
      expect(errorsOf(result)[0].message).toContain('not legal');
    });

    it('refuses more picks than the draft has slots', () => {
      const result = parseEdited((file) => {
        file.picks = ['a', 'b', 'c', 'd', 'f', 'g', 'h'];
      });
      expect(errorsOf(result)[0].path).toBe('picks[6]');
      expect(errorsOf(result)[0].message).toContain('already complete');
    });

    it('refuses a pick the drafter cannot afford', () => {
      const result = parseEdited((file) => {
        (file.league as Record<string, unknown>).budget = 25;
        file.picks = ['a'];
      });
      expect(errorsOf(result)[0].message).toContain('costs 30 points but Ana has 25 left');
    });
  });

  describe('layer 4: sets (structure only)', () => {
    it('refuses a structurally invalid set, naming its path', () => {
      const result = parseEdited((file) => {
        file.sets = { b: { species: 'b', moves: ['x', 'x'] } };
      });
      expect(errorsOf(result).map((e) => e.path)).toEqual(['sets.b.moves[1]']);
    });

    it('refuses a set filed under the wrong species', () => {
      const result = parseEdited((file) => {
        file.sets = { b: { species: 'c' } };
      });
      expect(errorsOf(result).map((e) => e.path)).toEqual(['sets.b']);
      expect(errorsOf(result)[0].message).toContain('"c"');
    });

    it('is only reached when the picks replay cleanly', () => {
      const result = parseEdited((file) => {
        file.picks = ['zzz'];
        file.sets = { b: { species: 'c' } };
      });
      expect(errorsOf(result).map((e) => e.path)).toEqual(['picks[0]']);
    });

    it('does not check sets against the snapshot at load, so a regulation change cannot lock the user out', () => {
      const result = parseEdited((file) => {
        file.sets = { b: { species: 'b', moves: ['notarealmove'], item: 'notanitem', ability: 'nope' } };
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('warnings', () => {
    it('warns when the league is for a different format than the loaded data', () => {
      const result = parseEdited((file) => {
        (file.league as Record<string, unknown>).formatId = 'other';
      });
      expect(result.ok).toBe(true);
      expect(result.ok && result.warnings.map((w) => w.path)).toEqual(['league.formatId']);
    });

    it('warns about priced or banned species the snapshot does not have', () => {
      const result = parseEdited((file) => {
        const league = file.league as Record<string, unknown>;
        league.prices = { ...(league.prices as Record<string, number>), ghost: 3 };
        league.extraBans = ['e', 'phantom'];
      });
      expect(result.ok).toBe(true);
      expect(result.ok && result.warnings.map((w) => w.path)).toEqual(['league.prices.ghost', 'league.extraBans[1]']);
    });

    it('warns about a set or a team member that is not on your roster, after the league warnings', () => {
      const result = parseEdited((file) => {
        (file.league as Record<string, unknown>).formatId = 'other';
        file.sets = { a: { species: 'a' } }; // 'a' went to Ana, not to Ben
        file.teams = [{ name: 'T', members: ['c', 'b'] }]; // 'c' went to Cy
      });
      expect(result.ok).toBe(true);
      expect(result.ok && result.warnings.map((w) => w.path)).toEqual([
        'league.formatId',
        'sets.a',
        'teams[0].members[0]',
      ]);
      expect(result.ok && result.warnings[1].message).toContain('not on your roster');
      expect(result.ok && result.warnings[2].message).toContain('not on your roster');
    });
  });
});
```

Replace, in `src/domain/mock-draft.test.ts`, the two lines that call `serializeDraftFile(...)`:

```ts
    const parsed = parseDraftFile(serializeDraftFile({ schemaVersion: 1, league, picks }), snapshot);
```
with
```ts
    const parsed = parseDraftFile(serializeDraftFile({ schemaVersion: 2, league, picks, sets: {}, teams: [] }), snapshot);
```
and
```ts
    const parsed = parseDraftFile(serializeDraftFile({ schemaVersion: 1, league, picks: bad }), snapshot);
```
with
```ts
    const parsed = parseDraftFile(serializeDraftFile({ schemaVersion: 2, league, picks: bad, sets: {}, teams: [] }), snapshot);
```

- [ ] **Step 2: Run to verify the new tests fail**

```powershell
npx vitest run src/domain/file.test.ts
```

Expected: FAIL (the current `file.ts` only reads version 1: the version 2 round trip, the migration, the new shape cases, layer 4 and the new warnings all fail; `npm run typecheck` also reports errors until Step 3).

- [ ] **Step 3: Replace `src/domain/file.ts`**

```ts
import { deriveDraft } from './derive';
import { checkPick } from './draft';
import type { ID } from './id';
import { validateLeague, type LeagueConfig, type LegalSpeciesSource } from './league';
import type { Problem } from './problem';
import { validateSet } from './set';
import type { MatchTeam, RosterSets } from './team';

export interface DraftFile {
  schemaVersion: 2;
  league: LeagueConfig;
  /** Species ids in the order they were picked. */
  picks: ID[];
  /** The user's sets (the drafter at `league.me`), keyed by species id. */
  sets: RosterSets;
  /** The user's match teams, made of species ids from their roster. */
  teams: MatchTeam[];
}

export type ParseResult =
  | { ok: true; file: DraftFile; warnings: Problem[] }
  | { ok: false; errors: Problem[] };

export function serializeDraftFile(file: DraftFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringList = (value: unknown): boolean => Array.isArray(value) && value.every((item) => typeof item === 'string');

/** Layer 1: is the JSON the right shape, and is every field the right JSON type? */
function shapeProblems(json: unknown): Problem[] {
  if (!isRecord(json)) return [{ path: 'file', message: 'the file must contain a JSON object' }];
  if (json.schemaVersion !== 1 && json.schemaVersion !== 2) {
    return [
      {
        path: 'schemaVersion',
        message: `unsupported schemaVersion ${JSON.stringify(json.schemaVersion)} (this version reads 1 and 2)`,
      },
    ];
  }

  const problems: Problem[] = [];
  const add = (path: string, message: string) => problems.push({ path, message });

  const league = json.league;
  if (!isRecord(league)) {
    add('league', 'league must be an object');
  } else {
    if (typeof league.name !== 'string') add('league.name', 'name must be text');
    if (typeof league.formatId !== 'string') add('league.formatId', 'formatId must be text');
    if (!isStringList(league.drafters)) add('league.drafters', 'drafters must be a list of names');
    if (typeof league.order !== 'string') add('league.order', 'order must be text');
    for (const key of ['rounds', 'me', 'budget'] as const) {
      if (typeof league[key] !== 'number') add(`league.${key}`, `${key} must be a number`);
    }
    if (!isRecord(league.prices) || Object.values(league.prices).some((price) => typeof price !== 'number')) {
      add('league.prices', 'prices must be an object of species id to number');
    }
    if (!isStringList(league.extraBans)) add('league.extraBans', 'extraBans must be a list of species ids');
  }

  if (!isStringList(json.picks)) add('picks', 'picks must be a list of species ids');

  if (json.schemaVersion === 2) {
    if (!isRecord(json.sets)) {
      add('sets', 'sets must be an object of species id to set');
    } else {
      for (const [id, set] of Object.entries(json.sets)) {
        if (!isRecord(set)) add(`sets.${id}`, 'a set must be an object');
      }
    }
    if (!Array.isArray(json.teams)) {
      add('teams', 'teams must be a list');
    } else {
      json.teams.forEach((team, i) => {
        if (!isRecord(team) || typeof team.name !== 'string' || !isStringList(team.members)) {
          add(`teams[${i}]`, 'a team needs a text name and a list of species ids as members');
        }
      });
    }
  }
  return problems;
}

/**
 * Reads a saved draft (version 1 or 2; the result is always version 2). Four layers, stopping at the first
 * that has errors: (1) JSON shape, (2) league rules, (3) replaying every pick with `checkPick`, (4) each
 * set's structure. A file with any error is refused whole. Sets and teams are NOT checked against the
 * snapshot at load, so a regulation change cannot lock the user out; use `validateSetAgainstSnapshot` and
 * `validateTeam` for that. Prices or bans for species the snapshot does not have, a differing format id, and
 * sets or team members that are not on the user's roster come back as warnings.
 */
export function parseDraftFile(text: string, snapshot: LegalSpeciesSource): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [{ path: 'file', message: `not valid JSON: ${(error as Error).message}` }] };
  }

  const shape = shapeProblems(json);
  if (shape.length > 0) return { ok: false, errors: shape };
  const parsed = json as {
    schemaVersion: 1 | 2;
    league: LeagueConfig;
    picks: ID[];
    sets?: RosterSets;
    teams?: MatchTeam[];
  };
  const file: DraftFile = {
    schemaVersion: 2,
    league: parsed.league,
    picks: parsed.picks,
    sets: parsed.schemaVersion === 2 ? (parsed.sets as RosterSets) : {},
    teams: parsed.schemaVersion === 2 ? (parsed.teams as MatchTeam[]) : [],
  };

  const leagueProblems = validateLeague(file.league, 'league');
  if (leagueProblems.length > 0) return { ok: false, errors: leagueProblems };

  for (let i = 0; i < file.picks.length; i++) {
    const problem = checkPick(file.league, file.picks.slice(0, i), file.picks[i], snapshot);
    if (problem) {
      return { ok: false, errors: [{ path: `picks[${i}]`, message: `pick ${i + 1}: ${problem.message}` }] };
    }
  }

  const setProblems: Problem[] = [];
  for (const [id, set] of Object.entries(file.sets)) {
    const structural = validateSet(set, `sets.${id}`);
    setProblems.push(...structural);
    if (structural.length === 0 && set.species !== id) {
      setProblems.push({ path: `sets.${id}`, message: `the set under "${id}" is for "${set.species}"` });
    }
  }
  if (setProblems.length > 0) return { ok: false, errors: setProblems };

  const warnings: Problem[] = [];
  if (file.league.formatId !== snapshot.formatId) {
    warnings.push({
      path: 'league.formatId',
      message: `league is for "${file.league.formatId}" but the loaded data is "${snapshot.formatId}"`,
    });
  }
  for (const id of Object.keys(file.league.prices)) {
    if (!Object.hasOwn(snapshot.species, id)) {
      warnings.push({ path: `league.prices.${id}`, message: `"${id}" is not legal in ${snapshot.formatId}; its price is ignored` });
    }
  }
  file.league.extraBans.forEach((id, i) => {
    if (!Object.hasOwn(snapshot.species, id)) {
      warnings.push({ path: `league.extraBans[${i}]`, message: `"${id}" is not legal in ${snapshot.formatId}; the ban is ignored` });
    }
  });

  const roster = new Set(deriveDraft(file.league, file.picks, snapshot).drafters[file.league.me].roster);
  for (const id of Object.keys(file.sets)) {
    if (!roster.has(id)) warnings.push({ path: `sets.${id}`, message: `"${id}" is not on your roster; the set is ignored` });
  }
  file.teams.forEach((team, i) => {
    team.members.forEach((id, j) => {
      if (!roster.has(id)) warnings.push({ path: `teams[${i}].members[${j}]`, message: `"${id}" is not on your roster` });
    });
  });

  return { ok: true, file, warnings };
}
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run src/domain/file.test.ts src/domain/mock-draft.test.ts
npm test
npm run typecheck
```

Expected: all PASS (the whole suite, including the mock-draft file round trip); no type errors.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/file.ts src/domain/file.test.ts src/domain/mock-draft.test.ts
git commit -m "feat(domain): saved file version 2 with roster sets and match teams" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Real-snapshot tests and README

This task adds tests and a README edit only. The production code already exists, so the new tests are expected to pass on the first run; a failure is a real finding about the data or an earlier task and must be reported, not worked around by editing assertions.

**Files:**
- Test: `src/domain/teambuilder-real.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `validateSetAgainstSnapshot` (Task 4), `computeSetStats` (Task 3), `validateTeam`, `RosterSets` (Task 5), `isNatureName`, `PokemonSet`, `Snapshot`, and the committed version-2 snapshot from Task 2.
- Produces: nothing later tasks use.

- [ ] **Step 1: Write the tests**

`src/domain/teambuilder-real.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toID, type ID } from './id';
import { isNatureName } from './natures';
import type { PokemonSet } from './set';
import { validateSetAgainstSnapshot } from './set-check';
import { computeSetStats } from './stats';
import { validateTeam, type RosterSets } from './team';
import type { Snapshot } from './types';

const snapshot = JSON.parse(
  readFileSync(new URL('../../data/gen9championsvgc2026regmb/snapshot.json', import.meta.url), 'utf8'),
) as Snapshot;
if (!snapshot.usage) throw new Error('the committed snapshot has no usage data');
const usage = snapshot.usage;
const ranked = Object.values(usage.species).sort((a, b) => b.usage - a.usage);

/** A set built from what real ladder teams run on the species: top ability, top real item, top four moves, top spread. */
function setFromUsage(id: ID): PokemonSet {
  const entry = usage.species[id];
  const set: PokemonSet = { species: id, moves: entry.moves.slice(0, 4).map(([move]) => move) };
  const ability = entry.abilities[0]?.[0];
  if (ability) set.ability = ability;
  const item = entry.items.find(([itemId]) => itemId !== 'nothing')?.[0]; // Smogon's id for "no item"
  if (item) set.item = item;
  const spread = entry.spreads[0];
  if (spread) {
    if (isNatureName(spread.nature)) set.nature = spread.nature;
    const [hp, atk, def, spa, spd, spe] = spread.points;
    set.points = { hp, atk, def, spa, spd, spe };
  }
  return set;
}

describe('teambuilder logic on the real Reg M-B snapshot', () => {
  it('accepts a set built from real usage for each of the 40 most used species', () => {
    const problems: string[] = [];
    let withStone = 0;
    for (const { id } of ranked.slice(0, 40)) {
      if (snapshot.species[id].requiredItem) withStone += 1;
      for (const p of validateSetAgainstSnapshot(setFromUsage(id), snapshot, id)) problems.push(`${p.path}: ${p.message}`);
    }
    expect(withStone).toBeGreaterThanOrEqual(5); // 15 when this was written: Mega forms are common
    expect(problems).toEqual([]);
  });

  it('computes finite, positive stats for those sets', () => {
    for (const { id } of ranked.slice(0, 40)) {
      const stats = computeSetStats(setFromUsage(id), snapshot);
      expect(stats, id).not.toBeNull();
      for (const value of Object.values(stats ?? {})) {
        expect(Number.isFinite(value) && value > 0, `${id} stat ${value}`).toBe(true);
      }
    }
  });

  it('refuses a real set with an illegal move, ability and item at once', () => {
    const problems = validateSetAgainstSnapshot(
      { species: 'incineroar', ability: 'levitate', item: 'assaultvest', moves: ['fakeout', 'hydropump'] },
      snapshot,
      'set',
    );
    expect(problems.map((p) => p.path)).toEqual(['set.ability', 'set.moves[1]', 'set.item']);
  });

  it('accepts a full six-member team built from real usage, including a Mega form and its stone', () => {
    // The most used Mega form first, then the most used non-Mega species with a new dex number and a new item.
    const mega = ranked.find((entry) => snapshot.species[entry.id].requiredItem);
    if (!mega) throw new Error('no Mega form in the usage data');
    const candidates = [mega, ...ranked.filter((entry) => entry !== mega && !snapshot.species[entry.id].requiredItem)];

    const sets: RosterSets = {};
    const members: ID[] = [];
    const numbers = new Set<number>();
    const items = new Set<string>();
    for (const { id } of candidates) {
      const set = setFromUsage(id);
      const num = snapshot.species[id].num;
      if (numbers.has(num) || (set.item !== undefined && items.has(set.item))) continue;
      numbers.add(num);
      if (set.item !== undefined) items.add(set.item);
      sets[id] = set;
      members.push(id);
      if (members.length === 6) break;
    }
    expect(members).toHaveLength(6);
    expect(sets[members[0]].item).toBe(toID(snapshot.species[members[0]].requiredItem));

    expect(validateTeam({ name: 'Real', members }, members, sets, snapshot, 6)).toEqual({ problems: [], complete: true });
  });

  it('refuses Charizard together with Charizard-Mega-X (Species Clause, same dex number)', () => {
    expect(snapshot.species.charizard.num).toBe(snapshot.species.charizardmegax.num);
    const sets: RosterSets = { charizardmegax: { species: 'charizardmegax', item: 'charizarditex' } };
    const result = validateTeam(
      { name: 'Clones', members: ['charizard', 'charizardmegax'] },
      ['charizard', 'charizardmegax'],
      sets,
      snapshot,
      6,
    );
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].path).toBe('team.members[1]');
    expect(result.problems[0].message).toContain('Species Clause');
    expect(result.complete).toBe(false);
  });

  it('refuses two real members holding the same item (Item Clause)', () => {
    const sets: RosterSets = {
      incineroar: { species: 'incineroar', item: 'sitrusberry' },
      kingambit: { species: 'kingambit', item: 'sitrusberry' },
    };
    const result = validateTeam({ name: 'Twins', members: ['incineroar', 'kingambit'] }, ['incineroar', 'kingambit'], sets, snapshot, 6);
    expect(result.problems.map((p) => p.path)).toEqual(['team.members[1].item']);
    expect(result.problems[0].message).toContain('Sitrus Berry');
    expect(result.problems[0].message).toContain('Item Clause');
  });
});
```

- [ ] **Step 2: Run the tests**

```powershell
npx vitest run src/domain/teambuilder-real.test.ts
```

Expected: PASS (6 tests). Pre-verified on 2026-09-20 against the package's item list: all 40 sets pass (with the own-stone exemption), a Mega form is the most used candidate (Charizard-Mega-Y), and the greedy team is Charizard-Mega-Y, Kingambit, Basculegion, Garchomp, Incineroar, Sneasler. If a test fails, capture the exact failing message and report it: it is either a data finding or a defect in Tasks 1 to 6. Do not edit an assertion, a floor or the production code to force a pass.

- [ ] **Step 3: Update the README**

In `README.md`, replace the paragraph starting `This repo currently contains the data layer` with:

```md
This repo currently contains the data layer (the sync step in `sync/` that produces the data files the app will read, the snapshot, and the usage math) and the domain logic in `src/domain/`: the set model, league config, draft board, price-list import, the saved-draft file, and the teambuilder logic (checking a set against the format, stat calculation, roster sets and match teams with Item and Species Clause checks). There is no UI yet, and Showdown paste import and export is not built yet.
```

and replace the bullet `- \`data/<formatId>/snapshot.json\`: legal species, moves, learnsets and pruned ladder usage.` with:

```md
- `data/<formatId>/snapshot.json`: legal species, moves, learnsets, items and pruned ladder usage.
```

- [ ] **Step 4: Run everything**

```powershell
npm test
npm run test:integration
npm run typecheck
```

Expected: all green, with no warnings or noise in the output.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/teambuilder-real.test.ts README.md
git commit -m "test(domain): teambuilder logic against the real Reg M-B snapshot" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review (spec coverage)

| Spec requirement | Task |
|---|---|
| `ItemEntry`, `Snapshot.items`, `schemaVersion` 2 for snapshot and meta | 1 |
| Loader reads legal items; `usableBy` filtered to legal species; drop-if-empty; aggregated warning; required-item warning | 1 |
| `Limits.minItems`; `validateSnapshot` item checks; `buildSnapshot` puts items in and appends loader warnings | 1 |
| Previous snapshot untouched when items validation fails; required item missing is a warning not a failure | 1 |
| Real-package item tests (count, Sitrus present, Assault Vest absent, Staraptite usableBy, warnings) | 1 |
| Regenerate the committed snapshot; ladder-vs-item-table cross-check with `nothing` skipped and a floor | 2 |
| `computeStats`, `computeSetStats`, `LEVEL`; worked Incineroar example; both truncations; missing nature/points | 3 |
| `validateSetAgainstSnapshot` rules 1 to 5, messages, structural-first, own-stone exemption | 4 |
| `RosterSets`, `MatchTeam`, `TeamCheck`, `validateTeam` (size, repeats, roster, set checks, Species Clause, Item Clause, `complete`) | 5 |
| Saved file version 2, version 1 migration, shape/league/picks/sets layers, warnings for stale sets/teams, no snapshot checks at load | 6 |
| Real-snapshot tests: sets from usage, full six-member team with a Mega, Charizard vs Charizard-Mega-X, Item Clause | 7 |
| README and out-of-scope items (paste, choosing 4, UI, storage) | 7 and Global Constraints |

Type and name consistency was checked across tasks: `ItemEntry`, `ShowdownFormatData.items/warnings`, `Limits.minItems`, `SetSnapshot`, `validateSetAgainstSnapshot`, `computeStats`, `computeSetStats`, `Stats`, `LEVEL`, `RosterSets`, `MatchTeam`, `TeamCheck`, `validateTeam`, `DraftFile` (version 2), `speciesEntry`, `moveEntry`, `itemEntry`, `setSnapshot`.

---

## Later increments (outlined; each gets its own plan)

1. **Plan 2: Showdown paste import and export** for sets and teams. Uses item display names from `snapshot.items`, move names from `snapshot.moves`, ability names from `species.abilities`. Champions writes stat points in the EVs field (`EVs: 2 HP / 32 Atk / 32 Spe`) with `Level: 50`. Note for Plan 2: Showdown writes Mega Pokémon either as the Mega form species with its stone or as the base species holding the stone; decide how to import both.
2. **Suggestion engine, stages 1 to 3** (see the parent spec); it should recompute its budget reserve from the pool, since `pointsNeededToFill` reserves for all open slots.
3. **App shell and hosting.**
