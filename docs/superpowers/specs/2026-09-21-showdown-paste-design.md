# Showdown paste import and export (Teambuilder Plan 2) — Design

Date: 2026-09-21. Status: design approved in conversation; awaiting spec review.

Parents: `docs/superpowers/specs/2026-09-20-teambuilder-design.md` (Plan 1, merged), `docs/superpowers/specs/2026-09-20-draft-lab-design.md`.

## Purpose

Read and write the text format Pokémon Showdown uses for sets and teams, so users can move their sets between Draft Lab and Showdown. Pure TypeScript in `src/domain/`, plus one oracle test in the integration suite that compares against the real `pokemon-showdown` package. No UI, no clipboard or file handling, no storage.

## Decisions (settled in brainstorming)

- **Approach:** a hand-written pure parser and exporter (no runtime dependency on `pokemon-showdown`), with the real package used only as a test oracle in the integration suite. Wrapping `Teams.import` was rejected: it drags a large Node-side package into the app, defaults a missing Level to 100 and does no legality checking.
- **Bad pastes are imported leniently.** A set that is not legal as written is still returned, with its problems listed beside it. Lines the set model has no place for are dropped and reported as notes. Nothing else is thrown away, so a normal-Showdown team (252-EV spreads, Tera types, IVs) still shows up and the user fixes it.
- **Mega forms:** import rewrites a base species holding its Mega stone into the Mega form (each form is its own draft pick); export always writes the form name with its stone and never rewrites.
- **Bad input never throws**; results carry `Problem[]` (`{ path, message }`) like the rest of the domain.

## Facts established (verified against the installed package, `pokemon-showdown` 0.11.11, Champions mod)

- Showdown's `Teams.export` writes `EVs: 2 HP / 32 Atk / 32 Spe` for Champions stat points 1:1, `Level: 50`, `<Nature> Nature`, then `- Move` lines, and writes a Mega Pokémon as the form species (`Charizard-Mega-Y @ Charizardite Y`).
- `Teams.import` keeps `Charizard @ Charizardite Y` as base Charizard, defaults a missing `Level:` to 100, adds `ivs` of 31, and parses nickname `Kitty (Incineroar) (F)`, `Shiny: Yes`, `Tera Type: Fire` and `IVs: 0 Atk` into fields this app's `PokemonSet` does not have.
- Species names from `Teams.export` normalize with `toID` to snapshot species ids (`Charizard-Mega-Y` → `charizardmegay`).
- The integration suite only runs `sync/**/*.integration.test.ts` (`vitest.integration.config.ts`), so the oracle test lives at `sync/showdown/paste.integration.test.ts`. `sync/` may import from `src/domain/`; `src/domain/` must not import from `sync/`.

## Out of scope

UI; clipboard and file handling; Showdown team-folder or backup file structure beyond ignoring `===` header lines; Tera, IVs, gender, shiny, happiness; auto-filling a missing Mega stone; choosing which 4 Pokémon to bring; the suggestion engine.

## Module layout

```
Create: src/domain/paste.ts, paste.test.ts               parsePaste, pasteToTeam, ParsedSet
Create: src/domain/paste-export.ts, paste-export.test.ts exportSet, exportSets, exportTeam
Create: src/domain/paste-real.test.ts                    real-snapshot round trip
Create: sync/showdown/paste.integration.test.ts          oracle against the real package
Modify: README.md                                        one line
```

`paste.ts` imports only from `./id`, `./natures`, `./problem`, `./set`, `./set-check`, `./team`, `./types`. `paste-export.ts` imports only from `./id`, `./set`, `./set-check`, `./team`. Neither imports from `sync/`. The snapshot parameter type is `SetSnapshot` from Plan 1 (`formatId`, `species`, `moves`, `learnsets`, `items`).

## Import (`src/domain/paste.ts`)

