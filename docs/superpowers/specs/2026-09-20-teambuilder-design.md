# Draft Lab: Teambuilder Logic (Plan 1) Design

Date: 2026-09-20
Status: Draft for review
Parent specs: `docs/superpowers/specs/2026-09-20-draft-lab-design.md` ("Teambuilder"), `docs/superpowers/specs/2026-09-20-league-draft-design.md` (set model, saved file). Where this document differs from them for this increment, this document is the more specific one.

## Purpose

The logic behind the teambuilder: an item table in the snapshot, validation of a Pokémon set against the format, stat calculation, the user's roster sets, match teams with Item Clause and Species Clause checks, and the saved-file changes that carry sets and teams. Pure TypeScript in `src/domain/`, plus one change to the sync. No UI, no storage, no Showdown paste (that is Plan 2).

## Decisions made with the user (2026-09-20)

- **The teambuilder builds roster sets and match teams.** One set per drafted Pokémon, then teams of up to 6 picked from those sets, with the clause checks applied to the team. Choosing which 4 to bring at team preview is out of scope.
- **Item data comes from the Showdown Champions mod through the sync** and is stored in the snapshot (`schemaVersion` 2). Validation is pure functions like the rest of the domain code.
- **Two plans.** This document is Plan 1. Plan 2 is Showdown paste import and export, and builds on the item names added here.

## Scope

In scope: the snapshot item table (sync + types), `validateSetAgainstSnapshot`, `computeStats`/`computeSetStats`, `RosterSets`, `MatchTeam`, `validateTeam`, and saved-file version 2 with migration from version 1.

Out of scope: Showdown paste import and export, choosing the 4 Pokémon to bring, any UI, browser storage, per-species Tera (Champions has none), the suggestion engine.

## Findings that shaped the design (verified 2026-09-20)

- **Stat formula** (`node_modules/pokemon-showdown/dist/data/mods/champions/scripts.js`, `statModify`, for the VGC formats where `levelclausemod` is absent): HP = `base + points + 75`; every other stat = `base + points + 20`; then a raised stat becomes `floor(stat * 110 / 100)` and a lowered stat `floor(stat * 90 / 100)`. Level is fixed at 50 (`Adjust Level = 50`) and there are no IVs. The mod's overflow caps apply only where a rule enables them, which the VGC formats do not.
- **Items:** the Champions mod has 583 items of which 148 are legal (not marked `Past`, `Future`, `Unobtainable` or `CAP`). 75 are Mega stones. Assault Vest is `Past` (illegal); Sitrus Berry, Passho Berry, Leftovers, Choice Scarf, Focus Sash and Life Orb are legal. Each restricted item has an `itemUser` list of species *names*; for a Mega stone it is the base species (Staraptite: `["Staraptor"]`).
- **Mega forms** are separate species with a `requiredItem` display name (Staraptor-Mega: "Staraptite"). 79 legal species have a `requiredItem`.
- **Species Clause** in Showdown compares `species.num`. Forms share their number (Charizard, Charizard-Mega-X and Charizard-Mega-Y are all 6), so a team cannot hold two forms of one Pokémon even though each form is its own draft pick. **Item Clause** is 1: no two team members hold the same item. Both are team rules (Flat Rules), not roster rules.
- **Pre-plan check on real data (2026-09-20):** among the 40 most-used species, 15 need a stone; a set built from each species' own top ability, top real item, top four moves and top spread passes every rule in Part 2 (with the Floettite exemption above) and a greedy six-member team (Charizard-Mega-Y, Kingambit, Basculegion, Garchomp, Incineroar, Sneasler) passes both clauses.
- **Data inconsistencies to handle:** (a) three legal species, `ogerponwellspringtera`, `ogerponhearthflametera` and `ogerponcornerstonetera`, require masks that are not legal items in the mod, and none of them appears in ladder usage; (b) Smogon's usage data uses the item id `nothing` for "no item" (it passes through `pruneChaos`); (c) `itemUser` for Light Ball lists 15 Pikachu forms that are not legal species.
- **Showdown exports stat points in the EVs field** (`EVs: 2 HP / 32 Atk / 32 Spe`, `Level: 50`). Relevant to Plan 2.

## Part 1: Item data in the snapshot

### Types (`src/domain/types.ts`)

```ts
export interface ItemEntry {
  id: ID;
  name: string;        // display name, e.g. "Sitrus Berry"
  usableBy?: ID[];     // species ids allowed to hold it; absent means anyone
}
```

`Snapshot` gains `items: Record<ID, ItemEntry>` and its `schemaVersion` becomes the literal `2`. `SnapshotMeta.schemaVersion` also becomes `2`. Every place that builds a snapshot or meta (sync, tests, fixtures) moves to 2.

### Loader (`sync/showdown/source.ts`)

