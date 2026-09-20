# Draft Lab: Set Model, League Config and Draft Board Design

Date: 2026-09-20
Status: Draft for review
Parent spec: `docs/superpowers/specs/2026-09-20-draft-lab-design.md` (this document implements its "League config", "Draft board" and the set-model part of "Teambuilder"; where they differ, this document is the more specific one for this increment)

## Purpose

Pure TypeScript domain logic for the middle of Draft Lab: the Pokémon set model, the league configuration, a saved-file format with validation, price-list import, and the draft board (pick recording, derived state, undo). No UI, no browser storage, no network. It builds on the merged data layer (`Snapshot`, `ID`, `toID`, `StatName`).

## Decisions made with the user (2026-09-20)

- **The draftable unit is the snapshot species id.** Charizard, Charizard-Mega-X and Charizard-Mega-Y are three separate picks, each with its own price.
- **League rules in v1: extra banned Pokémon only**, on top of the regulation's own rules. Budget and roster size are always enforced. No Mega caps, price-band caps or type caps.
- **State is a pick log plus pure derivation functions**, validated by hand-written validators. No schema library and no new dependencies.

## Scope

In scope: `src/domain/` files listed below, with unit tests.

Out of scope (later increments): checking a set against the snapshot's legal moves, abilities and items; Showdown paste import/export; stat calculation; storing item names in the snapshot; the suggestion engine; any UI; browser storage; trades, skipped picks and auctions.

## Findings that shaped the design (verified 2026-09-20)

- No Terastallization on the Champions ladder: every species' `Tera Types` table in the Smogon data is only `nothing`. The set model has no Tera field. The Champions equivalent, Mega Evolution, is expressed through the held item.
- Showdown's Champions mod adds stat points 1:1 into the stat (HP = base + points + 75; other stats base + points + 20, then nature); there are no IVs. The limits of 32 per stat and 66 in total come from the ladder data (asserted in `sync/smogon/chaos.real-sample.test.ts`) and the game; the mod does not declare them itself.
- The snapshot has no item list, so a set's `item` is stored as an id and not validated here.

## Files

All in `src/domain/`, each with a sibling `*.test.ts`. Dependencies point one way: these files import only from `./id`, `./types` and each other.

| File | Responsibility |
|---|---|
| `problem.ts` | `Problem` type shared by every validator |
| `natures.ts` | The 25 natures |
| `set.ts` | `PokemonSet` and its structural validator |
| `league.ts` | `LeagueConfig` and its validator |
| `derive.ts` | Turn order and `deriveDraft` |
| `draft.ts` | `checkPick`, `applyPick`, `undoPick` |
| `prices.ts` | `parsePriceCsv` |
| `file.ts` | `DraftFile`, `parseDraftFile`, `serializeDraftFile` |

## Shared types

```ts
// problem.ts
export interface Problem { path: string; message: string; }

// league.ts: the only part of the snapshot the draft logic needs.
export type LegalSpeciesSource = Pick<Snapshot, 'formatId' | 'species'>;
```

Bad input never throws; validators return `Problem[]`. Only programmer errors (for example an out-of-range drafter index passed to a helper) throw. All functions are pure and never modify their arguments.

## Set model (`natures.ts`, `set.ts`)

```ts
export type NatureName =
  | 'Adamant' | 'Bashful' | 'Bold' | 'Brave' | 'Calm'
  | 'Careful' | 'Docile' | 'Gentle' | 'Hardy' | 'Hasty'
  | 'Impish' | 'Jolly' | 'Lax' | 'Lonely' | 'Mild'
  | 'Modest' | 'Naive' | 'Naughty' | 'Quiet' | 'Quirky'
  | 'Rash' | 'Relaxed' | 'Sassy' | 'Serious' | 'Timid';
export const NATURES: Record<NatureName, { plus: Exclude<StatName,'hp'> | null; minus: Exclude<StatName,'hp'> | null }>;

export const MAX_STAT_POINT = 32;
export const MAX_TOTAL_STAT_POINTS = 66;
export const MAX_MOVES = 4;

export type StatPoints = Record<StatName, number>;

export interface PokemonSet {
  species: ID;          // required
  ability?: ID;
  item?: ID;
  moves?: ID[];         // at most 4, unique
  nature?: NatureName;
  points?: StatPoints;  // six integers 0..32, total at most 66
}

export function validateSet(set: PokemonSet, path: string): Problem[];
```

