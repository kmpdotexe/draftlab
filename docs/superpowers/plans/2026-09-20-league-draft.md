# Set Model, League Config and Draft Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure domain logic for Draft Lab's middle layer: the Pokémon set model, the league configuration and its validator, the draft board (turn order, derived state, pick recording, undo), price-list import, and the saved-file format, all in `src/domain/` with unit tests.

**Architecture:** The draft state is a `LeagueConfig` plus an ordered `picks: ID[]`; everything else (who picked what, budgets, the available pool, whose turn it is) is derived by pure functions, so state can never drift. Validators return `Problem[]` (`{ path, message }`) instead of throwing. New files import only from `./id`, `./types` and each other.

**Tech Stack:** TypeScript (ESM), Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-20-league-draft-design.md` (parent: `docs/superpowers/specs/2026-09-20-draft-lab-design.md`). Read the league-draft spec first; it is the binding authority for this plan.

## Global Constraints

- The draftable unit is the snapshot species id: Charizard, Charizard-Mega-X and Charizard-Mega-Y are separate picks with separate prices.
- League rules in v1: extra banned Pokémon only, on top of the regulation's own rules. Budget and roster size are always enforced. No Mega caps, price-band caps or type caps.
- State is a pick log (`picks: ID[]`) plus pure derivation functions. No schema library and no new dependencies.
- Bad input never throws; validators return `Problem[]`. Only programmer errors (an out-of-range pick index passed to `drafterAt`, more picks than slots passed to `deriveDraft`) throw. All functions are pure and never modify their arguments.
- New files in `src/domain/` import only from `./id`, `./types` and each other. No imports from `sync/` or any app code.
- The set model has no Tera and no IVs. Stat points: six integers 0..32 each, total at most 66 (`MAX_STAT_POINT = 32`, `MAX_TOTAL_STAT_POINTS = 66`); at most 4 moves (`MAX_MOVES = 4`).
- A species with no price in `league.prices` is unavailable. A price of 0 is a valid price.
- A `Problem` locates with `path` and describes with `message`. Interpretation for this plan: where the spec writes a problem as `line N: ...` (price CSV) the `path` is `line N` and the `message` is the text after the colon; where it writes `picks[i]: pick <i+1>: ...` (saved file) the `path` is `picks[i]` and the `message` starts with `pick <i+1>: `.
- Commits end with the trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (copy it verbatim; never substitute another model name).

## Environment notes

- Windows + PowerShell. Node was installed after the Claude app started, so a fresh shell may not find `node`/`npm`. Start every PowerShell command with:
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User");`
- The repo path contains a space: quote it.
- Run a single test file with `npx vitest run <path>`; the whole suite with `npm test`; typecheck with `npm run typecheck`. The existing suite has 65 passing tests before this plan starts.

---

## File Structure

```
src/domain/problem.ts        Problem
src/domain/natures.ts        NatureName, NATURES, NATURE_NAMES, isNatureName
src/domain/natures.test.ts
src/domain/set.ts            PokemonSet, StatPoints, limits, validateSet
src/domain/set.test.ts
src/domain/league.ts         LeagueConfig, LegalSpeciesSource, validateLeague
src/domain/league.test.ts
src/domain/test-support.ts   leagueOf(), snapshotOf(), SPECIES_IDS, PRICES   (test helpers, not a test file)
src/domain/derive.ts         drafterAt, deriveDraft, PickRecord, DrafterState, DraftState
src/domain/derive.test.ts
src/domain/draft.ts          checkPick, applyPick, undoPick
src/domain/draft.test.ts
src/domain/prices.ts         parsePriceCsv
src/domain/prices.test.ts
src/domain/file.ts           DraftFile, ParseResult, parseDraftFile, serializeDraftFile
src/domain/file.test.ts
src/domain/mock-draft.test.ts   full mock draft against the committed Reg M-B snapshot (test only)
```

Existing files used: `src/domain/id.ts` (`ID`, `toID`), `src/domain/types.ts` (`Snapshot`, `SpeciesEntry`, `StatName`).

---

### Task 1: Problem type, natures and the set model

**Files:**
- Create: `src/domain/problem.ts`, `src/domain/natures.ts`, `src/domain/set.ts`
- Test: `src/domain/natures.test.ts`, `src/domain/set.test.ts`

**Interfaces:**
- Consumes: `StatName` from `./types`; `ID` from `./id`.
- Produces:
  - `interface Problem { path: string; message: string }`
  - `type NatureName` (25 names); `interface Nature { plus: 'atk'|'def'|'spa'|'spd'|'spe' | null; minus: same | null }`; `const NATURES: Record<NatureName, Nature>`; `const NATURE_NAMES: NatureName[]`; `isNatureName(value: unknown): value is NatureName`
  - `const MAX_STAT_POINT = 32`, `MAX_TOTAL_STAT_POINTS = 66`, `MAX_MOVES = 4`; `const STAT_NAMES: StatName[]`; `type StatPoints = Record<StatName, number>`; `interface PokemonSet { species: ID; ability?: ID; item?: ID; moves?: ID[]; nature?: NatureName; points?: StatPoints }`; `validateSet(set: PokemonSet, path: string): Problem[]`

- [ ] **Step 1: Write the failing tests**

`src/domain/natures.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isNatureName, NATURE_NAMES, NATURES } from './natures';

describe('NATURES', () => {
  it('has all 25 natures', () => {
    expect(NATURE_NAMES).toHaveLength(25);
  });

  it('has exactly the five neutral natures', () => {
    const neutral = NATURE_NAMES.filter((name) => NATURES[name].plus === null && NATURES[name].minus === null);
    expect(neutral.sort()).toEqual(['Bashful', 'Docile', 'Hardy', 'Quirky', 'Serious']);
  });

  it('gives every non-neutral nature a different raised and lowered stat, and no two share a pair', () => {
    const pairs = new Set<string>();
    for (const name of NATURE_NAMES) {
      const { plus, minus } = NATURES[name];
      if (plus === null && minus === null) continue;
      expect(plus, `${name} plus`).not.toBeNull();
      expect(minus, `${name} minus`).not.toBeNull();
      expect(plus, `${name} raises and lowers the same stat`).not.toBe(minus);
      pairs.add(`${plus}/${minus}`);
    }
    expect(pairs.size).toBe(20);
  });

  it('matches known natures', () => {
    expect(NATURES.Jolly).toEqual({ plus: 'spe', minus: 'spa' });
    expect(NATURES.Adamant).toEqual({ plus: 'atk', minus: 'spa' });
    expect(NATURES.Timid).toEqual({ plus: 'spe', minus: 'atk' });
    expect(NATURES.Modest).toEqual({ plus: 'spa', minus: 'atk' });
    expect(NATURES.Careful).toEqual({ plus: 'spd', minus: 'spa' });
    expect(NATURES.Relaxed).toEqual({ plus: 'def', minus: 'spe' });
  });
});

describe('isNatureName', () => {
  it('accepts exact nature names only', () => {
    expect(isNatureName('Jolly')).toBe(true);
    expect(isNatureName('jolly')).toBe(false);
    expect(isNatureName('toString')).toBe(false);
    expect(isNatureName(5)).toBe(false);
    expect(isNatureName(undefined)).toBe(false);
  });
});
```

