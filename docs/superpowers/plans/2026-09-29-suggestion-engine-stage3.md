# Suggestion Engine, Stage 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user's entered sets replace ladder guesses in the engine's role, ability and coverage rules, and add a fourth signal, `comboFit`, that rewards candidates completing a partner combo (Trick Room, weather, redirection + setup, Helping Hand + spread attacker) with the roster.

**Architecture:** One new "profile" module answers "what does this Pokémon run" (entered set where present, ladder usage otherwise); the stage 2 rules read profiles instead of raw usage. A combo table and a combo signal sit beside the role table and role signal, with the same shape (open things / what the candidate completes / importance-weighted fraction). `suggest()` reads `ctx.sets`, runs four signals, and gives weight 0 to a signal that no candidate has data for.

**Tech Stack:** TypeScript (ESM, strict), Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-suggestion-engine-stage3-design.md` (parents: the stage 2 and stage 1 engine specs in the same folder, and `docs/superpowers/specs/2026-09-20-draft-lab-design.md`). Read the stage 3 spec first; it is the binding authority for this plan.

## Global Constraints

- Scope: stage 3 only. Out of scope: combo conflicts (rain against sun, Trick Room against Tailwind), items, real Speed from a set's nature and points, set legality, any UI, browser storage.
- No function throws on plain-data input, none modifies its arguments, none keeps state between calls; output is deterministic. Use `Object.hasOwn` for every lookup keyed by a species id, a move id, an ability name or a set id.
- The engine never produces display text; results carry typed reasons (`Reason`) and notes (`Note`).
- Candidates always use the ladder profile; only roster members are read through `sets`. Usage lift never reads sets.
- `suggest(ctx)` and `suggest({ ...ctx, sets: {} })` give equal results. A malformed `ctx.sets` is ignored, never `invalid-context`.
- Constants live in one place each and are exactly: `TRICK_ROOM_MAX_BASE_SPEED = 50`, `SPREAD_MIN_BASE_POWER = 70`, `EXPECTED_ABILITY_MIN_SHARE = 0.5` (moved, unchanged), `RUN_MIN_SHARE = 0.1` (stage 2, reused), default weights `usageLift` 0.35, `typeSynergy` 0.3, `roleFit` 0.25, `comboFit` 0.1. `MISSING_WEIGHT_FACTOR` stays 0.5.
- The combo table is exactly the spec's table (ids, importance, sides) with the spread floor below.
- A signal with no data for any candidate in a `suggest` call gets weight 0 for that call.
- Dependencies point one way: `src/engine/` imports from `src/domain/` (and itself); `src/domain/` never imports from `src/engine/`.
- Commits end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (copy it verbatim; never substitute another model name).

**Plan clarifications (rulings on gaps in the spec, made at plan time):**
1. **Spread floor.** The spec's `helpingHand` beneficiary side is "runs a damaging spread move". Measured, that matched 126 species, many only through utility spread moves used as speed control (Icy Wind, Electroweb, Snarl, Bulldoze: base power 65 or less), which made "Helping Hand partner" reasons noisy. The side now requires a spread **attack**: a damaging spread move with base power at least `SPREAD_MIN_BASE_POWER = 70` (keeps Rock Slide 75, Heat Wave, Earthquake, Dazzling Gleam; 118 species). The spec is amended in the same commit as this plan.
2. **`expectedAbility` moves to `profile.ts`** (with `EXPECTED_ABILITY_MIN_SHARE`); `abilities.ts` re-exports both, so existing imports keep working. Reason: `profile.ts` needs it and `abilities.ts` needs profiles; keeping it in `abilities.ts` would make the two modules import each other.
3. **Three small helpers in `profile.ts`** beyond the spec's `profileOf` and `readSets`: `abilityOf` (the ability half of a profile, for callers without a move table, e.g. `immunityOf`), `setFor(sets, id)` (own-key lookup), `runsMove(profile, move, minShare)`.
4. **`roleSignal` takes no `sets`.** The spec lists `roleSignal(roster, candidate, snapshot, lacked, sets?)`, but the roster side of the role signal is entirely `lacked` (computed by the caller with `sets`), and the candidate never reads sets. So the signature stays `roleSignal(roster, candidate, snapshot, lacked)`.
5. **`readSets` returns `Record<ID, unknown>`** (entries unchecked); the profile functions read entries defensively. Every function that takes sets takes that type.
6. **`contextFor` copies only the set entries that are objects** (each with its `moves` array and `points` object copied), using `Object.defineProperty` so an id such as `__proto__` stays an own entry.
7. **Signals nobody has data for** are zeroed in `suggest` before `combineSignals` (the spec's chosen implementation); `combine.ts` is not touched.
8. **`profileOf`'s ladder moves** keep the largest share when a usage row id repeats (the stage 2 code considered every row, so this is the same result).

## Pre-verification results (measured 2026-09-29 against the committed Reg M-B snapshot, with the prototype of this plan's code)

The plan's code was built and run in full before this plan was written, and the plan was then replayed task by task in a clean checkout of ee52ac6 (each task's edits and files applied exactly as written below): every task ends green, with 584, 591, 600, 615, 623 and 631 unit tests after Tasks 1 to 6. In total: 631 unit tests and 21 integration tests pass, typecheck is clean, and two mutations (removing the "no data for anyone" weight rule; removing the no-self-pairing guard) are each caught by the new tests.

- **Side matches** (ladder profiles, every legal species; enabler | beneficiary): trickRoom 35 | 58, redirectSetup 7 | 47, rain 8 | 9, sun 4 | 8, sand 4 | 5, snow 5 | 8, electricTerrain 1 | 5, helpingHand 15 | 118 (126 without the spread floor).
- **Open combos and `comboFit`** (remaining 12, 3 open slots, the synthetic prices of `suggest-real.test.ts`):
  - pair `incineroar + kingambit`: open trickRoom, redirectSetup, helpingHand; 346 candidates, all with combo data, 135 above 0, 6 distinct values; 18 of the top 20 carry a combo reason.
  - six most used: open trickRoom, redirectSetup, helpingHand; 344 candidates, 138 above 0; 18 of the top 20 carry a combo reason.
  - trio `garchomp + whimsicott + sneasler`: open helpingHand only; 13 of 345 above 0; 1 of the top 20 carries a combo reason.
- **Stage 2 floors still hold:** candidates without lift data in the top 20 are 0, 0 and 0 for the pair, six-species and trio rosters (the tests allow at most 5).
- **Reachability:** a Pelipper roster puts Swampert-Mega (Swift Swim, price 4) 11th of 345 with the `rain` reason; a Torkoal roster gives Venusaur (Chlorophyll) the `sun` reason and a `comboFit` rank of 0.89 (96th overall: Torkoal also opens trickRoom and helpingHand, which Venusaur does not complete).
- **Sets:** an Incineroar set without Fake Out (and without Helping Hand) turns the pair's lacked roles from `redirection, speedControl, weatherTerrain, screens, disruption` into `fakeOut, redirection, speedControl, weatherTerrain, screens, support, disruption`; `sets: {}` gives a result identical to no sets.
- **Fixture numbers:** every hand-computed value in the tests (the combo fractions 1/1.75 and 0.75/1.75; the Trick Room fixture 0.5769231 / 0.4230769 and weights 0.4615385 / 0.3846154 / 0.1538462; the no-usage fixture 0.6363636 / 0.3636364 / 0.2272727 and weights 0.5454545 / 0.4545455) was computed separately with a script, and the stage 2 type numbers reused by the set tests (0.305 / 0.2675, 0.3738636 / 0.4232143) come from stage 2's verified tests. All stage 2 score expectations in `suggest.test.ts` are unchanged, because `comboFit` has no data in that fixture and now gets weight 0.

## Environment notes

- Windows + PowerShell. A fresh shell may not find `node`/`npm`. Start every PowerShell command with:
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User");`
- The repo path contains a space: quote it.
- Single test file: `npx vitest run <path>`. Whole unit suite: `npm test`. Types: `npm run typecheck`. Real-package tests (slow): `npm run test:integration`. The baseline before this plan is 566 unit tests and 21 integration tests, all passing; after it, 631 and 21.
- Work on branch `feat/engine-stage3` (already created; the spec is committed at ee52ac6).
- Every file block below is the complete file content: create the file, or replace the existing file entirely, with exactly that text. Edits to `types.ts` are given as exact find/replace pairs. The code typechecks under `strict`; if a line fails typecheck, report the exact TS error and apply the smallest fix that keeps the test's intent; do not silently rewrite a test. If a real-data test fails, report the measured value; do not change a floor to make it pass.

---

## File Structure

```
Create: src/engine/profile.ts, profile.test.ts             Profile, profileOf, abilityOf, readSets, setFor, runsMove, expectedAbility
Create: src/engine/combos.ts, combos.test.ts               the combo table, sideMatch
Create: src/engine/combo-signal.ts, combo-signal.test.ts   openCombos, comboSignal
Create: src/engine/combos-real.test.ts                     combos and sets on the real snapshot
Modify: src/engine/types.ts          ProfileSource, ComboId, ComboSource, SuggestContext.sets, Reason, SignalName
Modify: src/engine/abilities.ts      re-exports expectedAbility; immunityOf reads sets
Modify: src/engine/roles.ts          speciesRoles / rosterLacks read profiles; RoleTag.from
Modify: src/engine/role-signal.ts    fills-role carries from
Modify: src/engine/type-signal.ts    attackingTypes / typeSignal read roster sets
Modify: src/engine/suggest.ts        sets, four signals, weight 0 for a signal nobody has data for
Modify: src/engine/candidates.ts     contextFor copies sets
Modify: src/engine/index.ts          new exports
Modify tests: abilities, roles, role-signal, type-signal, suggest, candidates, index, suggest-real
Modify docs: docs/STATUS.md, README.md, the stage 2 spec (pointer)
```

---

### Task 1: Profiles

**Files:**
- Create: `src/engine/profile.ts`, `src/engine/profile.test.ts`
- Modify: `src/engine/types.ts` (new types, `SuggestContext.sets`, the `completes-combo` reason), `src/engine/abilities.ts`, `src/engine/abilities.test.ts`

**Interfaces:**
- Consumes: `EngineSnapshot`, `compareIds`, `toID` (existing).
- Produces:
  - `types.ts`: `type ProfileSource = 'set' | 'ladder'`; `type ComboId = 'trickRoom' | 'redirectSetup' | 'rain' | 'sun' | 'sand' | 'snow' | 'electricTerrain' | 'helpingHand'`; `type ComboSource = 'set' | 'ladder' | 'species'`; `SuggestContext.sets?: Record<ID, PokemonSet>`; `Reason` gains `{ kind: 'completes-combo'; combo: ComboId; side: 'enabler' | 'beneficiary'; with: ID; from: ComboSource }`.
  - `profile.ts`: `EXPECTED_ABILITY_MIN_SHARE = 0.5`; `interface Profile { moves: ReadonlyMap<ID, number>; movesFrom: ProfileSource; ability: string | null; abilityFrom: ProfileSource }`; `expectedAbility(id, snapshot: Pick<EngineSnapshot,'species'|'usage'>): string | null`; `profileOf(id, snapshot: Pick<EngineSnapshot,'species'|'moves'|'usage'>, set?: unknown): Profile`; `abilityOf(id, snapshot: Pick<EngineSnapshot,'species'|'usage'>, set?: unknown): { ability: string | null; from: ProfileSource }`; `readSets(given: unknown, roster: readonly ID[]): Record<ID, unknown>`; `setFor(sets: Record<ID, unknown> | undefined, id): unknown`; `runsMove(profile, move, minShare): boolean`.
  - `abilities.ts`: `immunityOf(id, snapshot, sets?: Record<ID, unknown>): Immunity | null` (re-exports `expectedAbility`, `EXPECTED_ABILITY_MIN_SHARE`).

- [ ] **Step 1: Edit `src/engine/types.ts` (types only; nothing uses them yet)**

Find:
```ts
import type { ID } from '../domain/id';
import type { Snapshot } from '../domain/types';
```
Replace with:
```ts
import type { ID } from '../domain/id';
import type { PokemonSet } from '../domain/set';
import type { Snapshot } from '../domain/types';
```

Find:
```ts
export type RoleSource = 'runs' | 'ability' | 'can-learn';

```
Replace with:
```ts
export type RoleSource = 'runs' | 'ability' | 'can-learn';

/** Where a profile fact came from: the user's entered set, or ladder usage and species data. */
export type ProfileSource = 'set' | 'ladder';

/** A partner combo. The combo table (`combos.ts`) says what enables each one and what benefits from it. */
export type ComboId = 'trickRoom' | 'redirectSetup' | 'rain' | 'sun' | 'sand' | 'snow' | 'electricTerrain' | 'helpingHand';

/** How a roster member's half of a combo was known: its set, ladder usage, or its species data (base Speed). */
export type ComboSource = 'set' | 'ladder' | 'species';

```

Find:
```ts
  /** Roster slots still to fill, including the one this pick will fill. */
  openSlots: number;
}
```
Replace with:
```ts
  /** Roster slots still to fill, including the one this pick will fill. */
  openSlots: number;
  /** The user's entered sets, keyed by species id (`DraftFile.sets`). Optional; malformed entries are ignored. */
  sets?: Record<ID, PokemonSet>;
}
```

Find:
```ts
  | { kind: 'fills-role'; role: RoleId; source: RoleSource; via: string }
```
Replace with:
```ts
  | { kind: 'fills-role'; role: RoleId; source: RoleSource; via: string }
  /** `side` is the candidate's side; `with` is the roster member on the other side and `from` how its half was known. */
  | { kind: 'completes-combo'; combo: ComboId; side: 'enabler' | 'beneficiary'; with: ID; from: ComboSource }
```

- [ ] **Step 2: Write the tests: create `src/engine/profile.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { speciesEntry } from '../domain/test-support';
import { abilityOf, profileOf, readSets, runsMove, setFor } from './profile';
import { typedMove, usageData, usageEntry } from './test-support';
import type { EngineSnapshot } from './types';

/**
 * `pel` has two abilities and a ladder entry: Drizzle in 80% of sets, moves Hurricane 0.6, Tailwind 0.4, Protect 0.05.
 * `solo` has one ability (Levitate) and no usage entry.
 */
const snapshot = (): EngineSnapshot => ({
  species: {
    pel: speciesEntry('pel', 'Pel', { abilities: ['Drizzle', 'Rain Dish'] }),
    solo: speciesEntry('solo', 'Solo', { abilities: ['Levitate'] }),
  },
  moves: {
    hurricane: typedMove('hurricane', 'Flying', 'Special', 110),
    tailwind: typedMove('tailwind', 'Flying', 'Status', 0),
    protect: typedMove('protect', 'Normal', 'Status', 0),
    surf: typedMove('surf', 'Water', 'Special', 90),
  },
  usage: usageData([
    usageEntry('pel', {
      moves: [['hurricane', 0.6], ['tailwind', 0.4], ['protect', 0.05]],
      abilities: [['drizzle', 0.8], ['raindish', 0.2]],
    }),
  ]),
});
const entries = (profile: ReturnType<typeof profileOf>) => [...profile.moves.entries()];

describe('profileOf: ladder', () => {
  it('reads the ladder moves and the expected ability without a set', () => {
    const profile = profileOf('pel', snapshot());
    expect(entries(profile)).toEqual([['hurricane', 0.6], ['tailwind', 0.4], ['protect', 0.05]]);
    expect(profile).toMatchObject({ movesFrom: 'ladder', ability: 'Drizzle', abilityFrom: 'ladder' });
  });

  it('has no moves without a usage entry, and the only ability of a one-ability species', () => {
    const profile = profileOf('solo', snapshot());
    expect(entries(profile)).toEqual([]);
    expect(profile).toMatchObject({ movesFrom: 'ladder', ability: 'Levitate', abilityFrom: 'ladder' });
  });

  it('keeps the largest share of a repeated ladder row and skips rows that are not [id, number] pairs', () => {
    const s = snapshot();
    (s.usage!.species.pel as unknown as Record<string, unknown>).moves = [['surf', 0.2], null, ['surf', 0.5], ['x'], ['surf', 0.3]];
    expect(entries(profileOf('pel', s))).toEqual([['surf', 0.5]]);
  });

  it('gives an empty ladder profile for an id that is not in the snapshot, including prototype names', () => {
    const empty = { movesFrom: 'ladder', ability: null, abilityFrom: 'ladder' };
    expect(profileOf('ghost', snapshot())).toMatchObject(empty);
    expect(profileOf('constructor', snapshot())).toMatchObject(empty);
    expect(profileOf('ghost', snapshot()).moves.size).toBe(0);
  });
});

describe('profileOf: sets', () => {
  it('replaces the ladder moves with the set\'s moves, at share 1, in set order', () => {
    const profile = profileOf('pel', snapshot(), { species: 'pel', moves: ['surf', 'protect'] });
    expect(entries(profile)).toEqual([['surf', 1], ['protect', 1]]);
    expect(profile.movesFrom).toBe('set');
    // The ability is untouched by a set without one.
    expect(profile).toMatchObject({ ability: 'Drizzle', abilityFrom: 'ladder' });
  });

  it('drops set moves that are not strings or not in the move table, and duplicates', () => {
    const profile = profileOf('pel', snapshot(), { moves: ['surf', 5, 'gonemove', 'surf', null, 'constructor'] });
    expect(entries(profile)).toEqual([['surf', 1]]);
  });

  it('keeps the ladder moves when no set move is usable, or the set has no moves', () => {
    for (const set of [{ moves: [] }, { moves: ['gonemove'] }, { moves: 'surf' }, {}]) {
      const profile = profileOf('pel', snapshot(), set);
      expect(profile.movesFrom, JSON.stringify(set)).toBe('ladder');
      expect(profile.moves.get('hurricane'), JSON.stringify(set)).toBe(0.6);
    }
  });

  it('takes the set\'s ability when the species can have it, matched by id and returned as the listed name', () => {
    const profile = profileOf('pel', snapshot(), { ability: 'raindish' });
    expect(profile).toMatchObject({ ability: 'Rain Dish', abilityFrom: 'set', movesFrom: 'ladder' });
    expect(profileOf('pel', snapshot(), { ability: 'Rain Dish' }).ability).toBe('Rain Dish');
  });

  it('ignores a set ability the species cannot have, or one that is not a string', () => {
    for (const ability of ['levitate', 5, null]) {
      const profile = profileOf('pel', snapshot(), { ability });
      expect(profile, String(ability)).toMatchObject({ ability: 'Drizzle', abilityFrom: 'ladder' });
    }
  });

  it('ignores a set for another species entirely, and a set that is not a plain object', () => {
    const ladder = profileOf('pel', snapshot());
    expect(profileOf('pel', snapshot(), { species: 'solo', moves: ['surf'], ability: 'raindish' })).toEqual(ladder);
    for (const set of [null, 'x', 5, ['surf']]) expect(profileOf('pel', snapshot(), set), JSON.stringify(set)).toEqual(ladder);
  });

  it('uses a set for a species with no usage entry', () => {
    const profile = profileOf('solo', snapshot(), { moves: ['surf'] });
    expect(entries(profile)).toEqual([['surf', 1]]);
    expect(profile.movesFrom).toBe('set');
  });

  it('does not modify the set or the snapshot', () => {
    const s = snapshot();
    const set = { species: 'pel', moves: ['surf', 'surf'], ability: 'raindish' };
    const before = JSON.stringify({ s, set });
    profileOf('pel', s, set);
    expect(JSON.stringify({ s, set })).toBe(before);
  });
});

describe('abilityOf', () => {
  it('follows the same rules as profileOf, without needing a move table', () => {
    const s = { species: snapshot().species, usage: snapshot().usage };
    expect(abilityOf('pel', s)).toEqual({ ability: 'Drizzle', from: 'ladder' });
    expect(abilityOf('pel', s, { ability: 'raindish' })).toEqual({ ability: 'Rain Dish', from: 'set' });
    expect(abilityOf('pel', s, { species: 'solo', ability: 'raindish' })).toEqual({ ability: 'Drizzle', from: 'ladder' });
    expect(abilityOf('ghost', s)).toEqual({ ability: null, from: 'ladder' });
  });
});

describe('readSets and setFor', () => {
  it('keeps the roster members\' entries only, as own keys', () => {
    const given = { pel: { moves: ['surf'] }, other: { moves: ['surf'] } };
    expect(readSets(given, ['pel', 'solo'])).toEqual({ pel: { moves: ['surf'] } });
  });

  it('gives {} for anything that is not a plain object', () => {
    for (const given of [undefined, null, 5, 'x', [{ moves: [] }]]) expect(readSets(given, ['pel']), JSON.stringify(given)).toEqual({});
  });

  it('does not pick up prototype names as sets', () => {
    expect(readSets({}, ['constructor', 'toString'])).toEqual({});
    expect(setFor({}, 'constructor')).toBeUndefined();
    expect(setFor(undefined, 'pel')).toBeUndefined();
    expect(setFor({ pel: 1 }, 'pel')).toBe(1);
  });
});

describe('runsMove', () => {
  it('is true at or above the share, false below it or for a move the profile does not have', () => {
    const profile = profileOf('pel', snapshot());
    expect(runsMove(profile, 'tailwind', 0.4)).toBe(true);
    expect(runsMove(profile, 'tailwind', 0.41)).toBe(false);
    expect(runsMove(profile, 'surf', 0)).toBe(false);
  });
});
```

- [ ] **Step 3: Replace `src/engine/abilities.test.ts`** (adds the "reads the ability from an entered set" test; everything else is unchanged)

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { speciesEntry } from '../domain/test-support';
import type { Snapshot } from '../domain/types';
import { EXPECTED_ABILITY_MIN_SHARE, IMMUNITY_ABILITIES, expectedAbility, immunityOf } from './abilities';
import { usageData, usageEntry } from './test-support';
import type { EngineSnapshot } from './types';

/** A snapshot of species with the given ability lists (id -> ability names) and optional usage. */
const snap = (abilities: Record<string, string[]>, usage: EngineSnapshot['usage'] = null): Pick<EngineSnapshot, 'species' | 'usage'> => ({
  species: Object.fromEntries(Object.entries(abilities).map(([id, list]) => [id, speciesEntry(id, id, { abilities: list })])),
  usage,
});

describe('expectedAbility: with ability usage', () => {
  it('takes the top-used ability at exactly 50% and refuses it at 49%', () => {
    expect(EXPECTED_ABILITY_MIN_SHARE).toBe(0.5);
    const at = (share: number) => snap({ a: ['Levitate', 'Pressure'] }, usageData([usageEntry('a', { abilities: [['levitate', share], ['pressure', 0.3]] })]));
    expect(expectedAbility('a', at(0.5))).toBe('Levitate');
    expect(expectedAbility('a', at(0.49))).toBeNull();
  });

  it('breaks a tie between top abilities by id ascending, whatever the row order', () => {
    const rows = (order: Array<[string, number]>) => snap({ a: ['Pressure', 'Levitate'] }, usageData([usageEntry('a', { abilities: order })]));
    expect(expectedAbility('a', rows([['pressure', 0.5], ['levitate', 0.5]]))).toBe('Levitate');
    expect(expectedAbility('a', rows([['levitate', 0.5], ['pressure', 0.5]]))).toBe('Levitate');
  });

  it('matches the usage id to a listed name by id ("Earth Eater" is "eartheater") and returns the listed spelling', () => {
    const s = snap({ a: ['Earth Eater', 'Static'] }, usageData([usageEntry('a', { abilities: [['eartheater', 0.9]] })]));
    expect(expectedAbility('a', s)).toBe('Earth Eater');
  });

  it('gives null when the top ability is not one of the species\' listed abilities, and does not fall back to a single listed ability', () => {
    const s = snap({ a: ['Pressure'] }, usageData([usageEntry('a', { abilities: [['levitate', 0.9]] })]));
    expect(expectedAbility('a', s)).toBeNull();
  });

  it('uses the single-ability rule when the usage entry has no ability rows', () => {
    const one = snap({ a: ['Pressure'] }, usageData([usageEntry('a', { abilities: [] })]));
    const two = snap({ a: ['Pressure', 'Levitate'] }, usageData([usageEntry('a', { abilities: [] })]));
    expect(expectedAbility('a', one)).toBe('Pressure');
    expect(expectedAbility('a', two)).toBeNull();
  });
});

