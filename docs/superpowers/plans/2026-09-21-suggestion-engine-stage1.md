# Suggestion Engine, Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure suggestion pipeline in `src/engine/` with two signals, usage lift and type synergy: given a roster, the pool and a budget it returns ranked, explained candidates as typed reasons.

**Architecture:** Small pure modules with one job each: a static type chart, candidate selection (budget reserve, usage filters, same-dex-number rule), one module per signal, and `suggest()` which combines and ranks. The engine imports only from `src/domain/`. A static 18x18 type chart lives in the engine and an integration test checks it against the real `pokemon-showdown` package.

**Tech Stack:** TypeScript (ESM), Vitest, the existing `pokemon-showdown` dev dependency (oracle test only). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-21-suggestion-engine-stage1-design.md` (parents: `docs/superpowers/specs/2026-09-20-draft-lab-design.md`, `docs/superpowers/specs/2026-09-20-league-draft-design.md`). Read the stage 1 spec first; it is the binding authority for this plan.

## Global Constraints

- Scope: stage 1 only, two signals (`usageLift`, `typeSynergy`). Out of scope: role and mechanics tags (stage 2), set-specific scoring (stage 3), ability immunities, predicting what other drafters take, sample-size weighting of lifts, any UI, browser storage.
- No function throws on any input, none modifies its arguments, none keeps state between calls; output is deterministic. Use `Object.hasOwn` for every lookup keyed by a species id or a type name; type names are additionally checked with `isTypeName`.
- The engine never produces display text; results carry typed reasons (`Reason`) and notes (`Note`).
- Scores are in [0, 1]. Usage lift: `score = clamp((mean(log2(lift)) + 3) / 6, 0, 1)` over roster members with a stored pair. Type synergy: `0.6 x defensive + 0.4 x offensive` (offensive drops out when the roster already covers all 18 defending types, then the score is the defensive score).
- Constants live in one place each and are exactly: `LIFT_LOG_RANGE = 3`, `DEFENSIVE_SCALE = 12`, `UNEXPOSED_HARM_FACTOR = 0.25`, `OFFENSIVE_MIN_MOVE_SHARE = 0.1`, `DEFENSIVE_WEIGHT = 0.6`, `OFFENSIVE_WEIGHT = 0.4`, `LOW_USAGE = 0.03`, `DEFAULT_LIMIT = 20`, default weights `usageLift` 0.35 and `typeSynergy` 0.3.
- Budget rule: with `k = openSlots - 1`, a candidate is affordable when `price + (sum of the k cheapest prices among the OTHER priced pool species) <= remaining`. Do not use `pointsNeededToFill`.
- Ranking: score descending, then price ascending, then id ascending.
- Dependencies point one way: `src/engine/` imports from `src/domain/` (and itself); `src/domain/` never imports from `src/engine/`; nothing in `src/engine/` imports from `sync/`. `sync/` may import from `src/engine/` (the oracle test does).
- Commits end with the trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (copy it verbatim; never substitute another model name).

**Plan clarifications (rulings on gaps in the spec):**
1. `suggest`, `selectCandidates` and the signals take `EngineSnapshot = Pick<Snapshot, 'species' | 'moves' | 'usage'>`. A full `Snapshot` satisfies it, so the spec's `suggest(ctx, snapshot, options)` signature still holds; the narrower type makes test fixtures small.
2. When `snapshot.usage` is null there is no informational usage reason (neither `low-usage` nor `no-ladder-usage`): "no ladder usage" would be misleading for every candidate, and the `no-usage-data` note already says it.
3. Two small files are added to the spec's layout: `src/engine/math.ts` (`clamp`, `compareIds`, shared by three modules) and `src/engine/test-support.ts` (usage and move fixtures for engine tests).
4. The budget reserve and `pricedPoolSize` count every pool id that has a finite price, including an id that is not in the snapshot (it cannot be suggested but it is still a species someone could draft). A `DraftState` pool never contains such ids.

## Pre-verification results (measured 2026-09-21 against the committed Reg M-B snapshot; a JS mirror of the spec's formulas, and the real package's type chart)

- Chart: 324 cells, 51 super effective, 61 resisted, 8 immune, 204 neutral, 18 types (no legal species has `Stellar`). 100 dex numbers are shared by 243 legal forms.
- **Defensive scale.** Raw score over all candidates, five real rosters: range -6.0 to +3.5, median around -0.5. `DEFENSIVE_SCALE = 12` gives scores from about 0.0 to 0.79 and pins 0 or 1 candidates at 0 (and none at 1); scale 8 would pin 9 to 14 candidates at 0. Kept at 12.
- **Offensive fraction.** For rosters of one to three species it spreads over the whole range (min 0, median 0.25 to 0.33, max 0.9 to 1.0; 8% to 17% of candidates at 0). For rosters of six or more the roster covers all 18 defending types (`|U| = 0`) and the component drops out, as the spec says.
- **Lift score.** For real rosters the score has median 0.27 to 0.35 and maximum 0.51 to 0.77 and never pins at 1; 4 to 18 candidates pin at 0. No change needed.
- Real pair roster `incineroar` + `kingambit`: 353 candidates, 221 with lift data (220 for both members and 1 for one), 132 with none (no usage entry); 175 candidates below 3% usage, 46 at or above; 307 at or below 3% usage or without an entry; 29 with usage at or above 5%.
- Synthetic prices used by the real-data tests, `1 + round(20 x usage / topUsage)` (top usage 0.4074), give a price histogram of 282 candidates at 1 point and a maximum of 21. Budget (remaining 12, 3 open slots): pair roster 346 of 353 candidates affordable (7 excluded), six-member roster 344 of 347 (3 excluded); remaining 200 with 5 open slots excludes nothing.
- The type chart, all hand-computed test values (see the arithmetic comments in the tests) and the float behaviour of the lift fixtures (`100 x 0.1 = 10`, `100 x 0.2 = 20`, `log2` exact on powers of two) were checked with a separate script.

## Environment notes

- Windows + PowerShell. Node was installed after the Claude app started, so a fresh shell may not find `node`/`npm`. Start every PowerShell command with:
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User");`
- The repo path contains a space: quote it.
- Single test file: `npx vitest run <path>`. Whole unit suite: `npm test`. Types: `npm run typecheck`. Real-package tests (slow): `npm run test:integration`. The baseline before this plan is 335 unit tests and 18 integration tests, all passing.
- Work on branch `feat/suggestion-engine` (already created; the spec is committed at 524b18f).
- The plan's code is written to typecheck under `strict`. If a line fails typecheck, report the exact TS error and apply the smallest fix that keeps the test's intent; do not silently rewrite a test.

---

## File Structure

```
Create: src/engine/types.ts, math.ts, typechart.ts          shared types, clamp/compareIds, the type chart
Create: src/engine/math.test.ts, typechart.test.ts
Create: src/engine/test-support.ts                          usageEntry, usageData, typedMove fixtures
Create: src/engine/candidates.ts, candidates.test.ts        contextFor, selectCandidates
Create: src/engine/lift-signal.ts, lift-signal.test.ts      liftSignal
Create: src/engine/type-signal.ts, type-signal.test.ts      defensiveComponent, offensiveComponent, attackingTypes, typeSignal
Create: src/engine/suggest.ts, suggest.test.ts              suggest
Create: src/engine/suggest-real.test.ts                     real-snapshot properties
Create: sync/showdown/typechart.integration.test.ts         oracle against the real package
Modify: README.md                                           one sentence
```

Existing code these build on (do not modify): `src/domain/usage.ts` (`teammateLift`), `src/domain/types.ts` (`Snapshot`, `SpeciesEntry`, `MoveEntry`, `UsageData`, `UsageEntry`), `src/domain/derive.ts` (`DraftState`, `deriveDraft`), `src/domain/league.ts` (`LeagueConfig`), `src/domain/id.ts` (`ID`), `src/domain/test-support.ts` (`leagueOf`, `snapshotOf`, `speciesEntry`, `moveEntry`).

---

### Task 1: Shared types, math helpers and the type chart

**Files:**
- Create: `src/engine/types.ts`, `src/engine/math.ts`, `src/engine/typechart.ts`
- Test: `src/engine/math.test.ts`, `src/engine/typechart.test.ts`

**Interfaces:**
- Consumes: `ID` from `../domain/id`; `Snapshot` from `../domain/types`.
- Produces:
  - `types.ts`: `EngineSnapshot`, `SignalName`, `SIGNAL_NAMES`, `SuggestContext`, `SuggestOptions`, `Reason`, `Note`, `SignalOutput`, `SignalScore`, `Suggestion`, `SuggestResult` (exact shapes below).
  - `math.ts`: `clamp(value: number, low: number, high: number): number`; `compareIds(a: string, b: string): number` (-1, 0 or 1 by code-point order).
  - `typechart.ts`: `TYPES` (18 names, alphabetical, `as const`), `TypeName`, `isTypeName(value: unknown): value is TypeName`, `effectiveness(attacking: string, defending: string): 0 | 0.5 | 1 | 2` (1 for anything not a type name), `multiplier(attacking: string, defendingTypes: readonly string[]): number`, `severity(m: number): number`.

- [ ] **Step 1: Write the failing tests**

`src/engine/math.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clamp, compareIds } from './math';

describe('clamp', () => {
  it('leaves a value inside the range alone and pulls others to the ends', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(-3, 0, 1)).toBe(0);
    expect(clamp(7, 0, 1)).toBe(1);
    expect(clamp(0, 0, 1)).toBe(0);
    expect(clamp(1, 0, 1)).toBe(1);
  });
});

describe('compareIds', () => {
  it('orders by code point and returns 0 for equal ids', () => {
    expect(compareIds('a', 'b')).toBe(-1);
    expect(compareIds('b', 'a')).toBe(1);
    expect(compareIds('a', 'a')).toBe(0);
    expect(['stlc', 'stla', 'stlb'].sort(compareIds)).toEqual(['stla', 'stlb', 'stlc']);
  });
});
```

`src/engine/typechart.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TYPES, effectiveness, isTypeName, multiplier, severity } from './typechart';

describe('TYPES', () => {
  it('lists the 18 types alphabetically, without Stellar', () => {
    expect(TYPES).toHaveLength(18);
    expect([...TYPES]).toEqual([...TYPES].sort());
    expect(TYPES).not.toContain('Stellar');
    expect(TYPES).toContain('Fairy');
  });
});

describe('isTypeName', () => {
  it('accepts the 18 names only', () => {
    expect(isTypeName('Fire')).toBe(true);
    expect(isTypeName('Stellar')).toBe(false);
    expect(isTypeName('fire')).toBe(false);
    expect(isTypeName('constructor')).toBe(false);
    expect(isTypeName(5)).toBe(false);
    expect(isTypeName(undefined)).toBe(false);
  });
});

describe('effectiveness (attacking type first, defending type second)', () => {
  it('knows the immunities', () => {
    for (const [attacking, defending] of [
      ['Normal', 'Ghost'],
      ['Ghost', 'Normal'],
      ['Electric', 'Ground'],
      ['Ground', 'Flying'],
      ['Dragon', 'Fairy'],
      ['Poison', 'Steel'],
      ['Psychic', 'Dark'],
      ['Fighting', 'Ghost'],
    ]) {
      expect(effectiveness(attacking, defending), `${attacking} -> ${defending}`).toBe(0);
    }
  });

  it('knows super effective and resisted hits, and that the direction matters', () => {
    expect(effectiveness('Fairy', 'Dragon')).toBe(2);
    expect(effectiveness('Dragon', 'Fairy')).toBe(0);
    expect(effectiveness('Steel', 'Fairy')).toBe(2);
    expect(effectiveness('Fairy', 'Steel')).toBe(0.5);
    expect(effectiveness('Fire', 'Steel')).toBe(2);
    expect(effectiveness('Water', 'Fire')).toBe(2);
    expect(effectiveness('Fire', 'Water')).toBe(0.5);
    expect(effectiveness('Ice', 'Dragon')).toBe(2);
    expect(effectiveness('Ground', 'Electric')).toBe(2);
  });

  it('is neutral otherwise', () => {
    expect(effectiveness('Normal', 'Normal')).toBe(1);
    expect(effectiveness('Water', 'Electric')).toBe(1); // Electric -> Water is 2, the reverse is neutral
  });

  it('counts 51 super effective, 61 resisted, 8 immune and 204 neutral cells (matches the real package)', () => {
    const counts = { superEffective: 0, resisted: 0, immune: 0, neutral: 0 };
    for (const attacking of TYPES) {
      for (const defending of TYPES) {
        const value = effectiveness(attacking, defending);
        if (value === 2) counts.superEffective += 1;
        else if (value === 0.5) counts.resisted += 1;
        else if (value === 0) counts.immune += 1;
        else counts.neutral += 1;
      }
    }
    expect(counts).toEqual({ superEffective: 51, resisted: 61, immune: 8, neutral: 204 });
  });

  it('treats anything that is not a type name as neutral and never throws', () => {
    expect(effectiveness('Stellar', 'Fire')).toBe(1);
    expect(effectiveness('Fire', 'Stellar')).toBe(1);
    expect(effectiveness('constructor', 'Fire')).toBe(1);
    expect(effectiveness('Fire', 'toString')).toBe(1);
    expect(effectiveness(5 as unknown as string, 'Fire')).toBe(1);
  });
});

describe('multiplier', () => {
  it('multiplies over the defending types', () => {
    expect(multiplier('Fire', ['Grass'])).toBe(2);
    expect(multiplier('Rock', ['Fire', 'Flying'])).toBe(4); // 2 x 2
    expect(multiplier('Fire', ['Rock', 'Dragon'])).toBe(0.25); // 0.5 x 0.5
    expect(multiplier('Ice', ['Fire', 'Ground'])).toBe(1); // 0.5 x 2
    expect(multiplier('Ground', ['Fire', 'Flying'])).toBe(0); // 2 x 0
  });

  it('is 1 for no types or something that is not a list, and ignores unknown types', () => {
    expect(multiplier('Fire', [])).toBe(1);
    expect(multiplier('Fire', 'Grass' as unknown as string[])).toBe(1);
    expect(multiplier('Fire', ['Stellar', 'Grass'])).toBe(2);
  });
});

describe('severity', () => {
  it('is log2 of the multiplier, clamped to -2..2, with immunity counted as -2', () => {
    expect(severity(4)).toBe(2);
    expect(severity(2)).toBe(1);
    expect(severity(1)).toBe(0);
    expect(severity(0.5)).toBe(-1);
    expect(severity(0.25)).toBe(-2);
    expect(severity(0)).toBe(-2);
    expect(severity(8)).toBe(2); // clamped
    expect(severity(0.125)).toBe(-2); // clamped
    expect(severity(Number.NaN)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npx vitest run src/engine/math.test.ts src/engine/typechart.test.ts
```