Natures, with what they raise (+) and lower (-): Hardy, Docile, Serious, Bashful, Quirky are neutral (both null). Lonely +atk -def; Brave +atk -spe; Adamant +atk -spa; Naughty +atk -spd; Bold +def -atk; Relaxed +def -spe; Impish +def -spa; Lax +def -spd; Timid +spe -atk; Hasty +spe -def; Jolly +spe -spa; Naive +spe -spd; Modest +spa -atk; Mild +spa -def; Quiet +spa -spe; Rash +spa -spd; Calm +spd -atk; Gentle +spd -def; Sassy +spd -spe; Careful +spd -spa.

`validateSet` is structural only: `species` is a non-empty string; `moves` (if present) has at most 4 entries, each a non-empty string, no duplicates; `nature` (if present) is one of the 25; `points` (if present) has all six keys, each an integer in 0..32, with a total of at most 66. Checking against the snapshot is the teambuilder increment.

## League config (`league.ts`)

```ts
export interface LeagueConfig {
  name: string;               // non-empty
  formatId: string;           // e.g. "gen9championsvgc2026regmb"
  drafters: string[];         // names, in first-round order
  order: 'snake' | 'linear';
  rounds: number;             // also the roster size
  me: number;                 // index into drafters: the user's slot
  budget: number;             // points per roster
  prices: Record<ID, number>; // species id -> points; absent means unavailable
  extraBans: ID[];            // species banned by this league
}

export function validateLeague(league: LeagueConfig, path: string): Problem[];
```

`validateLeague` rules (each violation is one `Problem` whose `path` points at the field, for example `league.drafters[2]`):
- `name` is a non-empty string after trimming.
- `formatId` is a non-empty string.
- `drafters` has 2 to 32 entries; each is a non-empty string after trimming; names are unique ignoring case.
- `order` is `'snake'` or `'linear'`.
- `rounds` is an integer from 1 to 30.
- `me` is an integer with `0 <= me < drafters.length`.
- `budget` is a positive integer.
- every price is a non-negative integer (keys are species ids; a price of 0 is a valid price).
- `extraBans` is an array of non-empty strings.

## Draft state and derivation (`derive.ts`)

The draft state is the league plus `picks: ID[]`, the species ids in the order they were picked. Who picked what is derived, never stored.

```ts
/** Which drafter makes pick number n (0-based). Throws RangeError if n is outside 0 .. drafters*rounds-1. */
export function drafterAt(league: LeagueConfig, n: number): { round: number; drafter: number };
```

For pick `n` with `D` drafters: `round = floor(n / D)` and `position = n % D`. In a `linear` draft the drafter is `position`. In a `snake` draft the drafter is `position` when `round` is even and `D - 1 - position` when `round` is odd. `round` here is 0-based; `PickRecord.round` below is 1-based.

```ts
export interface PickRecord { number: number; round: number; drafter: number; species: ID; price: number; } // number and round are 1-based

export interface DrafterState {
  name: string;
  roster: ID[];               // species in pick order
  spent: number;
  remaining: number;          // budget - spent
  openSlots: number;          // rounds - roster.length
  /** Sum of the cheapest `openSlots` prices in the pool; 0 when openSlots is 0; null when the pool has fewer species than openSlots. */
  pointsNeededToFill: number | null;
  /** true when pointsNeededToFill is null or exceeds remaining. A warning flag, not a rule. */
  cannotFillRoster: boolean;
}

export interface DraftState {
  picks: PickRecord[];
  drafters: DrafterState[];   // same order as league.drafters
  /** Legal, priced, not banned, not picked. Sorted by price descending, then id ascending. */
  pool: ID[];
  onTheClock: { number: number; round: number; drafter: number } | null; // null when complete
  complete: boolean;          // picks.length === drafters * rounds
}

export function deriveDraft(league: LeagueConfig, picks: ID[], snapshot: LegalSpeciesSource): DraftState;
```

`deriveDraft` recomputes everything from scratch on each call and assumes the picks are valid (they come from `applyPick`). It is total on that assumption: a picked species with no price counts as price 0. It throws only if `picks.length` exceeds `drafters * rounds` (a programmer error). The pool is the keys of `snapshot.species` that have an entry in `league.prices`, are not in `league.extraBans`, and are not in `picks`. `pointsNeededToFill` uses the pool as it stands after the last pick, for each drafter independently.

## Recording picks (`draft.ts`)

```ts
export function checkPick(league: LeagueConfig, picks: ID[], species: ID, snapshot: LegalSpeciesSource): Problem | null;
export function applyPick(league: LeagueConfig, picks: ID[], species: ID, snapshot: LegalSpeciesSource):
  { ok: true; picks: ID[] } | { ok: false; problem: Problem };
export function undoPick(picks: ID[]): ID[];
```

