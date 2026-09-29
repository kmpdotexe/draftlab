# Suggestion engine, stage 3: roster sets and partner combos — Design

Date: 2026-09-29. Status: design approved in conversation; awaiting spec review.

Parents: `docs/superpowers/specs/2026-09-21-suggestion-engine-stage2-design.md` (stage 2; this spec extends its role, ability and type rules to read entered sets, adds a fourth signal and amends its "Combining" section for signals that no candidate has data for), `docs/superpowers/specs/2026-09-21-suggestion-engine-stage1-design.md`, and `docs/superpowers/specs/2026-09-20-draft-lab-design.md` (the "Suggestion engine" section defines signal 4, "Set-specific", at weight 0.10).

## Purpose

Stages 1 and 2 know a roster member only through ladder averages: a Pelipper "runs Tailwind" because 40% of ladder Pelipper do. Once the user has entered a set, that set is better evidence. Stage 3 does two things behind the same `suggest()` signature:

1. **Sets replace ladder guesses.** Where a roster member has an entered set, the role tags, ability immunities and offensive coverage read the set instead of ladder usage.
2. **A fourth signal, `comboFit`,** rewards candidates that complete a partner combo with the roster (a Trick Room setter and a slow hitter, a rain setter and a Swift Swim user), in either direction. It reads each roster member's set where one exists and ladder usage otherwise, so it works from the first pick.

Pure TypeScript in `src/engine/`. No UI, no storage.

## Decisions (settled in brainstorming)

- **Both changes in one increment** (sets replace guesses, and a combo signal).
- **The combo signal uses ladder data until a set exists**, rather than only entered sets.
- **One "profile" per species** answers "what does this Pokémon run": moves and ability from the entered set where present, otherwise from ladder usage. Every signal that needs moves or abilities reads profiles. Rejected: writing sets into a copy of the usage data (fabricates ladder data and entangles the lift and informational-usage logic), and passing sets into each signal separately (duplicated lookups that drift).
- **Candidates always use the ladder profile.** The user has not built them.
- **Usage lift is unchanged.** It is about species pairs, not sets.
- **A signal with no data for any candidate in a call is left out of that call.** Ranking is unchanged by this; it stops such a signal compressing every score toward 0.5.
- **Bad input never throws**, nothing is modified, results are deterministic.

## Facts established (verified 2026-09-29 against the committed Reg M-B snapshot)

Probe: each ability is counted as available on N legal species, and in brackets the species for which it is the expected ability (stage 2's rule); moves are counted by species running them on at least 10% of ladder sets.

- Weather and terrain setters (expected ability): Drizzle 2 (Politoed, Pelipper), Drought 3 (Charizard-Mega-Y, Ninetales, Torkoal), Sand Stream 3 (Tyranitar, Tyranitar-Mega, Hippowdon), Snow Warning 5, Electric Surge 1 (Raichu-Mega-X). Setting moves run at 10% or more: Rain Dance 6, Sunny Day 1, Sandstorm 1, Snowscape 0.
- Weather and terrain users: Swift Swim 6 available (1 expected: Swampert-Mega), Rain Dish 2 (1), Chlorophyll 6 (2: Venusaur, Vileplume), Solar Power 3 (1), Sand Rush 3 (3), Sand Force 4 (2), Slush Rush 1 (0), Surge Surfer 1 (1: Raichu-Alola). Moves run at 10% or more: Thunder 1, Hurricane 6, Solar Beam 8, Blizzard 8, Rising Voltage 4.
- Trick Room is run by 35 species; 58 legal species have base Speed 50 or lower (42 of them have a usage entry).
- Follow Me 3 and Rage Powder 4 runners; setup moves run at 10% or more: Swords Dance 13, Nasty Plot 4, Dragon Dance 7, Calm Mind 15, Belly Drum 3, Shell Smash 4, Quiver Dance 1, Bulk Up 4.
- Helping Hand 15 runners; 33 damaging spread moves in the move table.
- Not legal, so not used: Storm Drain, Hadron Engine, Protosynthesis, Quark Drive, Power Spot, Battery, Steely Spirit, Flower Gift. Justified is legal but is nobody's expected ability, so Beat Up + Justified is not a combo.
- The engine test fixtures use `speciesEntry`, whose base stats are all 80, so no fixture species is a Trick Room beneficiary unless a test sets its Speed.

## Out of scope

Combo conflicts (rain against sun, Trick Room against Tailwind); items (Damp Rock, Heat Rock and similar); computing real Speed from a set's nature and stat points (candidates have no set, so both sides use base Speed); set legality (the domain's `validateSetAgainstSnapshot` covers it; the engine uses what parts of a set it can read); the UI.