describe('expectedAbility: without ability usage', () => {
  it('is the only ability of a single-ability species, with or without usage data', () => {
    expect(expectedAbility('a', snap({ a: ['Levitate'] }))).toBe('Levitate');
    expect(expectedAbility('a', snap({ a: ['Levitate'] }, usageData([usageEntry('other')])))).toBe('Levitate');
  });

  it('is null for a multi-ability species and for a species with no abilities', () => {
    expect(expectedAbility('a', snap({ a: ['Levitate', 'Pressure'] }))).toBeNull();
    expect(expectedAbility('a', snap({ a: [] }))).toBeNull();
  });

  it('is null for an id that is not in the snapshot, including names on the prototype', () => {
    const s = snap({ a: ['Levitate'] });
    expect(expectedAbility('ghost', s)).toBeNull();
    expect(expectedAbility('constructor', s)).toBeNull();
  });

  it('does not throw on a species whose abilities are not a list of strings', () => {
    const s = snap({ a: ['Levitate'] });
    (s.species.a as unknown as Record<string, unknown>).abilities = 'Levitate';
    expect(expectedAbility('a', s)).toBeNull();
    (s.species.a as unknown as Record<string, unknown>).abilities = [5, 'Levitate'];
    expect(expectedAbility('a', s)).toBe('Levitate');
  });
});

describe('immunityOf', () => {
  it('maps each table ability to its type, for a species whose only ability it is', () => {
    const expected: Record<string, string> = {
      Levitate: 'Ground',
      'Earth Eater': 'Ground',
      'Flash Fire': 'Fire',
      'Water Absorb': 'Water',
      'Dry Skin': 'Water',
      'Volt Absorb': 'Electric',
      'Lightning Rod': 'Electric',
      'Motor Drive': 'Electric',
      'Sap Sipper': 'Grass',
    };
    expect(IMMUNITY_ABILITIES).toEqual(expected);
    for (const [ability, type] of Object.entries(expected)) {
      expect(immunityOf('a', snap({ a: [ability] })), ability).toEqual({ type, ability });
    }
  });

  it('is null for an ability outside the table, and for an ability that is available but not the expected one', () => {
    expect(immunityOf('a', snap({ a: ['Intimidate'] }))).toBeNull();
    // Levitate is listed, but the species runs Pressure in 90% of sets.
    const s = snap({ a: ['Levitate', 'Pressure'] }, usageData([usageEntry('a', { abilities: [['pressure', 0.9], ['levitate', 0.1]] })]));
    expect(immunityOf('a', s)).toBeNull();
    // Without usage a two-ability species has no expected ability.
    expect(immunityOf('a', snap({ a: ['Levitate', 'Pressure'] }))).toBeNull();
    expect(immunityOf('ghost', snap({ a: ['Levitate'] }))).toBeNull();
  });

  it('follows the usage data: the same species is immune or not depending on its top ability', () => {
    const list = ['Levitate', 'Pressure'];
    const levitating = snap({ a: list }, usageData([usageEntry('a', { abilities: [['levitate', 0.8], ['pressure', 0.2]] })]));
    expect(immunityOf('a', levitating)).toEqual({ type: 'Ground', ability: 'Levitate' });
  });

  it('reads the ability from an entered set when the species can have it', () => {
    // Two abilities and no usage: no expected ability, so no immunity, until a set names Levitate.
    const s = snap({ a: ['Levitate', 'Pressure'] });
    expect(immunityOf('a', s)).toBeNull();
    expect(immunityOf('a', s, { a: { ability: 'levitate' } })).toEqual({ type: 'Ground', ability: 'Levitate' });
    // A set ability outside the table overrides an expected immunity ability.
    const one = snap({ b: ['Levitate'] });
    expect(immunityOf('b', one, { b: { ability: 'Intimidate' } })).toEqual({ type: 'Ground', ability: 'Levitate' }); // not listed: ignored
    const both = snap({ c: ['Levitate', 'Pressure'] }, usageData([usageEntry('c', { abilities: [['levitate', 0.9]] })]));
    expect(immunityOf('c', both, { c: { ability: 'pressure' } })).toBeNull();
    // A set for another species, or an empty table, changes nothing.
    expect(immunityOf('a', s, { other: { ability: 'levitate' } })).toBeNull();
    expect(immunityOf('c', both, {})).toEqual({ type: 'Ground', ability: 'Levitate' });
  });

  it('does not treat names on the prototype as table abilities', () => {
    expect(immunityOf('a', snap({ a: ['constructor'] }))).toBeNull();
    expect(immunityOf('a', snap({ a: ['toString'] }))).toBeNull();
  });
});

describe('the immunity table on the real snapshot', () => {
  const snapshot = JSON.parse(
    readFileSync(new URL('../../data/gen9championsvgc2026regmb/snapshot.json', import.meta.url), 'utf8'),
  ) as Snapshot;
  const legal = Object.values(snapshot.species);

  it('lists only abilities that some legal species can have', () => {
    for (const ability of Object.keys(IMMUNITY_ABILITIES)) {
      expect(legal.filter((entry) => entry.abilities.includes(ability)).length, ability).toBeGreaterThanOrEqual(1);
    }
  });

  it('gives Rotom-Wash a Levitate immunity and Incineroar none', () => {
    expect(immunityOf('rotomwash', snapshot)).toEqual({ type: 'Ground', ability: 'Levitate' });
    expect(immunityOf('incineroar', snapshot)).toBeNull();
  });

  it('finds an expected ability for most species with usage data, and an immunity for a handful', () => {
    const withUsage = Object.keys(snapshot.usage?.species ?? {});
    const expected = withUsage.filter((id) => expectedAbility(id, snapshot) !== null).length;
    const immune = Object.keys(snapshot.species).filter((id) => immunityOf(id, snapshot) !== null).length;
    expect(expected).toBeGreaterThanOrEqual(150); // 220 of 223 when this was written
    expect(immune).toBeGreaterThanOrEqual(12); // 22 when this was written
    expect(immune).toBeLessThanOrEqual(40);
  });
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run src/engine/profile.test.ts src/engine/abilities.test.ts`
Expected: FAIL (`profile.ts` does not exist; `immunityOf` ignores its third argument).

- [ ] **Step 5: Create `src/engine/profile.ts`**

```ts
import { toID, type ID } from '../domain/id';
import { compareIds } from './math';
import type { EngineSnapshot, ProfileSource } from './types';

/** A species' expected ability is its top-used ability, but only when at least this share of its sets run it. */
export const EXPECTED_ABILITY_MIN_SHARE = 0.5;

/** What a species runs: from the user's entered set where it has one, otherwise from ladder usage. */
export interface Profile {
  /** Move id -> share of sets. A move from an entered set has share 1. */
  moves: ReadonlyMap<ID, number>;
  movesFrom: ProfileSource;
  /** An ability display name from `species.abilities`, or null. */
  ability: string | null;
  abilityFrom: ProfileSource;
}

type ProfileSnapshot = Pick<EngineSnapshot, 'species' | 'moves' | 'usage'>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The species' listed ability names; anything that is not a string is skipped. */
function listedAbilities(id: ID, snapshot: Pick<EngineSnapshot, 'species'>): string[] {
  const listed: unknown = snapshot.species[id].abilities;
  return Array.isArray(listed) ? listed.filter((name): name is string => typeof name === 'string') : [];
}

/**
 * The ability a species most likely has, as its display name from `species.abilities`. With ability usage data it is the
 * most-used ability (ties by id ascending) when at least `EXPECTED_ABILITY_MIN_SHARE` of sets run it and it is one of the
 * species' listed abilities; otherwise null. Without a usage entry, or without ability usage, it is the species' only
 * ability when it has exactly one, else null. An id that is not in the snapshot gives null.
 */
export function expectedAbility(id: ID, snapshot: Pick<EngineSnapshot, 'species' | 'usage'>): string | null {
  if (!Object.hasOwn(snapshot.species, id)) return null;
  const names = listedAbilities(id, snapshot);

  const usage = snapshot.usage;
  if (usage !== null && Object.hasOwn(usage.species, id) && usage.species[id].abilities.length > 0) {
    let best: [ID, number] | null = null;
    for (const row of usage.species[id].abilities) {
      if (best === null || row[1] > best[1] || (row[1] === best[1] && compareIds(row[0], best[0]) < 0)) best = row;
    }
    if (best === null || best[1] < EXPECTED_ABILITY_MIN_SHARE) return null;
    const topId = best[0];
    return names.find((name) => toID(name) === topId) ?? null;
  }
  return names.length === 1 ? names[0] : null;
}

/**
 * The ladder moves as id -> share: the usage entry's rows that are `[id, number]` pairs (a repeated id keeps its largest
 * share). Empty without an entry.
 */
function ladderMoves(id: ID, snapshot: Pick<EngineSnapshot, 'usage'>): Map<ID, number> {
  const moves = new Map<ID, number>();
  const usage = snapshot.usage;
  if (usage === null || !Object.hasOwn(usage.species, id)) return moves;
  const rows: unknown = usage.species[id].moves;
  if (!Array.isArray(rows)) return moves;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2 || typeof row[0] !== 'string' || typeof row[1] !== 'number') continue;
    const known = moves.get(row[0]);
    if (known === undefined || row[1] > known) moves.set(row[0], row[1]);
  }
  return moves;
}

/**
 * What a species runs. `set` is the user's entered set for it, if any (read defensively; only the fields that are usable
 * count). Moves: the set's string moves that are in the move table (no duplicates, set order) at share 1 when there is at
 * least one, else the ladder moves. Ability: the set's ability when its id matches one of the species' listed abilities
 * (returned as the listed name), else the expected ability. A set whose `species` is a string other than `id` is ignored.
 * An id that is not in the snapshot gives an empty ladder profile.
 */
export function profileOf(id: ID, snapshot: ProfileSnapshot, set?: unknown): Profile {
  const empty: Profile = { moves: new Map(), movesFrom: 'ladder', ability: null, abilityFrom: 'ladder' };
  if (!Object.hasOwn(snapshot.species, id)) return empty;

  const usable = isRecord(set) && !(typeof set.species === 'string' && set.species !== id) ? set : null;

  let moves: Map<ID, number> | null = null;
  if (usable !== null && Array.isArray(usable.moves)) {
    const chosen = new Map<ID, number>();
    for (const move of usable.moves) {
      if (typeof move === 'string' && Object.hasOwn(snapshot.moves, move)) chosen.set(move, 1);
    }
    if (chosen.size > 0) moves = chosen;
  }

  const { ability, from } = abilityOf(id, snapshot, usable);
  return {
    moves: moves ?? ladderMoves(id, snapshot),
    movesFrom: moves === null ? 'ladder' : 'set',
    ability,
    abilityFrom: from,
  };
}

/**
 * The ability half of `profileOf`, for callers that have no move table: the set's ability when its id matches one of the
 * species' listed abilities (as the listed name), else the expected ability. Same rules for `set` as `profileOf`.
 */
export function abilityOf(
  id: ID,
  snapshot: Pick<EngineSnapshot, 'species' | 'usage'>,
  set?: unknown,
): { ability: string | null; from: ProfileSource } {
  if (!Object.hasOwn(snapshot.species, id)) return { ability: null, from: 'ladder' };
  if (isRecord(set) && !(typeof set.species === 'string' && set.species !== id) && typeof set.ability === 'string') {
    const wanted = toID(set.ability);
    const listed = listedAbilities(id, snapshot).find((name) => toID(name) === wanted);
    if (listed !== undefined) return { ability: listed, from: 'set' };
  }
  return { ability: expectedAbility(id, snapshot), from: 'ladder' };
}

/**
 * The roster members' entries of `given` (own keys only) when `given` is a plain object; anything else gives `{}`.
 * Entries for species that are not on the roster are dropped. The entries themselves are not checked here: `profileOf`
 * reads them defensively.
 */
export function readSets(given: unknown, roster: readonly ID[]): Record<ID, unknown> {
  if (!isRecord(given)) return {};
  return Object.fromEntries(roster.filter((id) => Object.hasOwn(given, id)).map((id) => [id, given[id]]));
}

/** The entry for `id` in a `readSets` result, or undefined (own keys only). */
export function setFor(sets: Record<ID, unknown> | undefined, id: ID): unknown {
  return sets !== undefined && Object.hasOwn(sets, id) ? sets[id] : undefined;
}

/** True when the profile runs `move`: its share is at least `minShare` (a set move, share 1, always is). */
export function runsMove(profile: Profile, move: ID, minShare: number): boolean {
  const share = profile.moves.get(move);
  return share !== undefined && share >= minShare;
}
```

- [ ] **Step 6: Replace `src/engine/abilities.ts`**

```ts
import type { ID } from '../domain/id';
import { abilityOf, setFor } from './profile';
import type { TypeName } from './typechart';
import type { EngineSnapshot } from './types';

// `expectedAbility` moved to `profile.ts` (profiles need it, and this module needs profiles); re-exported for callers.
export { EXPECTED_ABILITY_MIN_SHARE, expectedAbility } from './profile';

/** Abilities that make the holder immune to a type, by ability name. Partial resistances (Thick Fat, Fluffy, ...) are not listed. */
export const IMMUNITY_ABILITIES: Readonly<Record<string, TypeName>> = {
  Levitate: 'Ground',
  'Earth Eater': 'Ground',
  'Flash Fire': 'Fire',
  'Water Absorb': 'Water',
  'Dry Skin': 'Water',
  'Volt Absorb': 'Electric',
  'Lightning Rod': 'Electric',
  'Motor Drive': 'Electric',
  'Sap Sipper': 'Grass',
};

export interface Immunity {
  type: TypeName;
  ability: string;
}

/**
 * The type a species is immune to through its ability, with that ability's name; null when it has none. The ability is
 * the one in `sets[id]` when that set names one the species can have, otherwise the expected ability.
 */
export function immunityOf(id: ID, snapshot: Pick<EngineSnapshot, 'species' | 'usage'>, sets?: Record<ID, unknown>): Immunity | null {
  const { ability } = abilityOf(id, snapshot, setFor(sets, id));
  if (ability === null || !Object.hasOwn(IMMUNITY_ABILITIES, ability)) return null;
  return { type: IMMUNITY_ABILITIES[ability], ability };
}
```

- [ ] **Step 7: Run the tests, the suite and the typecheck**

Run: `npx vitest run src/engine/profile.test.ts src/engine/abilities.test.ts` then `npm test` then `npm run typecheck`
Expected: PASS; the whole suite passes (584 tests) and the typecheck is clean.

- [ ] **Step 8: Commit**

```bash
git add src/engine/types.ts src/engine/profile.ts src/engine/profile.test.ts src/engine/abilities.ts src/engine/abilities.test.ts
git commit -m "feat(engine): read a species through its entered set or ladder usage (profiles)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The stage 2 rules read profiles

**Files:**
- Modify: `src/engine/types.ts` (`fills-role` gains `from`), `src/engine/roles.ts`, `src/engine/role-signal.ts`, `src/engine/type-signal.ts`
- Test: `src/engine/roles.test.ts`, `src/engine/role-signal.test.ts`, `src/engine/type-signal.test.ts`

**Interfaces:**
- Consumes (Task 1): `profileOf`, `setFor`, `Profile`, `immunityOf(id, snapshot, sets?)`, `ProfileSource`.
- Produces:
  - `RoleTag` gains `from: ProfileSource`; `speciesRoles(id, snapshot: Pick<EngineSnapshot,'species'|'moves'|'usage'|'learnsets'>, sets?: Record<ID, unknown>): RoleTag[]`; `rosterLacks(roster, snapshot, sets?): RoleId[]`.
  - `roleSignal(roster, candidate, snapshot: Pick<EngineSnapshot,'species'|'moves'|'usage'|'learnsets'>, lacked)`: unchanged signature except the snapshot type now includes `moves`; its `fills-role` reasons carry `from`.
  - `attackingTypes(id, snapshot, sets?)`; `typeSignal(roster, candidate, snapshot, sets?)` (roster side only).

- [ ] **Step 1: Edit `src/engine/types.ts`**

Find:
```ts
  /** `via` is the move id (`runs`, `can-learn`) or the ability name (`ability`). */
  | { kind: 'fills-role'; role: RoleId; source: RoleSource; via: string }
```
Replace with:
```ts
  /** `via` is the move id (`runs`, `can-learn`) or the ability name (`ability`); `from` is where that fact came from. */
  | { kind: 'fills-role'; role: RoleId; source: RoleSource; via: string; from: ProfileSource }
```

- [ ] **Step 2: Replace the three test files**

`src/engine/roles.test.ts` (every expected tag gains `from: 'ladder'`, and a new "entered sets" block is added):