`ShowdownFormatData` gains `items: Record<ID, ItemEntry>` and `warnings: string[]`. Items are read from the format's mod dex: every item that `exists` and is not `isNonstandard`. `usableBy` is the item's `itemUser` names normalized with `toID`, filtered to legal species ids.
- If the filter removes every id of a non-empty `itemUser`, the item is dropped from the table.
- If it removes some, the item is kept with the remaining ids.
- One aggregated warning string is added per load when anything was filtered, for example `Dropped 15 restricted-species entries that are not legal in <format> (lightball: 12, ...)`.
- One warning string per legal species whose `requiredItem` is not in the item table, for example `ogerponwellspringtera requires "Wellspring Mask", which is not a legal item`. This is a warning, not a failure.

### Builder (`sync/build.ts`)

- `Limits` gains `minItems`; `DEFAULT_LIMITS` becomes `{ minSpecies: 150, minMoves: 100, minItems: 100 }`.
- `validateSnapshot` additionally checks: item count is at least `minItems`; every item's key equals its `id`; every `usableBy` id is a legal species.
- `buildSnapshot` puts `showdown.items` into the snapshot, sets `schemaVersion: 2`, and appends `showdown.warnings` to `meta.warnings`.
- A validation failure still fails the run and leaves the previous snapshot files untouched (existing behavior).

### Regeneration and cross-check

`npm run sync` regenerates `data/gen9championsvgc2026regmb/`. A unit test over the committed snapshot asserts that every (species, item) pair in `usage` with a share of at least 1% has its item id in `snapshot.items`, skipping the id `nothing`. Like the moves cross-check, it requires a floor on the number of pairs checked (measured 981 on the plan date; the test floor is 500) and reports every violation at once. As of the plan date there are no violations other than `nothing`.

## Part 2: Checking a set against the format (`src/domain/set-check.ts`)

```ts
export type SetSnapshot = Pick<Snapshot, 'formatId' | 'species' | 'moves' | 'learnsets' | 'items'>;
export function validateSetAgainstSnapshot(set: PokemonSet, snapshot: SetSnapshot, path: string): Problem[];
```

Never throws. It first runs `validateSet(set, path)`; if that returns any problem it returns those problems and stops. Otherwise it collects every problem from these rules:

1. **Species** must be a key of `snapshot.species`, else `path.species`: `"<id>" is not legal in <formatId>`. If this fails, the remaining rules are skipped.
2. **Ability** (if present) must equal `toID` of one of the species' `abilities` names, else `path.ability`: `"<id>" is not an ability of <species name> (<names joined by ", ">)`.
3. **Each move** must be in `snapshot.learnsets[species]`, else `path.moves[i]`: `"<id>" is not a legal move for <species name> in <formatId>`. A move id unknown to `snapshot.moves` gets the same message.
4. **Item** (if present) must be a key of `snapshot.items`, else `path.item`: `"<id>" is not a legal item in <formatId>`. If the item has `usableBy` and is NOT the species' own `requiredItem`, the species id or `toID(species.baseSpecies)` must be in it, else `path.item`: `"<item name>" can only be held by <usableBy species names (or ids when unknown) joined by ", ">`. A Mega form's own required stone is exempt because a stone's `itemUser` can name the form the Mega changes from instead of its base species (Floettite lists `Floette-Eternal`, while Floette-Mega's base species is Floette).
5. **Required item:** if the species' `requiredItem` is not null, the set's item must equal `toID(requiredItem)`, else `path.item`: `<species name> must hold <requiredItem>` (this covers both a missing item and a different item).

A problem means "this set is not legal as written", not "this set is incomplete". A species-only set for an ordinary species has no problems.

## Part 3: Stat calculation (`src/domain/stats.ts`)

```ts
export const LEVEL = 50;
export type Stats = Record<StatName, number>;
export function computeStats(baseStats: StatTable, nature?: NatureName, points?: StatPoints): Stats;
export function computeSetStats(set: PokemonSet, snapshot: Pick<Snapshot, 'species'>): Stats | null;
```

`computeStats`: a missing `nature` is neutral; missing `points` (or a missing stat in a partial object) is 0. HP = `base + points + 75`. For each other stat `v = base + points + 20`; if the nature raises it the result is `Math.floor((v * 110) / 100)`, if it lowers it `Math.floor((v * 90) / 100)`, otherwise `v`. `computeSetStats` looks up `snapshot.species[set.species].baseStats` and returns `null` for an unknown species; it never throws. No special cases (no one-HP Pokémon, no overflow cap).

## Part 4: Roster sets, match teams and the saved file (`src/domain/team.ts`, `src/domain/file.ts`)

```ts
export type RosterSets = Record<ID, PokemonSet>;   // key must equal set.species; sets are for the drafter at league.me
export interface MatchTeam { name: string; members: ID[]; }
export interface TeamCheck { problems: Problem[]; complete: boolean; }
export function validateTeam(
  team: MatchTeam, roster: ID[], sets: RosterSets, snapshot: SetSnapshot, teamSize: number,
): TeamCheck;
```

