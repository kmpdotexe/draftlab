# Suggestion engine, stage 2: roles, ability immunities and rank-based combining — Design

Date: 2026-09-21. Status: design approved in conversation; awaiting spec review.

Extended by `docs/superpowers/specs/2026-09-29-suggestion-engine-stage3-design.md` (stage 3): the role, ability and coverage rules below also read the roster's entered sets, and its "Combining" section is amended for signals that no candidate has data for.

Parents: `docs/superpowers/specs/2026-09-21-suggestion-engine-stage1-design.md` (stage 1; this spec supersedes its "Combining and ranking" section and the `SignalScore` shape, and extends its types), `docs/superpowers/specs/2026-09-20-draft-lab-design.md` (the "Suggestion engine" section defines signal 3, "Role and mechanics").

## Purpose

Stage 1 ranks candidates by usage lift and type synergy. It has three known weaknesses (recorded in `docs/STATUS.md`): it ignores abilities that make a Pokémon immune to a type; it has no notion of what the roster is missing in terms of jobs (speed control, Fake Out, redirection); and a candidate with no ladder usage data is ranked on one signal only, which puts about half of the top 20 on species nobody plays. Stage 2 fixes all three behind the same `suggest()` interface. Pure TypeScript in `src/engine/`. No UI, no storage.

## Decisions (settled in brainstorming)

- **Three changes in one increment:** a third signal `roleFit`; ability immunities in type synergy; a new combining rule.
- **Combining: rank-normalize each signal, then count a missing signal as neutral at reduced weight.** Measured on three real rosters (the two-species pair, the six most used species, and a trio), counting the number of candidates with no lift data in the top 20: stage 1 as shipped 10, 14 and 14 of 20; a neutral prior alone with absolute scores 10, 14 and 10 (no help, because real lift scores centre near 0.3 while neutral is 0.5); per-call percentile ranks plus a neutral prior at half weight 0, 2 and 0 (a fair share is about 7 to 8). Percentile ranks put every signal on a common scale, need no data-fitted constants and survive data refreshes. The reduced weight is tuned in the plan so that about 3 to 5 of the top 20 have no lift data.
- **Evidence leads.** A candidate with real usage data ranks above an equivalent one without it. Species with no ladder data still appear, lower down (the UI can filter to them with `maxUsage`).
- **Roles come from what a species actually runs** (at least 10% of sets), plus a short "signature" list credited as `can-learn` for species that have no usage entry at all: Fake Out, Follow Me, Rage Powder, Trick Room, Tailwind and Parting Shot. A species that has usage data is never credited for a role it merely can learn.
- **Ability immunities use the expected ability**, never "any available ability": the top-used ability when it is at least 50% of sets.
- **The interface changes additively:** `SignalName` gains `roleFit`; `SignalScore` gains `rank`; `Reason` and `Note` gain members. `suggest()`'s signature is unchanged. `Suggestion.score` now means "fit compared with the rest of the candidate pool", not an absolute grade; the absolute per-signal scores stay in `signals[].score`.
- **Bad input never throws**, nothing is modified, results are deterministic (as in stage 1).

## Facts established (verified 2026-09-21 against the committed Reg M-B snapshot)

- Role moves that exist in the legal move table: every id listed in the role table below. `spotlight`, `teleport` and `spore` are not legal and are not used.
- Species per role, by evidence: run at 10% or more of sets: speed control (Tailwind, Trick Room, Icy Wind, Electroweb) 75 species, Fake Out 28, redirection 7, screens 12, support 39, pivot 29, disruption 64, priority 52. Species that can learn them: Fake Out 36, redirection 43 (28 of those have no usage entry), speed control 331 (nearly every species learns Thunder Wave, Rock Tomb or Bulldoze, so those moves are not counted), screens 189, support 238, disruption 244.
- Abilities: 208 distinct ability names; 239 of 355 legal species have more than one ability slot; among the 223 species with usage data the top ability is the median 99% of sets and at least 90% for 175 of them. Role abilities on legal species: Intimidate 19, Snow Warning 6, Drought 3, Sand Stream 3, Drizzle 2, Electric Surge 1 (the only terrain setter). Storm Drain is not legal.
- Immunity abilities by number of legal species with them available and, in brackets, species where it is the top-used ability: Levitate 11 (7), Flash Fire 9 (3), Sap Sipper 6 (0), Lightning Rod 5 (3), Water Absorb 3 (1), Dry Skin 2 (2), Volt Absorb 1 (1), Earth Eater 1 (1), Motor Drive 1 (0).
- 132 of 355 legal species have no usage entry. For a two-species roster, 37% of candidates have no usage lift, and their stage 1 scores fill half of the top 20.

