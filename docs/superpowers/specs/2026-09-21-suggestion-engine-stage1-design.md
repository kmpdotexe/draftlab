# Suggestion engine, stage 1 — Design

Date: 2026-09-21. Status: design approved in conversation; awaiting spec review.

Superseded in part by `docs/superpowers/specs/2026-09-21-suggestion-engine-stage2-design.md` (stage 2): the "Combining and ranking" section and the `SignalScore` shape below are replaced there.

Parents: `docs/superpowers/specs/2026-09-20-draft-lab-design.md` (the "Suggestion engine" section defines the four signals and the three stages), `docs/superpowers/specs/2026-09-20-league-draft-design.md` (draft state), `docs/superpowers/specs/2026-09-20-teambuilder-design.md` and `docs/superpowers/specs/2026-09-21-showdown-paste-design.md`.

## Purpose

Given the user's roster, the pool of Pokémon still available and their budget, rank the candidates that would pair well with the roster and say why, in typed reasons the UI can turn into sentences. Stage 1 builds the pipeline and two of the four signals: usage lift and type synergy. Stage 2 (role and mechanics tags) and stage 3 (set-specific scoring) are separate increments behind the same interface. Pure TypeScript in `src/engine/`, plus one oracle test in the integration suite. No UI, no storage.

## Decisions (settled in brainstorming)

- **Stage split:** stage 1 now; stages 2 and 3 later, each with its own spec and plan. The interface does not change across stages.
- **Niche picks:** popularity affects ranking only through usage lift. The UI can also filter by usage (`maxUsage`, `minUsage`). There is no separate niche-boost signal. A low-usage candidate carries an informational reason that never changes its score.
- **Type chart:** a static 18×18 table in `src/engine/typechart.ts`, with an oracle test comparing it to the real `pokemon-showdown` package. The chart is not added to the snapshot, so there is no schema bump and the engine does not depend on sync.
- **The engine takes an already-derived draft context.** The UI runs `deriveDraft` once per change and the engine never re-derives. The engine computes its own budget reserve from the pool and does not use `pointsNeededToFill`.
- **Same dex number:** a candidate that shares a dex number with a roster member is excluded (the Species Clause means they could never be on the same team). There is no option for this.
- **The engine never produces display text**; results carry typed reasons.
- **Bad input never throws**, nothing is modified, and results are deterministic.

## Facts established (verified 2026-09-21 against the committed Reg M-B snapshot and `pokemon-showdown` 0.11.11)

- The Showdown Champions mod exposes the type chart: `Dex.mod('champions').types.get(defending).damageTaken[attacking]` with codes 0 = normal, 1 = super effective, 2 = resisted, 3 = immune. It lists 19 types including `Stellar`; the 355 legal species use 18 (all but `Stellar`).
- 223 of the 355 legal species have a usage entry; every usage species is legal. Each stored teammate list has exactly 80 entries.
- Lift over the 17,840 stored pairs: minimum 0.010, 5th percentile 0.12, 25th 0.39, median 0.95, 75th 2.66, 95th 13.0, maximum 335. So a raw lift needs log scaling and clamping.
- For a roster of Incineroar and Kingambit, 220 of 353 candidates have lift for both, 1 for one, and 132 for none (all species without usage). Those 132 can only be scored by type synergy.
- Every move at 5% share or more in the usage data is present in `snapshot.moves`, so offensive coverage can use real moves.
- Ability-based immunities exist in the data (Levitate on 11 legal species, Flash Fire on 9, and others) but are out of stage 1.

## Out of scope

Role and mechanics tags (stage 2); set-specific scoring (stage 3); ability immunities and other ability effects; predicting what other drafters will take; sample-size weighting of noisy lifts; any UI; browser storage.

## Module layout

```
Create: src/engine/types.ts          SuggestContext, SuggestOptions, SignalName, Reason, Note, SignalScore, Suggestion, SuggestResult
Create: src/engine/typechart.ts      TYPES, effectiveness, multiplier, severity
Create: src/engine/candidates.ts     contextFor, candidate selection (budget reserve, usage filters, same-dex-number rule)
Create: src/engine/lift-signal.ts    usageLift
Create: src/engine/type-signal.ts    typeSynergy (defensive and offensive)
Create: src/engine/snapshot-check.ts sanitizeSnapshot: the snapshot as the engine can safely read it
Create: src/engine/suggest.ts        suggest(): combining, ranking, notes
Create: src/engine/index.ts          the public surface: contextFor, suggest, the constants and the types
Create: sync/showdown/typechart.integration.test.ts   oracle against the real package
Modify: README.md                    one line
```