`checkPick` tests the reasons below in this order and returns the first that applies; the message must name the species and, where a number is relevant, the numbers. The `path` is `picks[<index>]` where `<index>` is `picks.length` (the slot being filled).
1. the draft is complete;
2. the species is not in `snapshot.species` (not legal in this format);
3. the species has no price in `league.prices`;
4. the species is in `league.extraBans`;
5. the species is already in `picks`;
6. the species costs more than the on-the-clock drafter's remaining points (message states the price and the remaining points).

A pick that leaves the drafter unable to fill their roster is allowed; it shows up as `cannotFillRoster`. `applyPick` returns a new array with the species appended, or the problem. `undoPick` returns a copy without the last pick, and an empty list stays empty.

## Price list import (`prices.ts`)

```ts
export function parsePriceCsv(text: string, snapshot: LegalSpeciesSource):
  { prices: Record<ID, number>; unmatched: string[]; problems: Problem[] };
```

- Lines are split on `\r?\n`; blank lines are skipped.
- The separator of a line is its last tab if it contains one, otherwise its last comma (so a paste from a spreadsheet works, and names may contain commas). Fields are trimmed and one pair of surrounding double quotes is removed.
- The first non-blank line is a header, and is skipped, if its points field is not a non-negative integer.
- A row's name is matched by `toID(name)` against the keys of `snapshot.species`. A name with no match goes into `unmatched` (as written) and not into `prices`. There is no fuzzy matching.
- A points field that is not a non-negative integer is a problem `line N: "<text>" is not a whole number of points`. A line with no separator is a problem `line N: expected "name,points"`.
- A species listed twice is a problem `line N: "<name>" is listed twice (first on line M)`; the first price is kept.
- `problems` is empty when the whole input was usable; unmatched names are reported separately and are not problems.

## Saved file (`file.ts`)

```ts
export interface DraftFile { schemaVersion: 1; league: LeagueConfig; picks: ID[]; }

export type ParseResult =
  | { ok: true; file: DraftFile; warnings: Problem[] }
  | { ok: false; errors: Problem[] };

export function parseDraftFile(text: string, snapshot: LegalSpeciesSource): ParseResult;
export function serializeDraftFile(file: DraftFile): string; // JSON.stringify(file, null, 2) plus a trailing newline
```

`parseDraftFile` runs three layers and stops at the first layer that has errors:
1. **Shape:** the text is valid JSON (error path `file`); the top level is an object with `schemaVersion === 1` (a different version is a single error naming the version found), and with `league` and `picks` of the right JSON types; every `league` field has the right JSON type (string, number, array, object of numbers).
2. **League:** `validateLeague`.
3. **Picks replay:** each pick is checked in order with `checkPick`, against the picks before it; the first failure is reported as one error with `path` `picks[i]` and `message` `pick <i+1>: <the checkPick message>`.

**Warnings**, returned with `ok: true`: `league.formatId` differs from `snapshot.formatId`; a key in `league.prices` or an entry in `league.extraBans` that is not in `snapshot.species`. Such entries are ignored by the derivation. A file with any error is refused whole.

## Testing

Plain unit tests with small hand-built snapshots, plus a few against the real committed Reg M-B snapshot (`data/gen9championsvgc2026regmb/snapshot.json`).

- **Turn order:** `drafterAt` for linear and snake with 2, 3 and 4 drafters against hand-computed sequences; 3 drafters snake, picks 0..8 → `[0,1,2,2,1,0,0,1,2]`; out-of-range `n` throws `RangeError`.
- **Derivation:** the pool shrinks with each pick and is sorted price descending then id ascending; spent, remaining and open slots are right for each drafter; `onTheClock` advances and becomes `null` with `complete: true` at the end; banned and unpriced species never appear in the pool; `pointsNeededToFill` cases (open slots 0, pool too small → null, sum of cheapest); `cannotFillRoster` true and false.
- **Picks:** each refusal reason has its own test, and the order of the checks is tested (a species that is both banned and taken reports the ban); `applyPick` does not modify its input; `undoPick` on an empty list; apply then undo returns the original picks.
- **Sets:** `validateSet` for every rule; all 25 natures present with the correct plus/minus (neutral natures null).
- **League:** `validateLeague` one failing case per rule, and paths in messages.
- **Price CSV:** with and without header, tab-separated and comma-separated, quoted names, unmatched names, duplicate rows, bad points, a line with no separator, CRLF line endings.
- **File:** serialize then parse round-trips exactly; each layer's errors (bad JSON, wrong schema version, missing fields, bad league field, illegal pick with its pick number); each warning; a file with an error is refused whole.
- **Real snapshot:** price every Reg M-B species (for example 1 to 20 points by usage rank), run a full mock draft of 4 drafters with snake order and 6 rounds picking the cheapest available pick each time, and assert the derived state is consistent at every step (the pool never contains a picked species; total points spent equals the sum of the picked prices; the final state is complete).