```ts
import { describe, expect, it } from 'vitest';
import { CAN_LEARN_FACTOR, ROLES, RUN_MIN_SHARE, rosterLacks, speciesRoles } from './roles';
import { roleSnapshot, typedMove } from './test-support';
import type { RoleId } from './types';

const ALL_ROLES: RoleId[] = [
  'fakeOut', 'redirection', 'speedControl', 'intimidate', 'weatherTerrain', 'pivot', 'screens', 'support', 'priority', 'disruption',
];

describe('the role table', () => {
  it('has the ten roles in order, with their importance', () => {
    expect(ROLES.map((role) => role.id)).toEqual(ALL_ROLES);
    expect(ROLES.map((role) => role.importance)).toEqual([1, 1, 1, 0.75, 0.75, 0.5, 0.5, 0.5, 0.5, 0.5]);
    expect(RUN_MIN_SHARE).toBe(0.1);
    expect(CAN_LEARN_FACTOR).toBe(0.5);
  });

  it('gives every role a move or an ability, and only signature moves that are among its moves', () => {
    for (const role of ROLES) {
      expect(role.moves.length + role.abilities.length, role.id).toBeGreaterThan(0);
      for (const move of role.signatureMoves) expect(role.moves, `${role.id} ${move}`).toContain(move);
      expect(new Set(role.moves).size, role.id).toBe(role.moves.length);
    }
    const byId = Object.fromEntries(ROLES.map((role) => [role.id, role]));
    expect(byId.speedControl.moves).toEqual(['tailwind', 'trickroom', 'icywind', 'electroweb']);
    expect(byId.speedControl.signatureMoves).toEqual(['tailwind', 'trickroom']);
    expect(byId.intimidate.abilities).toEqual(['Intimidate']);
    expect(byId.weatherTerrain.abilities).toEqual(['Drought', 'Drizzle', 'Sand Stream', 'Snow Warning', 'Electric Surge']);
    expect(byId.fakeOut.signatureMoves).toEqual(['fakeout']);
    expect(byId.support.signatureMoves).toEqual([]);
  });
});

describe('speciesRoles: runs', () => {
  it('tags a role move at 10% of sets and not at 9%', () => {
    const s = roleSnapshot({
      at: { usage: { moves: [['fakeout', 0.1]] } },
      below: { usage: { moves: [['fakeout', 0.09]] } },
    });
    expect(speciesRoles('at', s)).toEqual([{ role: 'fakeOut', source: 'runs', via: 'fakeout', from: 'ladder' }]);
    expect(speciesRoles('below', s)).toEqual([]);
  });

  it('names the most-run move of the role, and breaks a tie by id ascending', () => {
    const s = roleSnapshot({
      top: { usage: { moves: [['tailwind', 0.2], ['trickroom', 0.5], ['icywind', 0.05]] } },
      tie: { usage: { moves: [['trickroom', 0.3], ['tailwind', 0.3]] } },
      tieReversed: { usage: { moves: [['tailwind', 0.3], ['trickroom', 0.3]] } },
    });
    expect(speciesRoles('top', s)).toEqual([{ role: 'speedControl', source: 'runs', via: 'trickroom', from: 'ladder' }]);
    expect(speciesRoles('tie', s)).toEqual([{ role: 'speedControl', source: 'runs', via: 'tailwind', from: 'ladder' }]);
    expect(speciesRoles('tieReversed', s)).toEqual([{ role: 'speedControl', source: 'runs', via: 'tailwind', from: 'ladder' }]);
  });

  it('gives one tag per role, in table order, whatever the order of the usage rows', () => {
    const s = roleSnapshot({
      a: {
        abilities: ['Intimidate', 'Blaze'],
        usage: {
          moves: [['suckerpunch', 0.4], ['fakeout', 0.9], ['tailwind', 0.2], ['icywind', 0.15], ['gonemove', 0.9]],
          abilities: [['intimidate', 0.8], ['blaze', 0.2]],
        },
      },
    });
    expect(speciesRoles('a', s)).toEqual([
      { role: 'fakeOut', source: 'runs', via: 'fakeout', from: 'ladder' },
      { role: 'speedControl', source: 'runs', via: 'tailwind', from: 'ladder' },
      { role: 'intimidate', source: 'ability', via: 'Intimidate', from: 'ladder' },
      { role: 'priority', source: 'runs', via: 'suckerpunch', from: 'ladder' },
    ]);
  });
});

describe('speciesRoles: ability', () => {
  it('tags a role ability when it is the expected ability, not when it is merely available', () => {
    const s = roleSnapshot({
      likely: { abilities: ['Intimidate', 'Blaze'], usage: { abilities: [['intimidate', 0.8], ['blaze', 0.2]] } },
      unlikely: { abilities: ['Intimidate', 'Blaze'], usage: { abilities: [['intimidate', 0.4], ['blaze', 0.6]] } },
      unused: { abilities: ['Intimidate', 'Blaze'], usage: { abilities: [['intimidate', 0.3], ['blaze', 0.3]] } },
    });
    expect(speciesRoles('likely', s)).toEqual([{ role: 'intimidate', source: 'ability', via: 'Intimidate', from: 'ladder' }]);
    expect(speciesRoles('unlikely', s)).toEqual([]);
    expect(speciesRoles('unused', s)).toEqual([]);
  });

  it('tags the only ability of a species that has no usage entry', () => {
    const s = roleSnapshot({ ninetails: { abilities: ['Drought'] }, other: { abilities: ['Drought', 'Blaze'] } });
    expect(speciesRoles('ninetails', s)).toEqual([{ role: 'weatherTerrain', source: 'ability', via: 'Drought', from: 'ladder' }]);
    expect(speciesRoles('other', s)).toEqual([]);
  });
});

describe('speciesRoles: can-learn', () => {
  it('tags a signature move for a species with no usage entry, naming the first signature move in table order', () => {
    const s = roleSnapshot({
      a: { learnset: ['tackle', 'fakeout', 'trickroom'] },
      b: { learnset: ['ragepowder', 'followme'] },
    });
    expect(speciesRoles('a', s)).toEqual([
      { role: 'fakeOut', source: 'can-learn', via: 'fakeout', from: 'ladder' },
      { role: 'speedControl', source: 'can-learn', via: 'trickroom', from: 'ladder' },
    ]);
    expect(speciesRoles('b', s)).toEqual([{ role: 'redirection', source: 'can-learn', via: 'followme', from: 'ladder' }]);
  });

  it('never tags a species that has a usage entry for a role it merely can learn', () => {
    const s = roleSnapshot({
      none: { usage: {}, learnset: ['fakeout'] },
      rare: { usage: { moves: [['fakeout', 0.05]] }, learnset: ['fakeout'] },
    });
    expect(speciesRoles('none', s)).toEqual([]);
    expect(speciesRoles('rare', s)).toEqual([]);
  });

  it('ignores learnable moves that are not signature moves, and gives nothing without learnsets', () => {
    const s = roleSnapshot({ a: { learnset: ['helpinghand', 'suckerpunch', 'icywind', 'uturn'] }, b: { learnset: ['fakeout'] } });
    expect(speciesRoles('a', s)).toEqual([]);
    const withoutLearnsets = { species: s.species, moves: s.moves, usage: s.usage };
    expect(speciesRoles('b', withoutLearnsets)).toEqual([]);
  });

  it('credits every species with no usage entry when there is no usage data at all', () => {
    const s = roleSnapshot({ a: { learnset: ['fakeout'] } }, false);
    expect(s.usage).toBeNull();
    expect(speciesRoles('a', s)).toEqual([{ role: 'fakeOut', source: 'can-learn', via: 'fakeout', from: 'ladder' }]);
  });
});

describe('speciesRoles and rosterLacks: entered sets', () => {
  /** `lead` runs Fake Out on 90% of ladder sets and has Intimidate as its expected ability; the move table has the set moves. */
  const withMoves = () => {
    const s = roleSnapshot({
      lead: { abilities: ['Intimidate', 'Blaze'], usage: { moves: [['fakeout', 0.9]], abilities: [['intimidate', 0.9]] } },
      learner: { learnset: ['fakeout'] },
    });
    s.moves = {
      fakeout: typedMove('fakeout', 'Normal', 'Physical', 40),
      tailwind: typedMove('tailwind', 'Flying', 'Status', 0),
      flareblitz: typedMove('flareblitz', 'Fire', 'Physical', 120),
    };
    return s;
  };

  it('reads the set\'s moves instead of the ladder\'s, and says so', () => {
    const sets = { lead: { moves: ['flareblitz', 'tailwind'] } };
    expect(speciesRoles('lead', withMoves(), sets)).toEqual([
      { role: 'speedControl', source: 'runs', via: 'tailwind', from: 'set' },
      { role: 'intimidate', source: 'ability', via: 'Intimidate', from: 'ladder' },
    ]);
  });

  it('reads the set\'s ability instead of the expected one', () => {
    const sets = { lead: { ability: 'blaze' } };
    expect(speciesRoles('lead', withMoves(), sets)).toEqual([{ role: 'fakeOut', source: 'runs', via: 'fakeout', from: 'ladder' }]);
  });

  it('never credits can-learn to a species whose set gives its moves', () => {
    expect(speciesRoles('learner', withMoves())).toEqual([{ role: 'fakeOut', source: 'can-learn', via: 'fakeout', from: 'ladder' }]);
    expect(speciesRoles('learner', withMoves(), { learner: { moves: ['flareblitz'] } })).toEqual([]);
  });

  it('makes a role lacked again when the set drops it (a lead without Fake Out)', () => {
    const s = withMoves();
    expect(rosterLacks(['lead'], s)).not.toContain('fakeOut');
    expect(rosterLacks(['lead'], s, { lead: { moves: ['flareblitz'] } })).toContain('fakeOut');
  });

  it('changes nothing with an empty set table, a set for another species, or a set with no usable field', () => {
    const s = withMoves();
    const ladder = speciesRoles('lead', s);
    expect(speciesRoles('lead', s, {})).toEqual(ladder);
    expect(speciesRoles('lead', s, { learner: { moves: ['tailwind'] } })).toEqual(ladder);
    expect(speciesRoles('lead', s, { lead: { moves: ['gonemove'], ability: 'levitate' } })).toEqual(ladder);
    expect(speciesRoles('lead', s, { lead: { species: 'learner', moves: ['tailwind'] } })).toEqual(ladder);
  });
});

describe('speciesRoles: malformed input (it is exported and callable on a raw, unsanitized snapshot)', () => {
  it('never throws when a usage entry\'s moves is not an array of pairs, or a learnset is not an array', () => {
    const s = roleSnapshot({ a: { usage: { moves: [['fakeout', 0.6]] } } });
    (s.usage!.species.a as unknown as Record<string, unknown>).moves = 'fakeout';
    expect(() => speciesRoles('a', s)).not.toThrow();
    expect(speciesRoles('a', s)).toEqual([]);
    (s.usage!.species.a as unknown as Record<string, unknown>).moves = [null, 5, ['fakeout']];
    expect(() => speciesRoles('a', s)).not.toThrow();
    expect(speciesRoles('a', s)).toEqual([]); // no row is a valid [id, number] pair
    const b = roleSnapshot({ b: { learnset: ['fakeout'] } });
    (b as unknown as Record<string, unknown>).learnsets = { b: 'fakeout' };
    expect(() => speciesRoles('b', b)).not.toThrow();
    expect(speciesRoles('b', b)).toEqual([]);
  });
});

describe('speciesRoles: unknown species', () => {
  it('has no tags for an id that is not in the snapshot, including names on the prototype', () => {
    const s = roleSnapshot({ a: { learnset: ['fakeout'] } });
    expect(speciesRoles('ghost', s)).toEqual([]);
    expect(speciesRoles('constructor', s)).toEqual([]);
    expect(speciesRoles('__proto__', s)).toEqual([]);
  });
});

describe('rosterLacks', () => {
  const s = roleSnapshot({
    lead: { abilities: ['Intimidate', 'Blaze'], usage: { moves: [['fakeout', 0.6]], abilities: [['intimidate', 0.9]] } },
    fast: { usage: { moves: [['tailwind', 0.7]] } },
    learner: { learnset: ['fakeout', 'followme'] },
  });

  it('is every role, in table order, for an empty roster', () => {
    expect(rosterLacks([], s)).toEqual(ALL_ROLES);
  });

  it('drops the roles the roster covers by a move it runs or its expected ability', () => {
    expect(rosterLacks(['lead', 'fast'], s)).toEqual(['redirection', 'weatherTerrain', 'pivot', 'screens', 'support', 'priority', 'disruption']);
    expect(rosterLacks(['lead'], s)).toEqual(ALL_ROLES.filter((role) => role !== 'fakeOut' && role !== 'intimidate'));
  });

  it('does not let a can-learn tag cover a role', () => {
    // The learner really has can-learn tags for Fake Out and redirection ...
    expect(speciesRoles('learner', s).map((tag) => tag.source)).toEqual(['can-learn', 'can-learn']);
    // ... and they do not count.
    expect(rosterLacks(['learner'], s)).toEqual(ALL_ROLES);
  });

  it('ignores roster ids that are not in the snapshot, and does not depend on roster order', () => {
    expect(rosterLacks(['ghost'], s)).toEqual(ALL_ROLES);
    expect(rosterLacks(['ghost', 'lead', 'fast'], s)).toEqual(rosterLacks(['lead', 'fast'], s));
    expect(rosterLacks(['fast', 'lead'], s)).toEqual(rosterLacks(['lead', 'fast'], s));
  });

  it('does not modify the roster', () => {
    const roster = ['fast', 'lead'];
    rosterLacks(roster, s);
    expect(roster).toEqual(['fast', 'lead']);
  });
});
```

`src/engine/role-signal.test.ts` (every expected `fills-role` reason gains `from: 'ladder'`):

```ts
import { describe, expect, it } from 'vitest';
import { roleSignal } from './role-signal';
import { rosterLacks } from './roles';
import { roleSnapshot } from './test-support';

/**
 * The roster member `dra1` runs Fake Out (60% of sets), so the roster covers only that role and lacks the other nine:
 * redirection 1, speed control 1, Intimidate 0.75, weather and terrain 0.75, pivot, screens, support, priority and
 * disruption 0.5 each = 6.0 in total. A candidate's score is what it earns of that 6.0.
 */
const s = roleSnapshot({
  dra1: { usage: { moves: [['fakeout', 0.6]] } },
  // Tailwind (speed control, 1) + Will-O-Wisp (disruption, 0.5) = 1.5 of 6; its Fake Out covers nothing new.
  c1: { usage: { moves: [['tailwind', 0.5], ['willowisp', 0.4], ['fakeout', 0.5]] } },
  // No usage entry, can learn Follow Me and Tailwind: half of (1 + 1) = 1 of 6.
  c2: { learnset: ['followme', 'tailwind'] },
  // Tailwind 1 + Rage Powder 1 + U-turn 0.5 + Sucker Punch 0.5 + Will-O-Wisp 0.5 = 3.5 of 6.
  c3: { usage: { moves: [['tailwind', 0.5], ['ragepowder', 0.4], ['uturn', 0.3], ['suckerpunch', 0.3], ['willowisp', 0.2]] } },
  // Only Fake Out, which the roster already has: 0 of 6.
  c4: { usage: { moves: [['fakeout', 0.7]] } },
  // Its only ability is Drizzle (weather and terrain, 0.75): 0.75 of 6.
  c5: { abilities: ['Drizzle'] },
});
const roster = ['dra1'];
/** The caller computes `rosterLacks` once per `suggest()` call and passes it to every candidate; the tests do the same. */
const lacked = rosterLacks(roster, s);

describe('roleSignal', () => {
  it('scores what the candidate earns of the importance the roster lacks', () => {
    expect(roleSignal(roster, 'c1', s, lacked).score).toBeCloseTo(1.5 / 6, 9);
    expect(roleSignal(roster, 'c3', s, lacked).score).toBeCloseTo(3.5 / 6, 9);
    expect(roleSignal(roster, 'c5', s, lacked).score).toBeCloseTo(0.75 / 6, 9);
  });

  it('counts a can-learn role at half its importance', () => {
    const result = roleSignal(roster, 'c2', s, lacked);
    expect(result.score).toBeCloseTo(1 / 6, 9);
    expect(result.reasons).toEqual([
      { kind: 'fills-role', role: 'redirection', source: 'can-learn', via: 'followme', from: 'ladder' },
      { kind: 'fills-role', role: 'speedControl', source: 'can-learn', via: 'tailwind', from: 'ladder' },
    ]);
  });

  it('gives 0, not no data, to a candidate that fills nothing the roster lacks, and no reasons', () => {
    expect(roleSignal(roster, 'c4', s, lacked)).toEqual({ score: 0, reasons: [] });
  });

  it('lists only the roles the roster lacks: c1\'s Fake Out is not a reason', () => {
    expect(roleSignal(roster, 'c1', s, lacked).reasons).toEqual([
      { kind: 'fills-role', role: 'speedControl', source: 'runs', via: 'tailwind', from: 'ladder' },
      { kind: 'fills-role', role: 'disruption', source: 'runs', via: 'willowisp', from: 'ladder' },
    ]);
  });

  it('lists at most three reasons, most important first and then by role id', () => {
    // c3 fills five roles. redirection and speed control (importance 1) come first, by id; then the importance-0.5 roles by id:
    // disruption, pivot, priority. Only disruption fits under the cap of 3.
    expect(roleSignal(roster, 'c3', s, lacked).reasons).toEqual([
      { kind: 'fills-role', role: 'redirection', source: 'runs', via: 'ragepowder', from: 'ladder' },
      { kind: 'fills-role', role: 'speedControl', source: 'runs', via: 'tailwind', from: 'ladder' },
      { kind: 'fills-role', role: 'disruption', source: 'runs', via: 'willowisp', from: 'ladder' },
    ]);
  });

  it('names the ability behind an ability tag', () => {
    expect(roleSignal(roster, 'c5', s, lacked).reasons).toEqual([{ kind: 'fills-role', role: 'weatherTerrain', source: 'ability', via: 'Drizzle', from: 'ladder' }]);
  });

  it('does not let a roster member\'s can-learn tag cover a role: the roster then lacks all ten roles (importance 7)', () => {
    const learnerRoster = roleSnapshot({
      learner: { learnset: ['fakeout'] },
      runner: { usage: { moves: [['fakeout', 0.5]] } },
    });
    const learnerLacked = rosterLacks(['learner'], learnerRoster);
    expect(learnerLacked).toHaveLength(10);
    // The roster lacks all ten roles (total 7); the runner earns Fake Out's 1: 1 / 7.
    expect(roleSignal(['learner'], 'runner', learnerRoster, learnerLacked).score).toBeCloseTo(1 / 7, 9);
  });

  it('has no data when the roster lacks nothing (an empty `lacked`), regardless of what rosterLacks itself would say', () => {
    const covered = roleSnapshot({
      movers: {
        usage: {
          moves: [['fakeout', 0.5], ['followme', 0.5], ['tailwind', 0.5], ['uturn', 0.5], ['reflect', 0.5], ['helpinghand', 0.5], ['suckerpunch', 0.5], ['encore', 0.5]],
        },
      },
      intimidator: { abilities: ['Intimidate'], usage: {} },
      setter: { abilities: ['Drought'], usage: {} },
      candidate: { usage: { moves: [['fakeout', 0.5]] } },
    });
    const fullRoster = ['movers', 'intimidator', 'setter'];
    expect(rosterLacks(fullRoster, covered)).toEqual([]);
    expect(roleSignal(fullRoster, 'candidate', covered, rosterLacks(fullRoster, covered))).toEqual({ score: null, reasons: [] });
    // Take the weather setter away and the signal comes back, so the null above is about `lacked` and nothing else.
    const partialRoster = ['movers', 'intimidator'];
    expect(roleSignal(partialRoster, 'candidate', covered, rosterLacks(partialRoster, covered)).score).toBe(0);
  });

  it('has no data for a roster with no member in the snapshot, or for an unknown candidate, whatever `lacked` says', () => {
    expect(roleSignal(['ghost'], 'c1', s, lacked)).toEqual({ score: null, reasons: [] });
    expect(roleSignal([], 'c1', s, lacked)).toEqual({ score: null, reasons: [] });
    expect(roleSignal(roster, 'ghost', s, lacked)).toEqual({ score: null, reasons: [] });
    expect(roleSignal(roster, 'constructor', s, lacked)).toEqual({ score: null, reasons: [] });
    expect(roleSignal(['ghost', 'dra1'], 'c1', s, lacked)).toEqual(roleSignal(roster, 'c1', s, lacked));
  });

  it('does not modify its inputs and gives the same answer twice', () => {
    const before = JSON.stringify({ s, roster, lacked });
    const first = roleSignal(roster, 'c3', s, lacked);
    expect(roleSignal(roster, 'c3', s, lacked)).toEqual(first);
    expect(JSON.stringify({ s, roster, lacked })).toBe(before);
  });
});
```