```ts
export interface ParsedSet {
  /** null only when the block has no readable species. */
  set: PokemonSet | null;
  /** Parse problems first, then the legality problems from validateSetAgainstSnapshot. Paths start "paste[i]". */
  problems: Problem[];
  /** Things dropped or rewritten, in reading order. */
  notes: string[];
}

export function parsePaste(text: string, snapshot: SetSnapshot): ParsedSet[];
```

A non-string `text`, an empty text and a whitespace-only text all return `[]`.

**Blocks.** Normalize `\r\n` to `\n` and trim trailing spaces on every line. A block is a run of non-blank lines. A line that starts with `===` is treated as a blank line (a separator), so a Showdown backup file still splits into sets. `paste[i]` in a path is the block's index in the returned array.

**First line**, `[Nickname (]Species[)] [(M|F)] [@ Item]`:
1. The item is the text after the first ` @ `, trimmed; empty means no item. The rest is the name part.
2. A trailing ` (M)` or ` (F)` on the name part is removed and noted (`gender M`).
3. If the name part now ends with ` (X)`, the text before it is a nickname (removed, noted as `nickname "Kitty"`) and `X` is the species name. Otherwise the whole name part is the species name.
4. Species, item, ability and every move become ids with `toID`. No lookup is needed, so an unknown species, item, ability or move is still imported as written and reported by the legality check.
5. If the species text is empty the block yields `{ set: null, problems: [{ path: 'paste[i]', message: 'no species found' }], notes }`.

**Mega rewrite.** After the species and item are read: if the species is legal and has no `requiredItem` of its own, and the set has an item, and exactly one legal species `S` has `toID(S.requiredItem) === item` and `toID(S.baseSpecies) === toID(species.baseSpecies)`, the set's species becomes `S.id`. Comparing `baseSpecies` (not the species name) is what lets `Floette-Eternal @ Floettite` become `floettemega`. The rewrite is noted (`read "Charizard" holding Charizardite Y as Charizard-Mega-Y`). With zero or two-or-more candidates nothing is rewritten. A Mega form pasted with no stone is not auto-filled; the legality check reports `X must hold Y`.

Known limitation, checked against the committed Reg M-B data: `Meowsticite` is the required item of both `meowsticmmega` and `meowsticfmega`, so `Meowstic @ Meowsticite` and `Meowstic-F @ Meowsticite` have two candidates each and stay as written. They are legal base-species sets (`Meowsticite` lists `meowstic` and `meowsticf` in `usableBy`), so nothing is lost; the user just gets the base form. Every other Mega form in the data has a unique stone. A real-data test pins this exact exception (see Testing), so a data change that adds another ambiguous stone is noticed.

**Body lines** (each line is trimmed; matching is case-insensitive on the label):
- `Ability: X` sets `ability` to `toID(X)`.
- `Level: N`: silent when N is 50; otherwise noted (`Level 100 ignored (Champions battles are level 50)`). Level is never stored.
- `EVs: a HP / b Atk / …` sets `points`. Labels are HP, Atk, Def, SpA, SpD, Spe; each stat not mentioned is 0. Values are read as written; limits (0 to 32 each, total 66) are enforced by the existing structural `validateSet`, which runs inside `validateSetAgainstSnapshot`. A part that does not read (`lots`, `5 Foo`, a repeated label) is a problem at `paste[i].points` (`could not read EVs "…"`) and the set gets no `points`.
- `<Name> Nature`: `NatureName` if `isNatureName`; otherwise a problem at `paste[i].nature` (`unknown nature "Foo"`) and no `nature`.
- `- Move` (or `-Move`): adds `toID(Move)` to `moves`. An empty move line is skipped and noted. More than four moves, or a repeated move, is reported by the existing structural check.
- `IVs`, `Shiny`, `Tera Type`, `Gender`, `Happiness`, `Hidden Power`, `Pokeball`, `Dynamax Level` and `Gigantamax` lines are noted (the trimmed line text) and ignored. Any other unrecognized line is noted as `unrecognized line: …` and ignored. A later `Ability:`, `EVs:` or nature line overrides an earlier one.