`src/domain/set.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { NatureName } from './natures';
import { MAX_MOVES, MAX_STAT_POINT, MAX_TOTAL_STAT_POINTS, validateSet, type PokemonSet, type StatPoints } from './set';

const points = (overrides: Partial<StatPoints> = {}): StatPoints => ({
  hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...overrides,
});

const paths = (set: PokemonSet) => validateSet(set, 'set').map((p) => p.path);

describe('limits', () => {
  it('are the Champions values', () => {
    expect(MAX_STAT_POINT).toBe(32);
    expect(MAX_TOTAL_STAT_POINTS).toBe(66);
    expect(MAX_MOVES).toBe(4);
  });
});

describe('validateSet', () => {
  it('accepts a set with only a species', () => {
    expect(validateSet({ species: 'incineroar' }, 'set')).toEqual([]);
  });

  it('accepts a full set at the limits', () => {
    const set: PokemonSet = {
      species: 'incineroar',
      ability: 'intimidate',
      item: 'sitrusberry',
      moves: ['fakeout', 'partingshot', 'flareblitz', 'throatchop'],
      nature: 'Jolly',
      points: points({ atk: 32, def: 2, spe: 32 }),
    };
    expect(validateSet(set, 'set')).toEqual([]);
  });

  it('requires a species', () => {
    expect(paths({ species: '' })).toEqual(['set.species']);
  });

  it('rejects empty ability or item when present', () => {
    expect(paths({ species: 'a', ability: '' })).toEqual(['set.ability']);
    expect(paths({ species: 'a', item: '' })).toEqual(['set.item']);
  });

  it('rejects more than four moves', () => {
    const problems = validateSet({ species: 'a', moves: ['m1', 'm2', 'm3', 'm4', 'm5'] }, 'set');
    expect(problems.map((p) => p.path)).toEqual(['set.moves']);
    expect(problems[0].message).toContain('4');
  });

  it('rejects duplicate and empty moves, naming the slot', () => {
    const dup = validateSet({ species: 'a', moves: ['fakeout', 'fakeout'] }, 'set');
    expect(dup.map((p) => p.path)).toEqual(['set.moves[1]']);
    expect(dup[0].message).toContain('duplicate');
    expect(paths({ species: 'a', moves: ['', 'fakeout'] })).toEqual(['set.moves[0]']);
  });

  it('rejects an unknown nature', () => {
    expect(paths({ species: 'a', nature: 'Jolly ' as unknown as NatureName })).toEqual(['set.nature']);
  });

  it('rejects stat points outside 0..32 or not whole numbers, naming the stat', () => {
    expect(paths({ species: 'a', points: points({ atk: 33 }) })).toEqual(['set.points.atk']);
    expect(paths({ species: 'a', points: points({ spd: -1 }) })).toEqual(['set.points.spd']);
    expect(paths({ species: 'a', points: points({ hp: 1.5 }) })).toEqual(['set.points.hp']);
  });

  it('rejects a points table with a missing stat', () => {
    const missing = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0 } as unknown as StatPoints;
    expect(paths({ species: 'a', points: missing })).toEqual(['set.points.spe']);
  });

  it('accepts a total of exactly 66 and rejects 67', () => {
    expect(validateSet({ species: 'a', points: points({ hp: 2, atk: 32, spe: 32 }) }, 'set')).toEqual([]);
    const over = validateSet({ species: 'a', points: points({ hp: 3, atk: 32, spe: 32 }) }, 'set');
    expect(over.map((p) => p.path)).toEqual(['set.points']);
    expect(over[0].message).toContain('67');
  });

  it('reports every problem, not just the first', () => {
    expect(paths({ species: '', ability: '', nature: 'x' as unknown as NatureName })).toEqual([
      'set.species',
      'set.ability',
      'set.nature',
    ]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```powershell
npx vitest run src/domain/natures.test.ts src/domain/set.test.ts
```

Expected: FAIL (cannot resolve `./natures` and `./set`).

- [ ] **Step 3: Implement**

`src/domain/problem.ts`:

```ts
export interface Problem {
  /** Where the problem is, e.g. "league.drafters[2]", "picks[3]" or "line 4". */
  path: string;
  message: string;
}
```

`src/domain/natures.ts`:

```ts
import type { StatName } from './types';

export type NatureName =
  | 'Adamant' | 'Bashful' | 'Bold' | 'Brave' | 'Calm'
  | 'Careful' | 'Docile' | 'Gentle' | 'Hardy' | 'Hasty'
  | 'Impish' | 'Jolly' | 'Lax' | 'Lonely' | 'Mild'
  | 'Modest' | 'Naive' | 'Naughty' | 'Quiet' | 'Quirky'
  | 'Rash' | 'Relaxed' | 'Sassy' | 'Serious' | 'Timid';

type NonHpStat = Exclude<StatName, 'hp'>;

export interface Nature {
  plus: NonHpStat | null;
  minus: NonHpStat | null;
}

const NEUTRAL: Nature = { plus: null, minus: null };

export const NATURES: Record<NatureName, Nature> = {
  Adamant: { plus: 'atk', minus: 'spa' },
  Bashful: NEUTRAL,
  Bold: { plus: 'def', minus: 'atk' },
  Brave: { plus: 'atk', minus: 'spe' },
  Calm: { plus: 'spd', minus: 'atk' },
  Careful: { plus: 'spd', minus: 'spa' },
  Docile: NEUTRAL,
  Gentle: { plus: 'spd', minus: 'def' },
  Hardy: NEUTRAL,
  Hasty: { plus: 'spe', minus: 'def' },
  Impish: { plus: 'def', minus: 'spa' },
  Jolly: { plus: 'spe', minus: 'spa' },
  Lax: { plus: 'def', minus: 'spd' },
  Lonely: { plus: 'atk', minus: 'def' },
  Mild: { plus: 'spa', minus: 'def' },
  Modest: { plus: 'spa', minus: 'atk' },
  Naive: { plus: 'spe', minus: 'spd' },
  Naughty: { plus: 'atk', minus: 'spd' },
  Quiet: { plus: 'spa', minus: 'spe' },
  Quirky: NEUTRAL,
  Rash: { plus: 'spa', minus: 'spd' },
  Relaxed: { plus: 'def', minus: 'spe' },
  Sassy: { plus: 'spd', minus: 'spe' },
  Serious: NEUTRAL,
  Timid: { plus: 'spe', minus: 'atk' },
};

export const NATURE_NAMES = Object.keys(NATURES) as NatureName[];

export function isNatureName(value: unknown): value is NatureName {
  return typeof value === 'string' && Object.hasOwn(NATURES, value);
}
```

`src/domain/set.ts`:

```ts
import type { ID } from './id';
import { isNatureName, type NatureName } from './natures';
import type { Problem } from './problem';
import type { StatName } from './types';

export const MAX_STAT_POINT = 32;
export const MAX_TOTAL_STAT_POINTS = 66;
export const MAX_MOVES = 4;

export const STAT_NAMES: StatName[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

/** Champions stat points: added 1:1 to the stat, no EVs or IVs. */
export type StatPoints = Record<StatName, number>;

export interface PokemonSet {
  species: ID;
  ability?: ID;
  item?: ID;
  moves?: ID[];
  nature?: NatureName;
  points?: StatPoints;
}

/** Structural checks only. Checking a set against the snapshot (legal moves, abilities, items) is a later increment. */
export function validateSet(set: PokemonSet, path: string): Problem[] {
  const problems: Problem[] = [];
  const add = (sub: string, message: string) => problems.push({ path: `${path}${sub}`, message });

  if (typeof set.species !== 'string' || set.species === '') add('.species', 'species is required');

  for (const key of ['ability', 'item'] as const) {
    const value = set[key];
    if (value !== undefined && (typeof value !== 'string' || value === '')) {
      add(`.${key}`, `${key} must be a non-empty id when present`);
    }
  }

  if (set.moves !== undefined) {
    if (!Array.isArray(set.moves)) {
      add('.moves', 'moves must be a list');
    } else {
      if (set.moves.length > MAX_MOVES) add('.moves', `at most ${MAX_MOVES} moves (found ${set.moves.length})`);
      const seen = new Set<string>();
      set.moves.forEach((move, i) => {
        if (typeof move !== 'string' || move === '') add(`.moves[${i}]`, 'move must be a non-empty id');
        else if (seen.has(move)) add(`.moves[${i}]`, `duplicate move "${move}"`);
        else seen.add(move);
      });
    }
  }

  if (set.nature !== undefined && !isNatureName(set.nature)) {
    add('.nature', `unknown nature "${String(set.nature)}"`);
  }

  if (set.points !== undefined) {
    let total = 0;
    for (const stat of STAT_NAMES) {
      const value = set.points[stat];
      if (!Number.isInteger(value) || value < 0 || value > MAX_STAT_POINT) {
        add(`.points.${stat}`, `${stat} must be a whole number from 0 to ${MAX_STAT_POINT} (found ${String(value)})`);
      } else {
        total += value;
      }
    }
    if (total > MAX_TOTAL_STAT_POINTS) {
      add('.points', `total ${total} is over the ${MAX_TOTAL_STAT_POINTS}-point limit`);
    }
  }

  return problems;
}
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run src/domain/natures.test.ts src/domain/set.test.ts
npm run typecheck
```

Expected: all tests PASS (natures 5, set 12); no type errors.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/problem.ts src/domain/natures.ts src/domain/natures.test.ts src/domain/set.ts src/domain/set.test.ts
git commit -m "feat(domain): add natures and the Pokemon set model" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: League config, validator and test helpers

**Files:**
- Create: `src/domain/league.ts`, `src/domain/test-support.ts`
- Test: `src/domain/league.test.ts`

**Interfaces:**
- Consumes: `ID` from `./id`; `Problem` from `./problem`; `Snapshot`, `SpeciesEntry` from `./types`.
- Produces:
  - `type DraftOrder = 'snake' | 'linear'`
  - `interface LeagueConfig { name: string; formatId: string; drafters: string[]; order: DraftOrder; rounds: number; me: number; budget: number; prices: Record<ID, number>; extraBans: ID[] }`
  - `type LegalSpeciesSource = Pick<Snapshot, 'formatId' | 'species'>`
  - `const MIN_DRAFTERS = 2`, `MAX_DRAFTERS = 32`, `MAX_ROUNDS = 30`
  - `validateLeague(league: LeagueConfig, path: string): Problem[]`
  - test helpers (in `test-support.ts`, used by Tasks 2–6): `const SPECIES_IDS: string[]` (`['a','b','c','d','e','f','g','h']`), `const PRICES: Record<string, number>` (`{ a: 30, b: 20, c: 10, d: 5, e: 5, f: 1, g: 0 }`), `snapshotOf(ids?: string[]): LegalSpeciesSource` (formatId `'fmt'`, species table with only keys), `leagueOf(overrides?: Partial<LeagueConfig>): LeagueConfig` (name `'Test League'`, formatId `'fmt'`, drafters `['Ana','Ben','Cy']`, snake, rounds 2, me 1, budget 50, `PRICES`, extraBans `['e']`)

- [ ] **Step 1: Write the test helpers and the failing test**

`src/domain/test-support.ts` (needed by the test; it imports the types from `league.ts`, which does not exist yet, so the test run in Step 2 fails at import):

```ts
import type { LeagueConfig, LegalSpeciesSource } from './league';
import type { SpeciesEntry } from './types';

/** Species ids in the default test snapshot. Note: 'h' has no price and 'e' is banned in leagueOf(). */
export const SPECIES_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** Default prices: 'h' is deliberately absent (unpriced) and 'g' costs 0. */
export const PRICES: Record<string, number> = { a: 30, b: 20, c: 10, d: 5, e: 5, f: 1, g: 0 };

/** A snapshot slice whose species table holds only keys; the draft logic never reads the values. */
export function snapshotOf(ids: string[] = SPECIES_IDS): LegalSpeciesSource {
  return {
    formatId: 'fmt',
    species: Object.fromEntries(ids.map((id) => [id, {} as SpeciesEntry])),
  };
}

/** A valid 3-drafter snake league of 2 rounds and a budget of 50. Override any field. */
export function leagueOf(overrides: Partial<LeagueConfig> = {}): LeagueConfig {
  return {
    name: 'Test League',
    formatId: 'fmt',
    drafters: ['Ana', 'Ben', 'Cy'],
    order: 'snake',
    rounds: 2,
    me: 1,
    budget: 50,
    prices: { ...PRICES },
    extraBans: ['e'],
    ...overrides,
  };
}
```

`src/domain/league.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_DRAFTERS, MAX_ROUNDS, validateLeague, type LeagueConfig } from './league';
import { leagueOf } from './test-support';

