# App shell, increment 2: the teambuilder — Design

Date: 2026-10-03. Status: design approved in conversation; awaiting spec review.

Parents: `docs/superpowers/specs/2026-09-29-app-draft-room-design.md` (increment 1: architecture, store, storage, views, sentences, testing style), `docs/superpowers/specs/2026-09-20-teambuilder-design.md` (set checks, stats, roster sets, match teams), `docs/superpowers/specs/2026-09-21-showdown-paste-design.md` (paste import and export) and `docs/superpowers/specs/2026-09-20-draft-lab-design.md` ("Teambuilder"). The domain and engine are used as they are.

## Purpose

Let the user enter a full set for each Pokémon on their roster (with a form, or by pasting from Showdown), see plain-language problems and level-50 stats, build match teams with the Species and Item Clause checks, and export sets and teams as Showdown pastes. Entered sets feed the suggestions, which already read `file.sets`.

## Decisions (settled in brainstorming)

- **Form editor plus paste.** A form per Pokémon (ability, item, four moves, nature, six stat points), and a paste panel for import and export.
- **Its own screen.** A Teambuilder view beside the draft room and setup, chosen from the header: roster list | set editor | match teams.
- **Every edit saves immediately** as a reducer action on the draft file (the increment 1 autosave), with no Save button. The form only produces well-formed sets; legality problems are shown, never blocking.
- **Undo of one of your picks that has a set or sits on a team asks first**, then removes the set and the team slots together with the pick.
- **Ladder helpers:** "Start from the common set", and usage-ordered ability, item and move choices with their share.

## Facts established (2026-10-03, committed Reg M-B snapshot)

- 355 legal species, 148 legal items; 223 species have ladder usage (every one of them legal). 79 species have a `requiredItem` (Mega forms and similar).
- `meta.showdown.rules`: `minTeamSize: 6`, `pickedTeamSize: 4`, `adjustLevel: 50`.
- Usage rows are `[id, share]` sorted by share; items may include the id `nothing` (no item). Spreads are `{ nature, points: [hp, atk, def, spa, spd, spe], share }`. Example, Garchomp: Rough Skin 97.8%; Life Orb 53.5%; Dragon Claw 91.0%, Earthquake 83.4%, Rock Slide 82.3%, Protect 72.3%; top spread Jolly 2/32/0/0/0/32 (28.5%).
- `SpeciesEntry.abilities` holds display names; a set's `ability` is the id (`toID(name)`). Learnsets are per species id (Garchomp: 64 moves).
- Domain functions used: `validateSetAgainstSnapshot`, `computeSetStats`, `validateTeam(team, roster, sets, snapshot, teamSize, path)`, `parsePaste`, `exportSet`, `exportSets`, `exportTeam`, `NATURES` / `NATURE_NAMES`, `MAX_STAT_POINT` (32), `MAX_TOTAL_STAT_POINTS` (66), `MAX_MOVES` (4). The draft file (schema version 2) already carries `sets: RosterSets` and `teams: MatchTeam[]`.
- `DraftRoom` already calls `contextFor(league, draft, league.me, file.sets)`.

## Out of scope

Choosing which 4 to bring, damage calculations, sets for other drafters, several teams per paste, hosting and data refresh (increment 3), and these increment 1 leftovers: setup price problems naming the species, load warnings that come back until the next save, a test for the error screen. No change to `src/domain/` or `src/engine/`, and no change to the draft file format.

## Architecture

```
src/app/team/
  TeambuilderView.tsx   the screen: roster list | set editor (or paste panel) | match teams
  RosterList.tsx        your drafted Pokémon with a status each
  SetEditor.tsx         the form for one Pokémon
  MovePicker.tsx        one move combobox
  ItemPicker.tsx        the item combobox
  StatPoints.tsx        six point inputs, points left, level-50 stats
  PastePanel.tsx        import a paste into your roster; export your sets
  MatchTeams.tsx        named teams with members, status, export, delete
  options.ts            pure: ability, item and move options with shares; the common set
src/app/text/problems.ts pure: set and team problems as plain sentences
src/app/FileButton.tsx  the one file-picker button (replaces three copies from increment 1)
```

Changed: `state/draft-store.ts` (new actions, undo removes sets and team slots), `browser.ts` (`copy`), `Workspace.tsx` (the third view, the undo question), `room/DraftRoom.tsx` and `setup/SetupView.tsx` (the header navigation, `FileButton`), `setup/PriceImport.tsx` (`FileButton`), `app.css`.

Dependencies point one way, as in increment 1: `src/app/` imports from `src/engine/` (its index only) and `src/domain/`.