Expected: FAIL (cannot resolve `./math` and `./typechart`).

- [ ] **Step 3: Implement**

`src/engine/types.ts`:

```ts
import type { ID } from '../domain/id';
import type { Snapshot } from '../domain/types';

/** The slice of the snapshot the engine reads. A full `Snapshot` satisfies it. */
export type EngineSnapshot = Pick<Snapshot, 'species' | 'moves' | 'usage'>;

export type SignalName = 'usageLift' | 'typeSynergy';

/** Both signals, in the order they appear in every `Suggestion.signals`. */
export const SIGNAL_NAMES: readonly SignalName[] = ['usageLift', 'typeSynergy'];

/** The draft as the engine sees it. `contextFor` builds one from a derived `DraftState`. */
export interface SuggestContext {
  /** The user's roster so far. */
  roster: ID[];
  /** Species still available (`DraftState.pool`). */
  pool: ID[];
  prices: Record<ID, number>;
  /** Points the user has left. */
  remaining: number;
  /** Roster slots still to fill, including the one this pick will fill. */
  openSlots: number;
}

export interface SuggestOptions {
  /** Only candidates whose usage fraction is at most / at least this. A species with no usage entry counts as 0. */
  maxUsage?: number;
  minUsage?: number;
  /** Positive integer; default 20. */
  limit?: number;
  /** Per-signal weight overrides; each must be finite and >= 0, otherwise it is ignored. */
  weights?: Partial<Record<SignalName, number>>;
}

export type Reason =
  | { kind: 'pairs-often-with'; with: ID; lift: number }
  | { kind: 'pairs-rarely-with'; with: ID; lift: number }
  | { kind: 'lift-coverage'; covered: number; of: number }
  | { kind: 'covers-weakness'; type: string; by: 'resists' | 'immune'; weakMembers: ID[] }
  | { kind: 'adds-weakness'; type: string; weakMembers: ID[] }
  | { kind: 'adds-coverage'; types: string[] }
  | { kind: 'low-usage'; usage: number }
  | { kind: 'no-ladder-usage' };

export type Note =
  | { kind: 'invalid-context' }
  | { kind: 'roster-full' }
  | { kind: 'empty-roster' }
  | { kind: 'cannot-fill-roster'; poolSize: number; openSlots: number }
  | { kind: 'no-usage-data' }
  | { kind: 'unscored-candidates'; count: number };

/** What one signal says about one candidate. `score` is null when the signal has no data. */
export interface SignalOutput {
  score: number | null;
  reasons: Reason[];
}

export interface SignalScore {
  signal: SignalName;
  /** In [0, 1], or null when the signal has no data for this candidate. */
  score: number | null;
  /** The effective (re-normalized) weight; 0 when score is null. */
  weight: number;
  reasons: Reason[];
}

export interface Suggestion {
  species: ID;
  price: number;
  /** In [0, 1]: the weighted sum of the signals that had data. */
  score: number;
  /** Always both signals, in the order usageLift, typeSynergy. */
  signals: SignalScore[];
  /** The signals' reasons in that order, then the informational usage reason. */
  reasons: Reason[];
}

export interface SuggestResult {
  suggestions: Suggestion[];
  /** Candidates that passed the budget and filters, before scoring and `limit`. */
  considered: number;
  notes: Note[];
}
```

`src/engine/math.ts`:

```ts
export function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/** Code-point order, for deterministic tie-breaks. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
```

`src/engine/typechart.ts`:

```ts
import { clamp } from './math';

/** The 18 types legal species use (Showdown also lists Stellar, which no species has). */
export const TYPES = [
  'Bug', 'Dark', 'Dragon', 'Electric', 'Fairy', 'Fighting', 'Fire', 'Flying', 'Ghost',
  'Grass', 'Ground', 'Ice', 'Normal', 'Poison', 'Psychic', 'Rock', 'Steel', 'Water',
] as const;

export type TypeName = (typeof TYPES)[number];

/**
 * CHART[attacking][defending]: only the cells that are not neutral. Generated from
 * `Dex.mod('champions').types` (damageTaken codes 0 -> 1, 1 -> 2, 2 -> 0.5, 3 -> 0); the integration test
 * `sync/showdown/typechart.integration.test.ts` checks every cell against the real package.
 */
const CHART: Record<TypeName, Partial<Record<TypeName, 0 | 0.5 | 2>>> = {
  Bug:       { Dark: 2, Fairy: 0.5, Fighting: 0.5, Fire: 0.5, Flying: 0.5, Ghost: 0.5, Grass: 2, Poison: 0.5, Psychic: 2, Steel: 0.5 },
  Dark:      { Dark: 0.5, Fairy: 0.5, Fighting: 0.5, Ghost: 2, Psychic: 2 },
  Dragon:    { Dragon: 2, Fairy: 0, Steel: 0.5 },
  Electric:  { Dragon: 0.5, Electric: 0.5, Flying: 2, Grass: 0.5, Ground: 0, Water: 2 },
  Fairy:     { Dark: 2, Dragon: 2, Fighting: 2, Fire: 0.5, Poison: 0.5, Steel: 0.5 },
  Fighting:  { Bug: 0.5, Dark: 2, Fairy: 0.5, Flying: 0.5, Ghost: 0, Ice: 2, Normal: 2, Poison: 0.5, Psychic: 0.5, Rock: 2, Steel: 2 },
  Fire:      { Bug: 2, Dragon: 0.5, Fire: 0.5, Grass: 2, Ice: 2, Rock: 0.5, Steel: 2, Water: 0.5 },
  Flying:    { Bug: 2, Electric: 0.5, Fighting: 2, Grass: 2, Rock: 0.5, Steel: 0.5 },
  Ghost:     { Dark: 0.5, Ghost: 2, Normal: 0, Psychic: 2 },
  Grass:     { Bug: 0.5, Dragon: 0.5, Fire: 0.5, Flying: 0.5, Grass: 0.5, Ground: 2, Poison: 0.5, Rock: 2, Steel: 0.5, Water: 2 },
  Ground:    { Bug: 0.5, Electric: 2, Fire: 2, Flying: 0, Grass: 0.5, Poison: 2, Rock: 2, Steel: 2 },
  Ice:       { Dragon: 2, Fire: 0.5, Flying: 2, Grass: 2, Ground: 2, Ice: 0.5, Steel: 0.5, Water: 0.5 },
  Normal:    { Ghost: 0, Rock: 0.5, Steel: 0.5 },
  Poison:    { Fairy: 2, Ghost: 0.5, Grass: 2, Ground: 0.5, Poison: 0.5, Rock: 0.5, Steel: 0 },
  Psychic:   { Dark: 0, Fighting: 2, Poison: 2, Psychic: 0.5, Steel: 0.5 },
  Rock:      { Bug: 2, Fighting: 0.5, Fire: 2, Flying: 2, Ground: 0.5, Ice: 2, Steel: 0.5 },
  Steel:     { Electric: 0.5, Fairy: 2, Fire: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Water: 0.5 },
  Water:     { Dragon: 0.5, Fire: 2, Grass: 0.5, Ground: 2, Rock: 2, Water: 0.5 },
};

export function isTypeName(value: unknown): value is TypeName {
  return typeof value === 'string' && (TYPES as readonly string[]).includes(value);
}

/** How much damage an attacking type does to a defending type: 0, 0.5, 1 or 2. Anything that is not a type name is neutral. */
export function effectiveness(attacking: string, defending: string): 0 | 0.5 | 1 | 2 {
  if (!isTypeName(attacking) || !isTypeName(defending)) return 1;
  return CHART[attacking][defending] ?? 1;
}

/** The product of `effectiveness` over a species' defending types: 0, 0.25, 0.5, 1, 2 or 4. */
export function multiplier(attacking: string, defendingTypes: readonly string[]): number {
  if (!Array.isArray(defendingTypes)) return 1;
  let result = 1;
  for (const defending of defendingTypes) result *= effectiveness(attacking, defending);
  return result;
}

/** log2 of a multiplier clamped to -2..2, with immunity counted as -2. NaN is 0. */
export function severity(m: number): number {
  if (typeof m !== 'number' || Number.isNaN(m)) return 0;
  if (m <= 0) return -2;
  return clamp(Math.log2(m), -2, 2);
}
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run src/engine/math.test.ts src/engine/typechart.test.ts
npm run typecheck
```

Expected: all PASS; no type errors. If a hand-computed expectation disagrees with the code, do NOT edit the assertion or the code to force a pass: report the discrepancy with the actual output.

- [ ] **Step 5: Run the whole unit suite**

```powershell
npm test
```

Expected: PASS (335 plus the new tests), output without warnings or noise.

- [ ] **Step 6: Commit**

```powershell
git add src/engine/types.ts src/engine/math.ts src/engine/typechart.ts src/engine/math.test.ts src/engine/typechart.test.ts
git commit -m "feat(engine): add shared types, math helpers and the type chart" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Candidates and the draft context

**Files:**
- Create: `src/engine/test-support.ts`, `src/engine/candidates.ts`
- Test: `src/engine/candidates.test.ts`

**Interfaces:**
- Consumes: `DraftState`, `deriveDraft` from `../domain/derive`; `LeagueConfig` from `../domain/league`; `ID`; `Snapshot`; `SuggestContext`, `SuggestOptions` from `./types`; test helpers `leagueOf`, `snapshotOf`, `speciesEntry`, `moveEntry` from `../domain/test-support`.
- Produces:
  - `contextFor(league: LeagueConfig, draft: DraftState, drafterIndex: number): SuggestContext | null`
  - `interface Candidate { species: ID; price: number }`
  - `interface CandidateSelection { candidates: Candidate[]; pricedPoolSize: number }`
  - `selectCandidates(ctx: SuggestContext, roster: ID[], snapshot: Pick<Snapshot, 'species' | 'usage'>, options: SuggestOptions): CandidateSelection` — `roster` is the already-validated roster (every id is in `snapshot.species`); `candidates` come back in the priced-pool order (price ascending, then id ascending).
  - `usageOf(snapshot: Pick<Snapshot, 'usage'>, id: ID): number` (0 when there is no usage entry or no usage data)
  - test helpers in `src/engine/test-support.ts` (used by Tasks 2 to 5): `usageEntry(id, overrides?)` (defaults `weight: 100, usage: 0.1`, empty lists), `usageData(entries)` (`teams: 1000, cutoff: 1630, battles: 1000`), `typedMove(id, type, category, basePower)`.

- [ ] **Step 1: Write the fixtures**

`src/engine/test-support.ts`:

```ts
import type { ID } from '../domain/id';
import { moveEntry } from '../domain/test-support';
import type { MoveEntry, UsageData, UsageEntry } from '../domain/types';

/** A usage entry with harmless defaults; override any field. */
export function usageEntry(id: ID, overrides: Partial<UsageEntry> = {}): UsageEntry {
  return { id, weight: 100, usage: 0.1, abilities: [], items: [], moves: [], spreads: [], teammates: [], ...overrides };
}

export function usageData(entries: UsageEntry[]): UsageData {
  return {
    teams: 1000,
    cutoff: 1630,
    battles: 1000,
    species: Object.fromEntries(entries.map((entry) => [entry.id, entry])),
  };
}

/** A move with a chosen type, category and base power. */
export function typedMove(id: string, type: string, category: MoveEntry['category'], basePower: number): MoveEntry {
  return { ...moveEntry(id, id), type, category, basePower };
}
```

- [ ] **Step 2: Write the failing tests**

`src/engine/candidates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveDraft } from '../domain/derive';
import type { DraftState } from '../domain/derive';
import type { LeagueConfig } from '../domain/league';
import { leagueOf, snapshotOf, speciesEntry } from '../domain/test-support';
import type { Snapshot } from '../domain/types';
import { contextFor, selectCandidates, usageOf } from './candidates';
import { usageData, usageEntry } from './test-support';
import type { SuggestContext, SuggestOptions } from './types';

type Slice = Pick<Snapshot, 'species' | 'usage'>;

/** Species with the given dex numbers and, optionally, usage shares (null means no usage data at all). */
const slice = (nums: Record<string, number>, shares: Record<string, number> | null = null): Slice => ({
  species: Object.fromEntries(Object.entries(nums).map(([id, num]) => [id, speciesEntry(id, id, { num })])),
  usage: shares === null ? null : usageData(Object.entries(shares).map(([id, usage]) => usageEntry(id, { usage }))),
});

const POOL_NUMS = { p1: 1, p2: 2, p3: 3, p4: 4, p5: 5 };
const PRICES: Record<string, number> = { p1: 5, p2: 3, p3: 8, p4: 3, p5: 10 };
// Sorted by price then id: p2 (3), p4 (3), p1 (5), p3 (8), p5 (10). Prefix sums of that order: 0, 3, 6, 11, 19, 29.
const ctx = (overrides: Partial<SuggestContext> = {}): SuggestContext => ({
  roster: [],
  pool: ['p5', 'p1', 'p3', 'p2', 'p4'], // shuffled on purpose
  prices: { ...PRICES },
  remaining: 100,
  openSlots: 1,
  ...overrides,
});
const ids = (result: ReturnType<typeof selectCandidates>) => result.candidates.map((entry) => entry.species);
const select = (
  overrides: Partial<SuggestContext> = {},
  snapshot: Slice = slice(POOL_NUMS),
  roster: string[] = [],
  options: SuggestOptions = {},
) => selectCandidates(ctx(overrides), roster, snapshot, options);