/** Build a league with values of the wrong type, the way a corrupt file would. */
const bad = (overrides: Record<string, unknown>): LeagueConfig =>
  leagueOf(overrides as unknown as Partial<LeagueConfig>);
const paths = (league: LeagueConfig) => validateLeague(league, 'league').map((p) => p.path);

describe('validateLeague', () => {
  it('accepts a valid league', () => {
    expect(validateLeague(leagueOf(), 'league')).toEqual([]);
  });

  it('accepts the boundary values', () => {
    const many = Array.from({ length: MAX_DRAFTERS }, (_, i) => `Drafter ${i}`);
    expect(validateLeague(leagueOf({ drafters: many, me: 0, rounds: MAX_ROUNDS }), 'league')).toEqual([]);
    expect(validateLeague(leagueOf({ drafters: ['A', 'B'], me: 0, rounds: 1, order: 'linear' }), 'league')).toEqual([]);
    expect(validateLeague(leagueOf({ prices: { a: 0 } }), 'league')).toEqual([]);
  });

  it('prefixes every path with the path it is given', () => {
    expect(validateLeague(leagueOf({ name: '' }), 'x').map((p) => p.path)).toEqual(['x.name']);
  });

  it.each(['', '   '])('requires a name (%j)', (name) => {
    expect(paths(leagueOf({ name }))).toEqual(['league.name']);
  });

  it('requires a formatId', () => {
    expect(paths(leagueOf({ formatId: '' }))).toEqual(['league.formatId']);
  });

  it('needs between 2 and 32 drafters', () => {
    expect(paths(leagueOf({ drafters: ['Ana'], me: 0 }))).toEqual(['league.drafters']);
    const tooMany = Array.from({ length: MAX_DRAFTERS + 1 }, (_, i) => `D${i}`);
    expect(paths(leagueOf({ drafters: tooMany, me: 0 }))).toEqual(['league.drafters']);
    expect(paths(bad({ drafters: 'Ana' }))).toContain('league.drafters');
  });

  it('rejects duplicate drafter names ignoring case, naming the first one', () => {
    const problems = validateLeague(leagueOf({ drafters: ['Ana', 'ana', 'Cy'] }), 'league');
    expect(problems.map((p) => p.path)).toEqual(['league.drafters[1]']);
    expect(problems[0].message).toContain('drafters[0]');
  });

  it('rejects a blank drafter name', () => {
    expect(paths(leagueOf({ drafters: ['Ana', '  ', 'Cy'] }))).toEqual(['league.drafters[1]']);
  });

  it('accepts only snake or linear order', () => {
    expect(paths(bad({ order: 'auction' }))).toEqual(['league.order']);
  });

  it.each([0, 31, 2.5])('rejects rounds = %s', (rounds) => {
    expect(paths(leagueOf({ rounds }))).toEqual(['league.rounds']);
  });

  it.each([-1, 3, 1.5])('rejects me = %s for a 3-drafter league', (me) => {
    expect(paths(leagueOf({ me }))).toEqual(['league.me']);
  });

  it.each([0, -5, 10.5])('rejects budget = %s', (budget) => {
    expect(paths(leagueOf({ budget }))).toEqual(['league.budget']);
  });

  it('rejects negative or fractional prices, naming the species', () => {
    expect(paths(leagueOf({ prices: { a: -1 } }))).toEqual(['league.prices.a']);
    expect(paths(leagueOf({ prices: { a: 1.5 } }))).toEqual(['league.prices.a']);
    expect(paths(bad({ prices: null }))).toEqual(['league.prices']);
  });

  it('rejects an empty banned species id', () => {
    expect(paths(leagueOf({ extraBans: [''] }))).toEqual(['league.extraBans[0]']);
    expect(paths(bad({ extraBans: 'x' }))).toEqual(['league.extraBans']);
  });

  it('reports every problem, in field order', () => {
    expect(paths(leagueOf({ name: '', budget: 0 }))).toEqual(['league.name', 'league.budget']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx vitest run src/domain/league.test.ts
```

Expected: FAIL (cannot resolve `./league`).

- [ ] **Step 3: Implement**

`src/domain/league.ts`:

```ts
import type { ID } from './id';
import type { Problem } from './problem';
import type { Snapshot } from './types';

/** The only part of the snapshot the draft logic needs. */
export type LegalSpeciesSource = Pick<Snapshot, 'formatId' | 'species'>;

export type DraftOrder = 'snake' | 'linear';

export interface LeagueConfig {
  name: string;
  /** The Showdown format id the league drafts for, e.g. "gen9championsvgc2026regmb". */
  formatId: string;
  /** Drafter names in first-round order. */
  drafters: string[];
  order: DraftOrder;
  /** Number of rounds; also the roster size. */
  rounds: number;
  /** Index into `drafters`: the user's own slot. */
  me: number;
  /** Points available to each roster. */
  budget: number;
  /** Species id -> points. A species with no entry is unavailable. */
  prices: Record<ID, number>;
  /** Species this league bans on top of the regulation's own rules. */
  extraBans: ID[];
}

export const MIN_DRAFTERS = 2;
export const MAX_DRAFTERS = 32;
export const MAX_ROUNDS = 30;

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function validateLeague(league: LeagueConfig, path: string): Problem[] {
  const problems: Problem[] = [];
  const add = (sub: string, message: string) => problems.push({ path: `${path}${sub}`, message });

  if (!isNonEmptyString(league.name)) add('.name', 'name is required');
  if (!isNonEmptyString(league.formatId)) add('.formatId', 'formatId is required');

  if (!Array.isArray(league.drafters)) {
    add('.drafters', 'drafters must be a list of names');
  } else {
    if (league.drafters.length < MIN_DRAFTERS || league.drafters.length > MAX_DRAFTERS) {
      add('.drafters', `need ${MIN_DRAFTERS} to ${MAX_DRAFTERS} drafters (found ${league.drafters.length})`);
    }
    const firstSeen = new Map<string, number>();
    league.drafters.forEach((name, i) => {
      if (!isNonEmptyString(name)) {
        add(`.drafters[${i}]`, 'drafter name is required');
        return;
      }
      const key = name.trim().toLowerCase();
      const first = firstSeen.get(key);
      if (first !== undefined) add(`.drafters[${i}]`, `duplicate name "${name}" (same as drafters[${first}])`);
      else firstSeen.set(key, i);
    });
  }

  if (league.order !== 'snake' && league.order !== 'linear') {
    add('.order', `order must be "snake" or "linear" (found ${JSON.stringify(league.order)})`);
  }

  if (!Number.isInteger(league.rounds) || league.rounds < 1 || league.rounds > MAX_ROUNDS) {
    add('.rounds', `rounds must be a whole number from 1 to ${MAX_ROUNDS}`);
  }

  if (
    !Number.isInteger(league.me) ||
    league.me < 0 ||
    !Array.isArray(league.drafters) ||
    league.me >= league.drafters.length
  ) {
    add('.me', 'me must be the index of one of the drafters');
  }

  if (!Number.isInteger(league.budget) || league.budget < 1) {
    add('.budget', 'budget must be a positive whole number');
  }

  if (!isRecord(league.prices)) {
    add('.prices', 'prices must be an object of species id to points');
  } else {
    for (const [id, price] of Object.entries(league.prices)) {
      if (!Number.isInteger(price) || price < 0) {
        add(`.prices.${id}`, `price must be a non-negative whole number (found ${String(price)})`);
      }
    }
  }

  if (!Array.isArray(league.extraBans)) {
    add('.extraBans', 'extraBans must be a list of species ids');
  } else {
    league.extraBans.forEach((id, i) => {
      if (!isNonEmptyString(id)) add(`.extraBans[${i}]`, 'banned species id is required');
    });
  }

  return problems;
}
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run src/domain/league.test.ts
npm run typecheck
```

Expected: all league tests PASS; no type errors.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/league.ts src/domain/league.test.ts src/domain/test-support.ts
git commit -m "feat(domain): add league config, validator and test helpers" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Turn order and derived draft state

**Files:**
- Create: `src/domain/derive.ts`
- Test: `src/domain/derive.test.ts`

**Interfaces:**
- Consumes: `ID`; `LeagueConfig`, `LegalSpeciesSource` from `./league`; test helpers `leagueOf`, `snapshotOf` from `./test-support`.
- Produces:
  - `drafterAt(league: LeagueConfig, n: number): { round: number; drafter: number }` (`n` and `round` 0-based; throws `RangeError` when `n` is not an integer in `0 .. drafters*rounds-1`)
  - `interface PickRecord { number: number; round: number; drafter: number; species: ID; price: number }` (`number` and `round` 1-based)
  - `interface DrafterState { name: string; roster: ID[]; spent: number; remaining: number; openSlots: number; pointsNeededToFill: number | null; cannotFillRoster: boolean }`
  - `interface DraftState { picks: PickRecord[]; drafters: DrafterState[]; pool: ID[]; onTheClock: { number: number; round: number; drafter: number } | null; complete: boolean }`
  - `deriveDraft(league: LeagueConfig, picks: ID[], snapshot: LegalSpeciesSource): DraftState`

- [ ] **Step 1: Write the failing tests**

`src/domain/derive.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveDraft, drafterAt } from './derive';
import { leagueOf, snapshotOf } from './test-support';

const sequence = (league: ReturnType<typeof leagueOf>) => {
  const total = league.drafters.length * league.rounds;
  return Array.from({ length: total }, (_, n) => drafterAt(league, n).drafter);
};

describe('drafterAt', () => {
  it('goes 0..D-1 every round in a linear draft', () => {
    const league = leagueOf({ order: 'linear' }); // 3 drafters, 2 rounds
    expect(sequence(league)).toEqual([0, 1, 2, 0, 1, 2]);
    expect(drafterAt(league, 4)).toEqual({ round: 1, drafter: 1 });
  });

  it('reverses every odd round in a snake draft', () => {
    expect(sequence(leagueOf({ rounds: 3 }))).toEqual([0, 1, 2, 2, 1, 0, 0, 1, 2]);
    expect(sequence(leagueOf({ drafters: ['A', 'B'], me: 0, rounds: 4 }))).toEqual([0, 1, 1, 0, 0, 1, 1, 0]);
    expect(sequence(leagueOf({ drafters: ['A', 'B', 'C', 'D'], me: 0, rounds: 2 }))).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
  });

  it('reports the 0-based round', () => {
    expect(drafterAt(leagueOf(), 0)).toEqual({ round: 0, drafter: 0 });
    expect(drafterAt(leagueOf(), 3)).toEqual({ round: 1, drafter: 2 });
  });

  it('throws RangeError outside 0 .. drafters*rounds-1', () => {
    const league = leagueOf(); // 6 slots
    expect(() => drafterAt(league, -1)).toThrow(RangeError);
    expect(() => drafterAt(league, 6)).toThrow(RangeError);
    expect(() => drafterAt(league, 1.5)).toThrow(RangeError);
  });
});

describe('deriveDraft', () => {
  const league = leagueOf(); // Ana, Ben, Cy; snake; 2 rounds; budget 50; prices a30 b20 c10 d5 e5(banned) f1 g0; h unpriced
  const snapshot = snapshotOf();

  it('starts with the full pool, sorted by price descending then id, without banned or unpriced species', () => {
    const state = deriveDraft(league, [], snapshot);
    expect(state.pool).toEqual(['a', 'b', 'c', 'd', 'f', 'g']);
    expect(state.picks).toEqual([]);
    expect(state.complete).toBe(false);
    expect(state.onTheClock).toEqual({ number: 1, round: 1, drafter: 0 });
    for (const d of state.drafters) {
      expect(d.roster).toEqual([]);
      expect(d.spent).toBe(0);
      expect(d.remaining).toBe(50);
      expect(d.openSlots).toBe(2);
      expect(d.pointsNeededToFill).toBe(1); // cheapest two prices: 0 + 1
      expect(d.cannotFillRoster).toBe(false);
    }
    expect(state.drafters.map((d) => d.name)).toEqual(['Ana', 'Ben', 'Cy']);
  });

  it('breaks price ties by id', () => {
    const state = deriveDraft(leagueOf({ prices: { b: 5, a: 5 } }), [], snapshotOf());
    expect(state.pool).toEqual(['a', 'b']);
  });

  it('derives rosters, budgets, the pool and the clock after some picks', () => {
    const state = deriveDraft(league, ['a', 'b', 'c'], snapshot);
    expect(state.picks).toEqual([
      { number: 1, round: 1, drafter: 0, species: 'a', price: 30 },
      { number: 2, round: 1, drafter: 1, species: 'b', price: 20 },
      { number: 3, round: 1, drafter: 2, species: 'c', price: 10 },
    ]);
    expect(state.pool).toEqual(['d', 'f', 'g']);
    expect(state.onTheClock).toEqual({ number: 4, round: 2, drafter: 2 });
    const [ana, ben, cy] = state.drafters;
    expect(ana).toMatchObject({ roster: ['a'], spent: 30, remaining: 20, openSlots: 1, pointsNeededToFill: 0 });
    expect(ben).toMatchObject({ roster: ['b'], spent: 20, remaining: 30, openSlots: 1 });
    expect(cy).toMatchObject({ roster: ['c'], spent: 10, remaining: 40, openSlots: 1 });
  });

  it('is complete after every slot is filled', () => {
    const state = deriveDraft(league, ['a', 'b', 'c', 'd', 'f', 'g'], snapshot);
    expect(state.complete).toBe(true);
    expect(state.onTheClock).toBeNull();
    expect(state.pool).toEqual([]);
    expect(state.picks.map((p) => [p.number, p.round, p.drafter, p.price])).toEqual([
      [1, 1, 0, 30], [2, 1, 1, 20], [3, 1, 2, 10], [4, 2, 2, 5], [5, 2, 1, 1], [6, 2, 0, 0],
    ]);
    const [ana, ben, cy] = state.drafters;
    expect(ana).toMatchObject({ roster: ['a', 'g'], spent: 30, remaining: 20, openSlots: 0, pointsNeededToFill: 0, cannotFillRoster: false });
    expect(ben).toMatchObject({ roster: ['b', 'f'], spent: 21, remaining: 29, openSlots: 0 });
    expect(cy).toMatchObject({ roster: ['c', 'd'], spent: 15, remaining: 35, openSlots: 0 });
  });

  it('sums the cheapest open-slot prices and flags a drafter who cannot afford them', () => {
    const tight = leagueOf({
      drafters: ['Ana', 'Ben'], me: 0, order: 'linear', rounds: 2, budget: 31, prices: { a: 30, b: 20, c: 10 }, extraBans: [],
    });
    const state = deriveDraft(tight, ['a'], snapshotOf(['a', 'b', 'c']));
    expect(state.drafters[0]).toMatchObject({ remaining: 1, openSlots: 1, pointsNeededToFill: 10, cannotFillRoster: true });
    expect(state.drafters[1]).toMatchObject({ remaining: 31, openSlots: 2, pointsNeededToFill: 30, cannotFillRoster: false });
  });

  it('reports null points needed, and cannotFillRoster, when the pool is smaller than the open slots', () => {
    const small = leagueOf({
      drafters: ['Ana', 'Ben'], me: 0, order: 'linear', rounds: 3, prices: { a: 1, b: 1 }, extraBans: [],
    });
    const state = deriveDraft(small, [], snapshotOf(['a', 'b']));
    expect(state.drafters[0].pointsNeededToFill).toBeNull();
    expect(state.drafters[0].cannotFillRoster).toBe(true);
  });

  it('ignores prices for species that are not in the snapshot', () => {
    const state = deriveDraft(leagueOf({ prices: { a: 3, ghost: 1 }, extraBans: [] }), [], snapshotOf(['a']));
    expect(state.pool).toEqual(['a']);
  });

  it('counts a picked species that has no price as costing 0', () => {
    const state = deriveDraft(league, ['h'], snapshot);
    expect(state.picks[0].price).toBe(0);
  });

  it('throws RangeError when there are more picks than slots', () => {
    expect(() => deriveDraft(league, ['a', 'b', 'c', 'd', 'f', 'g', 'h'], snapshot)).toThrow(RangeError);
  });

  it('does not modify its inputs', () => {
    const picks = ['a', 'b'];
    const before = JSON.stringify({ league, picks });
    deriveDraft(league, picks, snapshot);
    expect(JSON.stringify({ league, picks })).toBe(before);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx vitest run src/domain/derive.test.ts
```

Expected: FAIL (cannot resolve `./derive`).

- [ ] **Step 3: Implement**

`src/domain/derive.ts`:

```ts
import type { ID } from './id';
import type { LeagueConfig, LegalSpeciesSource } from './league';

export interface PickRecord {
  /** 1-based pick number. */
  number: number;
  /** 1-based round. */
  round: number;
  /** Index into `league.drafters`. */
  drafter: number;
  species: ID;
  /** 0 if the species has no price (only possible for a pick that was not validated). */
  price: number;
}

export interface DrafterState {
  name: string;
  /** Species in pick order. */
  roster: ID[];
  spent: number;
  /** budget - spent. */
  remaining: number;
  /** rounds - roster.length. */
  openSlots: number;
  /**
   * Sum of the cheapest `openSlots` prices left in the pool; 0 when openSlots is 0;
   * null when the pool has fewer species than openSlots.
   */
  pointsNeededToFill: number | null;
  /** True when pointsNeededToFill is null or more than `remaining`. A warning flag, not a rule. */
  cannotFillRoster: boolean;
}

export interface DraftState {
  picks: PickRecord[];
  /** Same order as `league.drafters`. */
  drafters: DrafterState[];
  /** Legal, priced, not banned, not picked. Sorted by price descending, then id ascending. */
  pool: ID[];
  /** Whose pick is next, or null when the draft is complete. */
  onTheClock: { number: number; round: number; drafter: number } | null;
  complete: boolean;
}

/**
 * Which drafter makes pick `n`. Both `n` and the returned `round` are 0-based.
 * Throws RangeError if `n` is not an integer in 0 .. drafters*rounds-1.
 */
export function drafterAt(league: LeagueConfig, n: number): { round: number; drafter: number } {
  const count = league.drafters.length;
  const total = count * league.rounds;
  if (!Number.isInteger(n) || n < 0 || n >= total) {
    throw new RangeError(`pick index ${n} is outside 0..${total - 1}`);
  }
  const round = Math.floor(n / count);
  const position = n % count;
  const drafter = league.order === 'snake' && round % 2 === 1 ? count - 1 - position : position;
  return { round, drafter };
}

/**
 * Recomputes the whole draft state from the league and the ordered picks. Assumes the picks are valid
 * (they come from `applyPick`); throws RangeError only when there are more picks than slots.
 */
export function deriveDraft(league: LeagueConfig, picks: ID[], snapshot: LegalSpeciesSource): DraftState {
  const total = league.drafters.length * league.rounds;
  if (picks.length > total) {
    throw new RangeError(`${picks.length} picks exceed the ${total} slots in this draft`);
  }

  const priceOf = (id: ID): number => league.prices[id] ?? 0;

  const records: PickRecord[] = picks.map((species, i) => {
    const { round, drafter } = drafterAt(league, i);
    return { number: i + 1, round: round + 1, drafter, species, price: priceOf(species) };
  });

  const taken = new Set(picks);
  const banned = new Set(league.extraBans);
  const pool = Object.keys(snapshot.species).filter(
    (id) => Object.hasOwn(league.prices, id) && !banned.has(id) && !taken.has(id),
  );
  pool.sort((a, b) => priceOf(b) - priceOf(a) || (a < b ? -1 : a > b ? 1 : 0));
  const cheapestFirst = pool.map(priceOf).sort((a, b) => a - b);

  const drafters: DrafterState[] = league.drafters.map((name, index) => {
    const mine = records.filter((record) => record.drafter === index);
    const spent = mine.reduce((sum, record) => sum + record.price, 0);
    const openSlots = league.rounds - mine.length;
    const remaining = league.budget - spent;
    const pointsNeededToFill =
      openSlots === 0
        ? 0
        : openSlots > cheapestFirst.length
          ? null
          : cheapestFirst.slice(0, openSlots).reduce((sum, price) => sum + price, 0);
    return {
      name,
      roster: mine.map((record) => record.species),
      spent,
      remaining,
      openSlots,
      pointsNeededToFill,
      cannotFillRoster: pointsNeededToFill === null || pointsNeededToFill > remaining,
    };
  });

  let onTheClock: DraftState['onTheClock'] = null;
  if (picks.length < total) {
    const { round, drafter } = drafterAt(league, picks.length);
    onTheClock = { number: picks.length + 1, round: round + 1, drafter };
  }

  return { picks: records, drafters, pool, onTheClock, complete: picks.length === total };
}
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run src/domain/derive.test.ts
npm run typecheck
```

Expected: all derive tests PASS; no type errors.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/derive.ts src/domain/derive.test.ts
git commit -m "feat(domain): add turn order and derived draft state" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Recording and undoing picks

**Files:**
- Create: `src/domain/draft.ts`
- Test: `src/domain/draft.test.ts`

**Interfaces:**
- Consumes: `ID`; `LeagueConfig`, `LegalSpeciesSource` from `./league`; `Problem` from `./problem`; `deriveDraft`, `drafterAt` from `./derive`; test helpers `leagueOf`, `snapshotOf`, `SPECIES_IDS`, `PRICES` from `./test-support`.
- Produces:
  - `checkPick(league: LeagueConfig, picks: ID[], species: ID, snapshot: LegalSpeciesSource): Problem | null`
  - `applyPick(league, picks, species, snapshot): { ok: true; picks: ID[] } | { ok: false; problem: Problem }`
  - `undoPick(picks: ID[]): ID[]`

- [ ] **Step 1: Write the failing tests**

`src/domain/draft.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveDraft } from './derive';
import { applyPick, checkPick, undoPick } from './draft';
import { leagueOf, PRICES, snapshotOf, SPECIES_IDS } from './test-support';

// Default league: Ana, Ben, Cy; snake; 2 rounds (order Ana, Ben, Cy, Cy, Ben, Ana); budget 50.
// Extra species: 'ghost' is priced but not legal, 'big' costs 60, 'mid' costs 20.
const league = leagueOf({ prices: { ...PRICES, ghost: 1, big: 60, mid: 20 } });
const snapshot = snapshotOf([...SPECIES_IDS, 'big', 'mid']);

describe('checkPick', () => {
  it('accepts a legal, priced, unbanned, untaken, affordable species', () => {
    expect(checkPick(league, [], 'a', snapshot)).toBeNull();
  });

  it('refuses a species that is not legal in the format', () => {
    const problem = checkPick(league, [], 'ghost', snapshot);
    expect(problem?.path).toBe('picks[0]');
    expect(problem?.message).toContain('ghost');
    expect(problem?.message).toContain('not legal');
    expect(problem?.message).toContain('fmt');
  });

  it('refuses a species with no price', () => {
    expect(checkPick(league, [], 'h', snapshot)?.message).toContain('no price');
  });

  it('refuses a banned species', () => {
    expect(checkPick(league, [], 'e', snapshot)?.message).toContain('banned');
  });

  it('refuses a species that was already picked, at the right slot', () => {
    const problem = checkPick(league, ['a'], 'a', snapshot);
    expect(problem?.path).toBe('picks[1]');
    expect(problem?.message).toContain('already been picked');
  });

  it('refuses a species that costs more than the drafter on the clock has left', () => {
    expect(checkPick(league, [], 'big', snapshot)?.message).toBe('"big" costs 60 points but Ana has 50 left');
    // After a, b, c the clock is on Cy, who spent 10 on c.
    expect(checkPick(league, ['a', 'b', 'c'], 'big', snapshot)?.message).toBe('"big" costs 60 points but Cy has 40 left');
    expect(checkPick(league, ['a', 'b', 'c'], 'mid', snapshot)).toBeNull();
  });

  it('refuses any pick once the draft is complete, even with too many picks', () => {
    const full = ['a', 'b', 'c', 'd', 'f', 'g'];
    const problem = checkPick(league, full, 'mid', snapshot);
    expect(problem?.path).toBe('picks[6]');
    expect(problem?.message).toContain('already complete');
    expect(checkPick(league, [...full, 'h'], 'mid', snapshot)?.message).toContain('already complete');
  });

  it('checks the reasons in a fixed order', () => {
    // complete first
    expect(checkPick(league, ['a', 'b', 'c', 'd', 'f', 'g'], 'ghost', snapshot)?.message).toContain('already complete');
    // legal before priced: unknown to the snapshot and unpriced
    expect(checkPick(league, [], 'zzz', snapshot)?.message).toContain('not legal');
    // banned before taken
    expect(checkPick(league, ['e'], 'e', snapshot)?.message).toContain('banned');
  });

  it('does not refuse a pick that will leave the drafter unable to fill the roster', () => {
    const tight = leagueOf({
      drafters: ['Ana', 'Ben'], me: 0, order: 'linear', rounds: 2, budget: 31, prices: { a: 30, b: 20, c: 10 }, extraBans: [],
    });
    const tightSnapshot = snapshotOf(['a', 'b', 'c']);
    const result = applyPick(tight, [], 'a', tightSnapshot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(deriveDraft(tight, result.picks, tightSnapshot).drafters[0].cannotFillRoster).toBe(true);
    }
  });
});

describe('applyPick', () => {
  it('returns a new list with the species appended and leaves the input alone', () => {
    const picks = ['a'];
    const result = applyPick(league, picks, 'b', snapshot);
    expect(result).toEqual({ ok: true, picks: ['a', 'b'] });
    expect(picks).toEqual(['a']);
  });

  it('returns the problem when the pick is refused', () => {
    const result = applyPick(league, [], 'h', snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem.message).toContain('no price');
  });
});

describe('undoPick', () => {
  it('drops the last pick and returns a new list', () => {
    const picks = ['a', 'b'];
    const undone = undoPick(picks);
    expect(undone).toEqual(['a']);
    expect(undone).not.toBe(picks);
    expect(picks).toEqual(['a', 'b']);
  });

  it('leaves an empty list empty', () => {
    expect(undoPick([])).toEqual([]);
  });

  it('undoes an applied pick exactly', () => {
    const before = ['a', 'b'];
    const applied = applyPick(league, before, 'c', snapshot);
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(undoPick(applied.picks)).toEqual(before);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx vitest run src/domain/draft.test.ts
```

Expected: FAIL (cannot resolve `./draft`).

- [ ] **Step 3: Implement**

`src/domain/draft.ts`:

```ts
import { deriveDraft, drafterAt } from './derive';
import type { ID } from './id';
import type { LeagueConfig, LegalSpeciesSource } from './league';
import type { Problem } from './problem';

/**
 * Why `species` cannot be picked next, or null if it can. The reasons are tested in this order and the
 * first one that applies is returned. A pick that leaves the drafter unable to fill their roster is
 * allowed; it shows up as `cannotFillRoster` in the derived state.
 */
export function checkPick(
  league: LeagueConfig,
  picks: ID[],
  species: ID,
  snapshot: LegalSpeciesSource,
): Problem | null {
  const problem = (message: string): Problem => ({ path: `picks[${picks.length}]`, message });

  if (picks.length >= league.drafters.length * league.rounds) return problem('the draft is already complete');
  if (!Object.hasOwn(snapshot.species, species)) return problem(`"${species}" is not legal in ${snapshot.formatId}`);
  if (!Object.hasOwn(league.prices, species)) return problem(`"${species}" has no price in this league`);
  if (league.extraBans.includes(species)) return problem(`"${species}" is banned in this league`);
  if (picks.includes(species)) return problem(`"${species}" has already been picked`);

  const { drafter } = drafterAt(league, picks.length);
  const onTheClock = deriveDraft(league, picks, snapshot).drafters[drafter];
  const price = league.prices[species];
  if (price > onTheClock.remaining) {
    return problem(`"${species}" costs ${price} points but ${onTheClock.name} has ${onTheClock.remaining} left`);
  }
  return null;
}

export function applyPick(
  league: LeagueConfig,
  picks: ID[],
  species: ID,
  snapshot: LegalSpeciesSource,
): { ok: true; picks: ID[] } | { ok: false; problem: Problem } {
  const problem = checkPick(league, picks, species, snapshot);
  return problem ? { ok: false, problem } : { ok: true, picks: [...picks, species] };
}

/** A copy of `picks` without the last pick; an empty list stays empty. */
export function undoPick(picks: ID[]): ID[] {
  return picks.slice(0, -1);
}
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run src/domain/draft.test.ts
npm run typecheck
```

Expected: all draft tests PASS; no type errors.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/draft.ts src/domain/draft.test.ts
git commit -m "feat(domain): add pick checking, recording and undo" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Price list import

**Files:**
- Create: `src/domain/prices.ts`
- Test: `src/domain/prices.test.ts`

**Interfaces:**
- Consumes: `ID`, `toID` from `./id`; `LegalSpeciesSource` from `./league`; `Problem` from `./problem`; test helper `snapshotOf` from `./test-support`.
- Produces:
  - `interface PriceImport { prices: Record<ID, number>; unmatched: string[]; problems: Problem[] }`
  - `parsePriceCsv(text: string, snapshot: LegalSpeciesSource): PriceImport`

- [ ] **Step 1: Write the failing tests**

`src/domain/prices.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parsePriceCsv } from './prices';
import { snapshotOf } from './test-support';

const snapshot = snapshotOf(['incineroar', 'kingambit', 'sinistcha', 'charizardmegax']);

describe('parsePriceCsv', () => {
  it('reads name,points lines and skips a header', () => {
    const result = parsePriceCsv('Pokemon,Points\nIncineroar,20\nKingambit,15', snapshot);
    expect(result).toEqual({ prices: { incineroar: 20, kingambit: 15 }, unmatched: [], problems: [] });
  });

  it('works without a header', () => {
    expect(parsePriceCsv('Incineroar,20\nKingambit,15', snapshot).prices).toEqual({ incineroar: 20, kingambit: 15 });
  });

  it('reads tab-separated lines, as pasted from a spreadsheet', () => {
    const result = parsePriceCsv('Incineroar\t20\nKingambit\t15', snapshot);
    expect(result.prices).toEqual({ incineroar: 20, kingambit: 15 });
    expect(result.problems).toEqual([]);
  });

  it('handles quoted names, spaces around fields and CRLF line endings', () => {
    const result = parsePriceCsv('"Incineroar",20\r\n"Kingambit", 15 \r\n', snapshot);
    expect(result.prices).toEqual({ incineroar: 20, kingambit: 15 });
    expect(result.problems).toEqual([]);
  });

  it('matches names by normalized id, so form names work', () => {
    expect(parsePriceCsv('Charizard-Mega-X,25', snapshot).prices).toEqual({ charizardmegax: 25 });
  });

  it('splits on the last comma, so a name may contain a comma', () => {
    const result = parsePriceCsv('"Weird, Name",5', snapshot);
    expect(result.unmatched).toEqual(['Weird, Name']);
    expect(result.problems).toEqual([]);
  });

  it('lists names that match no species without treating them as problems', () => {
    const result = parsePriceCsv('Incineroar,20\nMissingno,5', snapshot);
    expect(result.prices).toEqual({ incineroar: 20 });
    expect(result.unmatched).toEqual(['Missingno']);
    expect(result.problems).toEqual([]);
  });

  it('accepts a price of 0', () => {
    expect(parsePriceCsv('Incineroar,0', snapshot).prices).toEqual({ incineroar: 0 });
  });

  it('reports a species listed twice, keeps the first price', () => {
    const result = parsePriceCsv('Incineroar,20\nKingambit,15\nincineroar,99', snapshot);
    expect(result.prices.incineroar).toBe(20);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].path).toBe('line 3');
    expect(result.problems[0].message).toContain('listed twice');
    expect(result.problems[0].message).toContain('line 1');
  });

  it.each(['lots', '-5', '1.5', ''])('reports non-whole points %j after the first line', (points) => {
    const result = parsePriceCsv(`Incineroar,20\nKingambit,${points}`, snapshot);
    expect(result.prices).toEqual({ incineroar: 20 });
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].path).toBe('line 2');
    expect(result.problems[0].message).toContain(`"${points}"`);
    expect(result.problems[0].message).toContain('whole number');
  });

  it('treats a first line with non-numeric points as a header, not a problem', () => {
    const result = parsePriceCsv('Incineroar,lots\nKingambit,15', snapshot);
    expect(result.prices).toEqual({ kingambit: 15 });
    expect(result.problems).toEqual([]);
  });

  it('reports a line with no separator', () => {
    const result = parsePriceCsv('Incineroar,20\nKingambit', snapshot);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].path).toBe('line 2');
    expect(result.problems[0].message).toContain('name,points');
  });

  it('skips blank lines but counts them in line numbers', () => {
    const result = parsePriceCsv('\n\nIncineroar,20\nKingambit,x', snapshot);
    expect(result.problems.map((p) => p.path)).toEqual(['line 4']);
  });

  it('returns nothing for empty text', () => {
    expect(parsePriceCsv('', snapshot)).toEqual({ prices: {}, unmatched: [], problems: [] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx vitest run src/domain/prices.test.ts
```

Expected: FAIL (cannot resolve `./prices`).

- [ ] **Step 3: Implement**

`src/domain/prices.ts`:

```ts
import { toID, type ID } from './id';
import type { LegalSpeciesSource } from './league';
import type { Problem } from './problem';

export interface PriceImport {
  /** Species id -> points, for every row that matched a legal species. */
  prices: Record<ID, number>;
  /** Names (as written) that matched no species. Not problems. */
  unmatched: string[];
  problems: Problem[];
}

const WHOLE_NUMBER = /^\d+$/;

/** Removes one pair of surrounding double quotes, then trims. */
function clean(field: string): string {
  const trimmed = field.trim();
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).trim()
    : trimmed;
}

/** Splits at the last tab if the line has one, otherwise at the last comma. */
function splitLine(line: string): [name: string, points: string] | null {
  const tab = line.lastIndexOf('\t');
  const at = tab >= 0 ? tab : line.lastIndexOf(',');
  if (at < 0) return null;
  return [clean(line.slice(0, at)), clean(line.slice(at + 1))];
}

/**
 * Reads a price list ("name,points" or "name<TAB>points" per line). The first non-blank line is skipped
 * as a header when its points field is not a whole number. Names are matched by `toID` against the
 * snapshot's species; there is no fuzzy matching.
 */
export function parsePriceCsv(text: string, snapshot: LegalSpeciesSource): PriceImport {
  const prices: Record<ID, number> = {};
  const unmatched: string[] = [];
  const problems: Problem[] = [];
  const firstSeenOnLine = new Map<ID, number>();
  let sawContent = false;

  text.split(/\r?\n/).forEach((raw, index) => {
    const lineNumber = index + 1;
    if (raw.trim() === '') return;
    const isFirstContentLine = !sawContent;
    sawContent = true;
    const path = `line ${lineNumber}`;

    const fields = splitLine(raw);
    if (fields === null) {
      problems.push({ path, message: 'expected "name,points"' });
      return;
    }
    const [name, points] = fields;

    if (!WHOLE_NUMBER.test(points)) {
      if (!isFirstContentLine) problems.push({ path, message: `"${points}" is not a whole number of points` });
      return;
    }

    const id = toID(name);
    if (!Object.hasOwn(snapshot.species, id)) {
      unmatched.push(name);
      return;
    }
    const earlier = firstSeenOnLine.get(id);
    if (earlier !== undefined) {
      problems.push({ path, message: `"${name}" is listed twice (first on line ${earlier})` });
      return;
    }
    firstSeenOnLine.set(id, lineNumber);
    prices[id] = Number(points);
  });

  return { prices, unmatched, problems };
}
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run src/domain/prices.test.ts
npm run typecheck
```

Expected: all price tests PASS; no type errors.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/prices.ts src/domain/prices.test.ts
git commit -m "feat(domain): add price list import" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Saved file format

**Files:**
- Create: `src/domain/file.ts`
- Test: `src/domain/file.test.ts`

**Interfaces:**
- Consumes: `ID`; `LeagueConfig`, `LegalSpeciesSource`, `validateLeague` from `./league`; `checkPick` from `./draft`; `Problem` from `./problem`; test helpers `leagueOf`, `snapshotOf` from `./test-support`.
- Produces:
  - `interface DraftFile { schemaVersion: 1; league: LeagueConfig; picks: ID[] }`
  - `type ParseResult = { ok: true; file: DraftFile; warnings: Problem[] } | { ok: false; errors: Problem[] }`
  - `parseDraftFile(text: string, snapshot: LegalSpeciesSource): ParseResult`
  - `serializeDraftFile(file: DraftFile): string` (`JSON.stringify(file, null, 2)` plus a trailing newline)

- [ ] **Step 1: Write the failing tests**

`src/domain/file.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseDraftFile, serializeDraftFile, type DraftFile } from './file';
import { leagueOf, snapshotOf } from './test-support';

const snapshot = snapshotOf(); // a..h; 'e' is banned and 'h' unpriced in leagueOf()
const goodFile = (): DraftFile => ({ schemaVersion: 1, league: leagueOf(), picks: ['a', 'b', 'c'] });

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
    expect(text).toContain('\n  "schemaVersion": 1');
  });
});

describe('parseDraftFile', () => {
  it('round-trips a saved file exactly', () => {
    const result = parseDraftFile(serializeDraftFile(goodFile()), snapshot);
    expect(result).toEqual({ ok: true, file: goodFile(), warnings: [] });
  });

  it('accepts a file with no picks yet', () => {
    const result = parseDraftFile(serializeDraftFile({ ...goodFile(), picks: [] }), snapshot);
    expect(result.ok).toBe(true);
  });

  it('drops unknown top-level keys', () => {
    const result = parseEdited((file) => {
      file.extra = 'ignored';
    });
    expect(result.ok && 'extra' in result.file).toBe(false);
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

    it('refuses a different schemaVersion, naming the version found', () => {
      const result = parseEdited((file) => {
        file.schemaVersion = 2;
      });
      expect(errorsOf(result).map((e) => e.path)).toEqual(['schemaVersion']);
      expect(errorsOf(result)[0].message).toContain('2');
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
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx vitest run src/domain/file.test.ts
```

Expected: FAIL (cannot resolve `./file`).

- [ ] **Step 3: Implement**

`src/domain/file.ts`:

```ts
import { checkPick } from './draft';
import type { ID } from './id';
import { validateLeague, type LeagueConfig, type LegalSpeciesSource } from './league';
import type { Problem } from './problem';

export interface DraftFile {
  schemaVersion: 1;
  league: LeagueConfig;
  /** Species ids in the order they were picked. */
  picks: ID[];
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
  if (json.schemaVersion !== 1) {
    return [
      { path: 'schemaVersion', message: `unsupported schemaVersion ${JSON.stringify(json.schemaVersion)} (this version reads 1)` },
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
  return problems;
}

/**
 * Reads a saved draft. Three layers, stopping at the first that has errors: (1) JSON shape, (2) league
 * rules, (3) replaying every pick with `checkPick`. A file with any error is refused whole. Prices or
 * bans for species the snapshot does not have, and a format id that differs from the snapshot's, are
 * returned as warnings.
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
  const parsed = json as DraftFile;
  const file: DraftFile = { schemaVersion: 1, league: parsed.league, picks: parsed.picks };

  const leagueProblems = validateLeague(file.league, 'league');
  if (leagueProblems.length > 0) return { ok: false, errors: leagueProblems };

  for (let i = 0; i < file.picks.length; i++) {
    const problem = checkPick(file.league, file.picks.slice(0, i), file.picks[i], snapshot);
    if (problem) {
      return { ok: false, errors: [{ path: `picks[${i}]`, message: `pick ${i + 1}: ${problem.message}` }] };
    }
  }

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

  return { ok: true, file, warnings };
}
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run src/domain/file.test.ts
npm run typecheck
```

Expected: all file tests PASS; no type errors.

- [ ] **Step 5: Commit**

```powershell
git add src/domain/file.ts src/domain/file.test.ts
git commit -m "feat(domain): add the saved draft file format" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Mock draft against the real Reg M-B snapshot

This task adds tests only. Every piece of production code already exists, so the new tests are expected to pass on first run; a failure is a real bug in an earlier task and must be reported, not worked around.

**Files:**
- Test: `src/domain/mock-draft.test.ts`

**Interfaces:**
- Consumes: `applyPick`, `undoPick` (Task 4); `deriveDraft` (Task 3); `parseDraftFile`, `serializeDraftFile` (Task 6); `LeagueConfig` (Task 2); `Snapshot` from `./types`; the committed file `data/gen9championsvgc2026regmb/snapshot.json`.
- Produces: nothing later tasks use.

- [ ] **Step 1: Write the tests**

`src/domain/mock-draft.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deriveDraft } from './derive';
import { applyPick, undoPick } from './draft';
import { parseDraftFile, serializeDraftFile } from './file';
import type { ID } from './id';
import type { LeagueConfig } from './league';
import type { Snapshot } from './types';

const snapshot = JSON.parse(
  readFileSync(new URL('../../data/gen9championsvgc2026regmb/snapshot.json', import.meta.url), 'utf8'),
) as Snapshot;
if (!snapshot.usage) throw new Error('the committed snapshot has no usage data');

// Price every species that has usage: the ten most used cost 20, the next ten 19, and so on, never below 1.
const ranked = Object.values(snapshot.usage.species).sort((a, b) => b.usage - a.usage);
const prices: Record<ID, number> = Object.fromEntries(
  ranked.map((entry, rank) => [entry.id, Math.max(1, 20 - Math.floor(rank / 10))]),
);
const BANNED = ranked[0].id; // the most-used species is banned in the mock league

function mockLeague(overrides: Partial<LeagueConfig> = {}): LeagueConfig {
  return {
    name: 'Mock League',
    formatId: snapshot.formatId,
    drafters: ['Ana', 'Ben', 'Cy', 'Di'],
    order: 'snake',
    rounds: 6,
    me: 2,
    budget: 100,
    prices,
    extraBans: [BANNED],
    ...overrides,
  };
}

/** Picks the cheapest species left in the pool, `count` times. */
function draftCheapest(league: LeagueConfig, count: number): ID[] {
  let picks: ID[] = [];
  for (let i = 0; i < count; i++) {
    const { pool } = deriveDraft(league, picks, snapshot);
    const result = applyPick(league, picks, pool[pool.length - 1], snapshot);
    if (!result.ok) throw new Error(`pick ${i + 1} refused: ${result.problem.message}`);
    picks = result.picks;
  }
  return picks;
}

describe('mock draft on the real Reg M-B snapshot', () => {
  it('runs a full 4-drafter snake draft, keeping the derived state consistent at every step', () => {
    const league = mockLeague();
    const total = league.drafters.length * league.rounds;
    const startPool = deriveDraft(league, [], snapshot).pool.length;
    expect(startPool).toBe(ranked.length - 1); // everything priced except the banned species

    let picks: ID[] = [];
    for (let i = 0; i < total; i++) {
      const state = deriveDraft(league, picks, snapshot);
      expect(state.complete).toBe(false);
      expect(state.pool).not.toContain(BANNED);
      expect(state.pool.length).toBe(startPool - picks.length);
      for (const picked of picks) expect(state.pool).not.toContain(picked);

      const cheapest = state.pool[state.pool.length - 1];
      const result = applyPick(league, picks, cheapest, snapshot);
      if (!result.ok) throw new Error(`pick ${i + 1} refused: ${result.problem.message}`);
      picks = result.picks;
    }

    const final = deriveDraft(league, picks, snapshot);
    expect(final.complete).toBe(true);
    expect(final.onTheClock).toBeNull();
    expect(new Set(picks).size).toBe(total);
    for (const drafter of final.drafters) {
      expect(drafter.roster).toHaveLength(league.rounds);
      expect(drafter.openSlots).toBe(0);
      expect(drafter.spent + drafter.remaining).toBe(league.budget);
    }
    expect(final.drafters.reduce((sum, d) => sum + d.spent, 0)).toBe(picks.reduce((sum, id) => sum + prices[id], 0));
  });

  it('undo returns to exactly the previous state', () => {
    const league = mockLeague();
    const picks = draftCheapest(league, 7);
    const before = deriveDraft(league, picks.slice(0, 6), snapshot);
    expect(deriveDraft(league, undoPick(picks), snapshot)).toEqual(before);
  });

  it('refuses a banned species and a species with no price', () => {
    const league = mockLeague();
    const banned = applyPick(league, [], BANNED, snapshot);
    expect(banned.ok).toBe(false);
    if (!banned.ok) expect(banned.problem.message).toContain('banned');

    const unpriced = Object.keys(snapshot.species).find((id) => !Object.hasOwn(prices, id));
    expect(unpriced).toBeDefined();
    const result = applyPick(league, [], unpriced as string, snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem.message).toContain('no price');
  });

  it('refuses a pick that costs more than the budget', () => {
    const league = mockLeague({ budget: 5 });
    const priciest = deriveDraft(league, [], snapshot).pool[0];
    const result = applyPick(league, [], priciest, snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem.message).toContain('costs');
  });

  it('saves and reopens a finished draft with no warnings', () => {
    const league = mockLeague();
    const picks = draftCheapest(league, league.drafters.length * league.rounds);
    const parsed = parseDraftFile(serializeDraftFile({ schemaVersion: 1, league, picks }), snapshot);
    if (!parsed.ok) throw new Error(`file refused: ${JSON.stringify(parsed.errors)}`);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.file.picks).toEqual(picks);
  });

  it('refuses a saved draft that contains an unpriced species, naming the pick', () => {
    const league = mockLeague();
    const picks = draftCheapest(league, 5);
    const unpriced = Object.keys(snapshot.species).find((id) => !Object.hasOwn(prices, id)) as string;
    const bad = [...picks.slice(0, 3), unpriced, ...picks.slice(4)];
    const parsed = parseDraftFile(serializeDraftFile({ schemaVersion: 1, league, picks: bad }), snapshot);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors[0].path).toBe('picks[3]');
      expect(parsed.errors[0].message).toContain('pick 4: ');
      expect(parsed.errors[0].message).toContain('no price');
    }
  });
});
```

- [ ] **Step 2: Run the tests**

```powershell
npx vitest run src/domain/mock-draft.test.ts
```

Expected: PASS (6 tests). If any fail, read the message: it points at a real defect in Tasks 1–6. Report the failing message; do not edit the assertions to make them pass.

- [ ] **Step 3: Run the full suite and typecheck**

```powershell
npm test
npm run typecheck
```

Expected: all tests PASS (the original 65 plus every test added in this plan); no type errors; no warnings or noise in the output.

- [ ] **Step 4: Commit**

```powershell
git add src/domain/mock-draft.test.ts
git commit -m "test(domain): mock draft against the real Reg M-B snapshot" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review (spec coverage)

| Spec requirement | Task |
|---|---|
| `natures.ts`: 25 natures with plus/minus | 1 |
| `set.ts`: `PokemonSet`, limits 32 / 66 / 4, structural `validateSet` | 1 |
| `problem.ts`: `Problem` | 1 |
| `league.ts`: `LeagueConfig`, `LegalSpeciesSource`, all `validateLeague` rules | 2 |
| `drafterAt` (snake / linear, 0-based, `RangeError`) | 3 |
| `deriveDraft`: picks, per-drafter state, pool ordering, `onTheClock`, `complete`, `pointsNeededToFill`, `cannotFillRoster`, no input mutation | 3 |
| `checkPick` with the six reasons in order, `applyPick`, `undoPick`, pick that leaves the roster unfillable is allowed | 4 |
| `parsePriceCsv`: header, comma / tab, quotes, CRLF, last-separator split, `toID` matching, unmatched, duplicates, bad points, no separator | 5 |
| `DraftFile`, `serializeDraftFile`, `parseDraftFile` three layers, refuse whole, warnings | 6 |
| Real-snapshot mock draft (consistency, undo, refusals, file round trip) | 7 |
| Spec Testing bullets (turn order, derivation, picks, sets, league, price CSV, file, real snapshot) | 1–7 |

Type and name consistency checked across tasks: `Problem`, `LeagueConfig`, `LegalSpeciesSource`, `DraftOrder`, `PickRecord`, `DrafterState`, `DraftState`, `drafterAt`, `deriveDraft`, `checkPick`, `applyPick`, `undoPick`, `parsePriceCsv`, `PriceImport`, `DraftFile`, `ParseResult`, `parseDraftFile`, `serializeDraftFile`, `leagueOf`, `snapshotOf`, `SPECIES_IDS`, `PRICES`.

---

## Later increments (outlined; each gets its own plan)

1. **Snapshot additions for the teambuilder:** item names and the legal item list from the Champions mod (`dex.items`), captured in the sync; also capture per-species `Tera Types` only if a format ever uses them (none does today). Regenerate the snapshot once.
2. **Teambuilder:** validate a `PokemonSet` against the snapshot (legal moves via `learnsets`, abilities via `species.abilities`, item legality), Showdown paste import/export, stat calculation (base + points + 75 for HP, + 20 otherwise, then nature).
3. **Suggestion engine, stages 1–3:** consumes `DraftState.pool`, `DrafterState.remaining`, `pointsNeededToFill` and the usage data; see the parent spec.
4. **App shell and hosting.**