**Legality.** After building the set, `problems` is the parse problems followed by `validateSetAgainstSnapshot(set, snapshot, 'paste[i]')`. A structurally invalid set (for example points over the limit) therefore reports only its structural problems, as in Plan 1, until it is fixed.

**Assembling a team.**

```ts
export function pasteToTeam(
  parsed: ParsedSet[],
  name: string,
): { team: MatchTeam; sets: RosterSets; problems: Problem[] };
```

`team.members` is the species id of each non-null set in paste order and `sets` holds those sets keyed by species. There is no size limit here (`validateTeam` applies it, and a pasted roster may be longer than a team). If a species appears in two blocks, the first block wins; the later one is left out of `members` and `sets` and adds a problem at its `paste[i]` (`"x" already appears in block N of this paste; this one is ignored`). `problems` is every `ParsedSet.problems` concatenated in block order, with those duplicate problems added after them, so the UI has one flat list. Notes are not merged; callers read them from `ParsedSet`.

## Export (`src/domain/paste-export.ts`)

```ts
export function exportSet(set: PokemonSet, snapshot: SetSnapshot): string;
export function exportSets(sets: PokemonSet[], snapshot: SetSnapshot): string;
export function exportTeam(team: MatchTeam, sets: RosterSets, snapshot: SetSnapshot): string;
```

`exportSet` output, one line per present field, in this order:

```
Incineroar @ Sitrus Berry
Ability: Intimidate
Level: 50
EVs: 2 HP / 32 Atk / 32 Spe
Jolly Nature
- Fake Out
- Flare Blitz
```