## Module layout

```
Create: src/engine/profile.ts        Profile, profileOf, readSets
Create: src/engine/combos.ts         ComboId, the combo table, sideMatch
Create: src/engine/combo-signal.ts   openCombos, comboSignal
Modify: src/engine/types.ts          SuggestContext.sets, SignalName, ProfileSource, ComboId, ComboSource, Reason
Modify: src/engine/roles.ts          speciesRoles and rosterLacks read profiles; RoleTag.from
Modify: src/engine/abilities.ts      immunityOf reads the profile's ability
Modify: src/engine/type-signal.ts    attackingTypes and roster immunities read profiles
Modify: src/engine/role-signal.ts    fills-role carries from
Modify: src/engine/suggest.ts        read sets, four signals, weight 0 for a signal no candidate has data for
Modify: src/engine/candidates.ts     contextFor takes optional sets
Modify: src/engine/index.ts          export the new types and constants
Modify: docs/STATUS.md, README.md, the stage 2 spec (a one-line pointer to this spec)
```

Each new file has a `.test.ts` beside it. The engine imports only from `src/domain/` and itself.

## Types (`src/engine/types.ts`)

```ts
import type { PokemonSet } from '../domain/set';

export interface SuggestContext {
  // ... the stage 1 fields, plus:
  /** The user's entered sets, keyed by species id (`DraftFile.sets`). Optional; malformed entries are ignored. */
  sets?: Record<ID, PokemonSet>;
}

/** Where a profile fact came from: the user's entered set, or ladder usage and species data. */
export type ProfileSource = 'set' | 'ladder';

export type ComboId =
  | 'trickRoom' | 'redirectSetup' | 'rain' | 'sun' | 'sand' | 'snow' | 'electricTerrain' | 'helpingHand';

/** How a roster member's half of a combo was known: its set, ladder usage, or its species data (base Speed). */
export type ComboSource = 'set' | 'ladder' | 'species';

export type SignalName = 'usageLift' | 'typeSynergy' | 'roleFit' | 'comboFit';   // SIGNAL_NAMES is in this order

export type Reason =
  // ... all stage 2 reasons, except fills-role, which becomes:
  | { kind: 'fills-role'; role: RoleId; source: RoleSource; via: string; from: ProfileSource }
  | { kind: 'completes-combo'; combo: ComboId; side: 'enabler' | 'beneficiary'; with: ID; from: ComboSource };
```

`fills-role.from` describes the candidate's tag, and candidates always use ladder profiles, so in `suggest` output it is always `'ladder'`. It exists because `speciesRoles` is also used for roster members (where `rosterLacks` depends on it) and the UI may show a roster member's roles. `covers-weakness` is unchanged: it describes the candidate's own typing or ability.

In `completes-combo`, `side` is the candidate's side, `with` is the roster member on the other side, and `from` is how that roster member's half was known.

## Profiles (`src/engine/profile.ts`)

```ts
export interface Profile {
  /** Move id -> share of sets. A move from an entered set has share 1. */
  moves: ReadonlyMap<ID, number>;
  movesFrom: ProfileSource;
  /** An ability display name from `species.abilities`, or null. */
  ability: string | null;
  abilityFrom: ProfileSource;
}
```