`roster` is the user's drafted species ids (from `deriveDraft(...).drafters[league.me].roster`); `teamSize` is 6 for the shipped format (the app reads it from the format's `minTeamSize`). `validateTeam` never throws. `complete` is true when `members.length === teamSize` and there are no problems. Problem paths are prefixed `team.members[i]`. Checks, in this order:
1. `members.length > teamSize` → `team.members`: `at most <teamSize> members (found <n>)`.
2. For each member `i`: a repeated id (the second and later occurrences) → `team.members[i]`: `"<id>" is listed twice`, and that member gets no further checks in steps 2 to 4; otherwise an id not in `roster` → `team.members[i]`: `"<id>" is not on your roster` (the checks continue); then `validateSetAgainstSnapshot(sets[id] ?? { species: id }, snapshot, "team.members[i]")`.
3. **Species Clause:** for each member `j` (not a repeat, species known to `snapshot.species`), if an earlier member has a species with the same `num`, report one problem for `j`, naming the first such earlier member → `team.members[j]`: `"<b>" and "<a>" are the same Pokémon (dex number <n>); Species Clause`.
4. **Item Clause:** for each member `j` (not a repeat) whose set holds an item, if an earlier member's set holds the same item id, report one problem for `j`, naming the first such earlier member → `team.members[j].item`: `"<b>" and "<a>" both hold <item name>; Item Clause` (members without an item are skipped; the item name is the snapshot's display name, or the id if the item is unknown).

Choosing which 4 to bring is not modeled.

### Saved file version 2

```ts
export interface DraftFile {
  schemaVersion: 2;
  league: LeagueConfig;
  picks: ID[];
  sets: RosterSets;
  teams: MatchTeam[];
}
```

- `serializeDraftFile` writes version 2 (same formatting as today).
- `parseDraftFile` accepts `schemaVersion` 1 or 2. Any other value is one error `unsupported schemaVersion <x> (this version reads 1 and 2)` at path `schemaVersion`. A version-1 file is migrated: `sets` becomes `{}`, `teams` becomes `[]`, and the returned file has `schemaVersion: 2`.
- Layer 1 (shape) additionally requires, for version 2: `sets` is an object whose every value is an object; `teams` is an array whose every entry has a string `name` and a list-of-strings `members`. Errors use paths `sets`, `sets.<id>`, `teams`, `teams[i]`.
- Layer 2 (league) is unchanged. Layer 3 (picks replay) is unchanged.
- **Layer 4 (sets and teams, structural only):** every set passes `validateSet(set, "sets.<id>")` and its key equals `set.species`; otherwise these are errors and the file is refused. Legality against the snapshot is never checked at load, so a regulation change cannot lock the user out of their file.
- **Warnings** (returned with `ok: true`, in addition to the existing ones, after them): a set whose species is not on the roster of the drafter at `league.me` (path `sets.<id>`: `"<id>" is not on your roster; the set is ignored`); a team member not on that roster (path `teams[i].members[j]`: `"<id>" is not on your roster`). The roster comes from `deriveDraft(league, picks, snapshot).drafters[league.me].roster`.

## Errors

Bad input never throws; every validator returns `Problem[]`. The only loud failures are in the sync: a broken Showdown or Smogon shape fails the run and keeps the last good snapshot.

## Testing

- **Sync:** hand-built fixtures for the item table; a missing required stone gives a warning and the run still succeeds; `usableBy` filtering (some ids removed, all ids removed drops the item, aggregated warning text); `validateSnapshot` rejects too few items, a key that differs from its `id`, and a `usableBy` id that is not a legal species; the previous snapshot is untouched when items validation fails; an integration test against the real package (148 legal items, Sitrus Berry present, Assault Vest absent, Staraptite `usableBy` includes `staraptor`).
- **Cross-check:** the committed-snapshot test described above.
- **Set validation:** one failing case per rule; the ability message lists the real options; a Mega form with a wrong or missing item; a stone on a species not in `usableBy`; a stone on the base species of the Mega it belongs to is accepted; a malformed set returns problems and does not throw.
- **Stats:** the Incineroar example (base 95/115/90/80/90/60, Jolly, points 2 HP / 32 Atk / 32 Spe → 172 / 167 / 110 / 90 / 110 / 123), plus cases where the raise and the lower each truncate a fractional result; missing nature; missing points; `computeSetStats` unknown species.
- **Teams:** each rule on its own with the exact paths and messages, including Charizard against Charizard-Mega-X (Species Clause), two members holding the same item, a repeat, a member off the roster, too many members, `complete` for 5 versus 6 members, and a member with no set.
- **File:** a version-1 file opens and migrates; version 2 round-trips exactly; wrong version; each new shape error; a set keyed under the wrong species is refused; the new warnings; the existing layers still behave (existing tests are updated for version 2).
- **Real snapshot:** validate plausible sets for several real species, then a full six-member team including one Mega form with its stone.