**Data flow.** The reducer still holds `DraftFile | null`. The teambuilder derives `roster = deriveDraft(...).drafters[league.me].roster`; per set, `validateSetAgainstSnapshot(set, snapshot, 'sets.<id>')` and `computeSetStats`; per team, `validateTeam(team, roster, sets, snapshot, meta.showdown.rules.minTeamSize, 'teams[i]')`. The selected Pokémon and the active middle tab (editor or paste) are view state.

## The draft store: new and changed actions

- `{ type: 'set-set'; species: ID; set: PokemonSet }` — stores the set under `species`. Refused when there is no file, `species` is not on your roster, `set.species !== species`, or `validateSet(set)` (structure) finds problems. Legality problems are not checked here.
- `{ type: 'clear-set'; species: ID }` — removes the set (no-op when there is none).
- `{ type: 'add-team'; name: string }` — appends `{ name, members: [] }`. Refused for an empty (after trim) name.
- `{ type: 'rename-team'; index: number; name: string }` — refused for a missing index or an empty name.
- `{ type: 'set-team-members'; index: number; members: ID[] }` — refused for a missing index, a member not on your roster, a repeated member, or more members than the team size (6). Species and Item Clause problems are not refused.
- `{ type: 'delete-team'; index: number }` — refused for a missing index.
- `undo` (changed): when the undone pick is yours, its set (if any) is removed and the species is removed from every team, in the same action.

The team size reaches the reducer through the factory: `makeDraftReducer(snapshot, teamSize)`. Refusal messages name species by display name and teams by name. The reducer still never throws, never modifies its inputs and never stores an invalid file.

**The undo question** (Workspace, before dispatching `undo`): when the last pick is yours and that species has a set or is on at least one team, ask "Undo <name>? Its set will be deleted and it will be removed from N team(s)." (only the parts that apply). No: nothing happens.

## The Teambuilder view

**Header** (all three views): league name, then **Draft room · Teambuilder · Setup** as buttons, the current one marked (`aria-current="page"` and a text style, not colour alone). Increment 1's draft-room header buttons stay where they are.

**Roster list (left).** Your drafted Pokémon in pick order: display name, types, and a status — "No set", "Set ready" (a set with no problems), or "N problems". Selecting one opens it in the editor. Empty roster: "Your roster is empty: draft a Pokémon first." The first Pokémon is selected by default.

**Set editor (middle, tab "Set").** For the selected Pokémon:
- Name, types, price; **Start from the common set** (shown only when the set is empty or species-only; when the species has no ladder usage the button is replaced by "No ladder data for this Pokémon."); **Clear set** (asks "Clear Garchomp's set?").
- **Ability:** a select: the species' abilities in ladder-share order with the share ("Rough Skin (97.8%)"), then abilities without usage in the species' own order, then "No ability chosen".
- **Item:** a combobox (same keyboard behaviour as increment 1's pick box). Options: ladder items for this species with a share (skipping `nothing` and items that are not legal or that this species cannot hold), then every other legal item it can hold, alphabetically; a "No item" choice. A species with a `requiredItem` shows that item fixed (no combobox) and the note "<species> must hold <item>".
- **Moves:** four comboboxes, each over the species' learnset: ladder moves with a share first, then the rest alphabetically; a move already in another slot is not offered; each slot can be emptied ("No move"). Stored moves keep slot order without gaps (an emptied slot closes up).
- **Nature:** a select of the 25 natures labelled with their effect: "Adamant (+Atk, −SpA)", neutral natures "Hardy (neutral)"; plus "No nature chosen".
- **Stat points:** six number inputs (0 to 32), labelled HP, Atk, Def, SpA, SpD, Spe; "N of 66 points left" (negative shown as "N points over the 66 limit"); beside each, the level-50 stat from `computeSetStats` with ↑ / ↓ for the nature's raised and lowered stats. A value outside 0 to 32 or not a whole number is not stored; the input shows "0 to 32" next to it until corrected.
- **Problems:** the set's problems as sentences (below), under the form.
- Every change dispatches `set-set` at once.

**The common set** (`commonSet(species, snapshot)` in `options.ts`): ability = the top usage ability; item = the species' `requiredItem` if any, else the top usage item that is legal and holdable (not `nothing`), else none; moves = the top four usage moves that are in the learnset; nature and points = the top spread (when its nature is a valid nature name). Returns null when the species has no usage.

**Paste panel (middle, tab "Paste").**
- Import: a textarea and a `FileButton` (`.txt`); **Import** runs `parsePaste`, then for each block: on your roster → becomes that species' set; not on your roster → listed ("Kingambit is not on your roster; skipped."); unreadable → its problems. If any imported species already has a set, ask once: "Replace the existing sets of Garchomp and Incineroar?" (No: none of the existing ones is replaced; the new ones are still added). Notes from the parser are listed per block. A result line: "3 sets imported." A checkbox **Also make a team from this paste** adds a team of the imported roster species (first 6, in paste order), named after the file without its extension or "Pasted team".
- Export: **Copy all sets** (`exportSets` of your sets in roster order) and **Download** (`<league file base>.sets.txt`). In the editor, each set also has **Copy set**.

**Match teams (right).**
- **New team** adds "Team N" (the smallest N not already used). The name is an input (rename on change; an empty name is refused and the input shows "A team needs a name").
- Members: a checkbox per roster Pokémon (display name); with 6 ticked, the others are disabled with "6 of 6". 
- Status: "Complete" (6 members, no problems), "N of 6", and the team's problems as sentences.
- **Copy** and **Download** (`<league file base>.<team name>.txt`) via `exportTeam`; **Delete** asks "Delete <team name>?".

**Copy.** `BrowserActions.copy(text): Promise<boolean>` (clipboard API; false when it throws or is missing). Success shows "Copied." for a few seconds; failure "Couldn't copy: use Download instead." Both in a polite live region.

## Problem sentences (`text/problems.ts`)

`setProblemText(problem, set, names)` and `teamProblemText(problem, team, names)`, chosen by the problem's path suffix; display names from `names` (species, move, item, plus ability names via the species' ability list). Anything unrecognised falls back to the domain message.