## Out of scope

Set-specific scoring (stage 3); the UI; role conflicts (a Tailwind team versus a Trick Room team); partial-resistance abilities (Thick Fat, Heatproof, Fluffy, Filter, Solid Rock) and ability downsides (Dry Skin's extra Fire damage); a per-candidate ability choice; sample-size weighting of lifts.

## Module layout

```
Create: src/engine/roles.ts        RoleId, the role table, speciesRoles, rosterLacks
Create: src/engine/abilities.ts    the immunity table, expectedAbility, immunityOf
Create: src/engine/role-signal.ts  roleSignal
Create: src/engine/combine.ts      percentileRanks and the combining rule
Modify: src/engine/types.ts        RoleId, RoleSource, SignalName, SignalScore, Reason, Note
Modify: src/engine/type-signal.ts  ability immunities in defensiveComponent and typeSignal
Modify: src/engine/suggest.ts      three signals, rank-based combining, the new note
Modify: src/engine/index.ts        export the new types and constants
Modify: docs/STATUS.md, README.md, the stage 1 spec (a one-line pointer to this spec)
```

Each new file has a `.test.ts` beside it. The engine imports only from `src/domain/` and itself; nothing imports from `sync/`.

## Types (`src/engine/types.ts`)

```ts
export type RoleId =
  | 'fakeOut' | 'redirection' | 'speedControl' | 'intimidate' | 'weatherTerrain'
  | 'pivot' | 'screens' | 'support' | 'priority' | 'disruption';

/** Where a role tag comes from: a move the species runs, its expected ability, or a signature move it can learn. */
export type RoleSource = 'runs' | 'ability' | 'can-learn';

export type SignalName = 'usageLift' | 'typeSynergy' | 'roleFit';   // SIGNAL_NAMES is in this order

export type Reason =
  // ... all stage 1 reasons, except covers-weakness, which becomes:
  | { kind: 'covers-weakness'; type: TypeName; by: 'resists' | 'immune' | 'ability'; weakMembers: ID[]; ability?: string }
  | { kind: 'fills-role'; role: RoleId; source: RoleSource; via: string };

export type Note =
  // ... all stage 1 notes, plus, after no-usage-data:
  | { kind: 'roster-lacks-roles'; roles: RoleId[] };

export interface SignalScore {
  signal: SignalName;
  /** The signal's absolute score in [0, 1], or null when it has no data for this candidate. */
  score: number | null;
  /** The value that was combined: the candidate's percentile rank for this signal, or 0.5 when the signal has no data. */
  rank: number;
  /** The effective (re-normalized) weight, including the reduced weight of a missing signal. */
  weight: number;
  reasons: Reason[];
}
```

`ability` is present exactly when `by` is `'ability'`. `via` in `fills-role` is the move id (for `runs` and `can-learn`) or the ability name (for `ability`).

## Roles (`src/engine/roles.ts`)

```ts
interface RoleDef {
  id: RoleId;
  /** Starting weights; tuned by the plan-time probe and by use. */
  importance: number;
  moves: readonly string[];          // move ids a species can run to fill the role
  abilities: readonly string[];      // ability names
  signatureMoves: readonly string[]; // credited as can-learn to species with no usage entry
}
```

The table, in this order:

| id | importance | moves | abilities | signatureMoves |
|---|---|---|---|---|
| `fakeOut` | 1 | `fakeout` | | `fakeout` |
| `redirection` | 1 | `followme`, `ragepowder` | | `followme`, `ragepowder` |
| `speedControl` | 1 | `tailwind`, `trickroom`, `icywind`, `electroweb` | | `tailwind`, `trickroom` |
| `intimidate` | 0.75 | | `Intimidate` | |
| `weatherTerrain` | 0.75 | | `Drought`, `Drizzle`, `Sand Stream`, `Snow Warning`, `Electric Surge` | |
| `pivot` | 0.5 | `partingshot`, `uturn`, `voltswitch`, `flipturn` | | `partingshot` |
| `screens` | 0.5 | `reflect`, `lightscreen`, `auroraveil` | | |
| `support` | 0.5 | `helpinghand`, `wideguard`, `quickguard`, `coaching` | | |
| `priority` | 0.5 | `aquajet`, `machpunch`, `iceshard`, `suckerpunch`, `shadowsneak`, `bulletpunch`, `quickattack`, `extremespeed`, `vacuumwave`, `jetpunch`, `firstimpression` | | |
| `disruption` | 0.5 | `encore`, `taunt`, `willowisp`, `yawn`, `sleeppowder`, `nuzzle` | | |

Constants: `RUN_MIN_SHARE = 0.1`, `CAN_LEARN_FACTOR = 0.5`.

`speciesRoles(id, snapshot): RoleTag[]` with `RoleTag = { role: RoleId; source: RoleSource; via: string }`, at most one tag per role, in table order, choosing the strongest source:
1. `runs`: the species has a usage entry and runs a role move at a share of at least `RUN_MIN_SHARE`; `via` is the role move with the highest share (ties by id ascending).
2. `ability`: `expectedAbility(id)` is one of the role's abilities; `via` is that ability name.
3. `can-learn`: only when the species has no usage entry: its learnset contains one of the role's `signatureMoves`; `via` is the first such move in the table's order.
A species that is not in the snapshot has no tags.

`rosterLacks(roster, snapshot): RoleId[]`: the roles (in table order) for which no roster member has a tag with source `runs` or `ability`. A `can-learn` tag on a roster member does not cover a role. Roster ids that are not in the snapshot are ignored.

## Abilities (`src/engine/abilities.ts`)

Constant `EXPECTED_ABILITY_MIN_SHARE = 0.5`.

`expectedAbility(id, snapshot): string | null` returns an ability display name from `species.abilities`:
- if the species has a usage entry with a non-empty `abilities` list: the ability with the highest share (ties by id ascending), provided its share is at least `EXPECTED_ABILITY_MIN_SHARE` and its id matches (by `toID`) one of the species' ability names; otherwise null;
- otherwise (no usage entry, or no ability usage): the species' only ability if it has exactly one, else null.

The immunity table maps an ability name to the type it makes the holder immune to: Levitate and Earth Eater to Ground; Flash Fire to Fire; Water Absorb and Dry Skin to Water; Volt Absorb, Lightning Rod and Motor Drive to Electric; Sap Sipper to Grass. A test checks that every ability in the table appears on at least one legal species.

`immunityOf(id, snapshot): { type: TypeName; ability: string } | null`: `expectedAbility` looked up in the table.

## Type synergy changes (`src/engine/type-signal.ts`)

`TypedMember` gains an optional `immune?: { type: TypeName; ability: string }`. A member's multiplier against an attacking type `T` is 0 when `immune.type === T`, otherwise the usual product over its types (`memberMultiplier`). `defensiveComponent` uses it everywhere it used `multiplier(type, member.types)` (exposure, `weakMembers`) and for the candidate. `typeSignal` fills `immune` from `immunityOf` for every roster member and the candidate. A species without an expected ability in the table changes nothing, so every stage 1 fixture behaves as before.

The `by` value of a `covers-weakness` reason: `'immune'` when the candidate's typing alone gives multiplier 0; else `'ability'` (with `ability`) when its ability gives 0; else `'resists'`. `weakMembers` lists roster members whose multiplier for `T` (ability included) is above 1.

## Role signal (`src/engine/role-signal.ts`)

`roleSignal(roster, candidate, snapshot): SignalOutput` (roster validated, as in stage 1). Let `L = rosterLacks(roster)`. No data (`score: null`) when `L` is empty, or the roster has no member in the snapshot, or the candidate is not in the snapshot. Otherwise the candidate's tags are `speciesRoles(candidate)`; for each role in `L` that it has a tag for, `credit = importance × (source === 'can-learn' ? CAN_LEARN_FACTOR : 1)`;

`score = sum(credit) / sum(importance over L)`, in [0, 1].

Reasons: `fills-role { role, source, via }` for up to 3 of the roles it fills (highest importance first, ties by role id ascending). `suggest` also emits the note `roster-lacks-roles { roles: L }` whenever `L` is non-empty (whether or not the role weight is 0).

## Combining (`src/engine/combine.ts`) and `suggest`

Constants: default weights `usageLift` 0.35, `typeSynergy` 0.3, `roleFit` 0.25; `MISSING_WEIGHT_FACTOR = 0.5` (a start value; the plan tunes it so that 3 to 5 of the top 20 have no lift data on the real rosters). Option weights are validated as in stage 1.

1. Compute all three signals for every candidate (`considered` candidates).
2. **Percentile ranks.** For each signal, over the candidates whose score is not null: `rank = (below + (equal - 1) / 2) / (n - 1)`, where `below` counts candidates with a strictly smaller score, `equal` counts candidates with an equal score (including itself) and `n` is the number of candidates with data; with `n <= 1` the rank is 0.5. Ties share an average rank. `percentileRanks(values: number[]): number[]` is exported from `combine.ts`.
3. **Missing signals.** A signal with no data for a candidate has rank 0.5.
4. **Weights.** For a candidate, `w_s = weight_s` if the signal has data, else `weight_s × MISSING_WEIGHT_FACTOR`. The candidate is **unscored** (left out and counted in `unscored-candidates`) when the sum of `weight_s` over the signals that HAVE data is 0 or there are none. Otherwise `effective_s = w_s / sum(w)` and `score = sum(effective_s × rank_s)`, in [0, 1].
5. `signals` has one entry per `SIGNAL_NAMES`, in order: `score` (absolute or null), `rank` (as combined), `weight` (`effective_s`), `reasons`. `reasons` is the signals' reasons in order, then the informational usage reason, as in stage 1.
6. Ranking (score descending, then price, then id), `limit`, `considered` and the informational usage reasons are as in stage 1.

The percentile pool is the candidate set after the budget and usage filters, so changing a filter can change ranks.

Notes, in order: `invalid-context`, `invalid-snapshot`, `roster-full`, `empty-roster`, `cannot-fill-roster`, `no-affordable-candidates`, `no-usage-data`, `roster-lacks-roles`, `unscored-candidates`.

## Errors and robustness

No function throws on plain-data input. Nothing modifies its arguments or keeps state between calls. Lookups keyed by an id, a move id or an ability name use `Object.hasOwn`. Output is deterministic.

## Testing

Every test must be able to fail: reversed or shuffled inputs where order matters, floors on counts in real-data sweeps, `expect(x).not.toBeNull()` before narrowing, hand-computed expectations with the arithmetic shown in comments.

- **`roles.test.ts`:** the table shape; `speciesRoles` for each source (a species that runs Fake Out at 10% exactly and at 9%; the highest-share `via`; an expected Intimidate ability; a can-learn tag only without a usage entry; no can-learn tag for a species with a usage entry that does not run the move; an unknown species); `rosterLacks` (a can-learn tag does not cover; roster members without ids in the snapshot are ignored; table order).
- **`abilities.test.ts`:** `expectedAbility` (share exactly 0.5 and 0.49; a single-ability species with and without usage; a multi-ability species without usage gives null; an ability id that matches no listed name gives null); `immunityOf` for each table entry; every table ability exists on a real species.
- **`type-signal.test.ts` additions:** a Levitate candidate relieves a roster's shared Ground weakness (hand-computed raw score and the `by: 'ability'` reason with `ability: 'Levitate'`); a roster member with Flash Fire stops counting as weak to Fire (exposure and `weakMembers` change); type immunity wins over ability in `by`; a species whose ability is not in the table changes nothing.
- **`role-signal.test.ts`:** the arithmetic of the fraction on a small roster (importance-weighted, `can-learn` at half); no data for an empty `L`; reason order and the cap of 3; the roster's `can-learn` tag not covering.
- **`combine.test.ts`:** `percentileRanks` on distinct values, ties (average rank), one value (0.5), reversed input; the weight rule (a missing signal at `MISSING_WEIGHT_FACTOR`, unscored when only zero-weight signals have data, option weights).
- **`suggest.test.ts`:** the existing fixtures' expectations are recomputed by hand for the rank rule (the arithmetic is in comments); the three-signal breakdown; the `roster-lacks-roles` note and the notes order.
- **Real snapshot:** every id in the role table exists in the real data (moves in `snapshot.moves`, abilities on some legal species); tag-count floors (Fake Out run by at least 20 species, redirection at least 5, speed control at least 50, pivot at least 20, Intimidate expected ability on at least 15); for the pair, six-species and trio rosters the number of no-lift candidates in the top 20 is within the tuned band and evidence-backed candidates lead; a Levitate candidate's defensive raw score against a roster with a Ground weakness is higher than the same species without the ability effect (the test computes both); all previous property checks (valid scores, ranking, exact affordable set) still hold.

## Plan-time pre-verification

Before the plan asserts numbers, a probe over real rosters measures: the role score distribution and the tag counts above; the tuned `MISSING_WEIGHT_FACTOR`; how many candidates' defensive scores change because of abilities; and how the three-signal ranking looks (which species reach the top 20 and whether the reasons make sense).

## Later increments

Stage 3 (set-specific scoring, weight 0.10), then the app shell: the UI runs `deriveDraft`, `contextFor` and `suggest`, and renders `reasons` and `notes` as sentences (including `roster-lacks-roles`).