- First line: species display name, then ` @ ` and the item display name if there is an item.
- `Ability:` only if the set has one; `Level: 50` always; `EVs:` only if some stat is non-zero, listing only non-zero stats in the order HP, Atk, Def, SpA, SpD, Spe; the nature line only if the set has one; then one `- Move` line per move. A species-only set is a single line.
- Display names: `snapshot.species[id].name`, `snapshot.items[id].name`, `snapshot.moves[id].name`, and for the ability the entry of `species.abilities` whose `toID` equals the ability id. Each lookup uses `Object.hasOwn`. If a lookup fails the id is written as it stands, so exporting never fails on an odd set.
- Lines carry no trailing spaces (Showdown's own export writes two; the oracle test compares with trailing whitespace trimmed).
- Mega forms export as the form species with whatever item the set holds. Export never rewrites a set.
- A value that is not a usable set (not an object, or no string species) exports as `''`. `exportSets` drops empty results and joins the rest with one blank line. `exportTeam` exports each member in team order, using `{ species: id }` for a member with no saved set; a team without a list of members exports as `''`.

## Round trip

For every set that is valid in the snapshot, `parsePaste(exportSet(set, snapshot), snapshot)[0].set` equals `set`, and its `problems` and `notes` are empty. There are two exceptions. A set whose `points` are all zero writes no `EVs:` line and comes back with no `points`. A valid set of a base species holding a stone that some legal form of the same base species requires (for example `{ species: 'staraptor', item: 'staraptite' }`) exports as `Staraptor @ Staraptite` and re-imports as that Mega form (`staraptormega`) with the note `read "Staraptor" holding Staraptite as Staraptor-Mega`; it is a set the user could equally have written as the Mega form, and each form is its own pick. Both are documented in the export and import doc comments and pinned by tests.

## Testing

Every test must be able to fail: reversed or shuffled input where order matters, floors on counts in sweeps, `expect(x).not.toBeNull()` before narrowing, and hand-computed expectations checked against the code.

**`paste.test.ts`** (fixture snapshot from `test-support.ts`: `setSnapshot()`):
- The full Incineroar block reads to the exact `PokemonSet` and has no problems and no notes.
- A messy block (nickname, `(F)`, `Shiny: Yes`, `Tera Type: Fire`, `IVs: 0 Atk`, `Level: 100`, CRLF line ends, trailing spaces) yields the set plus the exact list of notes.
- Blocks: several blocks in order; blank-only and empty text return `[]`; a non-string returns `[]`; `===` headers split blocks; `paste[i]` indexes are right for the second and third block.
- Mega rewrite: `Staraptor @ Staraptite` becomes `staraptormega`; `Charizard @ Charizardite X` becomes `charizardmegax`; `Floette-Eternal @ Floettite` becomes `floettemega` (base-species comparison; the shared fixture gives `floetteeternal` the base species `Floette-Eternal`, unlike the real data where it is `Floette`, so this test builds a local `setSnapshot()` copy with `floetteeternal` set to `baseSpecies: 'Floette'`, `forme: 'Eternal'` and does not edit the shared fixture); no rewrite for an unrelated item, for a species that is already a Mega form, for an unknown species, and (with a local snapshot copy adding a second form that needs the same stone) when two candidates exist; a Mega form with no stone is imported as written and reports `must hold`.
- Failures: unreadable `EVs` (each of `lots`, `5 Foo`, repeated `2 HP / 3 HP`), unknown nature, five moves, a repeated move, an unknown species (still imported), a block with only `@ Item` (`set: null`), over-limit points (structural problem only).
- Case: `evs: 2 hp / 32 ATK`, `jolly nature` are read.
- `pasteToTeam`: order of members, duplicate species keeps the first and reports the second, `set: null` blocks are skipped, no size limit (seven blocks give seven members), all problems flattened in block order.
- No mutation of the snapshot and no shared state between calls.

**`paste-export.test.ts`**: the exact text of the full example; each omitted-line case (no ability, no item, no nature, no points, all-zero points, no moves); EVs order and zero-skipping; display names come from the snapshot and fall back to ids for unknown ability, item, move and species; malformed input returns `''`; `exportSets` skips empties and joins with one blank line; `exportTeam` order follows `team.members`, uses a species-only block for a member without a saved set, and returns `''` for a malformed team; no mutation.

**Round trip** (in `paste-export.test.ts`): a set with every field; a Mega form with its stone; a species-only set; the all-zero-points exception (comes back with no `points`).

**`paste-real.test.ts`** (real committed snapshot): sets built from usage for each of the 40 most used species (the same builder as `teambuilder-real.test.ts`; copy it, do not import across test files) export and re-import to an equal, problem-free set; floor of 5 Mega forms among them; the six-member real team from Plan 1's test round-trips through `exportTeam` and `pasteToTeam` to the same members and sets. Mega rewrite over every Mega form: for each legal Mega form `M` and each legal non-Mega species `b` with the same `baseSpecies`, `parsePaste` of `b` holding `M`'s stone gives `M`, except exactly the two base species `meowstic` and `meowsticf` (the documented limitation), which stay as written; the number of rewrites checked has a floor of 50 (80 when this was written) so the sweep cannot pass vacuously.

**`sync/showdown/paste.integration.test.ts`** (real package, oracle): for the same sets, `exportSet` text equals `Teams.export` text after trimming trailing whitespace on each line; `Teams.import(ours)` returns species, item, ability, moves, nature and `evs` equal to the set's (Showdown's `evs` 1:1 with our `points`); and our `parsePaste` of `Teams.export` output equals the original set. Include a Mega form. A mismatch is a finding to report, not a reason to change the expectation.

## Errors and robustness

Nothing here throws on any input. Every lookup keyed by an id uses `Object.hasOwn`. Functions never modify their arguments and keep no state between calls.

## Later increments

Suggestion engine (stages 1 to 3), app shell and hosting. The UI will call `parsePaste` and show `problems` and `notes` per block, and call `exportTeam` for a copy button. The UI must show a `read "X" holding Y as Z` note on an imported roster block rather than swallow it.