describe('selectCandidates: the budget reserve', () => {
  it('reserves the cheapest prices of the OTHER species for the other open slots (3 open slots: reserve 2)', () => {
    // k = 2. Total needed to pick each candidate and still fill: p2 3 + (p4 3 + p1 5) = 11; p4 3 + (p2 3 + p1 5) = 11;
    // p1 5 + (p2 3 + p4 3) = 11; p3 8 + 6 = 14; p5 10 + 6 = 16.
    expect(ids(select({ openSlots: 3, remaining: 13 }))).toEqual(['p2', 'p4', 'p1']);
    expect(ids(select({ openSlots: 3, remaining: 14 }))).toEqual(['p2', 'p4', 'p1', 'p3']); // p3 exactly on the boundary
    expect(ids(select({ openSlots: 3, remaining: 16 }))).toEqual(['p2', 'p4', 'p1', 'p3', 'p5']);
    expect(ids(select({ openSlots: 3, remaining: 11 }))).toEqual(['p2', 'p4', 'p1']);
    expect(ids(select({ openSlots: 3, remaining: 10 }))).toEqual([]);
    // Reserving pointsNeededToFill (the cheapest 3 = 11) plus the candidate's own price would already refuse p2 at 13.
  });

  it('with one open slot there is no reserve: the price alone must fit', () => {
    expect(ids(select({ openSlots: 1, remaining: 8 }))).toEqual(['p2', 'p4', 'p1', 'p3']);
    expect(ids(select({ openSlots: 1, remaining: 7 }))).toEqual(['p2', 'p4', 'p1']);
    expect(ids(select({ openSlots: 1, remaining: 2 }))).toEqual([]);
  });

  it('handles a candidate inside and outside the cheapest set (4 open slots: reserve 3)', () => {
    // Cheapest four are p2 3, p4 3, p1 5, p3 8 = 19. Each of them needs exactly 19; p5 needs 10 + 3 + 3 + 5 = 21.
    expect(ids(select({ openSlots: 4, remaining: 19 }))).toEqual(['p2', 'p4', 'p1', 'p3']);
    expect(ids(select({ openSlots: 4, remaining: 18 }))).toEqual([]);
    expect(ids(select({ openSlots: 4, remaining: 21 }))).toEqual(['p2', 'p4', 'p1', 'p3', 'p5']);
  });

  it('uses whatever others exist when the pool is smaller than the open slots, and reports the pool size', () => {
    // Two species, 4 open slots: each candidate needs its own price plus the one other species (3 + 3 = 6).
    const result = select({ pool: ['p4', 'p2'], openSlots: 4, remaining: 6 });
    expect(ids(result)).toEqual(['p2', 'p4']);
    expect(result.pricedPoolSize).toBe(2);
    expect(ids(select({ pool: ['p4', 'p2'], openSlots: 4, remaining: 5 }))).toEqual([]);
  });

  it('returns candidates in price then id order regardless of the pool order', () => {
    expect(ids(select({ pool: ['p3', 'p5', 'p4', 'p2', 'p1'] }))).toEqual(['p2', 'p4', 'p1', 'p3', 'p5']);
    expect(select().candidates[0]).toEqual({ species: 'p2', price: 3 });
  });

  it('ignores unpriced, non-finite and repeated pool entries, and inherited property names', () => {
    const odd = select({
      pool: ['p1', 'p1', 'p2', 'p3', 'p4', 'constructor'],
      prices: { p1: 5, p2: 'x', p3: Number.NaN, p4: 3 } as unknown as Record<string, number>,
    });
    expect(ids(odd)).toEqual(['p4', 'p1']);
    expect(odd.pricedPoolSize).toBe(2);
  });

  it('counts a priced pool id that is not in the snapshot toward the reserve and the pool size, but never suggests it', () => {
    // ghost 2, p1 5, 2 open slots: p1 needs 5 + 2 = 7.
    const withGhost = select({ pool: ['ghost', 'p1'], prices: { ghost: 2, p1: 5 }, openSlots: 2, remaining: 7 });
    expect(ids(withGhost)).toEqual(['p1']);
    expect(withGhost.pricedPoolSize).toBe(2);
    expect(ids(select({ pool: ['ghost', 'p1'], prices: { ghost: 2, p1: 5 }, openSlots: 2, remaining: 6 }))).toEqual([]);
  });
});

describe('selectCandidates: roster and dex numbers', () => {
  it('leaves out the roster and every species that shares a dex number with a roster member', () => {
    const snapshot = slice({ r1: 10, p1: 10, p2: 11 });
    const result = selectCandidates(
      ctx({ roster: ['r1'], pool: ['r1', 'p1', 'p2'], prices: { r1: 1, p1: 5, p2: 3 } }),
      ['r1'],
      snapshot,
      {},
    );
    expect(ids(result)).toEqual(['p2']);
  });
});

describe('selectCandidates: usage filters', () => {
  // p1 is at 2% usage, p2 at 10%, the others have no usage entry (usage 0).
  const shares = slice(POOL_NUMS, { p1: 0.02, p2: 0.1 });

  it('maxUsage keeps species at or below it, and species with no usage entry', () => {
    expect(ids(select({}, shares, [], { maxUsage: 0.05 }))).toEqual(['p4', 'p1', 'p3', 'p5']);
    expect(ids(select({}, shares, [], { maxUsage: 0.02 }))).toEqual(['p4', 'p1', 'p3', 'p5']); // boundary is inclusive
    expect(ids(select({}, shares, [], { maxUsage: 0.01 }))).toEqual(['p4', 'p3', 'p5']);
  });

  it('minUsage keeps species at or above it and drops species with no usage entry', () => {
    expect(ids(select({}, shares, [], { minUsage: 0.05 }))).toEqual(['p2']);
    expect(ids(select({}, shares, [], { minUsage: 0.1 }))).toEqual(['p2']); // boundary is inclusive
    expect(ids(select({}, shares, [], { minUsage: 0.02, maxUsage: 0.02 }))).toEqual(['p1']);
  });

  it('ignores a filter that is not a finite number', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 'x', null, {}]) {
      const options = { maxUsage: bad, minUsage: bad } as unknown as SuggestOptions;
      expect(ids(select({}, shares, [], options)), String(bad)).toEqual(['p2', 'p4', 'p1', 'p3', 'p5']);
    }
  });

  it('treats every species as usage 0 when there is no usage data', () => {
    const none = slice(POOL_NUMS, null);
    expect(ids(select({}, none, [], { maxUsage: 0.05 }))).toHaveLength(5);
    expect(ids(select({}, none, [], { minUsage: 0.05 }))).toEqual([]);
  });
});

describe('usageOf', () => {
  it('reads the usage fraction, and gives 0 for no entry, no usage data or an inherited property name', () => {
    const withUsage = slice(POOL_NUMS, { p1: 0.02 });
    expect(usageOf(withUsage, 'p1')).toBe(0.02);
    expect(usageOf(withUsage, 'p2')).toBe(0);
    expect(usageOf(withUsage, 'constructor')).toBe(0);
    expect(usageOf({ usage: null }, 'p1')).toBe(0);
  });
});

describe('contextFor', () => {
  // leagueOf(): 3 drafters snake, 2 rounds, budget 50, me = 1. Picks a, b, c go to Ana, Ben, Cy (round 1).
  const league: LeagueConfig = leagueOf();
  const draft: DraftState = deriveDraft(league, ['a', 'b', 'c'], snapshotOf());

  it("builds a context from a drafter's state (roster, remaining budget, open slots) and the draft's pool", () => {
    // Ben: roster b (20 points), 30 left, 1 open slot. Pool: legal, priced, not banned (e), not taken: d 5, f 1, g 0.
    expect(contextFor(league, draft, 1)).toEqual({
      roster: ['b'],
      pool: ['d', 'f', 'g'],
      prices: league.prices,
      remaining: 30,
      openSlots: 1,
    });
    expect(contextFor(league, draft, 0)).toEqual({
      roster: ['a'],
      pool: ['d', 'f', 'g'],
      prices: league.prices,
      remaining: 20,
      openSlots: 1,
    });
  });

  it('returns null for a drafter index that is not an integer in range, and for malformed input', () => {
    for (const bad of [-1, 3, 1.5, Number.NaN, '1']) {
      expect(contextFor(league, draft, bad as number), String(bad)).toBeNull();
    }
    expect(contextFor(null as unknown as LeagueConfig, draft, 1)).toBeNull();
    expect(contextFor(league, null as unknown as DraftState, 1)).toBeNull();
    expect(contextFor(league, { drafters: 5 } as unknown as DraftState, 1)).toBeNull();
  });
});