`src/engine/type-signal.test.ts` (adds "takes a roster member's move types from its entered set" and "reads a roster member's immunity from its entered set"):

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

  it('lets a resisting member cancel a weak member before deciding whether the roster is exposed', () => {
    // Dragon is weak to Ice but Fire resists it, and Fire is weak to Water but Dragon resists it, so the summed exposure is 0
    // for both and Ground's weaknesses to Water, Grass and Ice cost 0.25 each. Rock is the only exposed type (Fire alone is weak
    // to it, exposure 1) and Ground resists it: relief 1. raw = 1 - 0.75 = 0.25, score = 0.5 + 0.25 / 12.
    const result = defensiveComponent([member('d1', 'Dragon'), member('f1', 'Fire')], ['Ground']);
    expect(result.raw).toBe(0.25);
    expect(result.score).toBeCloseTo(0.5208333, 7);
    expect(result.reasons).toEqual([{ kind: 'covers-weakness', type: 'Rock', by: 'resists', weakMembers: ['f1'] }]);
  });

  it('stacks exposure across members, lets an immunity relieve more than a resistance, and orders covered weaknesses by relief', () => {
    // Two Grass members are weak to Bug, Fire, Flying, Ice, Poison: exposure 2 each. Steel is immune to Poison (relief min(2, 2) = 2)
    // and resists Bug, Flying, Ice (relief min(2, 1) = 1 each): relief total 2 + 1 + 1 + 1 = 5. Poison sorts before Bug despite the
    // name order because its relief is bigger; Ice is the fourth covered type and is cut by the cap of 3. Harm: Fire 1 (exposed)
    // + Fighting 0.25 + Ground 0.25 = 1.5. raw = 5 - 1.5 = 3.5, score = 0.5 + 3.5 / 12.
    const result = defensiveComponent([member('g1', 'Grass'), member('g2', 'Grass')], ['Steel']);
    expect(result.raw).toBe(3.5);
    expect(result.score).toBeCloseTo(0.7916667, 7);
    expect(result.reasons).toEqual([
      { kind: 'covers-weakness', type: 'Poison', by: 'immune', weakMembers: ['g1', 'g2'] },
      { kind: 'covers-weakness', type: 'Bug', by: 'resists', weakMembers: ['g1', 'g2'] },
      { kind: 'covers-weakness', type: 'Flying', by: 'resists', weakMembers: ['g1', 'g2'] },
      { kind: 'adds-weakness', type: 'Fire', weakMembers: ['g1', 'g2'] },
    ]);
  });

  it('counts a x4 weakness as exposure 2 (relief 2), not 1', () => {
    // Dragon/Grass takes x4 from Ice (severity +2, exposure 2); Fire/Steel takes x1/4 from Ice (-2): relief min(2, 2) = 2.
    // Bug, Dragon, Fairy, Flying (each x2 on the roster, exposure 1) and Poison (Steel is immune, relief min(1, 2) = 1) add 1 each:
    // 2 + 5 = 7 relief. Harm: Fighting 0.25, Ground 0.5 (x4), Water 0.25, all unexposed = 1. raw = 6, score = 0.5 + 6 / 12 = 1.
    // Ice comes first because its relief is the biggest; Bug and Dragon follow by name (Fairy, Flying and Poison are cut by the cap of 3).
    const result = defensiveComponent([member('dg', 'Dragon', 'Grass')], ['Fire', 'Steel']);
    expect(result.raw).toBe(6);
    expect(result.score).toBe(1);
    expect(result.reasons).toEqual([
      { kind: 'covers-weakness', type: 'Ice', by: 'resists', weakMembers: ['dg'] },
      { kind: 'covers-weakness', type: 'Bug', by: 'resists', weakMembers: ['dg'] },
      { kind: 'covers-weakness', type: 'Dragon', by: 'resists', weakMembers: ['dg'] },
    ]);
  });

  it('clamps to 1 when the raw score is far above 6', () => {
    // Two Dragon/Grass members are exposed (summed severity) to Bug, Dragon, Fairy, Flying, Ice, Poison. Fire/Steel resists or is
    // immune to all six, and the relief is capped by its own severity: Bug 2, Dragon 1, Fairy 2, Flying 1, Ice 2, Poison 2 = 10.
    // Its weaknesses (Fighting, Ground, Water) are all unexposed, so they cost 0.25 per severity point: 0.25 + 0.5 + 0.25 = 1.
    // raw = 10 - 1 = 9, score = 0.5 + 9 / 12 = 1.25 unclamped, so exactly 1.
    const result = defensiveComponent([member('g1', 'Dragon', 'Grass'), member('g2', 'Dragon', 'Grass')], ['Fire', 'Steel']);
    expect(result.raw).toBe(9);
    expect(result.score).toBe(1);
  });

  it('clamps to 0 when the raw score is far below -6, and lists at most 2 added weaknesses, the biggest first', () => {
    // Two Grass members are exposed to Bug, Fire, Flying, Ice, Poison. A Bug/Grass candidate is x4 weak to Fire and Flying (harm 2
    // each) and x2 weak to Bug, Ice, Poison (harm 1 each), and also weak to Rock, which the roster is not exposed to (0.25).
    // Harm Fire 2 + Flying 2 + Bug 1 + Ice 1 + Poison 1 = 7, plus 0.25 = 7.25. Nothing is covered: raw = -7.25,
    // score = 0.5 - 7.25 / 12 = -0.104 unclamped, so exactly 0. Fire and Flying tie on harm and are ordered by type name;
    // Bug, Ice and Poison are cut by the cap of 2.
    const result = defensiveComponent([member('g1', 'Grass'), member('g2', 'Grass')], ['Bug', 'Grass']);
    expect(result.raw).toBe(-7.25);
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([
      { kind: 'adds-weakness', type: 'Fire', weakMembers: ['g1', 'g2'] },
      { kind: 'adds-weakness', type: 'Flying', weakMembers: ['g1', 'g2'] },
    ]);
  });

  it('never throws on odd input', () => {
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

  it('uses the move types from usage data, not just the own types', () => {
    // Defensive is the same either way: the Fire roster is exposed to Ground, Rock, Water (1 each); Grass resists Ground and Water
    // (relief 1 + 1) and is weak to Bug, Fire, Flying, Ice, Poison, none of which the roster is exposed to (harm 5 x 0.25 = 1.25).
    // raw = 2 - 1.25 = 0.75, defensive = 0.5 + 0.75 / 12 = 0.5625.
    // With Surf in the usage data the Fire roster also hits Fire, Ground, Rock: offensive is 1 / 11 (Grass adds Water only), so
    // 0.6 x 0.5625 + 0.4 x 1 / 11 = 0.3738636. Without it, offensive is 3 / 14 (Grass hits Ground, Rock, Water):
    // 0.6 x 0.5625 + 0.4 x 3 / 14 = 0.4232143.
    const moves = { surf: typedMove('surf', 'Water', 'Special', 90) };
    const usage = usageData([usageEntry('fire', { moves: [['surf', 0.6]] })]);
    const withSurf = typeSignal(['fire'], 'grass', snap({ fire: ['Fire'], grass: ['Grass'] }, usage, moves));
    expect(withSurf.score).toBeCloseTo(0.3738636, 7);
    expect(withSurf.reasons).toEqual([
      { kind: 'covers-weakness', type: 'Ground', by: 'resists', weakMembers: ['fire'] },
      { kind: 'covers-weakness', type: 'Water', by: 'resists', weakMembers: ['fire'] },
      { kind: 'adds-coverage', types: ['Water'] },
    ]);
    const withoutSurf = typeSignal(['fire'], 'grass', snap({ fire: ['Fire'], grass: ['Grass'] }));
    expect(withoutSurf.score).toBeCloseTo(0.4232143, 7);
    expect(withoutSurf.reasons.at(-1)).toEqual({ kind: 'adds-coverage', types: ['Ground', 'Rock', 'Water'] });
  });

  it('takes a roster member\'s move types from its entered set, and never the candidate\'s', () => {
    // No usage data. A roster set with Surf gives the "with Surf" numbers above (0.3738636); without it, 0.4232143.
    const moves = { surf: typedMove('surf', 'Water', 'Special', 90) };
    const s = snap({ fire: ['Fire'], grass: ['Grass'] }, null, moves);
    expect(typeSignal(['fire'], 'grass', s).score).toBeCloseTo(0.4232143, 7);
    expect(typeSignal(['fire'], 'grass', s, { fire: { moves: ['surf'] } }).score).toBeCloseTo(0.3738636, 7);
    // A set for the candidate is ignored: the candidate is always read from the ladder.
    expect(typeSignal(['fire'], 'grass', s, { grass: { moves: ['surf'] } }).score).toBeCloseTo(0.4232143, 7);
    expect([...attackingTypes('fire', s, { fire: { moves: ['surf'] } })].sort()).toEqual(['Fire', 'Water']);
  });

  it('feeds the attacking types of both species into the offensive component (components only, not typeSignal)', () => {
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

describe('defensiveComponent: ability immunities', () => {
  const levitate = { type: 'Ground', ability: 'Levitate' } as const;
  const flashFire = { type: 'Fire', ability: 'Flash Fire' } as const;

  it('lets a candidate\'s ability relieve a shared weakness like an immunity (Levitate Normal under Fire)', () => {
    // Fire takes x2 from Ground, Rock, Water (X = 1 each). Normal is weak to Fighting (harm 0.25, unexposed). With Levitate it is
    // immune to Ground (severity -2): relief min(1, 2) = 1. raw = 1 - 0.25 = 0.75, score = 0.5 + 0.75 / 12 = 0.5625.
    const result = defensiveComponent([member('fire', 'Fire')], ['Normal'], levitate);
    expect(result.raw).toBe(0.75);
    expect(result.score).toBe(0.5625);
    expect(result.reasons).toEqual([{ kind: 'covers-weakness', type: 'Ground', by: 'ability', weakMembers: ['fire'], ability: 'Levitate' }]);
    // Without the ability the same candidate has no relief at all: raw = -0.25.
    expect(defensiveComponent([member('fire', 'Fire')], ['Normal']).raw).toBe(-0.25);
  });

  it('lets the ability relieve up to the exposure, like an immunity: two Fire members give relief 2', () => {
    // Exposure to Ground is 2 and the ability's severity is -2, so the relief is min(2, 2) = 2 (a resistance would give 1).
    // raw = 2 - 0.25 = 1.75.
    const result = defensiveComponent([member('f1', 'Fire'), member('f2', 'Fire')], ['Normal'], levitate);
    expect(result.raw).toBe(1.75);
    expect(result.reasons).toEqual([{ kind: 'covers-weakness', type: 'Ground', by: 'ability', weakMembers: ['f1', 'f2'], ability: 'Levitate' }]);
  });

  it('reports a type immunity as immune even when the ability is for the same type (Flying with Levitate)', () => {
    // Fire roster: Ground relief min(1, 2) = 1; Flying is weak to Rock (harm 1, exposed), Electric and Ice (0.25 each, unexposed).
    // raw = 1 - 1.5 = -0.5, score = 0.5 - 0.5 / 12.
    const result = defensiveComponent([member('fire', 'Fire')], ['Flying'], levitate);
    expect(result.raw).toBe(-0.5);
    expect(result.score).toBeCloseTo(0.4583333, 7);
    expect(result.reasons).toEqual([
      { kind: 'covers-weakness', type: 'Ground', by: 'immune', weakMembers: ['fire'] },
      { kind: 'adds-weakness', type: 'Rock', weakMembers: ['fire'] },
    ]);
  });

  it('stops counting a roster member as weak to the type its ability absorbs (Flash Fire Grass, Bug candidate)', () => {
    // Grass is weak to Bug, Fire, Flying, Ice, Poison. Flash Fire makes Fire severity -2, so the exposure to Fire is -2, not +1.
    // Bug candidate: weak to Fire, Flying, Rock. Harm: Flying 1 (exposed), Fire 0.25 and Rock 0.25 (unexposed) = 1.5; nothing is
    // covered (Bug resists Fighting, Grass, Ground, where the roster has no exposure). raw = -1.5, score = 0.375.
    // Without Flash Fire the Fire harm is 1: raw = -2.25, score = 0.3125.
    const withAbility = defensiveComponent([{ id: 'gr', types: ['Grass'], immune: flashFire }], ['Bug']);
    expect(withAbility.raw).toBe(-1.5);
    expect(withAbility.score).toBe(0.375);
    expect(withAbility.reasons).toEqual([{ kind: 'adds-weakness', type: 'Flying', weakMembers: ['gr'] }]);
    const without = defensiveComponent([member('gr', 'Grass')], ['Bug']);
    expect(without.raw).toBe(-2.25);
    expect(without.reasons).toEqual([
      { kind: 'adds-weakness', type: 'Fire', weakMembers: ['gr'] },
      { kind: 'adds-weakness', type: 'Flying', weakMembers: ['gr'] },
    ]);
  });

  it('leaves a member with an absorbing ability out of weakMembers', () => {
    // Fire exposure: three plain Grass members +1 each and the Flash Fire member -2: X = 1. Water resists Fire: relief 1.
    // weakMembers for Fire lists g2, g3, g4 but not gf. Ice is covered too (all four are weak to it).
    const roster = [{ id: 'gf', types: ['Grass'], immune: flashFire }, member('g2', 'Grass'), member('g3', 'Grass'), member('g4', 'Grass')];
    const result = defensiveComponent(roster, ['Water']);
    expect(result.reasons).toEqual([
      { kind: 'covers-weakness', type: 'Fire', by: 'resists', weakMembers: ['g2', 'g3', 'g4'] },
      { kind: 'covers-weakness', type: 'Ice', by: 'resists', weakMembers: ['gf', 'g2', 'g3', 'g4'] },
    ]);
    expect(result.raw).toBe(1.5);
  });

  it('is unchanged when no immunity is passed', () => {
    expect(defensiveComponent([member('d1', 'Dragon')], ['Steel'], undefined).raw).toBe(2.25);
  });
});

describe('typeSignal: ability immunities', () => {
  const withAbilities = (species: Record<string, { types: string[]; abilities: string[] }>): EngineSnapshot => ({
    species: Object.fromEntries(Object.entries(species).map(([id, entry]) => [id, speciesEntry(id, id, entry)])),
    moves: {},
    usage: null,
  });

  it('reads the candidate\'s immunity from its expected ability (Levitate Normal under Fire)', () => {
    // Defensive 0.5625 (see above), offensive 0 (Normal hits nothing super effectively): 0.6 x 0.5625 = 0.3375.
    // Without the ability the defensive score is 0.4791667 and the signal 0.2875.
    const lev = typeSignal(['fire'], 'nrm', withAbilities({ fire: { types: ['Fire'], abilities: ['Blaze'] }, nrm: { types: ['Normal'], abilities: ['Levitate'] } }));
    expect(lev.score).toBeCloseTo(0.3375, 7);
    expect(lev.reasons).toEqual([{ kind: 'covers-weakness', type: 'Ground', by: 'ability', weakMembers: ['fire'], ability: 'Levitate' }]);
    const plain = typeSignal(['fire'], 'nrm', withAbilities({ fire: { types: ['Fire'], abilities: ['Blaze'] }, nrm: { types: ['Normal'], abilities: ['Pressure'] } }));
    expect(plain.score).toBeCloseTo(0.2875, 7);
    expect(plain.reasons).toEqual([]);
  });

  it('reads a roster member\'s immunity from its expected ability (Flash Fire Grass, Bug candidate)', () => {
    // Defensive 0.375 (see above); offensive 3 / 15 (Grass covers Ground, Rock, Water; Bug adds Dark, Grass, Psychic):
    // 0.6 x 0.375 + 0.4 x 0.2 = 0.305. Without the ability: defensive 0.3125, so 0.6 x 0.3125 + 0.08 = 0.2675.
    const s = withAbilities({ gr: { types: ['Grass'], abilities: ['Flash Fire'] }, bug: { types: ['Bug'], abilities: ['Pressure'] } });
    const result = typeSignal(['gr'], 'bug', s);
    expect(result.score).toBeCloseTo(0.305, 7);
    expect(result.reasons).toEqual([
      { kind: 'adds-weakness', type: 'Flying', weakMembers: ['gr'] },
      { kind: 'adds-coverage', types: ['Dark', 'Grass', 'Psychic'] },
    ]);
    const plain = withAbilities({ gr: { types: ['Grass'], abilities: ['Pressure'] }, bug: { types: ['Bug'], abilities: ['Pressure'] } });
    expect(typeSignal(['gr'], 'bug', plain).score).toBeCloseTo(0.2675, 7);
  });

  it('changes nothing for a species whose ability is not in the immunity table', () => {
    const base = { fire: { types: ['Fire'], abilities: ['Blaze'] }, nrm: { types: ['Normal'], abilities: ['Pressure'] } };
    const other = { fire: { types: ['Fire'], abilities: ['Intimidate'] }, nrm: { types: ['Normal'], abilities: ['Thick Fat'] } };
    expect(typeSignal(['fire'], 'nrm', withAbilities(other))).toEqual(typeSignal(['fire'], 'nrm', withAbilities(base)));
  });

  it('reads a roster member\'s immunity from its entered set (Flash Fire named by the set)', () => {
    // Overgrow or Flash Fire, no usage: no expected ability, so the Grass member counts as weak to Fire (0.2675, see above).
    // A set with Flash Fire gives the Flash Fire numbers (0.305, see above).
    const s = withAbilities({ gr: { types: ['Grass'], abilities: ['Overgrow', 'Flash Fire'] }, bug: { types: ['Bug'], abilities: ['Pressure'] } });
    expect(typeSignal(['gr'], 'bug', s).score).toBeCloseTo(0.2675, 7);
    expect(typeSignal(['gr'], 'bug', s, { gr: { ability: 'flashfire' } }).score).toBeCloseTo(0.305, 7);
    expect(typeSignal(['gr'], 'bug', s, {}).score).toBeCloseTo(0.2675, 7);
  });

  it('ignores an available immunity ability that is not the expected one', () => {
    // Two abilities and no usage data: there is no expected ability, so no immunity.
    const two = withAbilities({ fire: { types: ['Fire'], abilities: ['Blaze'] }, nrm: { types: ['Normal'], abilities: ['Levitate', 'Pressure'] } });
    expect(typeSignal(['fire'], 'nrm', two).score).toBeCloseTo(0.2875, 7);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/engine/roles.test.ts src/engine/role-signal.test.ts src/engine/type-signal.test.ts`
Expected: FAIL (tags and reasons have no `from`; sets are ignored).

- [ ] **Step 4: Replace `src/engine/roles.ts`**

```ts
import type { ID } from '../domain/id';
import { compareIds } from './math';
import { profileOf, setFor, type Profile } from './profile';
import type { EngineSnapshot, ProfileSource, RoleId, RoleSource } from './types';

/** A species runs a role move when at least this share of its sets carry it. */
export const RUN_MIN_SHARE = 0.1;
/** A role a species can only learn (a signature move, no usage entry) counts for this fraction of its importance. */
export const CAN_LEARN_FACTOR = 0.5;

export interface RoleDef {
  id: RoleId;
  /** How much a team missing this role should care; the role signal weighs roles by it. */
  importance: number;
  /** Move ids a species can run to fill the role. */
  moves: readonly string[];
  /** Ability names that fill the role. */
  abilities: readonly string[];
  /** Move ids credited as `can-learn` to a species with no usage entry. */
  signatureMoves: readonly string[];
}

/** The role table, in the order roles are listed everywhere. Hand-curated; see the stage 2 spec. */
export const ROLES: readonly RoleDef[] = [
  { id: 'fakeOut', importance: 1, moves: ['fakeout'], abilities: [], signatureMoves: ['fakeout'] },
  { id: 'redirection', importance: 1, moves: ['followme', 'ragepowder'], abilities: [], signatureMoves: ['followme', 'ragepowder'] },
  { id: 'speedControl', importance: 1, moves: ['tailwind', 'trickroom', 'icywind', 'electroweb'], abilities: [], signatureMoves: ['tailwind', 'trickroom'] },
  { id: 'intimidate', importance: 0.75, moves: [], abilities: ['Intimidate'], signatureMoves: [] },
  {
    id: 'weatherTerrain',
    importance: 0.75,
    moves: [],
    abilities: ['Drought', 'Drizzle', 'Sand Stream', 'Snow Warning', 'Electric Surge'],
    signatureMoves: [],
  },
  { id: 'pivot', importance: 0.5, moves: ['partingshot', 'uturn', 'voltswitch', 'flipturn'], abilities: [], signatureMoves: ['partingshot'] },
  { id: 'screens', importance: 0.5, moves: ['reflect', 'lightscreen', 'auroraveil'], abilities: [], signatureMoves: [] },
  { id: 'support', importance: 0.5, moves: ['helpinghand', 'wideguard', 'quickguard', 'coaching'], abilities: [], signatureMoves: [] },
  {
    id: 'priority',
    importance: 0.5,
    moves: ['aquajet', 'machpunch', 'iceshard', 'suckerpunch', 'shadowsneak', 'bulletpunch', 'quickattack', 'extremespeed', 'vacuumwave', 'jetpunch', 'firstimpression'],
    abilities: [],
    signatureMoves: [],
  },
  { id: 'disruption', importance: 0.5, moves: ['encore', 'taunt', 'willowisp', 'yawn', 'sleeppowder', 'nuzzle'], abilities: [], signatureMoves: [] },
];

export interface RoleTag {
  role: RoleId;
  source: RoleSource;
  /** The move id (`runs`, `can-learn`) or the ability name (`ability`) behind the tag. */
  via: string;
  /** Where the fact came from: the entered set or the ladder (`can-learn` is always `'ladder'`). */
  from: ProfileSource;
}

type RoleSnapshot = Pick<EngineSnapshot, 'species' | 'moves' | 'usage' | 'learnsets'>;

/** The role move the profile runs most (at least `RUN_MIN_SHARE`; ties by id ascending), or null. */
function bestRunMove(moves: readonly string[], profile: Profile): string | null {
  let best: [ID, number] | null = null;
  for (const [move, share] of profile.moves) {
    if (share < RUN_MIN_SHARE || !moves.includes(move)) continue;
    if (best === null || share > best[1] || (share === best[1] && compareIds(move, best[0]) < 0)) best = [move, share];
  }
  return best === null ? null : best[0];
}

/**
 * The roles a species fills, at most one tag per role, in table order, from the strongest source: `runs` (its profile
 * runs a role move at `RUN_MIN_SHARE` or more; `via` is the most-run one), then `ability` (its profile's ability is a
 * role ability), then `can-learn` (only for a species with no usage entry and no set moves: its learnset holds a
 * signature move; `via` is the first one in table order). The profile reads `sets[id]` where there is one (see
 * `profileOf`). An id that is not in the snapshot has no tags.
 */
export function speciesRoles(id: ID, snapshot: RoleSnapshot, sets?: Record<ID, unknown>): RoleTag[] {
  if (!Object.hasOwn(snapshot.species, id)) return [];
  const usage = snapshot.usage;
  const hasEntry = usage !== null && Object.hasOwn(usage.species, id);
  const rawLearnset = snapshot.learnsets !== undefined && Object.hasOwn(snapshot.learnsets, id) ? snapshot.learnsets[id] : [];
  const learnset: readonly string[] = Array.isArray(rawLearnset) ? rawLearnset : [];
  const profile = profileOf(id, snapshot, setFor(sets, id));
  const ability = profile.ability;

  const tags: RoleTag[] = [];
  for (const role of ROLES) {
    const run = bestRunMove(role.moves, profile);
    if (run !== null) {
      tags.push({ role: role.id, source: 'runs', via: run, from: profile.movesFrom });
    } else if (ability !== null && role.abilities.includes(ability)) {
      tags.push({ role: role.id, source: 'ability', via: ability, from: profile.abilityFrom });
    } else if (!hasEntry && profile.movesFrom === 'ladder') {
      const learnable = role.signatureMoves.find((move) => learnset.includes(move));
      if (learnable !== undefined) tags.push({ role: role.id, source: 'can-learn', via: learnable, from: 'ladder' });
    }
  }
  return tags;
}

/**
 * The roles (table order) no roster member covers. A member covers a role with a `runs` or `ability` tag; a `can-learn`
 * tag does not. Members are read through their sets where `sets` has one. Roster ids that are not in the snapshot are
 * ignored, so an empty roster lacks every role.
 */
export function rosterLacks(roster: readonly ID[], snapshot: RoleSnapshot, sets?: Record<ID, unknown>): RoleId[] {
  const covered = new Set<RoleId>();
  for (const id of roster) {
    for (const tag of speciesRoles(id, snapshot, sets)) if (tag.source !== 'can-learn') covered.add(tag.role);
  }
  return ROLES.filter((role) => !covered.has(role.id)).map((role) => role.id);
}
```

- [ ] **Step 5: Replace `src/engine/role-signal.ts`**

```ts
import type { ID } from '../domain/id';
import { compareIds } from './math';
import { CAN_LEARN_FACTOR, ROLES, speciesRoles } from './roles';
import type { EngineSnapshot, Reason, RoleId, SignalOutput } from './types';

const MAX_FILLS = 3;

/**
 * Role fit: how much of what the roster lacks the candidate supplies. `lacked` is the roles no roster member covers
 * (`rosterLacks`, computed once by the caller and passed in here since every candidate in a `suggest()` call shares
 * it); each role the candidate has a tag for earns its importance (half of it for a `can-learn` tag), and the score
 * is the earned sum over the summed importance of the lacked roles, in [0, 1]. No data when `lacked` is empty, the
 * roster has no member in the snapshot, or the candidate is not in the snapshot. `roster` is limited to ids in the
 * snapshot by the caller; other ids are ignored anyway.
 */
export function roleSignal(
  roster: ID[],
  candidate: ID,
  snapshot: Pick<EngineSnapshot, 'species' | 'moves' | 'usage' | 'learnsets'>,
  lacked: readonly RoleId[],
): SignalOutput {
  if (!Object.hasOwn(snapshot.species, candidate)) return { score: null, reasons: [] };
  if (!roster.some((id) => Object.hasOwn(snapshot.species, id))) return { score: null, reasons: [] };
  const lackedSet = new Set(lacked);
  if (lackedSet.size === 0) return { score: null, reasons: [] };

  const tags = speciesRoles(candidate, snapshot);
  let total = 0;
  let earned = 0;
  const filled: Array<{ importance: number; role: string; reason: Reason }> = [];
  for (const role of ROLES) {
    if (!lackedSet.has(role.id)) continue;
    total += role.importance;
    const tag = tags.find((entry) => entry.role === role.id);
    if (tag === undefined) continue;
    earned += role.importance * (tag.source === 'can-learn' ? CAN_LEARN_FACTOR : 1);
    filled.push({
      importance: role.importance,
      role: role.id,
      reason: { kind: 'fills-role', role: tag.role, source: tag.source, via: tag.via, from: tag.from },
    });
  }

  filled.sort((a, b) => b.importance - a.importance || compareIds(a.role, b.role));
  return { score: earned / total, reasons: filled.slice(0, MAX_FILLS).map((entry) => entry.reason) };
}
```

- [ ] **Step 6: Replace `src/engine/type-signal.ts`**

```ts
import type { ID } from '../domain/id';
import { immunityOf, type Immunity } from './abilities';
import { clamp, compareIds } from './math';
import { profileOf, setFor } from './profile';
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
  /** The type the member's expected ability makes it immune to, if any. */
  immune?: Immunity;
}

/** The damage multiplier `type` does to a member: 0 when its ability makes it immune to `type`, else the typing's product. */
function memberMultiplier(type: TypeName, member: Pick<TypedMember, 'types' | 'immune'>): number {
  return member.immune?.type === type ? 0 : multiplier(type, member.types);
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
 *
 * Two caveats. Exposure is a signed sum, so one member's resistance cancels another member's weakness to the same
 * type; a real team does not fully work that way. And `DEFENSIVE_SCALE = 12` keeps the defensive score in roughly
 * 0.12 to 0.79 on real rosters, so the combined scores cluster around 0.3 to 0.6.
 */
export function defensiveComponent(
  roster: readonly TypedMember[],
  candidate: readonly string[],
  candidateImmune?: Immunity,
): DefensiveResult {
  let raw = 0;
  const covers: Array<{ type: TypeName; relief: number }> = [];
  const adds: Array<{ type: TypeName; harm: number }> = [];

  for (const type of TYPES) {
    const exposure = roster.reduce((sum, member) => sum + severity(memberMultiplier(type, member)), 0);
    const exposed = Math.max(0, exposure);
    const own = severity(memberMultiplier(type, { types: candidate, immune: candidateImmune }));
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
    roster.filter((member) => memberMultiplier(type, member) > 1).map((member) => member.id);

  covers.sort((a, b) => b.relief - a.relief || compareIds(a.type, b.type));
  adds.sort((a, b) => b.harm - a.harm || compareIds(a.type, b.type));

  const reasons: Reason[] = [];
  for (const { type } of covers.slice(0, MAX_COVERS)) {
    const weakMembers = weakMembersOf(type);
    if (multiplier(type, candidate) === 0) reasons.push({ kind: 'covers-weakness', type, by: 'immune', weakMembers });
    else if (candidateImmune?.type === type) {
      reasons.push({ kind: 'covers-weakness', type, by: 'ability', weakMembers, ability: candidateImmune.ability });
    } else reasons.push({ kind: 'covers-weakness', type, by: 'resists', weakMembers });
  }
  for (const { type } of adds.slice(0, MAX_ADDS)) {
    reasons.push({ kind: 'adds-weakness', type, weakMembers: weakMembersOf(type) });
  }
  return { raw, score: clamp(0.5 + raw / DEFENSIVE_SCALE, 0, 1), reasons };
}

/**
 * The types a species can hit with: its own types plus the types of the damaging moves (not Status, base power above 0)
 * its profile runs on at least `OFFENSIVE_MIN_MOVE_SHARE` of its sets (every move of an entered set counts). A species
 * with no usage entry and no set, or a move that is not in the move table, contributes only its own types. An id that
 * is not in the snapshot has none.
 */
export function attackingTypes(id: ID, snapshot: EngineSnapshot, sets?: Record<ID, unknown>): Set<string> {
  const types = new Set<string>(Object.hasOwn(snapshot.species, id) ? snapshot.species[id].types : []);
  for (const [moveId, share] of profileOf(id, snapshot, setFor(sets, id)).moves) {
    if (share < OFFENSIVE_MIN_MOVE_SHARE || !Object.hasOwn(snapshot.moves, moveId)) continue;
    const move = snapshot.moves[moveId];
    if (move.category !== 'Status' && move.basePower > 0) types.add(move.type);
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
 * data. Roster members are read through `sets` where it has an entry (their ability immunity and attacking types); the
 * candidate never is. No data for an empty roster (after dropping ids that are not in the snapshot) or an unknown
 * candidate.
 */
export function typeSignal(roster: ID[], candidate: ID, snapshot: EngineSnapshot, sets?: Record<ID, unknown>): SignalOutput {
  if (!Object.hasOwn(snapshot.species, candidate)) return { score: null, reasons: [] };
  const members: TypedMember[] = roster
    .filter((id) => Object.hasOwn(snapshot.species, id))
    .map((id) => ({ id, types: snapshot.species[id].types, immune: immunityOf(id, snapshot, sets) ?? undefined }));
  if (members.length === 0) return { score: null, reasons: [] };

  const defensive = defensiveComponent(members, snapshot.species[candidate].types, immunityOf(candidate, snapshot) ?? undefined);
  const offensive = offensiveComponent(
    members.map((entry) => attackingTypes(entry.id, snapshot, sets)),
    attackingTypes(candidate, snapshot),
  );

  const reasons = [...defensive.reasons];
  if (offensive.fraction === null) return { score: defensive.score, reasons };
  if (offensive.newTypes.length > 0) reasons.push({ kind: 'adds-coverage', types: [...offensive.newTypes] });
  return { score: clamp(DEFENSIVE_WEIGHT * defensive.score + OFFENSIVE_WEIGHT * offensive.fraction, 0, 1), reasons };
}
```

- [ ] **Step 7: Run the tests, the suite and the typecheck**

Run: `npx vitest run src/engine/roles.test.ts src/engine/role-signal.test.ts src/engine/type-signal.test.ts` then `npm test` then `npm run typecheck`
Expected: PASS; the whole suite passes (591 tests); typecheck clean. `suggest.test.ts` and the real-snapshot tests are unchanged and still pass: without sets every rule returns what stage 2 returned.

- [ ] **Step 8: Commit**

```bash
git add src/engine/types.ts src/engine/roles.ts src/engine/role-signal.ts src/engine/type-signal.ts src/engine/roles.test.ts src/engine/role-signal.test.ts src/engine/type-signal.test.ts
git commit -m "feat(engine): roles, ability immunities and coverage read the roster's entered sets" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The combo table

**Files:**
- Create: `src/engine/combos.ts`, `src/engine/combos.test.ts`

**Interfaces:**
- Consumes: `runsMove`, `Profile` (Task 1); `RUN_MIN_SHARE` (`roles.ts`); `ComboId`, `ComboSource` (Task 1).
- Produces: `TRICK_ROOM_MAX_BASE_SPEED = 50`; `SPREAD_MIN_BASE_POWER = 70`; `interface ComboSide { abilities: readonly string[]; moves: readonly string[]; maxBaseSpeed?: number; spreadMove?: boolean }`; `interface ComboDef { id: ComboId; importance: number; enabler: ComboSide; beneficiary: ComboSide }`; `COMBOS: readonly ComboDef[]`; `sideMatch(side, id, profile, snapshot: Pick<EngineSnapshot,'species'|'moves'>): ComboSource | null`.

- [ ] **Step 1: Write the tests: create `src/engine/combos.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { speciesEntry } from '../domain/test-support';
import { COMBOS, SPREAD_MIN_BASE_POWER, TRICK_ROOM_MAX_BASE_SPEED, sideMatch, type ComboSide } from './combos';
import { profileOf } from './profile';
import { typedMove, usageData, usageEntry } from './test-support';
import type { EngineSnapshot } from './types';

const FLAT = { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 };
const withSpeed = (spe: number) => ({ ...FLAT, spe });

/**
 * `swim` has Swift Swim (its only ability) and runs Hurricane on 30% of ladder sets; `slow50` and `slow51` differ only
 * in base Speed; `spread` runs Rock Slide (75), `chip` runs Icy Wind (55), `wave` runs Heat Wave only as a Status copy.
 */
const snapshot = (): EngineSnapshot => ({
  species: {
    swim: speciesEntry('swim', 'Swim', { abilities: ['Swift Swim'], baseStats: withSpeed(40) }),
    slow50: speciesEntry('slow50', 'Slow50', { baseStats: withSpeed(50) }),
    slow51: speciesEntry('slow51', 'Slow51', { baseStats: withSpeed(51) }),
    spread: speciesEntry('spread', 'Spread'),
    chip: speciesEntry('chip', 'Chip'),
    statusSpread: speciesEntry('statusSpread', 'StatusSpread'),
  },
  moves: {
    hurricane: typedMove('hurricane', 'Flying', 'Special', 110),
    rockslide: { ...typedMove('rockslide', 'Rock', 'Physical', 75), target: 'allAdjacentFoes' },
    icywind: { ...typedMove('icywind', 'Ice', 'Special', 55), target: 'allAdjacentFoes' },
    growl: { ...typedMove('growl', 'Normal', 'Status', 0), target: 'allAdjacentFoes' },
    trickroom: typedMove('trickroom', 'Psychic', 'Status', 0),
  },
  usage: usageData([
    usageEntry('swim', { moves: [['hurricane', 0.3]] }),
    usageEntry('spread', { moves: [['rockslide', 0.5]] }),
    usageEntry('chip', { moves: [['icywind', 0.9]] }),
    usageEntry('statusSpread', { moves: [['growl', 0.9]] }),
  ]),
});
const match = (side: ComboSide, id: string, s = snapshot(), set?: unknown) => sideMatch(side, id, profileOf(id, s, set), s);
const byId = Object.fromEntries(COMBOS.map((combo) => [combo.id, combo]));

describe('the combo table', () => {
  it('has the eight combos in order, with their importance', () => {
    expect(COMBOS.map((combo) => combo.id)).toEqual(['trickRoom', 'redirectSetup', 'rain', 'sun', 'sand', 'snow', 'electricTerrain', 'helpingHand']);
    expect(COMBOS.map((combo) => combo.importance)).toEqual([1, 0.75, 0.75, 0.75, 0.75, 0.75, 0.5, 0.5]);
    expect(TRICK_ROOM_MAX_BASE_SPEED).toBe(50);
    expect(SPREAD_MIN_BASE_POWER).toBe(70);
  });

  it('gives every side at least one check', () => {
    for (const combo of COMBOS) {
      for (const side of [combo.enabler, combo.beneficiary]) {
        const checks = side.abilities.length + side.moves.length + (side.maxBaseSpeed === undefined ? 0 : 1) + (side.spreadMove ? 1 : 0);
        expect(checks, combo.id).toBeGreaterThan(0);
      }
    }
    expect(byId.rain.enabler).toEqual({ abilities: ['Drizzle'], moves: ['raindance'] });
    expect(byId.rain.beneficiary).toEqual({ abilities: ['Swift Swim', 'Rain Dish'], moves: ['thunder', 'hurricane'] });
    expect(byId.trickRoom.beneficiary.maxBaseSpeed).toBe(50);
    expect(byId.helpingHand.beneficiary.spreadMove).toBe(true);
    expect(byId.redirectSetup.beneficiary.moves).toEqual(['swordsdance', 'nastyplot', 'dragondance', 'calmmind', 'bellydrum', 'shellsmash', 'quiverdance', 'bulkup']);
  });
});

describe('sideMatch', () => {
  it('matches by ability, by a move the profile runs, and by base Speed, naming the source', () => {
    expect(match(byId.rain.beneficiary, 'swim')).toBe('ladder'); // Swift Swim, the only ability
    expect(match(byId.trickRoom.beneficiary, 'swim')).toBe('species'); // base Speed 40
    expect(match(byId.trickRoom.enabler, 'swim')).toBeNull();
  });

  it('checks the ability before the moves and the moves before base Speed', () => {
    // swim matches rain's beneficiary side by Swift Swim and by Hurricane; the ability wins. With a set ability the source is the set.
    const side: ComboSide = { abilities: ['Swift Swim'], moves: ['hurricane'], maxBaseSpeed: 50 };
    expect(match(side, 'swim', snapshot(), { moves: ['hurricane'] })).toBe('ladder'); // ability from the ladder, before the set move
    expect(match({ abilities: [], moves: ['hurricane'], maxBaseSpeed: 50 }, 'swim', snapshot(), { moves: ['hurricane'] })).toBe('set');
    expect(match({ abilities: [], moves: [], maxBaseSpeed: 50 }, 'swim', snapshot(), { moves: ['hurricane'] })).toBe('species');
  });

  it('counts a move only at the run threshold of 10%', () => {
    const s = snapshot();
    s.usage!.species.swim = usageEntry('swim', { moves: [['hurricane', 0.1]] });
    expect(match({ abilities: [], moves: ['hurricane'] }, 'swim', s)).toBe('ladder');
    s.usage!.species.swim = usageEntry('swim', { moves: [['hurricane', 0.09]] });
    expect(match({ abilities: [], moves: ['hurricane'] }, 'swim', s)).toBeNull();
  });

  it('matches base Speed at exactly 50 and not at 51', () => {
    expect(match(byId.trickRoom.beneficiary, 'slow50')).toBe('species');
    expect(match(byId.trickRoom.beneficiary, 'slow51')).toBeNull();
  });

  it('counts a spread attack at 70 base power or more, not a utility spread move or a Status one', () => {
    expect(match(byId.helpingHand.beneficiary, 'spread')).toBe('ladder'); // Rock Slide, 75
    expect(match(byId.helpingHand.beneficiary, 'chip')).toBeNull(); // Icy Wind, 55
    expect(match(byId.helpingHand.beneficiary, 'statusSpread')).toBeNull(); // Growl
    // A set with Rock Slide makes chip a spread attacker.
    expect(match(byId.helpingHand.beneficiary, 'chip', snapshot(), { moves: ['rockslide'] })).toBe('set');
  });

  it('does not match when a move\'s target or a species\' base stats are missing or malformed', () => {
    const s = snapshot();
    (s.moves.rockslide as unknown as Record<string, unknown>).target = undefined;
    expect(match(byId.helpingHand.beneficiary, 'spread', s)).toBeNull();
    (s.species.slow50 as unknown as Record<string, unknown>).baseStats = null;
    expect(match(byId.trickRoom.beneficiary, 'slow50', s)).toBeNull();
    (s.species.slow50 as unknown as Record<string, unknown>).baseStats = { spe: '40' };
    expect(match(byId.trickRoom.beneficiary, 'slow50', s)).toBeNull();
  });

  it('matches nothing for a species that is not in the snapshot', () => {
    const s = snapshot();
    for (const id of ['ghost', 'constructor']) expect(sideMatch(byId.trickRoom.beneficiary, id, profileOf('swim', s), s), id).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/engine/combos.test.ts`
Expected: FAIL (`combos.ts` does not exist).

- [ ] **Step 3: Create `src/engine/combos.ts`**

```ts
import type { ID } from '../domain/id';
import { runsMove, type Profile } from './profile';
import { RUN_MIN_SHARE } from './roles';
import type { ComboId, ComboSource, EngineSnapshot } from './types';

/** The Trick Room beneficiary side: species with base Speed at most this. */
export const TRICK_ROOM_MAX_BASE_SPEED = 50;

/** One side of a combo. A species is on the side when any one of the set checks matches. */
export interface ComboSide {
  /** Ability names, matched against the profile's ability. */
  abilities: readonly string[];
  /** Move ids, matched against the moves the profile runs. */
  moves: readonly string[];
  /** Matched when the species' base Speed is at most this. */
  maxBaseSpeed?: number;
  /** Matched when the profile runs a spread attack (a damaging spread move at `SPREAD_MIN_BASE_POWER` or more). */
  spreadMove?: boolean;
}

export interface ComboDef {
  id: ComboId;
  /** How much completing this combo is worth; the combo signal weighs combos by it. */
  importance: number;
  enabler: ComboSide;
  beneficiary: ComboSide;
}

const SETUP_MOVES = ['swordsdance', 'nastyplot', 'dragondance', 'calmmind', 'bellydrum', 'shellsmash', 'quiverdance', 'bulkup'];

/** The combo table, in the order combos are listed everywhere. Hand-curated; see the stage 3 spec. */
export const COMBOS: readonly ComboDef[] = [
  {
    id: 'trickRoom',
    importance: 1,
    enabler: { abilities: [], moves: ['trickroom'] },
    beneficiary: { abilities: [], moves: [], maxBaseSpeed: TRICK_ROOM_MAX_BASE_SPEED },
  },
  {
    id: 'redirectSetup',
    importance: 0.75,
    enabler: { abilities: [], moves: ['followme', 'ragepowder'] },
    beneficiary: { abilities: [], moves: SETUP_MOVES },
  },
  {
    id: 'rain',
    importance: 0.75,
    enabler: { abilities: ['Drizzle'], moves: ['raindance'] },
    beneficiary: { abilities: ['Swift Swim', 'Rain Dish'], moves: ['thunder', 'hurricane'] },
  },
  {
    id: 'sun',
    importance: 0.75,
    enabler: { abilities: ['Drought'], moves: ['sunnyday'] },
    beneficiary: { abilities: ['Chlorophyll', 'Solar Power'], moves: ['solarbeam'] },
  },
  {
    id: 'sand',
    importance: 0.75,
    enabler: { abilities: ['Sand Stream'], moves: ['sandstorm'] },
    beneficiary: { abilities: ['Sand Rush', 'Sand Force'], moves: [] },
  },
  {
    id: 'snow',
    importance: 0.75,
    enabler: { abilities: ['Snow Warning'], moves: ['snowscape'] },
    beneficiary: { abilities: ['Slush Rush'], moves: ['blizzard'] },
  },
  {
    id: 'electricTerrain',
    importance: 0.5,
    enabler: { abilities: ['Electric Surge'], moves: [] },
    beneficiary: { abilities: ['Surge Surfer'], moves: ['risingvoltage'] },
  },
  {
    id: 'helpingHand',
    importance: 0.5,
    enabler: { abilities: [], moves: ['helpinghand'] },
    beneficiary: { abilities: [], moves: [], spreadMove: true },
  },
];

/**
 * A spread move counts for Helping Hand only at this base power or more: utility spread moves (Icy Wind, Electroweb,
 * Snarl, Bulldoze and similar, all 65 or less) are speed control, not spread attacks.
 */
export const SPREAD_MIN_BASE_POWER = 70;

const SPREAD_TARGETS = ['allAdjacentFoes', 'allAdjacent'];

/** A damaging spread attack. Read defensively: `target` is not checked by the sanitizer. */
function isSpreadAttack(move: unknown): boolean {
  if (typeof move !== 'object' || move === null) return false;
  const m = move as Record<string, unknown>;
  return (
    typeof m.target === 'string' &&
    SPREAD_TARGETS.includes(m.target) &&
    m.category !== 'Status' &&
    typeof m.basePower === 'number' &&
    m.basePower >= SPREAD_MIN_BASE_POWER
  );
}

/** The species' base Speed, or null when it is missing or not a finite number (`baseStats` is not checked by the sanitizer). */
function baseSpeed(id: ID, snapshot: Pick<EngineSnapshot, 'species'>): number | null {
  const stats: unknown = snapshot.species[id].baseStats;
  if (typeof stats !== 'object' || stats === null) return null;
  const spe = (stats as Record<string, unknown>).spe;
  return typeof spe === 'number' && Number.isFinite(spe) ? spe : null;
}

/**
 * Whether species `id` with profile `profile` is on `side`, and if so how that was known. Checks, in order: the
 * profile's ability (`abilityFrom`), a side move the profile runs (`movesFrom`), a spread attack it runs
 * (`movesFrom`), base Speed (`'species'`). Null when nothing matches or the species is not in the snapshot.
 */
export function sideMatch(
  side: ComboSide,
  id: ID,
  profile: Profile,
  snapshot: Pick<EngineSnapshot, 'species' | 'moves'>,
): ComboSource | null {
  if (!Object.hasOwn(snapshot.species, id)) return null;
  if (profile.ability !== null && side.abilities.includes(profile.ability)) return profile.abilityFrom;
  if (side.moves.some((move) => runsMove(profile, move, RUN_MIN_SHARE))) return profile.movesFrom;
  if (side.spreadMove === true) {
    for (const [move, share] of profile.moves) {
      if (share >= RUN_MIN_SHARE && Object.hasOwn(snapshot.moves, move) && isSpreadAttack(snapshot.moves[move])) return profile.movesFrom;
    }
  }
  if (side.maxBaseSpeed !== undefined) {
    const spe = baseSpeed(id, snapshot);
    if (spe !== null && spe <= side.maxBaseSpeed) return 'species';
  }
  return null;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run src/engine/combos.test.ts` then `npm run typecheck`
Expected: PASS (9 tests); the whole suite then has 600 tests; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine/combos.ts src/engine/combos.test.ts
git commit -m "feat(engine): add the partner combo table" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The combo signal

**Files:**
- Create: `src/engine/combo-signal.ts`, `src/engine/combo-signal.test.ts`

**Interfaces:**
- Consumes: `COMBOS`, `sideMatch`, `ComboSide` (Task 3); `profileOf`, `setFor`, `Profile` (Task 1); the `completes-combo` reason (Task 1).
- Produces: `openCombos(roster: readonly ID[], snapshot: Pick<EngineSnapshot,'species'|'moves'|'usage'>, sets?: Record<ID, unknown>): ComboId[]`; `comboSignal(roster: ID[], candidate: ID, snapshot, open: readonly ComboId[], sets?: Record<ID, unknown>): SignalOutput`.

- [ ] **Step 1: Write the tests: create `src/engine/combo-signal.test.ts`**

The fractions: roster `tr + rain` opens trickRoom (importance 1) and rain (0.75), 1.75 in total; `slowswim` completes both (1.75 / 1.75 = 1), `slow` trickRoom only (1 / 1.75 = 0.5714286), `swimmer` rain only (0.75 / 1.75 = 0.4285714).

```ts
import { describe, expect, it } from 'vitest';
import { speciesEntry } from '../domain/test-support';
import { comboSignal, openCombos } from './combo-signal';
import { typedMove, usageData, usageEntry } from './test-support';
import type { EngineSnapshot } from './types';

const stats = (spe: number) => ({ hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe });

/**
 * Roster candidates for the tests. Base Speed is 80 unless given.
 *   tr, tr2:     run Trick Room (50%)                   -> trickRoom enabler
 *   rain:        Drizzle, its only ability              -> rain enabler
 *   sloth:       base Speed 30                          -> trickRoom beneficiary
 *   hub:         runs Trick Room, Follow Me, Helping Hand; Drizzle -> enabler of trickRoom, redirectSetup, rain, helpingHand
 *   plain:       nothing
 * Candidates:
 *   slowswim:    Swift Swim, base Speed 40              -> trickRoom and rain beneficiary
 *   swimmer:     Swift Swim                             -> rain beneficiary
 *   slow:        base Speed 50                          -> trickRoom beneficiary
 *   trsetter:    runs Trick Room                        -> trickRoom enabler
 *   trslow:      runs Trick Room, base Speed 40         -> trickRoom enabler and beneficiary
 *   allrounder:  Swift Swim, base Speed 40, runs Swords Dance and Rock Slide -> beneficiary of all four of hub's combos
 */
const snapshot = (): EngineSnapshot => ({
  species: {
    tr: speciesEntry('tr', 'Tr', { num: 1 }),
    tr2: speciesEntry('tr2', 'Tr2', { num: 2 }),
    rain: speciesEntry('rain', 'Rain', { num: 3, abilities: ['Drizzle'] }),
    sloth: speciesEntry('sloth', 'Sloth', { num: 4, baseStats: stats(30) }),
    hub: speciesEntry('hub', 'Hub', { num: 5, abilities: ['Drizzle'] }),
    plain: speciesEntry('plain', 'Plain', { num: 6 }),
    slowswim: speciesEntry('slowswim', 'SlowSwim', { num: 7, abilities: ['Swift Swim'], baseStats: stats(40) }),
    swimmer: speciesEntry('swimmer', 'Swimmer', { num: 8, abilities: ['Swift Swim'] }),
    slow: speciesEntry('slow', 'Slow', { num: 9, baseStats: stats(50) }),
    trsetter: speciesEntry('trsetter', 'TrSetter', { num: 10 }),
    trslow: speciesEntry('trslow', 'TrSlow', { num: 11, baseStats: stats(40) }),
    allrounder: speciesEntry('allrounder', 'AllRounder', { num: 12, abilities: ['Swift Swim'], baseStats: stats(40) }),
  },
  moves: {
    trickroom: typedMove('trickroom', 'Psychic', 'Status', 0),
    followme: typedMove('followme', 'Normal', 'Status', 0),
    helpinghand: typedMove('helpinghand', 'Normal', 'Status', 0),
    swordsdance: typedMove('swordsdance', 'Normal', 'Status', 0),
    rockslide: { ...typedMove('rockslide', 'Rock', 'Physical', 75), target: 'allAdjacentFoes' },
    protect: typedMove('protect', 'Normal', 'Status', 0),
  },
  usage: usageData([
    usageEntry('tr', { moves: [['trickroom', 0.5]] }),
    usageEntry('tr2', { moves: [['trickroom', 0.5]] }),
    usageEntry('hub', { moves: [['trickroom', 0.5], ['followme', 0.5], ['helpinghand', 0.5]] }),
    usageEntry('trsetter', { moves: [['trickroom', 0.5]] }),
    usageEntry('trslow', { moves: [['trickroom', 0.5]] }),
    usageEntry('allrounder', { moves: [['swordsdance', 0.5], ['rockslide', 0.5]] }),
  ]),
});
const signal = (roster: string[], candidate: string, s = snapshot(), sets?: Record<string, unknown>) =>
  comboSignal(roster, candidate, s, openCombos(roster, s, sets), sets);

describe('openCombos', () => {
  it('lists the combos a roster member is on either side of, in table order, whatever the roster order', () => {
    expect(openCombos(['tr', 'rain'], snapshot())).toEqual(['trickRoom', 'rain']);
    expect(openCombos(['rain', 'tr'], snapshot())).toEqual(['trickRoom', 'rain']);
    expect(openCombos(['sloth'], snapshot())).toEqual(['trickRoom']); // the beneficiary side opens it too
    expect(openCombos(['hub'], snapshot())).toEqual(['trickRoom', 'redirectSetup', 'rain', 'helpingHand']);
  });

  it('is empty for a roster with nothing open, and ignores ids that are not in the snapshot', () => {
    expect(openCombos(['plain'], snapshot())).toEqual([]);
    expect(openCombos([], snapshot())).toEqual([]);
    expect(openCombos(['ghost', 'constructor'], snapshot())).toEqual([]);
  });

  it('reads roster members through their sets', () => {
    // tr's set has no Trick Room, so nothing is open; plain's set has it, so trickRoom opens.
    expect(openCombos(['tr'], snapshot(), { tr: { moves: ['protect'] } })).toEqual([]);
    expect(openCombos(['plain'], snapshot(), { plain: { moves: ['trickroom'] } })).toEqual(['trickRoom']);
  });
});

describe('comboSignal: the score', () => {
  // Roster tr + rain: open trickRoom (importance 1) and rain (0.75), 1.75 in total.
  const roster = ['tr', 'rain'];

  it('is the importance of the completed combos over the importance of the open ones', () => {
    expect(signal(roster, 'slowswim').score).toBe(1); // both: 1.75 / 1.75
    expect(signal(roster, 'slow').score).toBeCloseTo(1 / 1.75, 12); // trickRoom only: 0.5714286
    expect(signal(roster, 'swimmer').score).toBeCloseTo(0.75 / 1.75, 12); // rain only: 0.4285714
  });

  it('gives 0, not no data, to a candidate that completes nothing', () => {
    expect(signal(roster, 'plain')).toEqual({ score: 0, reasons: [] });
    // trsetter is on trickRoom's enabler side, but no roster member is on the beneficiary side.
    expect(signal(roster, 'trsetter')).toEqual({ score: 0, reasons: [] });
  });

  it('counts the enabler direction: a Trick Room setter for a slow roster member', () => {
    expect(signal(['sloth'], 'trsetter')).toEqual({
      score: 1,
      reasons: [{ kind: 'completes-combo', combo: 'trickRoom', side: 'enabler', with: 'sloth', from: 'species' }],
    });
  });

  it('never pairs a species with itself', () => {
    // trslow is on both sides of trickRoom; as the only roster member it opens the combo, but cannot complete it for itself.
    expect(signal(['trslow'], 'trslow')).toEqual({ score: 0, reasons: [] });
  });
});

describe('comboSignal: reasons', () => {
  it('names the combo, the candidate\'s side, the partner and how the partner\'s half was known', () => {
    expect(signal(['tr', 'rain'], 'slowswim').reasons).toEqual([
      { kind: 'completes-combo', combo: 'trickRoom', side: 'beneficiary', with: 'tr', from: 'ladder' },
      { kind: 'completes-combo', combo: 'rain', side: 'beneficiary', with: 'rain', from: 'ladder' },
    ]);
  });

  it('prefers the beneficiary direction when both hold', () => {
    // trslow benefits from tr's Trick Room and also sets Trick Room for sloth: the reason is the beneficiary one.
    expect(signal(['sloth', 'tr'], 'trslow').reasons).toEqual([
      { kind: 'completes-combo', combo: 'trickRoom', side: 'beneficiary', with: 'tr', from: 'ladder' },
    ]);
  });

  it('names the first partner in roster order', () => {
    expect(signal(['tr2', 'tr'], 'slow').reasons[0]).toMatchObject({ with: 'tr2' });
    expect(signal(['tr', 'tr2'], 'slow').reasons[0]).toMatchObject({ with: 'tr' });
  });

  it('says a partner\'s half came from its set', () => {
    const sets = { plain: { moves: ['trickroom'] } };
    expect(signal(['plain'], 'slow', snapshot(), sets)).toEqual({
      score: 1,
      reasons: [{ kind: 'completes-combo', combo: 'trickRoom', side: 'beneficiary', with: 'plain', from: 'set' }],
    });
  });

  it('lists at most three, most important first and then by combo id', () => {
    // hub opens trickRoom 1, redirectSetup 0.75, rain 0.75, helpingHand 0.5 (3.0 in total); allrounder completes all four.
    // Order: trickRoom, then rain before redirectSetup by id; helpingHand is cut by the cap.
    const result = signal(['hub'], 'allrounder');
    expect(result.score).toBe(1);
    expect(result.reasons.map((r) => (r.kind === 'completes-combo' ? r.combo : r.kind))).toEqual(['trickRoom', 'rain', 'redirectSetup']);
  });
});

describe('comboSignal: no data and robustness', () => {
  it('has no data when nothing is open, the roster has no member in the snapshot, or the candidate is unknown', () => {
    expect(signal(['plain'], 'slow')).toEqual({ score: null, reasons: [] });
    expect(signal(['ghost'], 'slow')).toEqual({ score: null, reasons: [] });
    expect(comboSignal([], 'slow', snapshot(), ['trickRoom'])).toEqual({ score: null, reasons: [] });
    expect(signal(['tr'], 'ghost')).toEqual({ score: null, reasons: [] });
    expect(signal(['tr'], 'constructor')).toEqual({ score: null, reasons: [] });
  });

  it('turns a combo off when the roster member\'s set drops it', () => {
    // With a set without Trick Room, tr opens nothing, so the signal has no data at all.
    expect(signal(['tr'], 'slow', snapshot(), { tr: { moves: ['protect'] } })).toEqual({ score: null, reasons: [] });
  });

  it('does not modify its inputs and gives the same answer twice', () => {
    const s = snapshot();
    const roster = ['tr', 'rain'];
    const sets = { tr: { moves: ['trickroom'] } };
    const before = JSON.stringify({ s, roster, sets });
    const first = signal(roster, 'slowswim', s, sets);
    expect(signal(roster, 'slowswim', s, sets)).toEqual(first);
    expect(JSON.stringify({ s, roster, sets })).toBe(before);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/engine/combo-signal.test.ts`
Expected: FAIL (`combo-signal.ts` does not exist).

- [ ] **Step 3: Create `src/engine/combo-signal.ts`**

```ts
import type { ID } from '../domain/id';
import { COMBOS, sideMatch, type ComboSide } from './combos';
import { compareIds } from './math';
import { profileOf, setFor, type Profile } from './profile';
import type { ComboId, ComboSource, EngineSnapshot, Reason, SignalOutput } from './types';

const MAX_COMPLETES = 3;

type ComboSnapshot = Pick<EngineSnapshot, 'species' | 'moves' | 'usage'>;

interface Member {
  id: ID;
  profile: Profile;
}

/** The roster members that are in the snapshot, in roster order, each read through its set where `sets` has one. */
function members(roster: readonly ID[], snapshot: ComboSnapshot, sets?: Record<ID, unknown>): Member[] {
  const seen = new Set<ID>();
  const result: Member[] = [];
  for (const id of roster) {
    if (seen.has(id) || !Object.hasOwn(snapshot.species, id)) continue;
    seen.add(id);
    result.push({ id, profile: profileOf(id, snapshot, setFor(sets, id)) });
  }
  return result;
}

/** The combos (table order) for which at least one roster member is on the enabler side or the beneficiary side. */
export function openCombos(roster: readonly ID[], snapshot: ComboSnapshot, sets?: Record<ID, unknown>): ComboId[] {
  const team = members(roster, snapshot, sets);
  return COMBOS.filter((combo) =>
    team.some(
      (m) =>
        sideMatch(combo.enabler, m.id, m.profile, snapshot) !== null || sideMatch(combo.beneficiary, m.id, m.profile, snapshot) !== null,
    ),
  ).map((combo) => combo.id);
}

/** The first roster member (roster order) other than `candidate` on `side`, with how that was known. */
function partner(
  team: readonly Member[],
  candidate: ID,
  side: ComboSide,
  snapshot: ComboSnapshot,
): { with: ID; from: ComboSource } | null {
  for (const m of team) {
    if (m.id === candidate) continue;
    const from = sideMatch(side, m.id, m.profile, snapshot);
    if (from !== null) return { with: m.id, from };
  }
  return null;
}

/**
 * Combo fit: how much of the roster's open combos the candidate completes. `open` is `openCombos` for the roster
 * (computed once by the caller). The candidate completes a combo as beneficiary when it is on the beneficiary side and
 * another roster member is on the enabler side, or as enabler the other way round. The score is the summed importance
 * of the completed combos over the summed importance of the open ones, in [0, 1]. Roster members are read through
 * `sets`; the candidate always uses its ladder profile. No data when nothing is open, the roster has no member in the
 * snapshot, or the candidate is not in the snapshot.
 */
export function comboSignal(
  roster: ID[],
  candidate: ID,
  snapshot: ComboSnapshot,
  open: readonly ComboId[],
  sets?: Record<ID, unknown>,
): SignalOutput {
  if (!Object.hasOwn(snapshot.species, candidate)) return { score: null, reasons: [] };
  const team = members(roster, snapshot, sets);
  if (team.length === 0) return { score: null, reasons: [] };
  const openSet = new Set(open);
  if (openSet.size === 0) return { score: null, reasons: [] };

  const own = profileOf(candidate, snapshot);
  let total = 0;
  let earned = 0;
  const completed: Array<{ importance: number; combo: ComboId; reason: Reason }> = [];
  for (const combo of COMBOS) {
    if (!openSet.has(combo.id)) continue;
    total += combo.importance;
    let found: { side: 'enabler' | 'beneficiary'; with: ID; from: ComboSource } | null = null;
    if (sideMatch(combo.beneficiary, candidate, own, snapshot) !== null) {
      const p = partner(team, candidate, combo.enabler, snapshot);
      if (p !== null) found = { side: 'beneficiary', ...p };
    }
    if (found === null && sideMatch(combo.enabler, candidate, own, snapshot) !== null) {
      const p = partner(team, candidate, combo.beneficiary, snapshot);
      if (p !== null) found = { side: 'enabler', ...p };
    }
    if (found === null) continue;
    earned += combo.importance;
    completed.push({
      importance: combo.importance,
      combo: combo.id,
      reason: { kind: 'completes-combo', combo: combo.id, side: found.side, with: found.with, from: found.from },
    });
  }

  completed.sort((a, b) => b.importance - a.importance || compareIds(a.combo, b.combo));
  return { score: earned / total, reasons: completed.slice(0, MAX_COMPLETES).map((entry) => entry.reason) };
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run src/engine/combo-signal.test.ts` then `npm run typecheck`
Expected: PASS (15 tests); the whole suite then has 615 tests; typecheck clean.

Mutation proof (do it, then undo it): delete the line `if (m.id === candidate) continue;` in `partner`; the test "never pairs a species with itself" must fail. Restore the line.

- [ ] **Step 5: Commit**

```bash
git add src/engine/combo-signal.ts src/engine/combo-signal.test.ts
git commit -m "feat(engine): score candidates by the partner combos they complete" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `suggest` with sets and four signals

**Files:**
- Modify: `src/engine/types.ts` (`SignalName`, `SIGNAL_NAMES`), `src/engine/suggest.ts`, `src/engine/candidates.ts`, `src/engine/index.ts`
- Test: `src/engine/suggest.test.ts`, `src/engine/candidates.test.ts`, `src/engine/index.test.ts`, `src/engine/suggest-real.test.ts`

**Interfaces:**
- Consumes: `readSets` (Task 1), `rosterLacks(roster, snapshot, sets)`, `typeSignal(..., sets)` (Task 2), `openCombos`, `comboSignal` (Task 4), `COMBOS`, `SPREAD_MIN_BASE_POWER`, `TRICK_ROOM_MAX_BASE_SPEED`, `ComboDef`, `ComboSide` (Task 3).
- Produces: `SignalName` gains `'comboFit'`; `SIGNAL_NAMES = ['usageLift', 'typeSynergy', 'roleFit', 'comboFit']`; `DEFAULT_WEIGHTS.comboFit = 0.1`; `contextFor(league, draft, drafterIndex, sets?: Record<ID, PokemonSet>)`; `suggest` reads `ctx.sets`. The index exports everything the UI needs for the new reasons.

- [ ] **Step 1: Edit `src/engine/types.ts`**

Find:
```ts
export type SignalName = 'usageLift' | 'typeSynergy' | 'roleFit';

/** All signals, in the order they appear in every `Suggestion.signals`. */
export const SIGNAL_NAMES: readonly SignalName[] = ['usageLift', 'typeSynergy', 'roleFit'];
```
Replace with:
```ts
export type SignalName = 'usageLift' | 'typeSynergy' | 'roleFit' | 'comboFit';

/** All signals, in the order they appear in every `Suggestion.signals`. */
export const SIGNAL_NAMES: readonly SignalName[] = ['usageLift', 'typeSynergy', 'roleFit', 'comboFit'];
```

(`suggest.ts` does not typecheck again until Step 5; that is expected.)

- [ ] **Step 2: Replace the four test files**

`src/engine/suggest.test.ts`: the four-signal breakdown, "leaves out a signal that no candidate has data for", and the new "combos and entered sets" block. All stage 2 score expectations are unchanged (the fixture's `comboFit` has no data, so it gets weight 0). The arithmetic for the new values is in the test comments.

```ts
import { describe, expect, it } from 'vitest';
import { speciesEntry } from '../domain/test-support';
import { suggest } from './suggest';
import { typedMove, usageData, usageEntry } from './test-support';
import type { EngineSnapshot, SuggestContext, SuggestOptions } from './types';

/**
 * A small universe. Roster member `dra1` (Dragon, weight 100, usage 0.5, runs Fake Out at 60%). Candidates:
 *   stla, stlb, stlc: Steel twins, usage 0.1, co-occurrence 20 with dra1 -> lift 20 / (100 x 0.1) = 2
 *   grd: Ground, usage 0.2, co 5 -> lift 5 / (100 x 0.2) = 0.25
 *   nod: Normal, no usage entry (no lift)
 * None of the five candidates has a usage entry with any role moves, so `roleFit` is 0 for all of them: the roster
 * lacks nine roles (dra1's Fake Out covers `fakeOut`), and nobody fills any.
 * Absolute per-signal scores (see type-signal.test.ts for the type arithmetic):
 *   lift score: stl* (log2 2 + 3) / 6 = 0.6666667; grd (log2 0.25 + 3) / 6 = 0.1666667
 *   type score: stl* 0.4830882; grd 0.3426471; nod 0.2875
 *   role score: 0 for every candidate (see above)
 * Percentile ranks (mid-rank, ties share the average). Lift has data for stla, stlb, stlc and grd (n = 4): the three
 * tied Steels have `below` = 1 (only grd is smaller) and `equal` = 3, so rank = (1 + (3-1)/2) / 3 = 0.6666667; grd is
 * the smallest, rank 0. Type has data for all 5 (n = 5, no ties): stl* is above both nod and grd, so `below` = 2 and
 * `equal` = 1, rank = (2 + 0/2) / 4 = 0.75; grd is above only nod, rank = (1 + 0) / 4 = 0.25; nod is smallest, rank 0.
 * Role is 0 for every candidate (n = 5, all five tied): rank = (0 + (5-1)/2) / 4 = 0.5 for everyone.
 * Default weights 0.35 / 0.3 / 0.25 all have data for stl* and grd, so they re-normalize to themselves (sum 0.9):
 *   stl* = (0.35 x 0.6666667 + 0.3 x 0.75 + 0.25 x 0.5) / 0.9 = 0.6481481 (weights 0.3888889 / 0.3333333 / 0.2777778)
 *   grd  = (0.35 x 0 + 0.3 x 0.25 + 0.25 x 0.5) / 0.9 = 0.2222222
 * nod has no lift, so its lift weight is halved (MISSING_WEIGHT_FACTOR 0.5): weights 0.175, 0.3, 0.25, total 0.725.
 *   nod = (0.175 x 0.5 + 0.3 x 0 + 0.25 x 0.5) / 0.725 = 0.2931034 (weights 0.2413793 / 0.4137931 / 0.3448276)
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
    usageEntry('dra1', { weight: 100, usage: 0.5, moves: [['fakeout', 0.6]], teammates: [['stla', 20], ['stlb', 20], ['stlc', 20], ['grd', 5]] }),
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
const LACKS_NINE = { kind: 'roster-lacks-roles', roles: ['redirection', 'speedControl', 'intimidate', 'weatherTerrain', 'pivot', 'screens', 'support', 'priority', 'disruption'] } as const;

describe('suggest: ranking', () => {
  it('ranks by combined score, then price ascending, then id ascending', () => {
    const result = suggest(ctx(), snapshot());
    // stlb and stlc tie with stla on score; stlb and stlc cost 6, stla costs 10; stlb comes before stlc by id.
    expect(order(result)).toEqual(['stlb', 'stlc', 'stla', 'nod', 'grd']);
    expect(result.suggestions[0].score).toBeCloseTo(0.6481481, 6);
    expect(result.suggestions[3].score).toBeCloseTo(0.2931034, 6);
    expect(result.suggestions[4].score).toBeCloseTo(0.2222222, 6);
    expect(result.considered).toBe(5);
    expect(result.notes).toEqual([LACKS_NINE]);
  });

  it('gives every suggestion all four signals in a fixed order, with score, rank, effective weight and reasons', () => {
    const top = suggest(ctx(), snapshot()).suggestions[0];
    expect(top.species).toBe('stlb');
    expect(top.price).toBe(6);
    expect(top.signals.map((s) => s.signal)).toEqual(['usageLift', 'typeSynergy', 'roleFit', 'comboFit']);
    expect(top.signals[0]).toMatchObject({ score: expect.closeTo(0.6666667, 6), rank: expect.closeTo(0.6666667, 6), weight: expect.closeTo(0.3888889, 6) });
    expect(top.signals[0].reasons).toEqual([{ kind: 'pairs-often-with', with: 'dra1', lift: 2 }]);
    expect(top.signals[1]).toMatchObject({ score: expect.closeTo(0.4830882, 6), rank: 0.75, weight: expect.closeTo(0.3333333, 6) });
    expect(top.signals[1].reasons).toEqual([
      { kind: 'covers-weakness', type: 'Dragon', by: 'resists', weakMembers: ['dra1'] },
      { kind: 'covers-weakness', type: 'Fairy', by: 'resists', weakMembers: ['dra1'] },
      { kind: 'covers-weakness', type: 'Ice', by: 'resists', weakMembers: ['dra1'] },
      { kind: 'adds-coverage', types: ['Fairy', 'Ice', 'Rock'] },
    ]);
    expect(top.signals[2]).toEqual({ signal: 'roleFit', score: 0, rank: 0.5, weight: expect.closeTo(0.2777778, 6), reasons: [] });
    // dra1 opens no combo (base Speed 80, no combo move or ability), so comboFit has no data for anyone: weight 0, and
    // the other three keep exactly their stage 2 weights.
    expect(top.signals[3]).toEqual({ signal: 'comboFit', score: null, rank: 0.5, weight: 0, reasons: [] });
    // Usage 0.1 is above the low-usage line, so there is no informational reason; the flat list is the signals' reasons in order.
    expect(top.reasons).toEqual([...top.signals[0].reasons, ...top.signals[1].reasons, ...top.signals[2].reasons]);
  });

  it('uses only the signals that have data: a candidate with no usage entry has null lift but a real rank', () => {
    const nod = suggest(ctx(), snapshot()).suggestions.find((s) => s.species === 'nod');
    expect(nod).toBeDefined();
    expect(nod?.signals[0]).toMatchObject({ signal: 'usageLift', score: null, rank: 0.5, weight: expect.closeTo(0.2413793, 6) });
    expect(nod?.signals[1]).toMatchObject({ score: expect.closeTo(0.2875, 6), rank: 0, weight: expect.closeTo(0.4137931, 6) });
    expect(nod?.signals[2]).toEqual({ signal: 'roleFit', score: 0, rank: 0.5, weight: expect.closeTo(0.3448276, 6), reasons: [] });
    expect(nod?.reasons.at(-1)).toEqual({ kind: 'no-ladder-usage' });
  });
});

describe('suggest: weights', () => {
  it('lets the options override the default weights', () => {
    // Lift only: stl* rank 0.6666667, grd rank 0; nod has no lift and every other weight is 0, so nod is unscored.
    const liftOnly = suggest(ctx(), snapshot(), { weights: { usageLift: 1, typeSynergy: 0, roleFit: 0 } });
    expect(order(liftOnly)).toEqual(['stlb', 'stlc', 'stla', 'grd']);
    expect(liftOnly.suggestions[0].score).toBeCloseTo(0.6666667, 6);
    expect(liftOnly.suggestions[3].score).toBeCloseTo(0, 6);
    expect(liftOnly.considered).toBe(5);
    expect(liftOnly.notes).toEqual([LACKS_NINE, { kind: 'unscored-candidates', count: 1 }]);

    // Equal weights on lift and type (role at 0): stl* (0.6666667 + 0.75) / 2 = 0.7083333.
    const equal = suggest(ctx(), snapshot(), { weights: { usageLift: 0.5, typeSynergy: 0.5, roleFit: 0 } });
    expect(equal.suggestions[0].score).toBeCloseTo(0.7083333, 6);
    // A zero weight on type and role leaves the lift signal alone: stl* rank 0.6666667.
    const zeroType = suggest(ctx(), snapshot(), { weights: { typeSynergy: 0, roleFit: 0 } });
    expect(zeroType.suggestions[0].score).toBeCloseTo(0.6666667, 6);
    // A zero weight on lift and role leaves the type signal alone: stl* rank 0.75.
    const zeroLift = suggest(ctx(), snapshot(), { weights: { usageLift: 0, roleFit: 0 } });
    expect(zeroLift.suggestions[0].score).toBeCloseTo(0.75, 6);
  });

  it('ignores weights that are not finite non-negative numbers', () => {
    const baseline = suggest(ctx(), snapshot());
    for (const weights of [
      { usageLift: -1, typeSynergy: Number.NaN, roleFit: -1 },
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
    // lowu, edge, justunder and nod are Normal-typed twins with no stored pair and no role moves: all four score alike.
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
    expect(result.notes).toEqual([{ kind: 'cannot-fill-roster', poolSize: 5, openSlots: 6 }, LACKS_NINE]);
    expect(result.suggestions).toHaveLength(5);
    expect(suggest(ctx({ openSlots: 6, remaining: 28 }), snapshot()).suggestions).toEqual([]);
  });

  it('says no-usage-data when there is no usage data, and the lift signal has no data for anyone', () => {
    const s = snapshot();
    s.usage = null;
    const result = suggest(ctx(), s);
    // Without usage data dra1 has no tags at all: the roster lacks all ten roles (fakeOut first, in table order, then the nine above).
    expect(result.notes).toEqual([{ kind: 'no-usage-data' }, { kind: 'roster-lacks-roles', roles: ['fakeOut', ...LACKS_NINE.roles] }]);
    expect(result.suggestions).toHaveLength(5);
    for (const suggestion of result.suggestions) expect(suggestion.signals[0].score).toBeNull();
  });

  it('leaves out a signal that no candidate has data for, instead of counting it as neutral', () => {
    // No usage data: usageLift has no data for anyone, and comboFit neither (dra1 opens no combo), so both get weight 0.
    // Type ranks as in the header (stl* 0.75, grd 0.25, nod 0), role 0.5 for everyone; weights 0.3 and 0.25 (sum 0.55):
    //   stl* = (0.3 x 0.75 + 0.25 x 0.5) / 0.55 = 0.6363636   grd = (0.3 x 0.25 + 0.125) / 0.55 = 0.3636364
    //   nod  = (0.3 x 0 + 0.125) / 0.55 = 0.2272727
    // (Stage 2 counted the missing lift at half weight, which gave 0.6034483 for stl*: the ranking is the same, only the scale.)
    const s = snapshot();
    s.usage = null;
    const result = suggest(ctx(), s);
    expect(result.suggestions.map((x) => x.species)).toEqual(['stlb', 'stlc', 'stla', 'grd', 'nod']);
    expect(result.suggestions[0].score).toBeCloseTo(0.6363636, 6);
    expect(result.suggestions[3].score).toBeCloseTo(0.3636364, 6);
    expect(result.suggestions[4].score).toBeCloseTo(0.2272727, 6);
    expect(result.suggestions[0].signals.map((x) => x.weight)).toEqual([0, expect.closeTo(0.5454545, 6), expect.closeTo(0.4545455, 6), 0]);
  });

  it('lists the notes in a fixed order', () => {
    const s = snapshot();
    s.usage = null;
    const result = suggest(ctx({ openSlots: 6 }), s, { weights: { typeSynergy: 0, roleFit: 0 } });
    // Nothing is scorable (no usage data and the type and role weights are 0): all 5 candidates are unscored.
    expect(result.suggestions).toEqual([]);
    expect(result.considered).toBe(5);
    expect(result.notes).toEqual([
      { kind: 'cannot-fill-roster', poolSize: 5, openSlots: 6 },
      { kind: 'no-usage-data' },
      { kind: 'roster-lacks-roles', roles: ['fakeOut', ...LACKS_NINE.roles] },
      { kind: 'unscored-candidates', count: 5 },
    ]);
  });
});

describe('suggest: no-affordable-candidates', () => {
  it('says so when candidates passed every rule but none fits the budget', () => {
    // 3 open slots: the cheapest way to pick any of the five species costs 13, so 12 is short for all of them.
    expect(suggest(ctx({ openSlots: 3, remaining: 12 }), snapshot())).toEqual({
      suggestions: [],
      considered: 0,
      notes: [{ kind: 'no-affordable-candidates' }, LACKS_NINE],
    });
  });

  it('says nothing when some candidate fits, or when the filters (not the budget) left nobody', () => {
    // At 14 with 3 open slots stla (17) is over budget but four others fit.
    expect(suggest(ctx({ openSlots: 3, remaining: 14 }), snapshot()).notes).toEqual([LACKS_NINE]);
    // Nothing has 90% usage: everyone is removed by the filter, none by the budget. No candidates means no role-lacks note either.
    const filtered = suggest(ctx(), snapshot(), { minUsage: 0.9 });
    expect(filtered.suggestions).toEqual([]);
    expect(filtered.notes).toEqual([LACKS_NINE]);
  });

  it('comes after cannot-fill-roster and before no-usage-data', () => {
    const s = snapshot();
    s.usage = null;
    // 6 open slots, 5 priced species: each needs all five (29 in total), so 28 is short for everyone.
    expect(suggest(ctx({ openSlots: 6, remaining: 28 }), s).notes).toEqual([
      { kind: 'cannot-fill-roster', poolSize: 5, openSlots: 6 },
      { kind: 'no-affordable-candidates' },
      { kind: 'no-usage-data' },
      { kind: 'roster-lacks-roles', roles: ['fakeOut', ...LACKS_NINE.roles] },
    ]);
  });
});

describe('suggest: roster-lacks-roles', () => {
  it('says nothing when the roster lacks no role', () => {
    const s = snapshot();
    if (s.usage === null) throw new Error('fixture has usage');
    s.usage.species.dra1 = usageEntry('dra1', {
      weight: 100,
      usage: 0.5,
      teammates: [['stla', 20], ['stlb', 20], ['stlc', 20], ['grd', 5]],
      moves: [
        ['fakeout', 0.6], ['followme', 0.5], ['tailwind', 0.5], ['uturn', 0.5],
        ['reflect', 0.5], ['helpinghand', 0.5], ['suckerpunch', 0.5], ['encore', 0.5],
      ],
    });
    s.species.dra1.abilities = ['Intimidate'];
    // Intimidate and weatherTerrain still need an ability tag; dra1 covers everything but those two.
    expect(suggest(ctx(), s).notes).toEqual([{ kind: 'roster-lacks-roles', roles: ['weatherTerrain'] }]);
  });

  it('lists the roles in table order, not the order the roster fills them', () => {
    const s = snapshot();
    if (s.usage === null) throw new Error('fixture has usage');
    s.usage.species.dra1 = usageEntry('dra1', { weight: 100, usage: 0.5, teammates: [['stla', 20], ['stlb', 20], ['stlc', 20], ['grd', 5]], moves: [['encore', 0.6], ['fakeout', 0.6]] });
    const result = suggest(ctx(), s);
    const note = result.notes.find((n) => n.kind === 'roster-lacks-roles');
    expect(note).toEqual({
      kind: 'roster-lacks-roles',
      roles: ['redirection', 'speedControl', 'intimidate', 'weatherTerrain', 'pivot', 'screens', 'support', 'priority'],
    });
  });
});

describe('suggest: combos and entered sets', () => {
  /**
   * Roster `trr` (Psychic) runs Trick Room on 50% of ladder sets, so it covers speedControl and opens trickRoom.
   * Candidates `slowa` (base Speed 40) and `fast` (80) are Normal-typed twins with no usage entry and no learnset.
   * usageLift has no data for anyone (no usage entries for the candidates): weight 0. typeSynergy ties (rank 0.5 each),
   * roleFit is 0 for both (rank 0.5 each). comboFit: slowa completes trickRoom (1 / 1 = 1, rank 1), fast 0 (rank 0).
   * Weights 0.3, 0.25, 0.1 (sum 0.65):
   *   slowa = (0.3 x 0.5 + 0.25 x 0.5 + 0.1 x 1) / 0.65 = 0.5769231   fast = (0.15 + 0.125 + 0) / 0.65 = 0.4230769
   *   effective weights 0.4615385, 0.3846154, 0.1538462
   */
  const stats = (spe: number) => ({ hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe });
  const trSnapshot = (): EngineSnapshot => ({
    species: {
      trr: speciesEntry('trr', 'trr', { num: 1, types: ['Psychic'] }),
      slowa: speciesEntry('slowa', 'slowa', { num: 2, baseStats: stats(40) }),
      fast: speciesEntry('fast', 'fast', { num: 3, baseStats: stats(80) }),
    },
    moves: {
      trickroom: typedMove('trickroom', 'Psychic', 'Status', 0),
      protect: typedMove('protect', 'Normal', 'Status', 0),
    },
    usage: usageData([usageEntry('trr', { moves: [['trickroom', 0.5]] })]),
  });
  const trCtx = (sets?: unknown): SuggestContext => ({
    roster: ['trr'],
    pool: ['fast', 'slowa'],
    prices: { slowa: 1, fast: 1 },
    remaining: 100,
    openSlots: 1,
    ...(sets === undefined ? {} : { sets: sets as SuggestContext['sets'] }),
  });

  it('adds the combo signal, with its reason, when the roster opens a combo', () => {
    const result = suggest(trCtx(), trSnapshot());
    expect(result.suggestions.map((s) => s.species)).toEqual(['slowa', 'fast']);
    const [slowa, fast] = result.suggestions;
    expect(slowa.score).toBeCloseTo(0.5769231, 6);
    expect(fast.score).toBeCloseTo(0.4230769, 6);
    expect(slowa.signals[3]).toEqual({
      signal: 'comboFit',
      score: 1,
      rank: 1,
      weight: expect.closeTo(0.1538462, 6),
      reasons: [{ kind: 'completes-combo', combo: 'trickRoom', side: 'beneficiary', with: 'trr', from: 'ladder' }],
    });
    expect(slowa.signals[0]).toMatchObject({ score: null, weight: 0 });
    // The flat list: type reasons (a Normal candidate is immune to the Psychic member's Ghost weakness; both candidates
    // share it, so type still ties), no role reasons, the combo reason, then the informational usage reason.
    expect(slowa.reasons).toEqual([
      { kind: 'covers-weakness', type: 'Ghost', by: 'immune', weakMembers: ['trr'] },
      { kind: 'completes-combo', combo: 'trickRoom', side: 'beneficiary', with: 'trr', from: 'ladder' },
      { kind: 'no-ladder-usage' },
    ]);
    expect(fast.signals[1].score).toBe(slowa.signals[1].score);
  });

  it('reads the roster member\'s entered set: a set without Trick Room closes the combo and makes speed control lacked', () => {
    const result = suggest(trCtx({ trr: { species: 'trr', moves: ['protect'] } }), trSnapshot());
    // comboFit has no data for anyone now: weight 0. Type and role tie: both 0.5, ordered by price then id.
    expect(result.suggestions.map((s) => [s.species, s.score])).toEqual([['fast', 0.5], ['slowa', 0.5]]);
    for (const s of result.suggestions) expect(s.signals[3]).toMatchObject({ score: null, weight: 0 });
    expect(result.notes).toEqual([{ kind: 'roster-lacks-roles', roles: ['fakeOut', ...LACKS_NINE.roles] }]);
  });

  it('says a combo half came from the set when the set supplies it', () => {
    const s = trSnapshot();
    s.usage = usageData([usageEntry('trr', { moves: [['protect', 0.9]] })]); // the ladder trr does not run Trick Room
    expect(suggest(trCtx(), s).suggestions[0].signals[3].score).toBeNull();
    const withSet = suggest(trCtx({ trr: { moves: ['trickroom'] } }), s).suggestions[0];
    expect(withSet.species).toBe('slowa');
    expect(withSet.signals[3].reasons).toEqual([{ kind: 'completes-combo', combo: 'trickRoom', side: 'beneficiary', with: 'trr', from: 'set' }]);
  });

  it('gives the same result with no sets, an empty set table, a malformed one, or sets for species off the roster', () => {
    const baseline = suggest(trCtx(), trSnapshot());
    for (const sets of [{}, null, 5, 'x', [], { slowa: { moves: ['trickroom'] } }, { trr: 'x' }]) {
      expect(suggest(trCtx(sets), trSnapshot()), JSON.stringify(sets)).toEqual(baseline);
    }
  });

  it('does not modify the sets', () => {
    const sets = { trr: { species: 'trr', moves: ['protect', 'trickroom'] } };
    const before = JSON.stringify(sets);
    suggest(trCtx(sets), trSnapshot());
    expect(JSON.stringify(sets)).toBe(before);
  });
});

describe('suggest: a malformed snapshot', () => {
  const invalid = { suggestions: [], considered: 0, notes: [{ kind: 'invalid-snapshot' }] };
  const asSnapshot = (value: unknown) => value as EngineSnapshot;

  it('says invalid-snapshot when the species or moves table is missing or not an object, without throwing', () => {
    for (const bad of [null, {}, { species: {}, moves: 5, usage: null }, { ...snapshot(), moves: undefined }]) {
      expect(() => suggest(ctx(), asSnapshot(bad)), JSON.stringify(bad)).not.toThrow();
      expect(suggest(ctx(), asSnapshot(bad)), JSON.stringify(bad)).toEqual(invalid);
    }
  });

  it('treats malformed usage as no usage data', () => {
    const result = suggest(ctx(), asSnapshot({ ...snapshot(), usage: undefined }));
    expect(result.notes).toEqual([{ kind: 'no-usage-data' }, { kind: 'roster-lacks-roles', roles: ['fakeOut', ...LACKS_NINE.roles] }]);
    expect(result.suggestions).toHaveLength(5);
    for (const suggestion of result.suggestions) expect(suggestion.signals[0].score).toBeNull();
  });

  it('leaves out a species entry that is not an object, without throwing', () => {
    const s = snapshot();
    (s.species as Record<string, unknown>).nod = null;
    expect(() => suggest(ctx(), s)).not.toThrow();
    const result = suggest(ctx(), s);
    expect(order(result)).toEqual(['stlb', 'stlc', 'stla', 'grd']);
    expect(result.considered).toBe(4);
  });

  // A row that is not an [id, number] pair used to make the usage lookups throw a TypeError.
  const badRows: Array<[string, unknown[]]> = [
    ['[5]', [5]],
    ['[null]', [null]],
    ['a sparse array', new Array(1)],
  ];
  for (const field of ['teammates', 'moves'] as const) {
    for (const [label, rows] of badRows) {
      it(`treats a species whose ${field} is ${label} as having no usage data: roster member`, () => {
        const s = snapshot();
        (s.usage!.species as Record<string, unknown>).dra1 = { ...usageEntry('dra1', { weight: 100, usage: 0.5 }), [field]: rows };
        expect(() => suggest(ctx(), s)).not.toThrow();
        const result = suggest(ctx(), s);
        expect(result.considered).toBe(5);
        expect(result.suggestions.length).toBeGreaterThan(0);
      });

      it(`treats a species whose ${field} is ${label} as having no usage data: candidate`, () => {
        const s = snapshot();
        (s.usage!.species as Record<string, unknown>).stla = { ...usageEntry('stla', { usage: 0.1 }), [field]: rows };
        expect(() => suggest(ctx(), s)).not.toThrow();
        const result = suggest(ctx(), s);
        expect(result.considered).toBe(5);
        const stla = result.suggestions.find((suggestion) => suggestion.species === 'stla');
        expect(stla?.signals[0].score).toBeNull();
      });
    }
  }

  it('reports invalid-context first when both the context and the snapshot are malformed', () => {
    expect(suggest({ ...ctx(), roster: 'dra1' } as unknown as SuggestContext, asSnapshot(null))).toEqual({
      suggestions: [],
      considered: 0,
      notes: [{ kind: 'invalid-context' }],
    });
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

`src/engine/candidates.test.ts` (two new `contextFor` tests about sets):

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

describe('selectCandidates: overBudget', () => {
  it('counts the species that pass every rule but fail the budget', () => {
    // 3 open slots, remaining 10: p2, p4, p1 need 11, p3 needs 14, p5 needs 16, so all five are over budget.
    const none = select({ openSlots: 3, remaining: 10 });
    expect(none.candidates).toEqual([]);
    expect(none.overBudget).toBe(5);
    // At 13 p2, p4 and p1 fit; p3 (14) and p5 (16) do not.
    const some = select({ openSlots: 3, remaining: 13 });
    expect(ids(some)).toEqual(['p2', 'p4', 'p1']);
    expect(some.overBudget).toBe(2);
    expect(select({ openSlots: 3, remaining: 100 }).overBudget).toBe(0);
  });

  it('does not count a species that a usage filter, the roster or the dex rule already excluded', () => {
    // p3 is at 90% usage: maxUsage 0.5 removes it, so only p5 is over budget at 13.
    const busy = slice(POOL_NUMS, { p3: 0.9 });
    const filtered = select({ openSlots: 3, remaining: 13 }, busy, [], { maxUsage: 0.5 });
    expect(ids(filtered)).toEqual(['p2', 'p4', 'p1']);
    expect(filtered.overBudget).toBe(1);
    // minUsage 0.5 keeps only p3, which is over budget; the other four fail the filter, not the budget.
    const kept = select({ openSlots: 3, remaining: 13 }, busy, [], { minUsage: 0.5 });
    expect(kept.candidates).toEqual([]);
    expect(kept.overBudget).toBe(1);

    // r1 is on the roster and shares dex number 5 with p5: p5 is excluded by the dex rule, so only p3 is over budget.
    const dex = slice({ ...POOL_NUMS, r1: 5 });
    const byDex = select({ roster: ['r1'], openSlots: 3, remaining: 13 }, dex, ['r1']);
    expect(ids(byDex)).toEqual(['p2', 'p4', 'p1']);
    expect(byDex.overBudget).toBe(1);
  });

  it('does not count a pool id that is not in the snapshot or is on the roster', () => {
    const snapshot = slice({ ...POOL_NUMS, r1: 10 });
    const result = select(
      { roster: ['r1'], pool: ['ghost', 'r1', 'p1'], prices: { ghost: 50, r1: 50, p1: 5 }, openSlots: 1, remaining: 4 },
      snapshot,
      ['r1'],
    );
    expect(result.candidates).toEqual([]);
    expect(result.overBudget).toBe(1); // p1 only
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

  it('returns null when the drafter entry is not an object with a roster array', () => {
    expect(contextFor(league, { drafters: [null], pool: [] } as unknown as DraftState, 0)).toBeNull();
    expect(contextFor(league, { drafters: [{ roster: 'x' }], pool: [] } as unknown as DraftState, 0)).toBeNull();
    expect(contextFor(league, { drafters: [{ remaining: 5, openSlots: 1 }], pool: [] } as unknown as DraftState, 0)).toBeNull();
  });

  it('adds a copy of the entered sets when given an object, and no sets field otherwise', () => {
    const sets = { b: { species: 'b', moves: ['tackle'], points: { hp: 32, atk: 32, def: 2, spa: 0, spd: 0, spe: 0 } } };
    const context = contextFor(league, draft, 1, sets);
    expect(context?.sets).toEqual(sets);
    expect(context?.sets).not.toBe(sets);
    expect(context?.sets?.b).not.toBe(sets.b);
    expect(context?.sets?.b.moves).not.toBe(sets.b.moves);
    expect(context?.sets?.b.points).not.toBe(sets.b.points);
    // Changing the copy leaves the original alone.
    context?.sets?.b.moves?.push('surf');
    expect(sets.b.moves).toEqual(['tackle']);
    for (const bad of [undefined, null, 5, 'x', [1]]) {
      const plain = contextFor(league, draft, 1, bad as never);
      expect(plain !== null && Object.hasOwn(plain, 'sets'), String(bad)).toBe(false);
    }
  });

  it('copies only the set entries that are objects, and keeps an id such as __proto__ as an own entry', () => {
    const given = JSON.parse('{"__proto__": {"moves": ["tackle"]}, "b": 5, "c": {"ability": "x"}}');
    const context = contextFor(league, draft, 1, given);
    expect(Object.keys(context?.sets ?? {})).toEqual(['__proto__', 'c']);
    expect(Object.getPrototypeOf(context?.sets)).toBe(Object.prototype);
  });

  it('returns copies, so changing the context leaves the draft and the league alone', () => {
    const context = contextFor(league, draft, 1);
    expect(context).not.toBeNull();
    if (context === null) return;
    expect(context.roster).toEqual(draft.drafters[1].roster);
    expect(context.roster).not.toBe(draft.drafters[1].roster);
    expect(context.pool).toEqual(draft.pool);
    expect(context.pool).not.toBe(draft.pool);
    expect(context.prices).toEqual(league.prices);
    expect(context.prices).not.toBe(league.prices);

    const before = JSON.stringify({ draft, league });
    context.roster.push('zzz');
    context.pool.push('zzz');
    context.prices.zzz = 99;
    expect(draft.drafters[1].roster).toEqual(['b']);
    expect(JSON.stringify({ draft, league })).toBe(before);
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

`src/engine/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CAN_LEARN_FACTOR,
  COMBOS,
  DEFAULT_LIMIT,
  DEFAULT_WEIGHTS,
  SPREAD_MIN_BASE_POWER,
  TRICK_ROOM_MAX_BASE_SPEED,
  EXPECTED_ABILITY_MIN_SHARE,
  IMMUNITY_ABILITIES,
  MISSING_WEIGHT_FACTOR,
  ROLES,
  RUN_MIN_SHARE,
  SIGNAL_NAMES,
  contextFor,
  suggest,
} from './index';

describe('the engine index', () => {
  it('exports the public functions and constants', () => {
    expect(typeof contextFor).toBe('function');
    expect(DEFAULT_LIMIT).toBe(20);
    expect([...SIGNAL_NAMES]).toEqual(['usageLift', 'typeSynergy', 'roleFit', 'comboFit']);
    expect(DEFAULT_WEIGHTS).toEqual({ usageLift: 0.35, typeSynergy: 0.3, roleFit: 0.25, comboFit: 0.1 });
    expect(COMBOS.map((combo) => combo.id)).toHaveLength(8);
    expect(TRICK_ROOM_MAX_BASE_SPEED).toBe(50);
    expect(SPREAD_MIN_BASE_POWER).toBe(70);
    expect(MISSING_WEIGHT_FACTOR).toBe(0.5);
    expect(ROLES.map((role) => role.id)).toHaveLength(10);
    expect(RUN_MIN_SHARE).toBe(0.1);
    expect(CAN_LEARN_FACTOR).toBe(0.5);
    expect(EXPECTED_ABILITY_MIN_SHARE).toBe(0.5);
    expect(IMMUNITY_ABILITIES.Levitate).toBe('Ground');
  });

  it('exports a working suggest', () => {
    const result = suggest({ roster: [], pool: [], prices: {}, remaining: 0, openSlots: 0 }, { species: {}, moves: {}, usage: null });
    expect(result).toEqual({ suggestions: [], considered: 0, notes: [{ kind: 'roster-full' }] });
  });
});
```

`src/engine/suggest-real.test.ts` (four signals; every candidate on these rosters has combo data):

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ID } from '../domain/id';
import type { Snapshot } from '../domain/types';
import { immunityOf } from './abilities';
import { rosterLacks } from './roles';
import { sanitizeSnapshot } from './snapshot-check';
import { suggest } from './suggest';
import { defensiveComponent } from './type-signal';
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
  ['the trio garchomp + whimsicott + sneasler', ['garchomp', 'whimsicott', 'sneasler']],
] as Array<[string, ID[]]>)('suggestions for %s', (_name, roster) => {
  // Remaining 12 with 3 open slots: a handful of candidates cost too much once two cheap slots are reserved.
  const ctx = rosterContext(roster, 12, 3);
  const result = suggest(ctx, snapshot, { limit: 1000 });
  const candidateIds = ctx.pool.filter((id) => !sharesDexNumber(roster, id));
  const expectedIds = candidateIds.filter((id) => affordable(ctx, id));
  const lacked = rosterLacks(roster, snapshot);

  it('returns exactly the affordable candidates, with no note but roster-lacks-roles', () => {
    expect(expectedIds.length).toBeGreaterThanOrEqual(300);
    expect(candidateIds.length - expectedIds.length).toBeGreaterThanOrEqual(1); // the budget really excludes someone
    expect(result.notes).toEqual(lacked.length > 0 ? [{ kind: 'roster-lacks-roles', roles: lacked }] : []);
    expect(result.considered).toBe(expectedIds.length);
    expect(result.suggestions.map((s) => s.species).sort()).toEqual([...expectedIds].sort());
  });

  it('gives every suggestion a valid score, the right price, all four signals in order, and weights that sum to 1', () => {
    for (const s of result.suggestions) {
      expect(s.score, s.species).toBeGreaterThanOrEqual(0);
      expect(s.score, s.species).toBeLessThanOrEqual(1);
      expect(s.price, s.species).toBe(PRICES[s.species]);
      expect(s.signals.map((signal) => signal.signal), s.species).toEqual(['usageLift', 'typeSynergy', 'roleFit', 'comboFit']);
      expect(s.signals[1].score, s.species).not.toBeNull(); // a non-empty roster always has type data
      expect(s.signals[2].score, s.species).not.toBeNull(); // the roster lacks something for every real candidate here
      expect(s.signals[3].score, s.species).not.toBeNull(); // each of these rosters opens at least one combo (see the combo tests)
      const weightSum = s.signals.reduce((sum, signal) => sum + signal.weight, 0);
      expect(weightSum, s.species).toBeCloseTo(1, 9);
    }
  });

  it('ranks by score, then price, then id', () => {
    for (let i = 1; i < result.suggestions.length; i += 1) {
      const before = result.suggestions[i - 1];
      const after = result.suggestions[i];
      expect(isRankedBefore(before, after), `${before.species} before ${after.species}`).toBe(true);
    }
  });

  it('has plenty of candidates with and without usage data, and keeps the missing signal\'s weight positive but reduced', () => {
    const typeOnly = result.suggestions.filter((s) => s.signals[0].score === null);
    const both = result.suggestions.filter((s) => s.signals[0].score !== null);
    expect(typeOnly.length).toBeGreaterThanOrEqual(100); // 132 when this was written
    expect(both.length).toBeGreaterThanOrEqual(150); // about 215 when this was written
    for (const s of typeOnly) {
      expect(s.signals[0].weight, s.species).toBeGreaterThan(0); // MISSING_WEIGHT_FACTOR still counts it, just less
      expect(s.signals[0].weight, s.species).toBeLessThan(s.signals[1].weight + s.signals[2].weight);
    }
  });

  it('explains every suggestion in the top 20 (evidence leads: nothing reaches the shown list with no reasons at all)', () => {
    const top20 = suggest(ctx, snapshot, { limit: 20 }).suggestions;
    expect(top20.length).toBe(20);
    for (const s of top20) expect(s.signals.some((signal) => signal.reasons.length > 0), s.species).toBe(true);
  });

  /**
   * Regression floor for the deliberate deviation from the stage 2 spec's tuning target ("about 3 to 5 of the top 20
   * have no lift data" for `MISSING_WEIGHT_FACTOR`): once `roleFit` joined as a third signal, the measured counts on
   * these real rosters at the spec's own default (0.5) came out much lower than that target (0 for the pair, 1 for
   * the six-species roster, 0 for the trio — see docs/STATUS.md). This pins those measurements as a real assertion,
   * not just a comment: "evidence leads" holds on real data, with margin.
   */
  it('keeps the top 20 dominated by candidates with real usage data', () => {
    const top20 = suggest(ctx, snapshot, { limit: 20 }).suggestions;
    const withLift = top20.filter((s) => s.signals[0].score !== null);
    const noLift = top20.filter((s) => s.signals[0].score === null);
    expect(withLift.length, roster.join('+')).toBeGreaterThanOrEqual(15); // 20, 19 and 20 when this was written
    expect(noLift.length, roster.join('+')).toBeLessThanOrEqual(5); // 0, 1 and 0 when this was written
  });
});

describe('suggestions on the real snapshot: filters, dex numbers, notes and determinism', () => {
  const pair: ID[] = ['incineroar', 'kingambit'];
  const generous = rosterContext(pair, 200, 5);
  const pairLacks = rosterLacks(pair, snapshot);

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

  it('says roster-lacks-roles for the pair (they cover fakeOut, ability and priority tags, not everything)', () => {
    expect(pairLacks.length).toBeGreaterThan(0);
    expect(pairLacks.length).toBeLessThan(10);
    const result = suggest(generous, snapshot, { limit: 1000 });
    expect(result.notes).toEqual([{ kind: 'roster-lacks-roles', roles: pairLacks }]);
  });

  it('says no-usage-data and drops the lift signal when the snapshot has no usage, and lacks every role', () => {
    const result = suggest(generous, { ...snapshot, usage: null }, { limit: 1000 });
    expect(result.notes).toEqual([{ kind: 'no-usage-data' }, { kind: 'roster-lacks-roles', roles: rosterLacks(pair, { ...snapshot, usage: null }) }]);
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

describe('ability immunities on the real snapshot', () => {
  it('gives Rotom-Wash a higher defensive raw score against a Ground-weak roster with the ability effect than without', () => {
    const view = sanitizeSnapshot(snapshot);
    if (view === null) throw new Error('the committed snapshot must sanitize');
    // Incineroar + Kingambit: Kingambit (Dark/Steel) is weak to Ground, so the roster is exposed to it.
    const roster = ['incineroar', 'kingambit'];
    const plain = roster.map((id) => ({ id, types: view.species[id].types }));
    const withAbility = roster.map((id) => ({ id, types: view.species[id].types, immune: immunityOf(id, view) ?? undefined }));
    const target = view.species.rotomwash.types;
    const immunity = immunityOf('rotomwash', view);
    expect(immunity).toEqual({ type: 'Ground', ability: 'Levitate' });
    const without = defensiveComponent(plain, target);
    const withIt = defensiveComponent(withAbility, target, immunity ?? undefined);
    expect(withIt.raw).toBeGreaterThan(without.raw);
    expect(withIt.score).toBeGreaterThan(without.score);
  });

  it('changes at least a handful of real candidates\' defensive raw scores for a real roster', () => {
    const view = sanitizeSnapshot(snapshot);
    if (view === null) throw new Error('the committed snapshot must sanitize');
    const roster = ['incineroar', 'kingambit'];
    const plain = roster.map((id) => ({ id, types: view.species[id].types }));
    const withAbility = roster.map((id) => ({ id, types: view.species[id].types, immune: immunityOf(id, view) ?? undefined }));
    let changed = 0;
    for (const id of legal) {
      if (roster.includes(id)) continue;
      const target = view.species[id].types;
      const a = defensiveComponent(plain, target);
      const b = defensiveComponent(withAbility, target, immunityOf(id, view) ?? undefined);
      if (a.raw !== b.raw) changed += 1;
    }
    expect(changed).toBeGreaterThanOrEqual(5); // 13 when this was written
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/engine/suggest.test.ts src/engine/candidates.test.ts src/engine/index.test.ts`
Expected: FAIL (three signals in the output; `contextFor` ignores sets; missing exports).

- [ ] **Step 4: Replace `src/engine/candidates.ts`**

```ts
import type { DraftState } from '../domain/derive';
import type { ID } from '../domain/id';
import type { LeagueConfig } from '../domain/league';
import type { PokemonSet } from '../domain/set';
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
  /** Species that pass every rule except the budget (they are in the snapshot, off the roster, pass the filters) but do not fit it. */
  overBudget: number;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A copy of `sets`: each entry that is an object is copied, with its `moves` array and `points` object copied too. */
function copySets(sets: unknown): Record<ID, PokemonSet> | null {
  if (!isRecord(sets)) return null;
  const copy: Record<ID, PokemonSet> = {};
  for (const [id, set] of Object.entries(sets)) {
    if (!isRecord(set)) continue;
    const entry: Record<string, unknown> = { ...set };
    if (Array.isArray(set.moves)) entry.moves = [...set.moves];
    if (isRecord(set.points)) entry.points = { ...set.points };
    // `Object.defineProperty`, not assignment, so an id such as `__proto__` stays an own entry.
    Object.defineProperty(copy, id, { value: entry as unknown as PokemonSet, enumerable: true, writable: true, configurable: true });
  }
  return copy;
}

/**
 * The context for one drafter, from a derived `DraftState`. Derive the draft once and call this for each
 * question. Returns copies of the roster, pool, prices and (when given as an object) the user's entered sets
 * (`DraftFile.sets`), so the caller can change the context without touching the draft, the league or the sets.
 * Returns null when the drafter index is not an integer in range or the inputs are malformed.
 */
export function contextFor(
  league: LeagueConfig,
  draft: DraftState,
  drafterIndex: number,
  sets?: Record<ID, PokemonSet>,
): SuggestContext | null {
  if (typeof league !== 'object' || league === null || typeof league.prices !== 'object' || league.prices === null) {
    return null;
  }
  if (typeof draft !== 'object' || draft === null || !Array.isArray(draft.drafters) || !Array.isArray(draft.pool)) {
    return null;
  }
  if (!Number.isInteger(drafterIndex) || drafterIndex < 0 || drafterIndex >= draft.drafters.length) return null;
  const drafter = draft.drafters[drafterIndex];
  if (typeof drafter !== 'object' || drafter === null || !Array.isArray(drafter.roster)) return null;
  const context: SuggestContext = {
    roster: [...drafter.roster],
    pool: [...draft.pool],
    prices: { ...league.prices },
    remaining: drafter.remaining,
    openSlots: drafter.openSlots,
  };
  const copied = copySets(sets);
  if (copied !== null) context.sets = copied;
  return context;
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
  let overBudget = 0;
  priced.forEach((entry, index) => {
    if (!Object.hasOwn(snapshot.species, entry.species) || onRoster.has(entry.species)) return;
    if (rosterNumbers.has(snapshot.species[entry.species].num)) return;
    const usage = usageOf(snapshot, entry.species);
    if (maxUsage !== null && usage > maxUsage) return;
    if (minUsage !== null && usage < minUsage) return;
    // The `take` cheapest others: if this candidate is among the `take` cheapest overall, take one more and drop it.
    const reserve = index < take ? prefix[take + 1] - entry.price : prefix[take];
    if (entry.price + reserve <= ctx.remaining) candidates.push(entry);
    else overBudget += 1;
  });
  return { candidates, pricedPoolSize: priced.length, overBudget };
}
```

- [ ] **Step 5: Replace `src/engine/suggest.ts`**

```ts
import type { ID } from '../domain/id';
import { selectCandidates } from './candidates';
import { comboSignal, openCombos } from './combo-signal';
import { combineSignals, rankAll } from './combine';
import { liftSignal } from './lift-signal';
import { clamp, compareIds } from './math';
import { readSets } from './profile';
import { roleSignal } from './role-signal';
import { rosterLacks } from './roles';
import { sanitizeSnapshot } from './snapshot-check';
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

export const DEFAULT_WEIGHTS: Record<SignalName, number> = { usageLift: 0.35, typeSynergy: 0.3, roleFit: 0.25, comboFit: 0.1 };
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
 * deterministic; never throws on a plain-data (JSON) context and snapshot (an object with a throwing getter or a
 * Proxy can still throw). See the stage 1, 2 and 3 specs for the candidate rules, the four signals, the rank-based
 * combining, the use of entered sets and the notes. `Suggestion.score` is fit compared with the rest of the candidate pool.
 */
export function suggest(ctx: SuggestContext, snapshot: EngineSnapshot, options: SuggestOptions = {}): SuggestResult {
  const early = (notes: Note[]): SuggestResult => ({ suggestions: [], considered: 0, notes });
  if (!isContext(ctx)) return early([{ kind: 'invalid-context' }]);
  const opts: SuggestOptions = typeof options === 'object' && options !== null ? options : {};
  const view = sanitizeSnapshot(snapshot);
  if (view === null) return early([{ kind: 'invalid-snapshot' }]);

  const roster: ID[] = [];
  for (const id of ctx.roster) {
    if (typeof id === 'string' && Object.hasOwn(view.species, id) && !roster.includes(id)) roster.push(id);
  }
  if (ctx.openSlots === 0) return early([{ kind: 'roster-full' }]);
  if (roster.length === 0) return early([{ kind: 'empty-roster' }]);

  const selection = selectCandidates(ctx, roster, view, opts);
  const weights = resolveWeights(opts);
  const limit = typeof opts.limit === 'number' && Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : DEFAULT_LIMIT;

  // The user's sets for roster members only; read defensively by the profile functions.
  const sets = readSets(ctx.sets, roster);
  // Shared by every candidate this call, so they are computed once rather than inside the per-candidate signals.
  const lacked = rosterLacks(roster, view, sets);
  const open = openCombos(roster, view, sets);

  // Every candidate's signals first: the percentile ranks are taken over the whole candidate pool.
  const outputs: Array<Record<SignalName, SignalOutput>> = selection.candidates.map(({ species }) => ({
    usageLift: liftSignal(roster, species, view.usage),
    typeSynergy: typeSignal(roster, species, view, sets),
    roleFit: roleSignal(roster, species, view, lacked),
    comboFit: comboSignal(roster, species, view, open, sets),
  }));
  const scoresOf = (output: Record<SignalName, SignalOutput>): Record<SignalName, number | null> => ({
    usageLift: output.usageLift.score,
    typeSynergy: output.typeSynergy.score,
    roleFit: output.roleFit.score,
    comboFit: output.comboFit.score,
  });
  const allScores = outputs.map(scoresOf);
  const ranks = rankAll(SIGNAL_NAMES, allScores);
  // A signal that no candidate has data for says nothing this call: it gets weight 0 instead of counting as neutral.
  for (const name of SIGNAL_NAMES) {
    if (allScores.every((scores) => scores[name] === null)) weights[name] = 0;
  }

  const scored: Suggestion[] = [];
  let unscored = 0;
  selection.candidates.forEach(({ species, price }, index) => {
    const output = outputs[index];
    const scores = allScores[index];
    const combined = combineSignals(SIGNAL_NAMES, scores, ranks[index], weights);
    if (combined === null) {
      unscored += 1;
      return;
    }
    const signals: SignalScore[] = SIGNAL_NAMES.map((signal) => ({
      signal,
      score: scores[signal],
      rank: ranks[index][signal],
      weight: combined.weights[signal],
      reasons: output[signal].reasons,
    }));
    const reasons = signals.flatMap((entry) => entry.reasons);
    const extra = usageReason(view, species);
    if (extra !== null) reasons.push(extra);
    scored.push({ species, price, score: clamp(combined.score, 0, 1), signals, reasons });
  });

  const notes: Note[] = [];
  if (selection.pricedPoolSize < ctx.openSlots) {
    notes.push({ kind: 'cannot-fill-roster', poolSize: selection.pricedPoolSize, openSlots: ctx.openSlots });
  }
  if (selection.candidates.length === 0 && selection.overBudget > 0) notes.push({ kind: 'no-affordable-candidates' });
  if (view.usage === null) notes.push({ kind: 'no-usage-data' });
  if (lacked.length > 0) notes.push({ kind: 'roster-lacks-roles', roles: lacked });
  if (unscored > 0) notes.push({ kind: 'unscored-candidates', count: unscored });

  scored.sort((a, b) => b.score - a.score || a.price - b.price || compareIds(a.species, b.species));
  return { suggestions: scored.slice(0, limit), considered: selection.candidates.length, notes };
}
```

- [ ] **Step 6: Replace `src/engine/index.ts`**

```ts
/** The engine's public surface. The UI imports from here; everything else in `src/engine/` is internal. */
export { EXPECTED_ABILITY_MIN_SHARE, IMMUNITY_ABILITIES } from './abilities';
export { contextFor } from './candidates';
export { COMBOS, SPREAD_MIN_BASE_POWER, TRICK_ROOM_MAX_BASE_SPEED } from './combos';
export { MISSING_WEIGHT_FACTOR } from './combine';
export { CAN_LEARN_FACTOR, ROLES, RUN_MIN_SHARE } from './roles';
export { DEFAULT_LIMIT, DEFAULT_WEIGHTS, LOW_USAGE, suggest } from './suggest';
export { SIGNAL_NAMES } from './types';
export type { ComboDef, ComboSide } from './combos';
export type { RoleDef } from './roles';
export type {
  ComboId,
  ComboSource,
  EngineSnapshot,
  Note,
  ProfileSource,
  Reason,
  RoleId,
  RoleSource,
  SignalName,
  SignalScore,
  Suggestion,
  SuggestContext,
  SuggestOptions,
  SuggestResult,
} from './types';
```

- [ ] **Step 7: Run the tests, the suite and the typecheck**

Run: `npx vitest run src/engine/suggest.test.ts src/engine/candidates.test.ts src/engine/index.test.ts src/engine/suggest-real.test.ts` then `npm test` then `npm run typecheck`
Expected: PASS; the whole suite passes (623 tests); typecheck clean.

Mutation proof (do it, then undo it): in `suggest.ts` change `weights[name] = 0;` to `weights[name] = weights[name];`. Several `suggest.test.ts` tests must fail (the stage 2 fixture numbers and "leaves out a signal that no candidate has data for"). Restore the line.

- [ ] **Step 8: Commit**

```bash
git add src/engine/types.ts src/engine/suggest.ts src/engine/candidates.ts src/engine/index.ts src/engine/suggest.test.ts src/engine/candidates.test.ts src/engine/index.test.ts src/engine/suggest-real.test.ts
git commit -m "feat(engine): suggest reads entered sets and ranks with the combo signal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Real-snapshot combo tests and docs

**Files:**
- Create: `src/engine/combos-real.test.ts`
- Modify: `docs/STATUS.md`, `README.md`, `docs/superpowers/specs/2026-09-21-suggestion-engine-stage2-design.md`

**Interfaces:**
- Consumes: everything above. Produces nothing new.

- [ ] **Step 1: Create `src/engine/combos-real.test.ts`**

Floors sit below the measured counts in the comments (see "Pre-verification results"). If a floor fails, report the measured value; do not lower the floor.

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ID } from '../domain/id';
import type { Snapshot } from '../domain/types';
import { openCombos } from './combo-signal';
import { COMBOS, sideMatch } from './combos';
import { profileOf } from './profile';
import { suggest } from './suggest';
import type { SuggestContext } from './types';

const snapshot = JSON.parse(
  readFileSync(new URL('../../data/gen9championsvgc2026regmb/snapshot.json', import.meta.url), 'utf8'),
) as Snapshot;
if (!snapshot.usage) throw new Error('the committed snapshot has no usage data');
const usage = snapshot.usage;
const legal = Object.keys(snapshot.species);
const topUsage = Math.max(...Object.values(usage.species).map((entry) => entry.usage));
const usageOf = (id: ID) => (Object.hasOwn(usage.species, id) ? usage.species[id].usage : 0);
/** The same synthetic prices as suggest-real.test.ts: 1 to 21 points, rising with usage. */
const PRICES: Record<ID, number> = Object.fromEntries(legal.map((id) => [id, 1 + Math.round((20 * usageOf(id)) / topUsage)]));
const rosterContext = (roster: ID[], sets?: SuggestContext['sets']): SuggestContext => ({
  roster,
  pool: legal.filter((id) => !roster.includes(id)),
  prices: PRICES,
  remaining: 12,
  openSlots: 3,
  ...(sets === undefined ? {} : { sets }),
});
const byId = Object.fromEntries(COMBOS.map((combo) => [combo.id, combo]));

describe('the combo table on the real snapshot', () => {
  it('lists only move ids in the legal move table and abilities some legal species can have', () => {
    for (const combo of COMBOS) {
      for (const side of [combo.enabler, combo.beneficiary]) {
        for (const move of side.moves) expect(Object.hasOwn(snapshot.moves, move), `${combo.id} ${move}`).toBe(true);
        for (const ability of side.abilities) {
          expect(legal.some((id) => snapshot.species[id].abilities.includes(ability)), `${combo.id} ${ability}`).toBe(true);
        }
      }
    }
  });

  /** Floors with margin below the counts measured 2026-09-29 (ladder profiles, every legal species), in the comments. */
  it('puts a realistic number of species on each side of each combo', () => {
    const count = (id: string, side: 'enabler' | 'beneficiary') =>
      legal.filter((species) => sideMatch(byId[id][side], species, profileOf(species, snapshot), snapshot) !== null).length;
    const floors: Array<[string, number, number]> = [
      ['trickRoom', 25, 40], // 35 | 58
      ['redirectSetup', 5, 30], // 7 | 47
      ['rain', 5, 5], // 8 | 9
      ['sun', 3, 5], // 4 | 8
      ['sand', 3, 3], // 4 | 5
      ['snow', 3, 5], // 5 | 8
      ['electricTerrain', 1, 3], // 1 | 5
      ['helpingHand', 10, 80], // 15 | 118
    ];
    for (const [id, enabler, beneficiary] of floors) {
      expect(count(id, 'enabler'), `${id} enabler`).toBeGreaterThanOrEqual(enabler);
      expect(count(id, 'beneficiary'), `${id} beneficiary`).toBeGreaterThanOrEqual(beneficiary);
    }
  });

  it('keeps utility spread moves out of the Helping Hand side: Icy Wind alone does not make a spread attacker', () => {
    const icyWindOnly = profileOf('ninetalesalola', snapshot, { moves: ['icywind', 'protect'] });
    expect(sideMatch(byId.helpingHand.beneficiary, 'ninetalesalola', icyWindOnly, snapshot)).toBeNull();
    const withBlizzard = profileOf('ninetalesalola', snapshot, { moves: ['blizzard', 'protect'] });
    expect(sideMatch(byId.helpingHand.beneficiary, 'ninetalesalola', withBlizzard, snapshot)).toBe('set');
  });
});

describe('combos in real suggestions', () => {
  it('surfaces a Swift Swim partner for a Pelipper roster through rain', () => {
    const result = suggest(rosterContext(['pelipper']), snapshot, { limit: 1000 });
    const swampert = result.suggestions.find((s) => s.species === 'swampertmega');
    expect(swampert).toBeDefined();
    expect(swampert?.signals[3].reasons).toContainEqual({ kind: 'completes-combo', combo: 'rain', side: 'beneficiary', with: 'pelipper', from: 'ladder' });
    expect(result.suggestions.indexOf(swampert!)).toBeLessThan(20); // 11th when this was written
  });

  it('credits a Chlorophyll partner for a Torkoal roster through sun', () => {
    const result = suggest(rosterContext(['torkoal']), snapshot, { limit: 1000 });
    const venusaur = result.suggestions.find((s) => s.species === 'venusaur');
    expect(venusaur).toBeDefined();
    expect(venusaur?.signals[3].reasons).toContainEqual({ kind: 'completes-combo', combo: 'sun', side: 'beneficiary', with: 'torkoal', from: 'ladder' });
    expect(venusaur?.signals[3].rank).toBeGreaterThanOrEqual(0.8); // 0.89 when this was written
  });

  it('opens the combos a real roster supports, and gives combo reasons to much of the top 20', () => {
    const pair: ID[] = ['incineroar', 'kingambit'];
    expect(openCombos(pair, snapshot)).toEqual(expect.arrayContaining(['trickRoom', 'helpingHand'])); // also redirectSetup when written
    const top20 = suggest(rosterContext(pair), snapshot).suggestions;
    expect(top20.filter((s) => s.signals[3].reasons.length > 0).length).toBeGreaterThanOrEqual(8); // 18 when this was written
  });
});

describe('entered sets on the real snapshot', () => {
  const pair: ID[] = ['incineroar', 'kingambit'];

  it('gives the same result for no sets and an empty set table', () => {
    expect(suggest(rosterContext(pair, {}), snapshot, { limit: 1000 })).toEqual(suggest(rosterContext(pair), snapshot, { limit: 1000 }));
  });

  it('makes Fake Out a lacked role again when the entered Incineroar set does not run it', () => {
    const lacks = (sets?: SuggestContext['sets']) => {
      const note = suggest(rosterContext(pair, sets), snapshot).notes.find((n) => n.kind === 'roster-lacks-roles');
      return note?.kind === 'roster-lacks-roles' ? note.roles : [];
    };
    expect(lacks()).not.toContain('fakeOut'); // 90%+ of ladder Incineroar run Fake Out
    const set = { species: 'incineroar', ability: 'intimidate', moves: ['flareblitz', 'knockoff', 'partingshot', 'protect'] };
    expect(lacks({ incineroar: set })).toContain('fakeOut');
  });
});
```

- [ ] **Step 2: Run it, the suite, the typecheck and the integration tests**

Run: `npx vitest run src/engine/combos-real.test.ts` then `npm test` then `npm run typecheck` then `npm run test:integration`
Expected: PASS (9 new tests; 631 unit tests in total; 21 integration tests); typecheck clean.

- [ ] **Step 3: Update `docs/STATUS.md`**

In the "Where we are" table, find the row that starts `| 7 | Suggestion engine, stage 3:` and replace the whole row with:
```
| 7 | Suggestion engine, stage 3: entered sets replace ladder guesses, and a partner-combo signal | `specs/2026-09-29-suggestion-engine-stage3-design.md`, `plans/2026-09-29-suggestion-engine-stage3.md` | done: built and reviewed |
```
Change `Tests, all passing: 565 unit tests and 21 integration tests.` to `Tests, all passing: 631 unit tests and 21 integration tests.` (if the line shows a different starting number, still set it to 631).
Change `src/engine/      Pure suggestion engine (increments 5-6). Imports only from src/domain.` to `src/engine/      Pure suggestion engine (increments 5-7). Imports only from src/domain.`
In "Known gaps and deferred items", add this item after the one that starts `- The role-fit signal's \`can-learn\` credit`:
```
- Stage 3 reads entered sets but does not check them (the domain's set checks do that) and does not model combo conflicts (rain against sun, Trick Room against Tailwind) or items (Damp Rock and similar). Trick Room uses base Speed on both sides, since candidates have no set. The Helping Hand combo counts only spread attacks of base power 70 or more, so speed-control spread moves (Icy Wind, Electroweb) do not make a "spread attacker".
```
In "Good places for a reviewer to push", add after the role table item:
```
- The combo table (`src/engine/combos.ts`) and the profile rules (`src/engine/profile.ts`: when an entered set replaces ladder data).
```

- [ ] **Step 4: Update `README.md`**

Find:
```
`src/engine/` holds the suggestion engine through stage 2: candidates that fit the budget, ranked by usage lift, type synergy (including ability immunities) and role fit (speed control, Fake Out, redirection and similar), each with typed reasons. There is no UI yet.
```
Replace with:
```
`src/engine/` holds the suggestion engine through stage 3: candidates that fit the budget, ranked by usage lift, type synergy (including ability immunities), role fit (speed control, Fake Out, redirection and similar) and partner combos (Trick Room, weather, Helping Hand), each with typed reasons. Where you have entered a set for a roster member, the engine reads the set instead of ladder averages. There is no UI yet.
```

- [ ] **Step 5: Add a pointer to the stage 2 spec**

In `docs/superpowers/specs/2026-09-21-suggestion-engine-stage2-design.md`, find:
```
Date: 2026-09-21. Status: design approved in conversation; awaiting spec review.
```
Replace with:
```
Date: 2026-09-21. Status: design approved in conversation; awaiting spec review.

Extended by `docs/superpowers/specs/2026-09-29-suggestion-engine-stage3-design.md` (stage 3): the role, ability and coverage rules below also read the roster's entered sets, and its "Combining" section is amended for signals that no candidate has data for.
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/combos-real.test.ts docs/STATUS.md README.md docs/superpowers/specs/2026-09-21-suggestion-engine-stage2-design.md
git commit -m "test(engine): combos and entered sets on the real snapshot; docs for stage 3" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-Review (spec coverage)

- Sets replace ladder guesses: profiles (Task 1); roles, `rosterLacks`, immunities, attacking types (Tasks 1-2); `suggest` passes sets to the roster side only (Task 5); `contextFor` copies sets (Task 5).
- Profile rules (set moves at share 1 replace ladder moves; set ability by id; species mismatch ignored; unknown id; partial sets): `profile.test.ts` (Task 1).
- `fills-role.from`, `RoleTag.from`, `can-learn` suppressed by set moves: Task 2.
- `covers-weakness` unchanged (clarification in the spec).
- Combo table exactly as specified, plus the spread floor ruling (clarification 1): Task 3.
- `openCombos`, `comboSignal`, both directions, no self-pairing, beneficiary preferred in reasons, `with` in roster order, `from` sources, cap of 3, no data cases: Task 4.
- Default weight 0.1, four signals, weight 0 for a signal nobody has data for, `sets: {}` equals none, malformed sets ignored, no new note: Task 5.
- Real snapshot: legal ids, side floors, Pelipper -> Swampert-Mega, Torkoal -> Venusaur, stage 2 floors (unchanged tests in `suggest-real.test.ts`), sets on real data: Tasks 5-6.
- Docs and the stage 2 spec pointer: Task 6. The stage 3 spec's spread-floor amendment is committed with this plan.

## Later increments (outlined; each gets its own spec and plan)

The app shell: React + Vite UI for league setup, the draft board, the teambuilder and a suggestions panel that runs `deriveDraft`, `contextFor` (with the draft file's `sets`) and `suggest`, and renders reasons and notes as sentences; browser storage for the draft file; static hosting.