| path / case | sentence |
|---|---|
| `.ability` | "{species} can't have the ability {ability}." |
| `.moves[i]` | "{species} can't learn {move} in this format." |
| `.item`, not a legal item | "{item} isn't a legal item in this format." |
| `.item`, holder restriction | "{species} can't hold {item}." |
| `.item`, required item | "{species} must hold {requiredItem}." |
| `.points` total over 66 | "Stat points add up to {total}; the limit is 66." |
| team `.members` size | "A team has at most 6 Pokémon." |
| team Species Clause | "Species Clause: {a} and {b} are the same Pokémon." |
| team Item Clause | "Item Clause: {a} and {b} both hold {item}." |
| team member not on roster | "{species} is not on your roster." |
| team member's set problem | "{species}: " + the set sentence |

The plan maps each row to the exact domain path and message shape (read from `set-check.ts`, `set.ts` and `team.ts`) and tests one case per row.

## Errors and robustness

As increment 1: never a blank screen, refusals in polite live regions, the save banner when storage refuses. A pasted or imported set with legality problems is stored and its problems shown. `FileButton` reports a file that cannot be read ("That file could not be read.") and has a visible focus ring.

## Accessibility

Every input labelled ("Garchomp's ability", "Move 1", "Atk points"); comboboxes keyboard-operable (arrows, Enter, Escape); the view switcher uses `aria-current`; statuses and problems are text, never colour alone; live regions are always mounted (increment 1's final-review rule).

## Testing

Every test must be able to fail (as increment 1).

- **`draft-store.test.ts`** (extended): each new action and each refusal; undo removing the set and the team slots of your own pick and leaving other drafters' undo unchanged; no mutation.
- **`options.test.ts`:** ordering and shares for abilities, items and moves; learnset-only moves; `usableBy` and `nothing` filtering; the fixed required item; `commonSet` on fixtures and on the real snapshot (Garchomp's common set, a Mega form's common set holds its stone, a species without usage gives null).
- **`problems.test.ts`:** one test per table row, the fallback, and display names.
- **UI flows** (jsdom, real snapshot): build a full set with the form and see the level-50 stats and "Set ready"; Start from the common set; the 66-point message; a paste with one non-roster Pokémon and a replace question; Also make a team; Copy (fake success and failure) and Download; a team that breaks the Species Clause and the Item Clause; the 6-member limit; undo of a Pokémon with a set (asked, then removed from the set and the team); suggestions change after a set is entered (a reason with "(from your set)"); the view switcher.
- **Build and typecheck** as before.

## Plan-time pre-verification

Before the plan asserts anything: measure the common set for a few real species (Garchomp, a Mega form, Incineroar) and check each passes `validateSetAgainstSnapshot`; find a real Species Clause pair and Item Clause pair on the snapshot for the flow tests; confirm a set-backed "(from your set)" reason appears in the suggestions for a chosen roster; measure the new flow tests' time.

## Later increments

Hosting and data refresh (increment 3).