describe('selectCandidates: robustness', () => {
  it('does not modify its inputs', () => {
    const context = ctx({ openSlots: 3, remaining: 14 });
    const snapshot = slice(POOL_NUMS, { p1: 0.02 });
    const before = JSON.stringify({ context, snapshot });
    selectCandidates(context, [], snapshot, { maxUsage: 0.5 });
    expect(JSON.stringify({ context, snapshot })).toBe(before);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

```powershell
npx vitest run src/engine/candidates.test.ts
```

Expected: FAIL (cannot resolve `./candidates`).

- [ ] **Step 4: Implement**

`src/engine/candidates.ts`:

```ts
import type { DraftState } from '../domain/derive';
import type { ID } from '../domain/id';
import type { LeagueConfig } from '../domain/league';
import type { Snapshot } from '../domain/types';
import { compareIds } from './math';
import type { SuggestContext, SuggestOptions } from './types';

export interface Candidate {
  species: ID;
  price: number;
}

export interface CandidateSelection {
  /** In price-then-id order. */
  candidates: Candidate[];
  /** Pool species that have a finite price (whether or not they are in the snapshot). */
  pricedPoolSize: number;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * The context for one drafter, from a derived `DraftState`. Derive the draft once and call this for each
 * question. Returns null when the drafter index is not an integer in range or the inputs are malformed.
 */
export function contextFor(league: LeagueConfig, draft: DraftState, drafterIndex: number): SuggestContext | null {
  if (typeof league !== 'object' || league === null || typeof league.prices !== 'object' || league.prices === null) {
    return null;
  }
  if (typeof draft !== 'object' || draft === null || !Array.isArray(draft.drafters) || !Array.isArray(draft.pool)) {
    return null;
  }
  if (!Number.isInteger(drafterIndex) || drafterIndex < 0 || drafterIndex >= draft.drafters.length) return null;
  const drafter = draft.drafters[drafterIndex];
  return {
    roster: drafter.roster,
    pool: draft.pool,
    prices: league.prices,
    remaining: drafter.remaining,
    openSlots: drafter.openSlots,
  };
}

/** The usage fraction of a species, or 0 when it has no usage entry or there is no usage data. */
export function usageOf(snapshot: Pick<Snapshot, 'usage'>, id: ID): number {
  const usage = snapshot.usage;
  return usage !== null && Object.hasOwn(usage.species, id) ? usage.species[id].usage : 0;
}

/**
 * The pool species that can be suggested. A species is a candidate when it is in the snapshot, not on the roster,
 * shares no dex number with a roster member, passes the usage filters, and is affordable: its price plus the
 * cheapest prices of the OTHER priced pool species for the other open slots (`openSlots - 1` of them) fits in
 * `remaining`. `roster` must already be limited to ids in `snapshot.species`.
 */
export function selectCandidates(
  ctx: SuggestContext,
  roster: ID[],
  snapshot: Pick<Snapshot, 'species' | 'usage'>,
  options: SuggestOptions,
): CandidateSelection {
  const priced: Candidate[] = [];
  const seen = new Set<ID>();
  for (const id of ctx.pool) {
    if (typeof id !== 'string' || seen.has(id)) continue;
    seen.add(id);
    if (Object.hasOwn(ctx.prices, id) && isFiniteNumber(ctx.prices[id])) priced.push({ species: id, price: ctx.prices[id] });
  }
  priced.sort((a, b) => a.price - b.price || compareIds(a.species, b.species));

  // prefix[i] is the sum of the i cheapest prices.
  const prefix = [0];
  for (const entry of priced) prefix.push(prefix[prefix.length - 1] + entry.price);
  const reserveSlots = ctx.openSlots - 1;
  const take = Math.min(reserveSlots, priced.length - 1);

  const onRoster = new Set(roster);
  const rosterNumbers = new Set(roster.map((id) => snapshot.species[id].num));
  const maxUsage = isFiniteNumber(options.maxUsage) ? options.maxUsage : null;
  const minUsage = isFiniteNumber(options.minUsage) ? options.minUsage : null;

  const candidates: Candidate[] = [];
  priced.forEach((entry, index) => {
    if (!Object.hasOwn(snapshot.species, entry.species) || onRoster.has(entry.species)) return;
    if (rosterNumbers.has(snapshot.species[entry.species].num)) return;
    const usage = usageOf(snapshot, entry.species);
    if (maxUsage !== null && usage > maxUsage) return;
    if (minUsage !== null && usage < minUsage) return;
    // The `take` cheapest others: if this candidate is among the `take` cheapest overall, take one more and drop it.
    const reserve = index < take ? prefix[take + 1] - entry.price : prefix[take];
    if (entry.price + reserve <= ctx.remaining) candidates.push(entry);
  });
  return { candidates, pricedPoolSize: priced.length };
}
```

- [ ] **Step 5: Run tests and typecheck**

```powershell
npx vitest run src/engine/candidates.test.ts
npm run typecheck
```

Expected: all PASS; no type errors. If a hand-computed expectation disagrees with the code, report the numbers; do not edit the assertion or the code to force a pass.

- [ ] **Step 6: Run the whole unit suite**

```powershell
npm test
```

Expected: PASS, no warnings or noise.

- [ ] **Step 7: Commit**

```powershell
git add src/engine/test-support.ts src/engine/candidates.ts src/engine/candidates.test.ts
git commit -m "feat(engine): select affordable candidates and build the draft context" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: The usage lift signal

**Files:**
- Create: `src/engine/lift-signal.ts`
- Test: `src/engine/lift-signal.test.ts`

**Interfaces:**
- Consumes: `ID`; `teammateLift` from `../domain/usage` (returns `co / (W_given x usage_candidate)` or null); `UsageData`; `clamp`, `compareIds` from `./math`; `Reason`, `SignalOutput` from `./types`; test helpers `usageData`, `usageEntry` from `./test-support`.
- Produces: `LIFT_LOG_RANGE = 3`; `liftSignal(roster: ID[], candidate: ID, usage: UsageData | null): SignalOutput`. `roster` is the validated roster (ids present in the snapshot). `covered` counts members with a finite lift above 0; `of` is `roster.length`.

- [ ] **Step 1: Write the failing tests**

`src/engine/lift-signal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { liftSignal } from './lift-signal';
import { usageData, usageEntry } from './test-support';

// Every candidate below has usage 0.1 and member `a` has weight 1000, so expected co-occurrence is 1000 x 0.1 = 100
// and lift = co / 100.
const usage = usageData([
  usageEntry('a', {
    weight: 1000,
    usage: 0.4,
    teammates: [['c', 200], ['d', 12.5], ['e', 800], ['f', 6400], ['g', 1.5625]],
  }),
  usageEntry('b', { weight: 500, usage: 0.3, teammates: [] }),
  usageEntry('c', { usage: 0.1, teammates: [['b', 50]] }), // only c lists b: the pair is found through the symmetric fallback
  usageEntry('d', { usage: 0.1 }),
  usageEntry('e', { usage: 0.1 }),
  usageEntry('f', { usage: 0.1 }),
  usageEntry('g', { usage: 0.1 }),
  usageEntry('h', { usage: 0.1 }), // no stored pair with anyone
]);

describe('liftSignal: the score', () => {
  it('maps lift 1 to 0.5 and lift 2 to 4/6', () => {
    // a -> c: lift = 200 / (1000 x 0.1) = 2, log2 = 1, score = (1 + 3) / 6.
    expect(liftSignal(['a'], 'c', usage).score).toBeCloseTo(4 / 6, 9);
    // b -> c: lift = 50 / (500 x 0.1) = 1, log2 = 0, score = 3 / 6 (found through c's list).
    expect(liftSignal(['b'], 'c', usage).score).toBe(0.5);
  });

  it('spans 0 to 1 over lifts 1/8 to 8 and clamps beyond them', () => {
    expect(liftSignal(['a'], 'd', usage).score).toBe(0); // 12.5 / 100 = 1/8, log2 = -3
    expect(liftSignal(['a'], 'e', usage).score).toBe(1); // 800 / 100 = 8, log2 = 3
    expect(liftSignal(['a'], 'f', usage).score).toBe(1); // 64: (6 + 3) / 6 clamped
    expect(liftSignal(['a'], 'g', usage).score).toBe(0); // 1/64: (-6 + 3) / 6 clamped
  });

  it('averages log2(lift) over the members that have a lift', () => {
    // a -> c lift 2 (log2 1) and b -> c lift 1 (log2 0): mean 0.5, score (0.5 + 3) / 6.
    expect(liftSignal(['a', 'b'], 'c', usage).score).toBeCloseTo(3.5 / 6, 9);
  });
});

describe('liftSignal: no data', () => {
  it('is null without usage data, without a stored pair, or for a candidate without a usage entry', () => {
    expect(liftSignal(['a'], 'c', null)).toEqual({ score: null, reasons: [] });
    expect(liftSignal(['a'], 'h', usage)).toEqual({ score: null, reasons: [] }); // h has an entry but no stored pair
    expect(liftSignal(['a'], 'nobody', usage)).toEqual({ score: null, reasons: [] });
    expect(liftSignal(['x', 'y'], 'c', usage)).toEqual({ score: null, reasons: [] }); // roster members with no usage entry
    expect(liftSignal([], 'c', usage)).toEqual({ score: null, reasons: [] });
  });

  it('ignores a pair whose lift is not above zero', () => {
    const zero = usageData([usageEntry('a', { teammates: [['c', 0]] }), usageEntry('c')]);
    expect(liftSignal(['a'], 'c', zero)).toEqual({ score: null, reasons: [] });
  });
});

describe('liftSignal: reasons', () => {
  it('reports the strongest partners, the weakest partner and how many members had data', () => {
    // Six roster members, each weight 100, candidate usage 0.5: expected co-occurrence 100 x 0.5 = 50 for each.
    // co = lift x 50: m1 200 (lift 4), m2 100 (2), m3 100 (2), m4 150 (3), m5 25 (0.5), m6 12.5 (0.25).
    const table = usageData([
      usageEntry('m1', { teammates: [['cand', 200]] }),
      usageEntry('m2', { teammates: [['cand', 100]] }),
      usageEntry('m3', { teammates: [['cand', 100]] }),
      usageEntry('m4', { teammates: [['cand', 150]] }),
      usageEntry('m5', { teammates: [['cand', 25]] }),
      usageEntry('m6', { teammates: [['cand', 12.5]] }),
      usageEntry('cand', { usage: 0.5 }),
    ]);
    // Roster passed in reverse: the output order must come from the lifts and ids, not from the roster order.
    const result = liftSignal(['m6', 'm5', 'm4', 'm3', 'm2', 'm1'], 'cand', table);
    // mean log2 = (2 + 1 + 1 + 1.5849625 - 1 - 2) / 6 = 0.4308271, score = (0.4308271 + 3) / 6.
    expect(result.score).toBeCloseTo(0.5718045, 6);
    expect(result.reasons).toEqual([
      { kind: 'pairs-often-with', with: 'm1', lift: 4 },
      { kind: 'pairs-often-with', with: 'm4', lift: 3 },
      { kind: 'pairs-often-with', with: 'm2', lift: 2 }, // m2 and m3 tie at 2: id ascending, and only three are listed
      { kind: 'pairs-rarely-with', with: 'm6', lift: 0.25 },
    ]);
  });

  it('adds lift-coverage when only some roster members have a lift', () => {
    const result = liftSignal(['a', 'x'], 'c', usage);
    expect(result.score).toBeCloseTo(4 / 6, 9);
    expect(result.reasons).toEqual([
      { kind: 'pairs-often-with', with: 'a', lift: 2 },
      { kind: 'lift-coverage', covered: 1, of: 2 },
    ]);
  });

  it('lists no often or rarely reason for a lift of exactly 1', () => {
    expect(liftSignal(['b'], 'c', usage).reasons).toEqual([]);
  });

  it('does not modify its inputs', () => {
    const before = JSON.stringify(usage);
    const roster = ['a', 'b'];
    liftSignal(roster, 'c', usage);
    expect(JSON.stringify(usage)).toBe(before);
    expect(roster).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx vitest run src/engine/lift-signal.test.ts
```

Expected: FAIL (cannot resolve `./lift-signal`).

- [ ] **Step 3: Implement**

`src/engine/lift-signal.ts`:

```ts
import type { ID } from '../domain/id';
import type { UsageData } from '../domain/types';
import { teammateLift } from '../domain/usage';
import { clamp, compareIds } from './math';
import type { Reason, SignalOutput } from './types';

/** A lift of 2^-3 maps to score 0, 1 to 0.5 and 2^3 to 1; anything beyond is clamped. */
export const LIFT_LOG_RANGE = 3;

const MAX_OFTEN = 3;

/**
 * How much more often the candidate appears with the roster's Pokémon than its overall usage predicts
 * (`teammateLift`), averaged in log space over the roster members with a stored pair. `roster` must already be
 * limited to ids in the snapshot. No data when there is no usage data or no member has a pair with the candidate.
 */
export function liftSignal(roster: ID[], candidate: ID, usage: UsageData | null): SignalOutput {
  if (usage === null) return { score: null, reasons: [] };

  const lifts: Array<{ member: ID; lift: number }> = [];
  for (const member of roster) {
    const lift = teammateLift(usage, member, candidate);
    if (lift !== null && Number.isFinite(lift) && lift > 0) lifts.push({ member, lift });
  }
  if (lifts.length === 0) return { score: null, reasons: [] };

  const meanLog = lifts.reduce((sum, { lift }) => sum + Math.log2(lift), 0) / lifts.length;
  const score = clamp((meanLog + LIFT_LOG_RANGE) / (2 * LIFT_LOG_RANGE), 0, 1);

  const reasons: Reason[] = [];
  const strongestFirst = [...lifts].sort((a, b) => b.lift - a.lift || compareIds(a.member, b.member));
  for (const { member, lift } of strongestFirst.filter((entry) => entry.lift > 1).slice(0, MAX_OFTEN)) {
    reasons.push({ kind: 'pairs-often-with', with: member, lift });
  }
  const weakest = [...lifts].sort((a, b) => a.lift - b.lift || compareIds(a.member, b.member))[0];
  if (weakest.lift < 1) reasons.push({ kind: 'pairs-rarely-with', with: weakest.member, lift: weakest.lift });
  if (lifts.length < roster.length) reasons.push({ kind: 'lift-coverage', covered: lifts.length, of: roster.length });
  return { score, reasons };
}
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run src/engine/lift-signal.test.ts
npm run typecheck
```

Expected: all PASS; no type errors. If a hand-computed expectation disagrees with the code, report the numbers; do not edit the assertion or the code.

- [ ] **Step 5: Run the whole unit suite**

```powershell
npm test
```

Expected: PASS, no warnings or noise.

- [ ] **Step 6: Commit**

```powershell
git add src/engine/lift-signal.ts src/engine/lift-signal.test.ts
git commit -m "feat(engine): score candidates by usage lift" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: The type synergy signal

**Files:**
- Create: `src/engine/type-signal.ts`
- Test: `src/engine/type-signal.test.ts`

**Interfaces:**
- Consumes: `ID`; `EngineSnapshot`, `Reason`, `SignalOutput` from `./types`; `TYPES`, `TypeName`, `effectiveness`, `multiplier`, `severity` from `./typechart`; `clamp`, `compareIds` from `./math`; test helpers `usageData`, `usageEntry`, `typedMove` from `./test-support` and `speciesEntry` from `../domain/test-support`.
- Produces:
  - constants `DEFENSIVE_SCALE = 12`, `UNEXPOSED_HARM_FACTOR = 0.25`, `OFFENSIVE_MIN_MOVE_SHARE = 0.1`, `DEFENSIVE_WEIGHT = 0.6`, `OFFENSIVE_WEIGHT = 0.4`
  - `interface TypedMember { id: ID; types: readonly string[] }`
  - `defensiveComponent(roster: readonly TypedMember[], candidate: readonly string[]): { raw: number; score: number; reasons: Reason[] }`
  - `attackingTypes(id: ID, snapshot: EngineSnapshot): Set<string>`
  - `offensiveComponent(roster: readonly ReadonlySet<string>[], candidate: ReadonlySet<string>): { fraction: number | null; newTypes: TypeName[] }`
  - `typeSignal(roster: ID[], candidate: ID, snapshot: EngineSnapshot): SignalOutput` (`roster` validated; null score for an empty roster or an unknown candidate)

- [ ] **Step 1: Write the failing tests**

`src/engine/type-signal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { speciesEntry } from '../domain/test-support';
import {
  attackingTypes,
  defensiveComponent,
  offensiveComponent,
  typeSignal,
  type TypedMember,
} from './type-signal';
import { typedMove, usageData, usageEntry } from './test-support';
import type { EngineSnapshot } from './types';

const member = (id: string, ...types: string[]): TypedMember => ({ id, types });
const snap = (species: Record<string, string[]>, usage: EngineSnapshot['usage'] = null, moves: EngineSnapshot['moves'] = {}): EngineSnapshot => ({
  species: Object.fromEntries(Object.entries(species).map(([id, types]) => [id, speciesEntry(id, id, { types })])),
  moves,
  usage,
});

describe('defensiveComponent', () => {
  it('rewards a candidate that resists the roster\'s shared weaknesses (Steel over Dragon)', () => {
    // Mono-Dragon takes x2 from Dragon, Ice, Fairy (severity +1 each), so exposure X is 1 for those three and 0 elsewhere.
    // Mono-Steel resists all three (severity -1): relief min(1, 1) = 1 each, total 3.
    // Steel is weak to Fighting, Fire, Ground (+1 each) where the roster is not exposed: harm 0.25 each, total 0.75.
    // raw = 3 - 0.75 = 2.25, score = 0.5 + 2.25 / 12 = 0.6875.
    const result = defensiveComponent([member('d1', 'Dragon')], ['Steel']);
    expect(result.raw).toBe(2.25);
    expect(result.score).toBe(0.6875);
    expect(result.reasons).toEqual([
      { kind: 'covers-weakness', type: 'Dragon', by: 'resists', weakMembers: ['d1'] },
      { kind: 'covers-weakness', type: 'Fairy', by: 'resists', weakMembers: ['d1'] },
      { kind: 'covers-weakness', type: 'Ice', by: 'resists', weakMembers: ['d1'] },
    ]);
  });

  it('lists the weak members in roster order, and gives the same raw score for two Dragons (relief capped by the candidate)', () => {
    // Exposure is 2 for Dragon, Ice, Fairy but Steel only resists (-1): relief min(2, 1) = 1 each. Same raw as one Dragon.
    const result = defensiveComponent([member('d2', 'Dragon'), member('d1', 'Dragon')], ['Steel']);
    expect(result.raw).toBe(2.25);
    expect(result.reasons[0]).toEqual({ kind: 'covers-weakness', type: 'Dragon', by: 'resists', weakMembers: ['d2', 'd1'] });
  });

  it('penalizes a candidate that adds a weakness the roster is already exposed to (Ground under Dragon)', () => {
    // Ground is weak to Water, Grass, Ice (+1 each). The roster is exposed to Ice (X = 1): harm 1. Water and Grass are not
    // exposed: harm 0.25 each. Ground resists Poison and Rock and is immune to Electric, but the roster has no exposure there:
    // relief 0. raw = -(1 + 0.25 + 0.25) = -1.5, score = 0.5 - 1.5 / 12 = 0.375.
    const result = defensiveComponent([member('d1', 'Dragon')], ['Ground']);
    expect(result.raw).toBe(-1.5);
    expect(result.score).toBe(0.375);
    expect(result.reasons).toEqual([{ kind: 'adds-weakness', type: 'Ice', weakMembers: ['d1'] }]);
  });

  it('charges a quarter of a point for a weakness the roster is not exposed to (Normal under Dragon)', () => {
    // Normal is weak to Fighting (+1), roster exposure 0: harm 0.25. Immune to Ghost, but no exposure: relief 0.
    // raw = -0.25, score = 0.5 - 0.25 / 12.
    const result = defensiveComponent([member('d1', 'Dragon')], ['Normal']);
    expect(result.raw).toBe(-0.25);
    expect(result.score).toBeCloseTo(0.4791667, 7);
    expect(result.reasons).toEqual([]);
  });

  it('reports an immunity as immune, a resistance as resists, and an added weakness, in that order', () => {
    // Flying roster: weak to Electric, Ice, Rock (X = 1 each). Ground candidate: immune to Electric (-2 -> relief min(1, 2) = 1),
    // resists Rock (relief 1), weak to Ice (harm 1, exposed), weak to Water and Grass (roster not exposed: Flying is neutral to Water
    // and resists Grass) harm 0.25 each. raw = 2 - 1 - 0.25 - 0.25 = 0.5, score = 0.5 + 0.5 / 12.
    const result = defensiveComponent([member('fly', 'Flying')], ['Ground']);
    expect(result.raw).toBe(0.5);
    expect(result.score).toBeCloseTo(0.5416667, 7);
    expect(result.reasons).toEqual([
      { kind: 'covers-weakness', type: 'Electric', by: 'immune', weakMembers: ['fly'] },
      { kind: 'covers-weakness', type: 'Rock', by: 'resists', weakMembers: ['fly'] },
      { kind: 'adds-weakness', type: 'Ice', weakMembers: ['fly'] },
    ]);
  });

  it('lists at most 3 covered weaknesses but counts all of them in the score', () => {
    // Grass roster is weak to Bug, Fire, Flying, Ice, Poison (X = 1 each). Steel: resists Bug, Flying, Ice (relief 1 each), immune to
    // Poison (relief min(1, 2) = 1) = 4; weak to Fire (exposed, harm 1), Fighting and Ground (harm 0.25 each) = 1.5.
    // raw = 4 - 1.5 = 2.5, score = 0.5 + 2.5 / 12. Reasons cover Bug, Flying, Ice (name order); Poison is cut off; Fire is the added weakness.
    const result = defensiveComponent([member('g1', 'Grass')], ['Steel']);
    expect(result.raw).toBe(2.5);
    expect(result.score).toBeCloseTo(0.7083333, 7);
    expect(result.reasons).toEqual([
      { kind: 'covers-weakness', type: 'Bug', by: 'resists', weakMembers: ['g1'] },
      { kind: 'covers-weakness', type: 'Flying', by: 'resists', weakMembers: ['g1'] },
      { kind: 'covers-weakness', type: 'Ice', by: 'resists', weakMembers: ['g1'] },
      { kind: 'adds-weakness', type: 'Fire', weakMembers: ['g1'] },
    ]);
  });

  it('clamps the score to 0..1 and never throws on odd input', () => {
    const many = Array.from({ length: 12 }, (_, i) => member(`g${i}`, 'Grass'));
    const result = defensiveComponent(many, ['Bug', 'Flying']); // x4 weak to Fire/Ice/Rock and stacked exposure
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(defensiveComponent([], ['Steel']).raw).toBe(-0.75); // no roster: nothing to relieve, all harm at 0.25
    expect(defensiveComponent([member('x', 'Stellar')], ['Stellar']).raw).toBe(0);
  });
});

describe('attackingTypes', () => {
  const moves = {
    surf: typedMove('surf', 'Water', 'Special', 90),
    thunderwave: typedMove('thunderwave', 'Electric', 'Status', 0),
    seismictoss: typedMove('seismictoss', 'Fighting', 'Physical', 0),
    icebeam: typedMove('icebeam', 'Ice', 'Special', 90),
    rockslide: typedMove('rockslide', 'Rock', 'Physical', 75),
  };
  const usage = usageData([
    usageEntry('norm', {
      moves: [['surf', 0.5], ['thunderwave', 0.9], ['seismictoss', 0.9], ['icebeam', 0.09], ['rockslide', 0.1], ['gonemove', 0.8]],
    }),
  ]);

  it('is the species\' own types plus the types of damaging moves it runs at 10% or more', () => {
    // surf (0.50, damaging) counts; thunderwave is Status; seismictoss has base power 0; icebeam is at 9%;
    // rockslide is exactly 10% (counts); gonemove is not in the move table.
    const s = snap({ norm: ['Normal'] }, usage, moves);
    expect([...attackingTypes('norm', s)].sort()).toEqual(['Normal', 'Rock', 'Water']);
  });

  it('is the own types alone without a usage entry or without usage data, and empty for an unknown species', () => {
    expect([...attackingTypes('norm', snap({ norm: ['Normal', 'Ghost'] }, null, moves))].sort()).toEqual(['Ghost', 'Normal']);
    expect([...attackingTypes('other', snap({ other: ['Fire'] }, usage, moves))]).toEqual(['Fire']);
    expect([...attackingTypes('ghost', snap({ norm: ['Normal'] }, usage, moves))]).toEqual([]);
    expect([...attackingTypes('constructor', snap({ norm: ['Normal'] }, usage, moves))]).toEqual([]);
  });
});

describe('offensiveComponent', () => {
  const set = (...types: string[]) => new Set(types);

  it('is the fraction of the roster\'s uncovered defending types the candidate hits super effectively', () => {
    // Fire hits Bug, Grass, Ice, Steel: 4 covered, so 14 uncovered. Water hits Fire, Ground, Rock (all uncovered): 3 / 14.
    expect(offensiveComponent([set('Fire')], set('Water'))).toEqual({
      fraction: 3 / 14,
      newTypes: ['Fire', 'Ground', 'Rock'],
    });
    // Ground adds Electric, Poison (and Fire, Rock again; Steel is already covered): {Fire, Ground, Rock, Electric, Poison} = 5 / 14.
    expect(offensiveComponent([set('Fire')], set('Water', 'Ground')).newTypes).toEqual(['Electric', 'Fire', 'Ground', 'Poison', 'Rock']);
    expect(offensiveComponent([set('Fire')], set('Water', 'Ground')).fraction).toBeCloseTo(5 / 14, 12);
  });

  it('is 0, not null, when the candidate adds nothing', () => {
    // Dragon hits only Dragon: 17 uncovered. Normal hits nothing super effectively.
    expect(offensiveComponent([set('Dragon')], set('Normal'))).toEqual({ fraction: 0, newTypes: [] });
  });

  it('counts only types the roster does not already cover, pooled over every member', () => {
    // Roster attacking sets {Normal, Water, Rock}: Water hits Fire, Ground, Rock; Rock hits Bug, Fire, Flying, Ice: 6 covered, 12 not.
    // A Grass candidate hits Ground, Rock (covered) and Water (not): 1 / 12.
    expect(offensiveComponent([set('Normal', 'Water', 'Rock')], set('Grass'))).toEqual({ fraction: 1 / 12, newTypes: ['Water'] });
    // The same pool split over three members gives the same answer.
    expect(offensiveComponent([set('Normal'), set('Water'), set('Rock')], set('Grass')).fraction).toBe(1 / 12);
  });

  it('has no data when the roster already covers all 18 defending types', () => {
    // Fighting, Ground, Ice, Ghost, Poison, Grass and Flying together hit all 18 types super effectively.
    const roster = [set('Fighting', 'Ground'), set('Ice', 'Ghost'), set('Poison', 'Grass'), set('Flying')];
    expect(offensiveComponent(roster, set('Water'))).toEqual({ fraction: null, newTypes: [] });
  });
});

describe('typeSignal', () => {
  it('combines 0.6 defensive and 0.4 offensive, with the reasons of both', () => {
    // Fire roster, Water candidate. Defensive: Fire takes x2 from Ground, Rock, Water (X = 1 each); Water resists Water (relief 1);
    // Water is weak to Electric and Grass where the roster is not exposed (0.25 each): raw = 1 - 0.5 = 0.5, defensive = 0.5 + 0.5 / 12.
    // Offensive: 3 / 14. Score = 0.6 x 0.5416667 + 0.4 x 0.2142857 = 0.325 + 0.0857143.
    const s = snap({ fire: ['Fire'], water: ['Water'] });
    const result = typeSignal(['fire'], 'water', s);
    expect(result.score).toBeCloseTo(0.4107143, 7);
    expect(result.reasons).toEqual([
      { kind: 'covers-weakness', type: 'Water', by: 'resists', weakMembers: ['fire'] },
      { kind: 'adds-coverage', types: ['Fire', 'Ground', 'Rock'] },
    ]);
  });

  it('scores the Dragon-roster candidates from the worked examples', () => {
    const s = snap({ dra: ['Dragon'], stl: ['Steel'], grd: ['Ground'], nod: ['Normal'] });
    // Steel: defensive 0.6875, offensive 3 / 17 (Fairy, Ice, Rock): 0.6 x 0.6875 + 0.4 x 3 / 17 = 0.4125 + 0.0705882.
    expect(typeSignal(['dra'], 'stl', s).score).toBeCloseTo(0.4830882, 7);
    // Ground: defensive 0.375, offensive 5 / 17: 0.225 + 0.1176471.
    expect(typeSignal(['dra'], 'grd', s).score).toBeCloseTo(0.3426471, 7);
    // Normal: defensive 0.4791667, offensive 0 / 17: 0.6 x 0.4791667 = 0.2875.
    expect(typeSignal(['dra'], 'nod', s).score).toBeCloseTo(0.2875, 7);
    expect(typeSignal(['dra'], 'stl', s).reasons.at(-1)).toEqual({ kind: 'adds-coverage', types: ['Fairy', 'Ice', 'Rock'] });
    expect(typeSignal(['dra'], 'nod', s).reasons).toEqual([]);
  });

  it('drops the offensive component when the roster already covers every type: the score is the defensive score', () => {
    const s = snap({ f1: ['Fighting', 'Ground'], f2: ['Ice', 'Ghost'], f3: ['Poison', 'Grass'], f4: ['Flying'], water: ['Water'] });
    const roster = ['f1', 'f2', 'f3', 'f4'];
    const result = typeSignal(roster, 'water', s);
    const members = roster.map((id) => member(id, ...s.species[id].types));
    expect(result.score).toBe(defensiveComponent(members, ['Water']).score);
    expect(result.reasons.some((reason) => reason.kind === 'adds-coverage')).toBe(false);
  });

  it('uses real move types for the offensive component', () => {
    const moves = { surf: typedMove('surf', 'Water', 'Special', 90) };
    const usage = usageData([usageEntry('fire', { moves: [['surf', 0.6]] })]);
    const s = snap({ fire: ['Fire'], grass: ['Grass'] }, usage, moves);
    // Fire roster that also runs Surf covers Bug, Grass, Ice, Steel, Fire, Ground, Rock (7): 11 uncovered.
    // Grass hits Ground, Rock (covered) and Water (uncovered): 1 / 11.
    expect(offensiveComponent([attackingTypes('fire', s)], attackingTypes('grass', s)).fraction).toBeCloseTo(1 / 11, 12);
  });

  it('has no data for an empty roster, a roster of unknown ids, or an unknown candidate', () => {
    const s = snap({ fire: ['Fire'], water: ['Water'] });
    expect(typeSignal([], 'water', s)).toEqual({ score: null, reasons: [] });
    expect(typeSignal(['ghost'], 'water', s)).toEqual({ score: null, reasons: [] });
    expect(typeSignal(['fire'], 'ghost', s)).toEqual({ score: null, reasons: [] });
    expect(typeSignal(['fire'], 'constructor', s)).toEqual({ score: null, reasons: [] });
  });

  it('ignores roster ids that are not in the snapshot', () => {
    const s = snap({ fire: ['Fire'], water: ['Water'] });
    expect(typeSignal(['ghost', 'fire'], 'water', s)).toEqual(typeSignal(['fire'], 'water', s));
  });

  it('does not modify its inputs', () => {
    const s = snap({ fire: ['Fire'], water: ['Water'] });
    const roster = ['fire'];
    const before = JSON.stringify({ s, roster });
    typeSignal(roster, 'water', s);
    expect(JSON.stringify({ s, roster })).toBe(before);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx vitest run src/engine/type-signal.test.ts
```

Expected: FAIL (cannot resolve `./type-signal`).

- [ ] **Step 3: Implement**

`src/engine/type-signal.ts`:

```ts
import type { ID } from '../domain/id';
import { clamp, compareIds } from './math';
import { TYPES, effectiveness, multiplier, severity, type TypeName } from './typechart';
import type { EngineSnapshot, Reason, SignalOutput } from './types';

/** Raw defensive scores are divided by this before being centred on 0.5. */
export const DEFENSIVE_SCALE = 12;
/** A weakness the roster is not yet exposed to costs this fraction of a normal one. */
export const UNEXPOSED_HARM_FACTOR = 0.25;
/** A move counts toward a species' attacking types when it runs on at least this share of its sets. */
export const OFFENSIVE_MIN_MOVE_SHARE = 0.1;
export const DEFENSIVE_WEIGHT = 0.6;
export const OFFENSIVE_WEIGHT = 0.4;

const MAX_COVERS = 3;
const MAX_ADDS = 2;

export interface TypedMember {
  id: ID;
  types: readonly string[];
}

export interface DefensiveResult {
  raw: number;
  score: number;
  reasons: Reason[];
}

/**
 * How well the candidate's typing complements the roster's. For each attacking type `T`, `exposure` is the roster's
 * summed severity (x4 = +2, x2 = +1, x1/2 = -1, x1/4 or immune = -2); only the part above 0 is an unresisted
 * weakness. A candidate that resists `T` relieves up to that much; one that is weak to `T` costs its severity
 * (a quarter of it where the roster is not exposed). The score is `0.5 + raw / DEFENSIVE_SCALE`, clamped.
 */
export function defensiveComponent(roster: readonly TypedMember[], candidate: readonly string[]): DefensiveResult {
  let raw = 0;
  const covers: Array<{ type: TypeName; relief: number }> = [];
  const adds: Array<{ type: TypeName; harm: number }> = [];

  for (const type of TYPES) {
    const exposure = roster.reduce((sum, member) => sum + severity(multiplier(type, member.types)), 0);
    const exposed = Math.max(0, exposure);
    const own = severity(multiplier(type, candidate));
    if (own < 0) {
      const relief = Math.min(exposed, -own);
      if (relief > 0) {
        raw += relief;
        covers.push({ type, relief });
      }
    } else if (own > 0) {
      const harm = own * (exposed >= 1 ? 1 : UNEXPOSED_HARM_FACTOR);
      raw -= harm;
      if (exposed >= 1) adds.push({ type, harm });
    }
  }

  const weakMembersOf = (type: TypeName): ID[] =>
    roster.filter((member) => multiplier(type, member.types) > 1).map((member) => member.id);

  covers.sort((a, b) => b.relief - a.relief || compareIds(a.type, b.type));
  adds.sort((a, b) => b.harm - a.harm || compareIds(a.type, b.type));

  const reasons: Reason[] = [];
  for (const { type } of covers.slice(0, MAX_COVERS)) {
    const by = multiplier(type, candidate) === 0 ? 'immune' : 'resists';
    reasons.push({ kind: 'covers-weakness', type, by, weakMembers: weakMembersOf(type) });
  }
  for (const { type } of adds.slice(0, MAX_ADDS)) {
    reasons.push({ kind: 'adds-weakness', type, weakMembers: weakMembersOf(type) });
  }
  return { raw, score: clamp(0.5 + raw / DEFENSIVE_SCALE, 0, 1), reasons };
}

/**
 * The types a species can hit with: its own types plus the types of the damaging moves (not Status, base power above 0)
 * it runs on at least `OFFENSIVE_MIN_MOVE_SHARE` of its sets. A species with no usage entry, or a move that is not in
 * the move table, contributes only its own types. An id that is not in the snapshot has none.
 */
export function attackingTypes(id: ID, snapshot: EngineSnapshot): Set<string> {
  const types = new Set<string>(Object.hasOwn(snapshot.species, id) ? snapshot.species[id].types : []);
  const usage = snapshot.usage;
  if (usage !== null && Object.hasOwn(usage.species, id)) {
    for (const [moveId, share] of usage.species[id].moves) {
      if (share < OFFENSIVE_MIN_MOVE_SHARE || !Object.hasOwn(snapshot.moves, moveId)) continue;
      const move = snapshot.moves[moveId];
      if (move.category !== 'Status' && move.basePower > 0) types.add(move.type);
    }
  }
  return types;
}

/**
 * The fraction of the defending types the roster cannot yet hit super effectively that the candidate can. Each
 * defending type is judged on its own (dual typing is ignored). `fraction` is null when the roster already covers all 18.
 */
export function offensiveComponent(
  roster: readonly ReadonlySet<string>[],
  candidate: ReadonlySet<string>,
): { fraction: number | null; newTypes: TypeName[] } {
  const covered = new Set<TypeName>();
  for (const attacking of roster) {
    for (const type of attacking) {
      for (const defending of TYPES) if (effectiveness(type, defending) >= 2) covered.add(defending);
    }
  }
  const uncovered = TYPES.filter((defending) => !covered.has(defending));
  if (uncovered.length === 0) return { fraction: null, newTypes: [] };
  const newTypes = uncovered.filter((defending) => [...candidate].some((type) => effectiveness(type, defending) >= 2));
  return { fraction: newTypes.length / uncovered.length, newTypes };
}

/**
 * Type synergy: `0.6 x defensive + 0.4 x offensive`, or just the defensive score when the offensive component has no
 * data. No data for an empty roster (after dropping ids that are not in the snapshot) or an unknown candidate.
 */
export function typeSignal(roster: ID[], candidate: ID, snapshot: EngineSnapshot): SignalOutput {
  if (!Object.hasOwn(snapshot.species, candidate)) return { score: null, reasons: [] };
  const members: TypedMember[] = roster
    .filter((id) => Object.hasOwn(snapshot.species, id))
    .map((id) => ({ id, types: snapshot.species[id].types }));
  if (members.length === 0) return { score: null, reasons: [] };

  const defensive = defensiveComponent(members, snapshot.species[candidate].types);
  const offensive = offensiveComponent(
    members.map((entry) => attackingTypes(entry.id, snapshot)),
    attackingTypes(candidate, snapshot),
  );

  const reasons = [...defensive.reasons];
  if (offensive.fraction === null) return { score: defensive.score, reasons };
  if (offensive.newTypes.length > 0) reasons.push({ kind: 'adds-coverage', types: [...offensive.newTypes] });
  return { score: clamp(DEFENSIVE_WEIGHT * defensive.score + OFFENSIVE_WEIGHT * offensive.fraction, 0, 1), reasons };
}
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run src/engine/type-signal.test.ts
npm run typecheck
```

Expected: all PASS; no type errors. If a hand-computed expectation disagrees with the code, report the numbers (each test comment shows the arithmetic); do not edit the assertion or the code to force a pass.

- [ ] **Step 5: Run the whole unit suite**

```powershell
npm test
```

Expected: PASS, no warnings or noise.

- [ ] **Step 6: Commit**

```powershell
git add src/engine/type-signal.ts src/engine/type-signal.test.ts
git commit -m "feat(engine): score candidates by type synergy" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `suggest`: combining, ranking and notes

**Files:**
- Create: `src/engine/suggest.ts`
- Test: `src/engine/suggest.test.ts`

**Interfaces:**
- Consumes: `selectCandidates`, `usageOf` from `./candidates`; `liftSignal` from `./lift-signal`; `typeSignal` from `./type-signal`; `clamp`, `compareIds` from `./math`; all types from `./types`; test helpers `usageData`, `usageEntry` from `./test-support` and `speciesEntry` from `../domain/test-support`.
- Produces: `DEFAULT_WEIGHTS`, `DEFAULT_LIMIT = 20`, `LOW_USAGE = 0.03`, and `suggest(ctx: SuggestContext, snapshot: EngineSnapshot, options?: SuggestOptions): SuggestResult` exactly as in the spec.

- [ ] **Step 1: Write the failing tests**

`src/engine/suggest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { speciesEntry } from '../domain/test-support';
import { suggest } from './suggest';
import { usageData, usageEntry } from './test-support';
import type { EngineSnapshot, SuggestContext, SuggestOptions } from './types';

/**
 * A small universe. Roster member `dra1` (Dragon, weight 100, usage 0.5). Candidates:
 *   stla, stlb, stlc: Steel twins, usage 0.1, co-occurrence 20 with dra1 -> lift 20 / (100 x 0.1) = 2
 *   grd: Ground, usage 0.2, co 5 -> lift 5 / (100 x 0.2) = 0.25
 *   nod: Normal, no usage entry (no lift)
 * Signal scores (see type-signal.test.ts for the type arithmetic):
 *   lift score: stl* (log2 2 + 3) / 6 = 0.6666667; grd (log2 0.25 + 3) / 6 = 0.1666667
 *   type score: stl* 0.4830882; grd 0.3426471; nod 0.2875
 * Default weights 0.35 and 0.3 re-normalize to 0.5384615 and 0.4615385 when both signals have data:
 *   stl* 0.5384615 x 0.6666667 + 0.4615385 x 0.4830882 = 0.5819382
 *   grd  0.5384615 x 0.1666667 + 0.4615385 x 0.3426471 = 0.2478884
 *   nod  type only: 0.2875
 */
const snapshot = (): EngineSnapshot => ({
  species: {
    dra1: speciesEntry('dra1', 'dra1', { num: 1, types: ['Dragon'] }),
    stla: speciesEntry('stla', 'stla', { num: 2, types: ['Steel'] }),
    stlb: speciesEntry('stlb', 'stlb', { num: 3, types: ['Steel'] }),
    stlc: speciesEntry('stlc', 'stlc', { num: 4, types: ['Steel'] }),
    grd: speciesEntry('grd', 'grd', { num: 5, types: ['Ground'] }),
    nod: speciesEntry('nod', 'nod', { num: 6, types: ['Normal'] }),
  },
  moves: {},
  usage: usageData([
    usageEntry('dra1', { weight: 100, usage: 0.5, teammates: [['stla', 20], ['stlb', 20], ['stlc', 20], ['grd', 5]] }),
    usageEntry('stla', { usage: 0.1 }),
    usageEntry('stlb', { usage: 0.1 }),
    usageEntry('stlc', { usage: 0.1 }),
    usageEntry('grd', { usage: 0.2 }),
  ]),
});
const PRICES: Record<string, number> = { stla: 10, stlb: 6, stlc: 6, grd: 4, nod: 3 };
const ctx = (overrides: Partial<SuggestContext> = {}): SuggestContext => ({
  roster: ['dra1'],
  pool: ['grd', 'nod', 'stlc', 'stlb', 'stla'], // the reverse of the expected ranking
  prices: { ...PRICES },
  remaining: 100,
  openSlots: 1,
  ...overrides,
});
const order = (result: ReturnType<typeof suggest>) => result.suggestions.map((s) => s.species);

describe('suggest: ranking', () => {
  it('ranks by combined score, then price ascending, then id ascending', () => {
    const result = suggest(ctx(), snapshot());
    // stlb and stlc tie with stla on score; stlb and stlc cost 6, stla costs 10; stlb comes before stlc by id.
    expect(order(result)).toEqual(['stlb', 'stlc', 'stla', 'nod', 'grd']);
    expect(result.suggestions[0].score).toBeCloseTo(0.5819382, 6);
    expect(result.suggestions[3].score).toBeCloseTo(0.2875, 6);
    expect(result.suggestions[4].score).toBeCloseTo(0.2478884, 6);
    expect(result.considered).toBe(5);
    expect(result.notes).toEqual([]);
  });

  it('gives every suggestion both signals in a fixed order, with effective weights and reasons', () => {
    const top = suggest(ctx(), snapshot()).suggestions[0];
    expect(top.species).toBe('stlb');
    expect(top.price).toBe(6);
    expect(top.signals.map((s) => s.signal)).toEqual(['usageLift', 'typeSynergy']);
    expect(top.signals[0].score).toBeCloseTo(0.6666667, 6);
    expect(top.signals[0].weight).toBeCloseTo(0.5384615, 6);
    expect(top.signals[0].reasons).toEqual([{ kind: 'pairs-often-with', with: 'dra1', lift: 2 }]);
    expect(top.signals[1].score).toBeCloseTo(0.4830882, 6);
    expect(top.signals[1].weight).toBeCloseTo(0.4615385, 6);
    expect(top.signals[1].reasons).toEqual([
      { kind: 'covers-weakness', type: 'Dragon', by: 'resists', weakMembers: ['dra1'] },
      { kind: 'covers-weakness', type: 'Fairy', by: 'resists', weakMembers: ['dra1'] },
      { kind: 'covers-weakness', type: 'Ice', by: 'resists', weakMembers: ['dra1'] },
      { kind: 'adds-coverage', types: ['Fairy', 'Ice', 'Rock'] },
    ]);
    // Usage 0.1 is above the low-usage line, so there is no informational reason; the flat list is the signals' reasons in order.
    expect(top.reasons).toEqual([...top.signals[0].reasons, ...top.signals[1].reasons]);
  });

  it('uses only the signals that have data: a candidate with no usage entry is scored by type synergy alone', () => {
    const nod = suggest(ctx(), snapshot()).suggestions.find((s) => s.species === 'nod');
    expect(nod).toBeDefined();
    expect(nod?.signals[0]).toEqual({ signal: 'usageLift', score: null, weight: 0, reasons: [] });
    expect(nod?.signals[1].score).toBeCloseTo(0.2875, 6);
    expect(nod?.signals[1].weight).toBe(1);
    expect(nod?.reasons).toEqual([{ kind: 'no-ladder-usage' }]);
  });
});

describe('suggest: weights', () => {
  it('lets the options override the default weights', () => {
    // Lift only: stl* 0.6666667, grd 0.1666667; nod has no lift and the type weight is 0, so nod has no usable signal.
    const liftOnly = suggest(ctx(), snapshot(), { weights: { usageLift: 1, typeSynergy: 0 } });
    expect(order(liftOnly)).toEqual(['stlb', 'stlc', 'stla', 'grd']);
    expect(liftOnly.suggestions[0].score).toBeCloseTo(0.6666667, 6);
    expect(liftOnly.suggestions[3].score).toBeCloseTo(0.1666667, 6);
    expect(liftOnly.considered).toBe(5);
    expect(liftOnly.notes).toEqual([{ kind: 'unscored-candidates', count: 1 }]);

    // Equal weights: stl* 0.5 x 0.6666667 + 0.5 x 0.4830882 = 0.5748775.
    const equal = suggest(ctx(), snapshot(), { weights: { usageLift: 0.5, typeSynergy: 0.5 } });
    expect(equal.suggestions[0].score).toBeCloseTo(0.5748775, 6);
    // A zero weight on the type signal leaves the lift signal at full weight, and vice versa.
    const zeroType = suggest(ctx(), snapshot(), { weights: { typeSynergy: 0 } });
    expect(zeroType.suggestions[0].score).toBeCloseTo(0.6666667, 6);
    const zeroLift = suggest(ctx(), snapshot(), { weights: { usageLift: 0 } });
    expect(zeroLift.suggestions[0].score).toBeCloseTo(0.4830882, 6);
  });

  it('ignores weights that are not finite non-negative numbers', () => {
    const baseline = suggest(ctx(), snapshot());
    for (const weights of [
      { usageLift: -1, typeSynergy: Number.NaN },
      { usageLift: 'x', typeSynergy: Number.POSITIVE_INFINITY },
      null,
      5,
      [],
    ]) {
      const result = suggest(ctx(), snapshot(), { weights } as unknown as SuggestOptions);
      expect(result, JSON.stringify(weights)).toEqual(baseline);
    }
  });
});

describe('suggest: limit and options', () => {
  it('cuts to the limit after ranking, and reports how many were considered', () => {
    const result = suggest(ctx(), snapshot(), { limit: 2 });
    expect(order(result)).toEqual(['stlb', 'stlc']);
    expect(result.considered).toBe(5);
  });

  it('falls back to the default limit for a value that is not a positive integer', () => {
    for (const limit of [0, -1, 2.5, Number.NaN, 'x', null]) {
      expect(suggest(ctx(), snapshot(), { limit } as unknown as SuggestOptions).suggestions, String(limit)).toHaveLength(5);
    }
  });

  it('passes the usage filters to candidate selection', () => {
    expect(order(suggest(ctx(), snapshot(), { maxUsage: 0.15 }))).toEqual(['stlb', 'stlc', 'stla', 'nod']); // grd is at 0.2
    expect(order(suggest(ctx(), snapshot(), { minUsage: 0.15 }))).toEqual(['grd']); // nod has no usage entry
  });

  it('never throws on odd options', () => {
    for (const options of [null, 'x', 5, [], { limit: {}, weights: 5, maxUsage: 'a' }]) {
      expect(() => suggest(ctx(), snapshot(), options as unknown as SuggestOptions), JSON.stringify(options)).not.toThrow();
    }
    expect(order(suggest(ctx(), snapshot(), undefined))).toEqual(['stlb', 'stlc', 'stla', 'nod', 'grd']);
  });
});

describe('suggest: budget', () => {
  it('leaves out candidates that would make the roster impossible to fill', () => {
    // 3 open slots, reserve the 2 cheapest others. Sorted prices: nod 3, grd 4, stlb 6, stlc 6, stla 10 (prefix 0, 3, 7, 13, 19, 29).
    // nod needs 3 + (4 + 6) = 13; grd 4 + (3 + 6) = 13; stlb 6 + (3 + 4) = 13; stlc 13; stla 10 + (3 + 4) = 17.
    const result = suggest(ctx({ openSlots: 3, remaining: 14 }), snapshot());
    expect(order(result)).toEqual(['stlb', 'stlc', 'nod', 'grd']);
    expect(result.considered).toBe(4);
    expect(order(suggest(ctx({ openSlots: 3, remaining: 13 }), snapshot()))).toEqual(['stlb', 'stlc', 'nod', 'grd']);
    expect(order(suggest(ctx({ openSlots: 3, remaining: 12 }), snapshot()))).toEqual([]);
    expect(order(suggest(ctx({ openSlots: 3, remaining: 17 }), snapshot()))).toContain('stla');
  });
});

describe('suggest: same dex number and roster', () => {
  it('leaves out a species that shares a dex number with a roster member', () => {
    const s = snapshot();
    s.species.dra2 = speciesEntry('dra2', 'dra2', { num: 1, types: ['Dragon'] });
    const result = suggest(ctx({ pool: [...ctx().pool, 'dra2'], prices: { ...PRICES, dra2: 1 } }), s);
    expect(order(result)).not.toContain('dra2');
    expect(result.considered).toBe(5);
  });

  it('ignores roster ids that are not in the snapshot and repeated roster ids', () => {
    expect(order(suggest(ctx({ roster: ['ghost', 'dra1', 'dra1'] }), snapshot()))).toEqual(['stlb', 'stlc', 'stla', 'nod', 'grd']);
  });
});

describe('suggest: informational usage reasons', () => {
  const withLow = () => {
    const s = snapshot();
    s.species.lowu = speciesEntry('lowu', 'lowu', { num: 7, types: ['Normal'] });
    s.species.edge = speciesEntry('edge', 'edge', { num: 8, types: ['Normal'] });
    s.species.justunder = speciesEntry('justunder', 'justunder', { num: 9, types: ['Normal'] });
    if (s.usage === null) throw new Error('fixture has usage');
    s.usage.species.lowu = usageEntry('lowu', { usage: 0.02 });
    s.usage.species.edge = usageEntry('edge', { usage: 0.03 });
    s.usage.species.justunder = usageEntry('justunder', { usage: 0.029 });
    return s;
  };
  const wide = () =>
    ctx({
      pool: ['lowu', 'edge', 'justunder', 'nod'],
      prices: { lowu: 1, edge: 1, justunder: 1, nod: 1 },
    });

  it('adds low-usage below 3% (strictly), no-ladder-usage without an entry, and nothing otherwise', () => {
    const result = suggest(wide(), withLow());
    const byId = Object.fromEntries(result.suggestions.map((s) => [s.species, s]));
    expect(byId.lowu.reasons.at(-1)).toEqual({ kind: 'low-usage', usage: 0.02 });
    expect(byId.justunder.reasons.at(-1)).toEqual({ kind: 'low-usage', usage: 0.029 });
    expect(byId.edge.reasons.some((r) => r.kind === 'low-usage')).toBe(false); // exactly 0.03 is not low
    expect(byId.nod.reasons.at(-1)).toEqual({ kind: 'no-ladder-usage' });
  });

  it('never changes the score', () => {
    // lowu, edge and justunder are Normal-typed twins of nod with no stored pair: all four score alike.
    const result = suggest(wide(), withLow());
    const scores = new Set(result.suggestions.map((s) => s.score));
    expect(scores.size).toBe(1);
  });

  it('adds no usage reason at all when there is no usage data', () => {
    const s = snapshot();
    s.usage = null;
    for (const suggestion of suggest(ctx(), s).suggestions) {
      expect(suggestion.reasons.every((r) => r.kind !== 'no-ladder-usage' && r.kind !== 'low-usage')).toBe(true);
    }
  });
});

describe('suggest: notes and early results', () => {
  it('says roster-full when there are no open slots, and empty-roster when the roster has nothing usable', () => {
    expect(suggest(ctx({ openSlots: 0 }), snapshot())).toEqual({ suggestions: [], considered: 0, notes: [{ kind: 'roster-full' }] });
    expect(suggest(ctx({ roster: [] }), snapshot())).toEqual({ suggestions: [], considered: 0, notes: [{ kind: 'empty-roster' }] });
    expect(suggest(ctx({ roster: ['ghost'] }), snapshot()).notes).toEqual([{ kind: 'empty-roster' }]);
    // Both at once: roster-full wins and is the only note.
    expect(suggest(ctx({ roster: [], openSlots: 0 }), snapshot()).notes).toEqual([{ kind: 'roster-full' }]);
  });

  it('says invalid-context for a malformed context and returns nothing', () => {
    const bad: unknown[] = [
      null,
      undefined,
      5,
      {},
      { ...ctx(), roster: 'dra1' },
      { ...ctx(), pool: null },
      { ...ctx(), prices: null },
      { ...ctx(), remaining: Number.NaN },
      { ...ctx(), remaining: '100' },
      { ...ctx(), openSlots: -1 },
      { ...ctx(), openSlots: 1.5 },
      { ...ctx(), openSlots: '1' },
    ];
    for (const context of bad) {
      expect(suggest(context as SuggestContext, snapshot()), JSON.stringify(context)).toEqual({
        suggestions: [],
        considered: 0,
        notes: [{ kind: 'invalid-context' }],
      });
    }
  });

  it('says cannot-fill-roster when the priced pool is smaller than the open slots, and still ranks', () => {
    // 6 open slots, 5 priced species: each candidate needs its own price plus all four others (29 in total).
    const result = suggest(ctx({ openSlots: 6, remaining: 29 }), snapshot());
    expect(result.notes).toEqual([{ kind: 'cannot-fill-roster', poolSize: 5, openSlots: 6 }]);
    expect(result.suggestions).toHaveLength(5);
    expect(suggest(ctx({ openSlots: 6, remaining: 28 }), snapshot()).suggestions).toEqual([]);
  });

  it('says no-usage-data when there is no usage data, and the lift signal has no data for anyone', () => {
    const s = snapshot();
    s.usage = null;
    const result = suggest(ctx(), s);
    expect(result.notes).toEqual([{ kind: 'no-usage-data' }]);
    expect(result.suggestions).toHaveLength(5);
    for (const suggestion of result.suggestions) expect(suggestion.signals[0].score).toBeNull();
    expect(result.suggestions[0].score).toBeCloseTo(0.4830882, 6); // type synergy alone
  });

  it('lists the notes in a fixed order', () => {
    const s = snapshot();
    s.usage = null;
    const result = suggest(ctx({ openSlots: 6 }), s, { weights: { typeSynergy: 0 } });
    // Nothing is scorable (no usage data and the type weight is 0): all 5 candidates are unscored.
    expect(result.suggestions).toEqual([]);
    expect(result.considered).toBe(5);
    expect(result.notes).toEqual([
      { kind: 'cannot-fill-roster', poolSize: 5, openSlots: 6 },
      { kind: 'no-usage-data' },
      { kind: 'unscored-candidates', count: 5 },
    ]);
  });
});

describe('suggest: robustness', () => {
  it('does not modify its inputs and gives the same answer twice', () => {
    const s = snapshot();
    const context = ctx({ openSlots: 3, remaining: 14 });
    const options: SuggestOptions = { limit: 3, weights: { usageLift: 0.5 } };
    const before = JSON.stringify({ s, context, options });
    const first = suggest(context, s, options);
    const second = suggest(context, s, options);
    expect(JSON.stringify({ s, context, options })).toBe(before);
    expect(second).toEqual(first);
  });

  it('never returns a score outside 0..1', () => {
    for (const suggestion of suggest(ctx(), snapshot()).suggestions) {
      expect(suggestion.score).toBeGreaterThanOrEqual(0);
      expect(suggestion.score).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx vitest run src/engine/suggest.test.ts
```

Expected: FAIL (cannot resolve `./suggest`).

- [ ] **Step 3: Implement**

`src/engine/suggest.ts`:

```ts
import type { ID } from '../domain/id';
import { selectCandidates } from './candidates';
import { liftSignal } from './lift-signal';
import { clamp, compareIds } from './math';
import { typeSignal } from './type-signal';
import {
  SIGNAL_NAMES,
  type EngineSnapshot,
  type Note,
  type Reason,
  type SignalName,
  type SignalOutput,
  type SignalScore,
  type SuggestContext,
  type SuggestOptions,
  type SuggestResult,
  type Suggestion,
} from './types';

export const DEFAULT_WEIGHTS: Record<SignalName, number> = { usageLift: 0.35, typeSynergy: 0.3 };
export const DEFAULT_LIMIT = 20;
/** Below this usage fraction a candidate gets an informational `low-usage` reason. */
export const LOW_USAGE = 0.03;

function isContext(value: unknown): value is SuggestContext {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    Array.isArray(c.roster) &&
    Array.isArray(c.pool) &&
    typeof c.prices === 'object' &&
    c.prices !== null &&
    typeof c.remaining === 'number' &&
    Number.isFinite(c.remaining) &&
    typeof c.openSlots === 'number' &&
    Number.isInteger(c.openSlots) &&
    c.openSlots >= 0
  );
}

function resolveWeights(options: SuggestOptions): Record<SignalName, number> {
  const weights = { ...DEFAULT_WEIGHTS };
  const given: unknown = options.weights;
  if (typeof given === 'object' && given !== null) {
    for (const name of SIGNAL_NAMES) {
      if (!Object.hasOwn(given, name)) continue;
      const value = (given as Record<string, unknown>)[name];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) weights[name] = value;
    }
  }
  return weights;
}

/** Informational only: `low-usage` below 3%, `no-ladder-usage` when the species has no usage entry. */
function usageReason(snapshot: EngineSnapshot, id: ID): Reason | null {
  const usage = snapshot.usage;
  if (usage === null) return null;
  if (!Object.hasOwn(usage.species, id)) return { kind: 'no-ladder-usage' };
  const share = usage.species[id].usage;
  return share < LOW_USAGE ? { kind: 'low-usage', usage: share } : null;
}

/**
 * Ranks the pool species that fit the budget by how well they pair with the roster, with typed reasons. Pure and
 * deterministic; never throws. See the stage 1 spec for the candidate rules, the two signals and the notes.
 */
export function suggest(ctx: SuggestContext, snapshot: EngineSnapshot, options: SuggestOptions = {}): SuggestResult {
  const early = (notes: Note[]): SuggestResult => ({ suggestions: [], considered: 0, notes });
  if (!isContext(ctx)) return early([{ kind: 'invalid-context' }]);
  const opts: SuggestOptions = typeof options === 'object' && options !== null ? options : {};

  const roster: ID[] = [];
  for (const id of ctx.roster) {
    if (typeof id === 'string' && Object.hasOwn(snapshot.species, id) && !roster.includes(id)) roster.push(id);
  }
  if (ctx.openSlots === 0) return early([{ kind: 'roster-full' }]);
  if (roster.length === 0) return early([{ kind: 'empty-roster' }]);

  const selection = selectCandidates(ctx, roster, snapshot, opts);
  const weights = resolveWeights(opts);
  const limit = typeof opts.limit === 'number' && Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : DEFAULT_LIMIT;

  const scored: Suggestion[] = [];
  let unscored = 0;
  for (const { species, price } of selection.candidates) {
    const outputs: SignalOutput[] = [liftSignal(roster, species, snapshot.usage), typeSignal(roster, species, snapshot)];
    const withData = SIGNAL_NAMES.filter((_, index) => outputs[index].score !== null);
    const total = withData.reduce((sum, name) => sum + weights[name], 0);
    if (withData.length === 0 || total <= 0) {
      unscored += 1;
      continue;
    }

    let score = 0;
    const signals: SignalScore[] = SIGNAL_NAMES.map((signal, index) => {
      const output = outputs[index];
      if (output.score === null) return { signal, score: null, weight: 0, reasons: output.reasons };
      const weight = weights[signal] / total;
      score += weight * output.score;
      return { signal, score: output.score, weight, reasons: output.reasons };
    });
    const reasons = signals.flatMap((entry) => entry.reasons);
    const extra = usageReason(snapshot, species);
    if (extra !== null) reasons.push(extra);
    scored.push({ species, price, score: clamp(score, 0, 1), signals, reasons });
  }

  const notes: Note[] = [];
  if (selection.pricedPoolSize < ctx.openSlots) {
    notes.push({ kind: 'cannot-fill-roster', poolSize: selection.pricedPoolSize, openSlots: ctx.openSlots });
  }
  if (snapshot.usage === null) notes.push({ kind: 'no-usage-data' });
  if (unscored > 0) notes.push({ kind: 'unscored-candidates', count: unscored });

  scored.sort((a, b) => b.score - a.score || a.price - b.price || compareIds(a.species, b.species));
  return { suggestions: scored.slice(0, limit), considered: selection.candidates.length, notes };
}
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run src/engine/suggest.test.ts
npm run typecheck
```

Expected: all PASS; no type errors. If a hand-computed expectation disagrees with the code, report the numbers (the header comment of the test file shows the arithmetic); do not edit the assertion or the code to force a pass.

- [ ] **Step 5: Run the whole unit suite**

```powershell
npm test
```

Expected: PASS, no warnings or noise.

- [ ] **Step 6: Commit**

```powershell
git add src/engine/suggest.ts src/engine/suggest.test.ts
git commit -m "feat(engine): combine the signals into ranked, explained suggestions" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Real-snapshot tests, the type-chart oracle and the README

This task adds tests and a README sentence only. The production code exists, so the new tests are expected to pass on the first run; a failure is a real finding about the data or an earlier task and must be reported, not worked around by editing assertions, floors or production code.

**Files:**
- Test: `src/engine/suggest-real.test.ts`, `sync/showdown/typechart.integration.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `suggest` (Task 5); `TYPES`, `effectiveness` (Task 1); `SuggestContext`, `Suggestion` types; the committed version-2 snapshot; the real `pokemon-showdown` package's `Dex.mod('champions').types`.
- Produces: nothing later tasks use.
- Pre-verified 2026-09-21 (see "Pre-verification results" above): the pair roster has 353 candidates, of which 346 are affordable at remaining 12 with 3 open slots; the top-six roster (`kingambit`, `basculegion`, `garchomp`, `incineroar`, `sneasler`, `whimsicott`) has 347 candidates, 344 affordable; 132 candidates have no lift in both rosters; the charizard-family roster removes exactly `charizardmegax`, `charizardmegay`, `garchompmega` and `sinistchamasterpiece`; 307 pair-roster candidates have usage at or below 3% or no entry and 29 have usage at or above 5%.

- [ ] **Step 1: Write the real-snapshot tests**

`src/engine/suggest-real.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ID } from '../domain/id';
import type { Snapshot } from '../domain/types';
import { suggest } from './suggest';
import type { SuggestContext, Suggestion } from './types';

const snapshot = JSON.parse(
  readFileSync(new URL('../../data/gen9championsvgc2026regmb/snapshot.json', import.meta.url), 'utf8'),
) as Snapshot;
if (!snapshot.usage) throw new Error('the committed snapshot has no usage data');
const usage = snapshot.usage;
const legal = Object.keys(snapshot.species);
const topUsage = Math.max(...Object.values(usage.species).map((entry) => entry.usage));
const usageOf = (id: ID) => (Object.hasOwn(usage.species, id) ? usage.species[id].usage : 0);

/** A synthetic price list: 1 to 21 points, rising with usage; a species with no usage entry costs 1. */
const PRICES: Record<ID, number> = Object.fromEntries(
  legal.map((id) => [id, 1 + Math.round((20 * usageOf(id)) / topUsage)]),
);

/** The whole legal list minus the roster is the pool. */
function rosterContext(roster: ID[], remaining: number, openSlots: number): SuggestContext {
  return { roster, pool: legal.filter((id) => !roster.includes(id)), prices: PRICES, remaining, openSlots };
}

const sharesDexNumber = (roster: ID[], id: ID) => roster.some((member) => snapshot.species[member].num === snapshot.species[id].num);

/** Independent of the engine's prefix sums: sort the other prices and add up the cheapest `openSlots - 1`. */
function affordable(ctx: SuggestContext, id: ID): boolean {
  const others = ctx.pool.filter((other) => other !== id).map((other) => PRICES[other]).sort((a, b) => a - b);
  const reserve = others.slice(0, ctx.openSlots - 1).reduce((sum, price) => sum + price, 0);
  return PRICES[id] + reserve <= ctx.remaining;
}

const ranked = Object.values(usage.species).sort((a, b) => b.usage - a.usage).map((entry) => entry.id);
const topSix: ID[] = [];
{
  const numbers = new Set<number>();
  for (const id of ranked) {
    const num = snapshot.species[id].num;
    if (numbers.has(num)) continue;
    numbers.add(num);
    topSix.push(id);
    if (topSix.length === 6) break;
  }
}

const isRankedBefore = (a: Suggestion, b: Suggestion) =>
  a.score > b.score || (a.score === b.score && (a.price < b.price || (a.price === b.price && a.species < b.species)));

describe.each([
  ['the pair incineroar + kingambit', ['incineroar', 'kingambit']],
  ['the six most used species', topSix],
] as Array<[string, ID[]]>)('suggestions for %s', (_name, roster) => {
  // Remaining 12 with 3 open slots: 3 of 347 (six) or 7 of 353 (pair) candidates cost too much once two cheap slots are reserved.
  const ctx = rosterContext(roster, 12, 3);
  const result = suggest(ctx, snapshot, { limit: 1000 });
  const candidateIds = ctx.pool.filter((id) => !sharesDexNumber(roster, id));
  const expectedIds = candidateIds.filter((id) => affordable(ctx, id));

  it('returns exactly the affordable candidates, with no notes', () => {
    expect(expectedIds.length).toBeGreaterThanOrEqual(300);
    expect(candidateIds.length - expectedIds.length).toBeGreaterThanOrEqual(1); // the budget really excludes someone
    expect(result.notes).toEqual([]);
    expect(result.considered).toBe(expectedIds.length);
    expect(result.suggestions.map((s) => s.species).sort()).toEqual([...expectedIds].sort());
  });

  it('gives every suggestion a valid score, the right price, and both signals in order', () => {
    for (const s of result.suggestions) {
      expect(s.score, s.species).toBeGreaterThanOrEqual(0);
      expect(s.score, s.species).toBeLessThanOrEqual(1);
      expect(s.price, s.species).toBe(PRICES[s.species]);
      expect(s.signals.map((signal) => signal.signal), s.species).toEqual(['usageLift', 'typeSynergy']);
      expect(s.signals[1].score, s.species).not.toBeNull(); // a non-empty roster always has type data
    }
  });

  it('ranks by score, then price, then id', () => {
    for (let i = 1; i < result.suggestions.length; i += 1) {
      const before = result.suggestions[i - 1];
      const after = result.suggestions[i];
      expect(isRankedBefore(before, after), `${before.species} before ${after.species}`).toBe(true);
    }
  });

  it('scores candidates without usage data by type synergy alone, and has plenty of both kinds', () => {
    const typeOnly = result.suggestions.filter((s) => s.signals[0].score === null);
    const both = result.suggestions.filter((s) => s.signals[0].score !== null);
    expect(typeOnly.length).toBeGreaterThanOrEqual(100); // 132 when this was written
    expect(both.length).toBeGreaterThanOrEqual(150); // about 215 when this was written
    for (const s of typeOnly) expect(s.signals[1].weight, s.species).toBe(1);
  });

  it('explains every suggestion that scores above 0.5', () => {
    const strong = result.suggestions.filter((s) => s.score > 0.5);
    expect(strong.length).toBeGreaterThanOrEqual(1);
    // A score above 0.5 needs lift above 1 (a pairs-often-with reason) or a positive defensive raw score or offensive coverage.
    for (const s of strong) expect(s.signals.some((signal) => signal.reasons.length > 0), s.species).toBe(true);
  });
});

describe('suggestions on the real snapshot: filters, dex numbers, notes and determinism', () => {
  const pair: ID[] = ['incineroar', 'kingambit'];
  const generous = rosterContext(pair, 200, 5);

  it('honours the usage filters', () => {
    const niche = suggest(generous, snapshot, { maxUsage: 0.03, limit: 1000 });
    expect(niche.suggestions.length).toBeGreaterThan(100); // 307 when this was written
    for (const s of niche.suggestions) expect(usageOf(s.species), s.species).toBeLessThanOrEqual(0.03);

    const popular = suggest(generous, snapshot, { minUsage: 0.05, limit: 1000 });
    expect(popular.suggestions.length).toBeGreaterThanOrEqual(10); // 29 when this was written
    for (const s of popular.suggestions) {
      expect(Object.hasOwn(usage.species, s.species), s.species).toBe(true);
      expect(usageOf(s.species), s.species).toBeGreaterThanOrEqual(0.05);
    }
  });

  it('leaves out other forms of the roster\'s Pokémon (same dex number)', () => {
    const roster: ID[] = ['charizard', 'garchomp', 'sinistcha'];
    const otherForms = ['charizardmegax', 'charizardmegay', 'garchompmega', 'sinistchamasterpiece'];
    for (const id of otherForms) expect(Object.hasOwn(snapshot.species, id), id).toBe(true); // they are legal, priced picks...
    const result = suggest(rosterContext(roster, 200, 5), snapshot, { limit: 1000 });
    const suggested = new Set(result.suggestions.map((s) => s.species));
    for (const id of otherForms) expect(suggested.has(id), id).toBe(false); // ...that the rule removes
    for (const s of result.suggestions) expect(sharesDexNumber(roster, s.species), s.species).toBe(false);
    expect(result.suggestions.length).toBeGreaterThan(300);
  });

  it('adds the informational usage reasons', () => {
    const result = suggest(generous, snapshot, { limit: 1000 });
    const noEntry = result.suggestions.filter((s) => !Object.hasOwn(usage.species, s.species));
    const low = result.suggestions.filter((s) => Object.hasOwn(usage.species, s.species) && usageOf(s.species) < 0.03);
    const other = result.suggestions.filter((s) => usageOf(s.species) >= 0.03);
    expect(noEntry.length).toBeGreaterThanOrEqual(100); // 132 when this was written
    expect(low.length).toBeGreaterThanOrEqual(100); // 175 when this was written
    expect(other.length).toBeGreaterThanOrEqual(20); // 46 when this was written
    for (const s of noEntry) expect(s.reasons.at(-1), s.species).toEqual({ kind: 'no-ladder-usage' });
    for (const s of low) expect(s.reasons.at(-1), s.species).toEqual({ kind: 'low-usage', usage: usageOf(s.species) });
    for (const s of other) {
      expect(s.reasons.some((r) => r.kind === 'low-usage' || r.kind === 'no-ladder-usage'), s.species).toBe(false);
    }
  });

  it('says no-usage-data and drops the lift signal when the snapshot has no usage', () => {
    const result = suggest(generous, { ...snapshot, usage: null }, { limit: 1000 });
    expect(result.notes).toEqual([{ kind: 'no-usage-data' }]);
    expect(result.suggestions.length).toBeGreaterThan(300);
    for (const s of result.suggestions) expect(s.signals[0].score, s.species).toBeNull();
  });

  it('is deterministic and does not modify its inputs', () => {
    const before = JSON.stringify({ generous, snapshot });
    const first = suggest(generous, snapshot, { limit: 50 });
    const second = suggest(generous, snapshot, { limit: 50 });
    expect(JSON.stringify({ generous, snapshot })).toBe(before);
    expect(second).toEqual(first);
    expect(first.suggestions).toHaveLength(50);
  });
});
```

- [ ] **Step 2: Write the type-chart oracle**

`sync/showdown/typechart.integration.test.ts`:

```ts
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { TYPES, effectiveness } from '../../src/engine/typechart';

// The slice of the pokemon-showdown API this test relies on. Kept local, like the loader does.
interface ShowdownType {
  name: string;
  exists: boolean;
  isNonstandard?: string | null;
  /** attacking type name -> 0 normal, 1 super effective, 2 resisted, 3 immune. */
  damageTaken: Record<string, number>;
}
interface ShowdownDex {
  mod(name: string): { types: { all(): ShowdownType[]; get(name: string): ShowdownType } };
}
const { Dex } = createRequire(import.meta.url)('pokemon-showdown') as { Dex: ShowdownDex };
const types = Dex.mod('champions').types;

const FROM_CODE: Record<number, 0 | 0.5 | 1 | 2> = { 0: 1, 1: 2, 2: 0.5, 3: 0 };

describe('the engine type chart against the real pokemon-showdown Champions mod', () => {
  it('has the same 18 types (the package also lists Stellar, which no legal species uses)', () => {
    const names = types
      .all()
      .filter((t) => t.exists && !t.isNonstandard)
      .map((t) => t.name)
      .filter((name) => name !== 'Stellar')
      .sort();
    expect(names).toEqual([...TYPES].sort());
  });

  it('agrees on every one of the 324 cells (attacking type x defending type)', () => {
    const mismatches: string[] = [];
    let checked = 0;
    for (const attacking of TYPES) {
      for (const defending of TYPES) {
        checked += 1;
        const expected = FROM_CODE[types.get(defending).damageTaken[attacking]];
        const actual = effectiveness(attacking, defending);
        if (actual !== expected) mismatches.push(`${attacking} -> ${defending}: ours ${actual}, package ${expected}`);
      }
    }
    expect(checked).toBe(324);
    expect(mismatches).toEqual([]);
  });

  it('is not trivially neutral: the package has many super effective cells and so do we', () => {
    let packageSuperEffective = 0;
    let ourSuperEffective = 0;
    for (const attacking of TYPES) {
      for (const defending of TYPES) {
        if (FROM_CODE[types.get(defending).damageTaken[attacking]] === 2) packageSuperEffective += 1;
        if (effectiveness(attacking, defending) === 2) ourSuperEffective += 1;
      }
    }
    expect(packageSuperEffective).toBeGreaterThanOrEqual(40); // 51 when this was written
    expect(ourSuperEffective).toBe(packageSuperEffective);
  });
});
```

- [ ] **Step 3: Run the new tests**

```powershell
npx vitest run src/engine/suggest-real.test.ts
npx vitest run --config vitest.integration.config.ts sync/showdown/typechart.integration.test.ts
```

Expected: PASS for both (the real-snapshot file runs the property tests for two rosters plus five more, and the oracle runs 3 tests). If one fails, capture the exact failing message and report it: it is either a data finding or a defect in Tasks 1 to 5. Do not edit an assertion, a floor or production code to force a pass.

- [ ] **Step 4: Update the README**

In `README.md`, in the first paragraph, replace this sentence tail:

```md
and Showdown paste import and export for sets and teams. There is no UI yet.
```

with:

```md
and Showdown paste import and export for sets and teams. `src/engine/` holds the first stage of the suggestion engine: candidates that fit the budget, ranked by usage lift and type synergy, each with typed reasons. There is no UI yet.
```

- [ ] **Step 5: Run everything**

```powershell
npm test
npm run test:integration
npm run typecheck
```

Expected: all green, with no warnings or noise in the output. Unit total is 335 plus the tests added in Tasks 1 to 6; integration total is 18 plus 3.

- [ ] **Step 6: Commit**

```powershell
git add src/engine/suggest-real.test.ts sync/showdown/typechart.integration.test.ts README.md
git commit -m "test(engine): suggestions on the real snapshot and the type chart against Showdown" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review (spec coverage)

| Spec requirement | Task |
|---|---|
| Types: `SuggestContext`, `SuggestOptions`, `Reason`, `Note`, `SignalScore`, `Suggestion`, `SuggestResult` | 1 |
| Static 18x18 chart, `effectiveness`, `multiplier`, `severity`; oracle against the package | 1 (unit), 6 (oracle) |
| `contextFor` (null for a bad index) | 2 |
| Candidate rules: in snapshot, priced, not on roster, no same dex number, usage filters, budget reserve over the OTHER species with prefix sums, `cannot-fill-roster` size | 2 |
| Usage lift: `teammateLift`, log scale 1/8..8, reasons often/rarely/coverage, no data cases | 3 |
| Type synergy: defensive (exposure, relief, harm, scale 12, reasons capped 3 and 2), offensive (usage move types at 10%, damaging only, uncovered fraction, dropout), 0.6/0.4 | 4 |
| Combining: default weights, options overrides, re-normalization, zero-total unscored, per-signal breakdown | 5 |
| Ranking (score, price, id), `limit`, `considered`, informational usage reasons (3% strict, no-ladder-usage), notes in fixed order, invalid context | 5 |
| Never throws, deterministic, no mutation, `Object.hasOwn` | 1 to 5 (tests), Global Constraints |
| Real snapshot: valid scores, sorted, exactly the affordable candidates (independent brute force), floors on both kinds, filters, dex rule, reasons, no-usage-data, determinism | 6 |
| README | 6 |
| Plan-time pre-verification of the scale constants | "Pre-verification results" (done before writing) |

Type and name consistency was checked across tasks: `EngineSnapshot`, `SuggestContext`, `SuggestOptions`, `SignalName`, `SIGNAL_NAMES`, `SignalOutput`, `SignalScore`, `Suggestion`, `SuggestResult`, `Reason` (kinds `pairs-often-with`, `pairs-rarely-with`, `lift-coverage`, `covers-weakness`, `adds-weakness`, `adds-coverage`, `low-usage`, `no-ladder-usage`), `Note` (kinds `invalid-context`, `roster-full`, `empty-roster`, `cannot-fill-roster`, `no-usage-data`, `unscored-candidates`), `selectCandidates`, `CandidateSelection.pricedPoolSize`, `usageOf`, `liftSignal`, `typeSignal`, `defensiveComponent`, `offensiveComponent`, `attackingTypes`, `TypedMember`, `clamp`, `compareIds`, and the constants listed in Global Constraints.

Plan clarifications (rulings on spec gaps) are listed under Global Constraints: the narrower `EngineSnapshot`, no informational usage reason when usage is null, the two added helper files, and the pool-size rule for ids outside the snapshot.

---

## Later increments (outlined; each gets its own plan)

1. **Stage 2: role and mechanics tags** (speed control, Fake Out, redirection, Intimidate, weather and terrain setters, ability combos), including ability immunities such as Levitate (11 legal species) and Flash Fire (9). For rosters of six or more the offensive component drops out entirely (the roster covers all 18 defending types), so type synergy is defensive only there; stage 2's tags are where most of the signal for large rosters will come from.
2. **Stage 3: set-specific scoring** using the roster's entered sets.
3. **App shell and hosting.** The UI runs `deriveDraft`, `contextFor` and `suggest`, and renders `reasons` and `notes` as sentences (including `read ...` style notes from paste import), surfaces `meta.warnings` (the three Ogerpon tera formes can never have a legal set) and shows the snapshot's age.