Each has a `.test.ts` beside it (the oracle test is the exception). The engine imports from `src/domain/` (types, `usage.ts`, `derive.ts`, `league.ts`); `src/domain/` never imports from `src/engine/`; nothing in `src/engine/` imports from `sync/`.

## Types (`src/engine/types.ts`)

```ts
export interface SuggestContext {
  roster: ID[];
  pool: ID[];
  prices: Record<ID, number>;
  remaining: number;
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

export type SignalName = 'usageLift' | 'typeSynergy';

export type Reason =
  | { kind: 'pairs-often-with'; with: ID; lift: number }
  | { kind: 'pairs-rarely-with'; with: ID; lift: number }
  | { kind: 'lift-coverage'; covered: number; of: number }
  | { kind: 'covers-weakness'; type: TypeName; by: 'resists' | 'immune'; weakMembers: ID[] }
  | { kind: 'adds-weakness'; type: TypeName; weakMembers: ID[] }
  | { kind: 'adds-coverage'; types: TypeName[] }
  | { kind: 'low-usage'; usage: number }
  | { kind: 'no-ladder-usage' };

export type Note =
  | { kind: 'invalid-context' }
  | { kind: 'invalid-snapshot' }
  | { kind: 'roster-full' }
  | { kind: 'empty-roster' }
  | { kind: 'cannot-fill-roster'; poolSize: number; openSlots: number }
  | { kind: 'no-affordable-candidates' }
  | { kind: 'no-usage-data' }
  | { kind: 'unscored-candidates'; count: number };

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
  /** One entry per signal in `SIGNAL_NAMES` order (index by `signal`, not by position). */
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

`contextFor(league: LeagueConfig, draft: DraftState, drafterIndex: number): SuggestContext | null` builds a context from a derived `DraftState`: `roster`, `remaining` and `openSlots` from `draft.drafters[drafterIndex]`, `pool` from `draft.pool`, `prices` from `league.prices`. `roster`, `pool` and `prices` are copies, so changing the context never changes the draft or the league. It returns `null` when `drafterIndex` is not an integer in range, or when the drafter entry is not an object with a `roster` array.

## Public function

```ts
export function suggest(ctx: SuggestContext, snapshot: Snapshot, options?: SuggestOptions): SuggestResult;
```

Steps, in order:
1. **Validate.** If `ctx` is not an object, `roster` or `pool` is not an array, `prices` is not an object, `remaining` is not a finite number, or `openSlots` is not a non-negative integer, return `{ suggestions: [], considered: 0, notes: [{ kind: 'invalid-context' }] }`.
   After the context check the snapshot is sanitized (`sanitizeSnapshot`): the `species` and `moves` tables must be objects, otherwise return `{ suggestions: [], considered: 0, notes: [{ kind: 'invalid-snapshot' }] }`; malformed table entries are dropped, and so are usage entries whose `teammates` or `moves` rows are not `[id, number]` pairs; a malformed `usage` becomes null, so `no-usage-data` applies. The rest of the function reads only the sanitized view. `invalid-context` wins when both are invalid.
2. **Roster.** Keep the roster ids that exist in `snapshot.species` (`Object.hasOwn`). If `openSlots` is 0, return no suggestions with `roster-full`. If no roster member remains, return no suggestions with `empty-roster`. (Early returns have `considered: 0`.)
3. **Candidates** (see below).
4. **Score** each candidate with both signals; combine.
5. **Rank** and cut to `limit`.
6. **Notes**, in the fixed order `invalid-context`, `invalid-snapshot`, `roster-full`, `empty-roster`, `cannot-fill-roster`, `no-affordable-candidates`, `no-usage-data`, `unscored-candidates`. `no-affordable-candidates` means candidates that pass every rule except the budget existed, but none fits it (no candidates, and at least one species failed only the budget).

## Candidates (`candidates.ts`)

A pool id is a candidate when all of these hold:
- it exists in `snapshot.species` and has a finite price in `ctx.prices` (own property);
- it is not already on the roster;
- it shares no dex number (`species.num`) with a roster member;
- it passes the usage filters: `usage = snapshot.usage?.species[id]?.usage ?? 0` (own-property lookup), `usage <= maxUsage` if given, `usage >= minUsage` if given (a non-number or NaN filter is ignored);
- it is affordable: with `k = openSlots - 1`, `price + reserve <= remaining`, where `reserve` is the sum of the `k` cheapest prices among the OTHER priced pool species. If fewer than `k` others exist, `reserve` is the sum of all of them.

The reserve is computed for all candidates at once from the pool's prices sorted ascending (price, then id), with prefix sums: if the candidate sits among the `k` cheapest positions the reserve is the sum of the cheapest `k + 1` minus its own price, otherwise the sum of the cheapest `k`. Add `cannot-fill-roster` when the number of priced pool species is less than `openSlots`. Selection also counts `overBudget`: the species that pass every other rule and fail only the budget check.

## Signal: usage lift (`lift-signal.ts`)

For each roster member with a usage entry, `lift = teammateLift(usage, member, candidate)` from `src/domain/usage.ts` (null when the pair is not stored or either species lacks usage). Let `covered` be the members with a non-null lift and `of` the roster members present in the snapshot.

- No usage data at all (`snapshot.usage` is null), or `covered = 0`: the signal has no data (`score: null`).
- Otherwise `score = clamp((mean(log2(lift)) + 3) / 6, 0, 1)`, the mean over the covered members. Lift 1 gives 0.5; lifts of 1/8 and below give 0; 8 and above give 1.
- Reasons: `pairs-often-with { with, lift }` for up to 3 members with `lift > 1` (highest lift first, ties by id ascending); `pairs-rarely-with { with, lift }` for the single lowest lift below 1 (ties by id ascending); `lift-coverage { covered, of }` when `covered < of`.

## Signal: type synergy (`type-signal.ts`)

The 18 types are `Bug, Dark, Dragon, Electric, Fairy, Fighting, Fire, Flying, Ghost, Grass, Ground, Ice, Normal, Poison, Psychic, Rock, Steel, Water` (`Stellar` is not used). `effectiveness(attacking, defending)` is 0, 0.5, 1 or 2 from the chart; `multiplier(attacking, defendingTypes)` multiplies over a species' types (0, ¼, ½, 1, 2 or 4); `severity(m) = clamp(log2(m), -2, 2)` with `m = 0` counted as -2.

The signal has no data when the roster (members present in the snapshot) is empty. Otherwise `score` is the weighted mean of the components that have data, with weights 0.6 for defensive and 0.4 for offensive: `0.6 × defensive + 0.4 × offensive` when both have data, and just `defensive` when offensive has no data.

**Defensive component.**
- For each attacking type `T`: `E_T` is the sum of `severity(multiplier(T, member.types))` over the roster, and `X_T = max(0, E_T)` is the weakness the roster has not already resisted. `c_T = severity(multiplier(T, candidate.types))`.
- `relief_T = min(X_T, -c_T)` when `c_T < 0`, else 0. `harm_T = c_T × (X_T >= 1 ? 1 : 0.25)` when `c_T > 0`, else 0.
- `raw = sum(relief) - sum(harm)`; `defensive = clamp(0.5 + raw / 12, 0, 1)`. The constant 12 (DEFENSIVE_SCALE) lives in one place and is tuned by the plan's probe.
- Reasons: `covers-weakness { type, by, weakMembers }` for up to 3 types with `relief_T > 0`, highest relief first, ties by type name ascending (`by` is `immune` when the candidate's multiplier for `T` is 0, else `resists`; `weakMembers` are the roster members with multiplier above 1, in roster order). `adds-weakness { type, weakMembers }` for up to 2 types with `harm_T > 0` and `X_T >= 1`, highest harm first, ties by type name ascending.

**Offensive component.**
- A species' attacking types are its own types plus the types of its moves in `usage.species[id].moves` with share at least 0.10 (OFFENSIVE_MIN_MOVE_SHARE) whose `snapshot.moves` entry has `category !== 'Status'` and `basePower > 0`. Species with no usage entry, and moves not in `snapshot.moves`, contribute only their own types.
- The roster covers a defending type `d` when some member has an attacking type `a` with `effectiveness(a, d) >= 2` (each defending type judged on its own, ignoring dual typing). `U` is the set of defending types the roster does not cover. If `U` is empty, the component has no data.
- `new` is the members of `U` the candidate covers the same way; `offensive = |new| / |U|`. Reason: `adds-coverage { types }` (the `new` types, sorted) when `|new| > 0`.

## Combining and ranking

Default weights are `usageLift` 0.35 and `typeSynergy` 0.30. A valid entry in `options.weights` (finite, at least 0) replaces the default for that signal; invalid entries are ignored. The signals with a non-null score share the weights: `effective_s = weight_s / sum(weight over signals with data)`. If that sum is 0, or no signal has data, the candidate is unscored: it is left out of `suggestions` and counted in `unscored-candidates`. Otherwise `score = sum(effective_s × score_s)`.

The informational reason follows the signals' reasons: `low-usage { usage }` when the candidate has a usage entry with `usage < 0.03` (LOW_USAGE), `no-ladder-usage` when it has none. Neither changes the score.

`suggestions` are sorted by score descending, then price ascending, then id ascending, and cut to `limit` (a positive integer, default 20; anything else is ignored). `considered` counts all candidates that passed the budget and filters, scored or not. `no-usage-data` is added when `snapshot.usage` is null.

## Errors and robustness

No function throws on any input. Nothing modifies its arguments and nothing keeps state between calls. Lookups keyed by an id or type name use `Object.hasOwn`. Output is deterministic.

## Testing

Every test must be able to fail: reversed or shuffled inputs where order matters, floors on counts in real-data sweeps, `expect(x).not.toBeNull()` before narrowing, and hand-computed expectations checked against the code.

- **`typechart.test.ts` and the oracle** (`sync/showdown/typechart.integration.test.ts`): all 18×18 entries equal the package's `damageTaken` (code 0→1, 1→2, 2→0.5, 3→0), and the type list equals the package's types minus `Stellar`; unit tests for known cases (Dragon → Fairy is 0, Fairy → Dragon is 2, Steel resists Fairy, ×4 and ×¼ stacking, an immune dual type gives 0, `severity` at the ends).
- **`lift-signal.test.ts`:** hand-computed lifts on a small usage table; score at lift 1/8, 1 and 8 (0, 0.5, 1) and beyond (clamped); a mean over two members; partial coverage gives `lift-coverage`; no coverage and null usage give null; reason order and tie-breaks with reversed member order.
- **`type-signal.test.ts`:** a roster with a shared Fairy weakness where a Steel candidate is relieved (`covers-weakness`) and a Poison candidate adds harm (`adds-weakness`); the exact raw and score for a small hand-computed case with the scale constant; the 0.25 harm factor where the roster is not exposed; offensive fraction, the empty-`U` dropout and the weight re-normalization; usage-based move types counted only at 10% share or more and only for damaging moves; an empty roster gives null.
- **`candidates.test.ts`:** reserve with tied prices, a candidate inside and outside the cheapest `k`, `openSlots` 0 and 1, a pool smaller than `openSlots`, exact affordability boundaries, usage filters (a species with no usage entry passes `maxUsage` and fails `minUsage`), the same-dex-number exclusion, and `contextFor` including an out-of-range index.
- **`suggest.test.ts`:** weight re-normalization when a signal is missing, `weights` overrides and a zero weight, the tie-break order (reversed inputs), `limit`, `considered` versus `suggestions`, each note, and malformed context and options never throwing and never mutating.
- **Real snapshot** (`src/engine/suggest-real.test.ts`): for rosters built from real usage (the pair Incineroar and Kingambit, and a six-member roster), every score is in [0, 1], suggestions are sorted and within budget, at least 100 candidates come back for the pair, top suggestions carry at least one reason, candidates with no usage entry appear with `typeSynergy` only. No test asserts specific Pokémon names, so a data refresh does not break it.

## Plan-time pre-verification

Before the plan asserts numbers, a node probe over real rosters checks that the defensive scale (12) and the offensive fraction do not saturate at 0 or 1, and adjusts the two constants if they do.

## Later increments

Stage 2 (role and mechanics tags, including ability immunities such as Levitate and Flash Fire), stage 3 (set-specific scoring), then the app shell: the UI runs `deriveDraft`, `contextFor` and `suggest`, and renders `reasons` and `notes` as sentences.