`profileOf(id, snapshot, set?: unknown): Profile`:
- **Moves.** If `set` is a plain object and its `moves` is an array, the valid set moves are its string elements that are own keys of `snapshot.moves`, without duplicates, in set order. If there is at least one, `moves` maps each to 1 and `movesFrom` is `'set'`. Otherwise `moves` is the ladder list (the usage entry's `moves` rows as id -> share; empty without a usage entry) and `movesFrom` is `'ladder'`.
- **Ability.** If `set.ability` is a string whose `toID` equals the `toID` of one of the species' listed ability names, `ability` is that listed name and `abilityFrom` is `'set'`. Otherwise `ability` is `expectedAbility(id)` (stage 2) and `abilityFrom` is `'ladder'`.
- A set whose `species` field is a string different from `id` is ignored entirely.
- An id that is not in the snapshot gives an empty ladder profile (`moves` empty, `ability` null, both sources `'ladder'`).

`readSets(given: unknown, roster: ID[]): Record<ID, unknown>`: the roster members' entries of `given` when `given` is a plain object (own keys only); anything else gives `{}`. Sets for species that are not on the roster are dropped. `suggest` calls it once; every other function takes the result as an optional `sets` argument and looks up `sets[id]` with `Object.hasOwn`.

A move "is run" by a profile when its share is at least `RUN_MIN_SHARE` (0.1, stage 2). Set moves (share 1) always are.

## Sets in the stage 2 rules

- **`speciesRoles(id, snapshot, sets?)`** reads `profileOf(id, snapshot, sets?.[id])`. `runs` uses the profile's moves (the most-run role move, ties by id ascending, as in stage 2); `ability` uses the profile's ability; `can-learn` applies only when the species has no usage entry and `movesFrom` is `'ladder'` (a species with set moves is never credited for moves it merely can learn). `RoleTag` gains `from`: `movesFrom` for `runs`, `abilityFrom` for `ability`, `'ladder'` for `can-learn`.
- **`rosterLacks(roster, snapshot, sets?)`** passes `sets` through. So a roster Incineroar whose entered set has no Fake Out no longer covers `fakeOut`, even though 90% of ladder Incineroar run it.
- **`immunityOf(id, snapshot, sets?)`** looks the profile's ability up in the immunity table.
- **`attackingTypes(id, snapshot, sets?)`** takes the damaging moves from the profile at `OFFENSIVE_MIN_MOVE_SHARE` or more (set moves always count).
- **`typeSignal(roster, candidate, snapshot, sets?)`** and **`roleSignal(roster, candidate, snapshot, lacked, sets?)`** pass `sets` to the roster side only; the candidate is always looked up without sets.

With no `sets` (or `{}`), every one of these returns exactly what stage 2 returns, apart from the added `from: 'ladder'` field.

## Combos (`src/engine/combos.ts`)

```ts
interface ComboSide {
  abilities: readonly string[];   // ability names; matched against the profile's ability
  moves: readonly string[];       // move ids; matched against moves the profile runs
  maxBaseSpeed?: number;          // matched when the species' base Speed is at most this
  spreadMove?: boolean;           // matched when the profile runs a damaging spread move
}
interface ComboDef { id: ComboId; importance: number; enabler: ComboSide; beneficiary: ComboSide }
```

The table, in this order:

| id | importance | enabler | beneficiary |
|---|---|---|---|
| `trickRoom` | 1 | moves `trickroom` | `maxBaseSpeed` 50 |
| `redirectSetup` | 0.75 | moves `followme`, `ragepowder` | moves `swordsdance`, `nastyplot`, `dragondance`, `calmmind`, `bellydrum`, `shellsmash`, `quiverdance`, `bulkup` |
| `rain` | 0.75 | abilities `Drizzle`; moves `raindance` | abilities `Swift Swim`, `Rain Dish`; moves `thunder`, `hurricane` |
| `sun` | 0.75 | abilities `Drought`; moves `sunnyday` | abilities `Chlorophyll`, `Solar Power`; moves `solarbeam` |
| `sand` | 0.75 | abilities `Sand Stream`; moves `sandstorm` | abilities `Sand Rush`, `Sand Force` |
| `snow` | 0.75 | abilities `Snow Warning`; moves `snowscape` | abilities `Slush Rush`; moves `blizzard` |
| `electricTerrain` | 0.5 | abilities `Electric Surge` | abilities `Surge Surfer`; moves `risingvoltage` |
| `helpingHand` | 0.5 | moves `helpinghand` | `spreadMove` |

Constants `TRICK_ROOM_MAX_BASE_SPEED = 50` (the value in the table) and `SPREAD_MIN_BASE_POWER = 70`.

*Amended at plan time (2026-09-29):* `spreadMove` means a spread **attack**, base power at least `SPREAD_MIN_BASE_POWER`. Measured without the floor, 126 species matched the Helping Hand side, many only through speed-control spread moves (Icy Wind, Electroweb, Snarl, Bulldoze, all 65 or less); with it, 118, keeping Rock Slide (75), Heat Wave, Earthquake and Dazzling Gleam.

`sideMatch(side, id, profile, snapshot): ComboSource | null` checks, in this order, and returns the source of the first check that matches, or null:
1. the profile's ability is in `side.abilities` -> `abilityFrom`;
2. the profile runs one of `side.moves` -> `movesFrom`;
3. `side.spreadMove` and the profile runs a move whose move-table entry has `target` `'allAdjacentFoes'` or `'allAdjacent'`, a `category` other than `'Status'` and `basePower` at least `SPREAD_MIN_BASE_POWER` -> `movesFrom`;
4. `side.maxBaseSpeed` is set and the species' `baseStats.spe` is a finite number at most it -> `'species'`.

A species that is not in the snapshot matches nothing. Fields the sanitizer does not check (`target`, `baseStats`) are read defensively: a missing or wrong-typed value simply does not match.

## Combo signal (`src/engine/combo-signal.ts`)

`openCombos(roster, snapshot, sets?): ComboId[]`: the combos (table order) for which at least one roster member matches the enabler side or the beneficiary side.

`comboSignal(roster, candidate, snapshot, open, sets?): SignalOutput` (`open` is computed once by the caller, like `lacked` in stage 2). No data (`score: null`) when `open` is empty, the roster has no member in the snapshot, or the candidate is not in the snapshot. Otherwise, for each open combo, the candidate **completes** it when either:
- **as beneficiary:** the candidate matches the beneficiary side (ladder profile) and some roster member other than the candidate matches the enabler side; or
- **as enabler:** the candidate matches the enabler side and some roster member other than the candidate matches the beneficiary side.

`score = sum(importance of completed combos) / sum(importance of open combos)`, in [0, 1].

Reasons: one `completes-combo` per completed combo, with `side: 'beneficiary'` when that direction holds (else `'enabler'`), `with` the first roster member (roster order) on the other side, and `from` that member's `sideMatch` source. At most 3, highest importance first, ties by combo id ascending.

## Combining (amends stage 2)

Default weights: `usageLift` 0.35, `typeSynergy` 0.3, `roleFit` 0.25, `comboFit` 0.1.

Stage 2's rule stands, with one change: **a signal that has no data for any candidate in the call gets weight 0 for every candidate** (rank 0.5, as before), instead of counting at `weight x MISSING_WEIGHT_FACTOR`. A signal that has data for some candidates keeps the stage 2 rule. Because every candidate is shifted the same way, the ranking does not change; the scores do. The unscored rule is unchanged (a candidate is unscored when the weights of the signals that have data for it sum to 0).

`suggest` implements this by setting the weight of such a signal to 0 before calling `combineSignals`, which is unchanged: a zero weight stays zero after `MISSING_WEIGHT_FACTOR`, and a signal nobody has data for adds nothing to the unscored test.

## `suggest`

1. As stage 2 up to candidate selection.
2. `sets = readSets(ctx.sets, roster)`; `lacked = rosterLacks(roster, view, sets)`; `open = openCombos(roster, view, sets)`.
3. Per candidate: `liftSignal` (unchanged), `typeSignal(roster, c, view, sets)`, `roleSignal(roster, c, view, lacked, sets)`, `comboSignal(roster, c, view, open, sets)`.
4. Ranks, weights (with the amendment above), ranking, `limit`, reasons and notes as in stage 2. No new note.

`isContext` does not look at `sets`: a malformed `sets` is ignored, never `invalid-context`.

`contextFor(league, draft, drafterIndex, sets?)`: when `sets` is a plain object, the context gets a copy (each set copied, its `moves` array copied); otherwise the context has no `sets`.

## Errors and robustness

No function throws on plain-data input. Nothing modifies its arguments. Lookups keyed by an id, a move id or an ability name use `Object.hasOwn`. Output is deterministic. `suggest(ctx)` and `suggest({ ...ctx, sets: {} })` give equal results.

## Testing

Every test must be able to fail: reversed inputs where order matters, floors on counts in real-data sweeps, `expect(x).not.toBeNull()` before narrowing, and hand-computed expectations with the arithmetic in comments, checked by an independent script before they are written into a test.

- **`profile.test.ts`:** set moves replace ladder moves (share 1, `movesFrom: 'set'`); a set with only unknown moves or no moves keeps the ladder moves; duplicates dropped; a set ability matched by id and returned as the listed name; an ability the species cannot have is ignored; a set for another species (`species` mismatch) is ignored; no set gives the ladder profile; an unknown id; `readSets` drops non-roster keys and non-objects.
- **`combos.test.ts`:** the table shape; `sideMatch` for each check and its order (ability before moves before speed), base Speed exactly 50 and 51, a spread move by target, a Status spread move not counting, malformed `target`/`baseStats` not matching.
- **`combo-signal.test.ts`:** the fraction on a small roster; both directions; the beneficiary direction preferred in the reason; `with` and `from` (a set, a ladder move, base Speed); the cap of 3 and its order; no data when nothing is open.
- **Stage 2 rules with sets:** `roles.test.ts`, `abilities.test.ts`, `type-signal.test.ts` and `role-signal.test.ts` each gain cases where a set changes the answer (a set without Fake Out; a set ability of Levitate on a two-ability species; a set move adding offensive coverage) and one showing `{}` changes nothing.
- **`suggest.test.ts`:** the all-missing rule (the no-usage-data cases are recomputed by hand; the other fixture numbers stay as they are); the four-signal breakdown; a set changing a ranking; `sets: {}` equal to no sets; malformed `sets` ignored.
- **Real snapshot:** every move and ability in the combo table exists (moves in `snapshot.moves`, abilities on some legal species); floors on how many species match each side; a Pelipper roster surfaces Swampert-Mega through `rain` and a Torkoal roster surfaces Venusaur through `sun`; the stage 2 top-20 floors still hold on the pair, six-species and trio rosters; `sets: {}` equals no sets.

## Plan-time pre-verification

Before the plan asserts numbers, a probe over the real pair, six-species and trio rosters measures: the open combos, the `comboFit` score distribution (how many candidates score above 0), how the top 20 changes with four signals, and whether the stage 2 no-lift floors still hold. The measured numbers go in the plan.

## Later increments

The app shell: the UI runs `deriveDraft`, `contextFor` (with the draft file's `sets`) and `suggest`, and renders `reasons` and `notes` as sentences, including `completes-combo` and the `from` of `fills-role`.
