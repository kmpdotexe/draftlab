# App Shell, Increment 2: The Teambuilder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Teambuilder screen where the user enters a set for each roster Pokémon (a form or a Showdown paste), sees plain-language problems and level-50 stats, builds match teams with the Species and Item Clause checks, and exports sets and teams; entered sets feed the suggestions.

**Architecture:** New reducer actions on the one draft file (`set-set`, `clear-set`, team actions, and an `undo` that removes the undone Pokémon's set and team slots) keep every edit autosaved. Pure modules build the picker options and the common set (`team/options.ts`) and phrase domain problems (`text/problems.ts`); React components under `src/app/team/` render the screen, reached from a new view switcher in `Workspace`.

**Tech Stack:** React 19.3.0 + Vite 8.3.1 + TypeScript (strict, ESM), hand-written CSS; Vitest 5 with jsdom and React Testing Library for the UI flow tests. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-03-app-teambuilder-design.md` (parents: `docs/superpowers/specs/2026-09-29-app-draft-room-design.md`, `2026-09-20-teambuilder-design.md`, `2026-09-21-showdown-paste-design.md`). Read the spec first; it is the binding authority for this plan.

## Global Constraints

- Scope: increment 2 only. Out of scope: choosing which 4 to bring, damage calculations, sets for other drafters, hosting and data refresh, setup price problems naming the species, load warnings coming back, a test for the error screen. No change to `src/domain/`, `src/engine/` or the draft file format (schema version 2).
- No new dependencies. Dependencies point one way: `src/app/` imports from `src/engine/` (its index only) and `src/domain/`; nothing imports from `src/app/`.
- Every edit saves immediately through the reducer (no Save button). The reducer never throws, never modifies its inputs and never stores a structurally invalid set (`validateSet`); legality problems (`validateSetAgainstSnapshot`) are shown, never refused.
- Team size comes from `meta.showdown.rules.minTeamSize` (6); the reducer refuses more members than that, a member not on your roster and a repeated member. Species and Item Clause problems are shown, not refused.
- Display names everywhere; the problem sentences are exactly the spec's table text.
- Copy feedback is exactly "Copied." or "Couldn't copy: use Download instead."
- Live regions are always mounted; statuses and problems are text, never colour alone; every input is labelled.
- UI tests opt into jsdom with the first line `// @vitest-environment jsdom`.
- Commits end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (copy it verbatim; never substitute another model name).

**Plan clarifications (rulings on gaps in the spec, made at plan time):**
1. **Stat points over 66 are never stored** (spec amended in the same commit as this plan). The spec said going over 66 would be shown, not blocked; but `validateSet` (which the reducer applies) refuses a total over 66, and `parseDraftFile` refuses a whole file holding such a set, so the saved draft would become unreadable. A value that would take the total over 66 (or is over 32, or not a whole number) stays in its box with the allowed range as a hint ("0 to 21") and is not saved. A pasted set over the limit is reported as not imported. The "Stat points add up to …" sentence is still written for such a problem (from a paste).
2. **One combobox component, `team/OptionPicker.tsx`,** serves both the item and the move pickers (the spec listed `ItemPicker.tsx` and `MovePicker.tsx`; they would be identical). `team/flash.ts` holds the self-clearing "Copied." message (`useFlash`, 4 s) and `copyWithMessage`.
3. **The view switcher replaces the draft room's Setup button.** Draft room · Teambuilder · Setup are rendered once by `Workspace` above every view (once a draft exists); the draft room's own Setup button is removed, so the increment 1 tests that click "Setup" find the switcher's button. Switching view clears the last refusal (as the Setup button did).
4. **`FileButton` reads the file** and calls `onText(text, fileName)` with `text: null` when the file could not be read; `Workspace`'s import and the draft room's and setup's `onImport` therefore take the file's text (`string | null`) instead of a `File`.
5. **`browser.ts` gains `fileBase(name)`** ("Test League" → "test-league"), shared by `exportFileName` and the new downloads: `<base>.sets.txt` and `<base>.<team name as file base>.txt`.
6. **Reducer refusal messages** for the new actions: `<name> is not on your roster`, `this set is for <name>, not <name>`, the `validateSet` problems as they are, `a team needs a name`, `there is no such team`, `<name> is listed twice`, `a team has at most <n> Pokémon`, and `set up a league first` without a file. Names are display names (ids when the snapshot has none).
7. **Undo removes your Pokémon only.** The reducer knows the undone pick is yours when the species is on your roster (a species can be drafted once), and only then removes its set and team slots.
8. **Roster list buttons** show name, types and status, so their accessible names start with the display name (tests find them with `/^Garchomp/`).
9. **The common set check (pre-verification)** covers every species with usage, not only the three the spec names.

## Pre-verification results (measured 2026-10-03 with the prototype of this plan's code, on the committed Reg M-B snapshot)

The plan's code was built and run in full before this plan was written, and the plan was then replayed task by task in a clean checkout of 718e47b (each task's edits and files applied exactly as written below): every task ends green and every prototype file is reproduced byte for byte.

Unit test counts after Tasks 1 to 7: 707, 717, 726, 726, 726, 737, 737 (baseline 699). Typecheck is clean after every task, and `npm run build` succeeds after Task 7. The 21 integration tests are unchanged.

- **Common sets:** all 223 species with usage get a common set that passes `validateSetAgainstSnapshot` (no problems). Garchomp: Rough Skin, Life Orb, Dragon Claw / Earthquake / Rock Slide / Protect, Jolly 2/32/0/0/0/32. Incineroar: Intimidate, Sitrus Berry, Fake Out / Parting Shot / Flare Blitz / Throat Chop, Impish 32/0/21/0/10/3. Charizard-Mega-Y holds Charizardite Y. Charizard (base form), Beedrill, Pidgeot have no usage.
- **Clause pairs on real data:** Charizard-Mega-X and Charizard-Mega-Y share dex number 6 (Species Clause); two roster sets holding Leftovers give the Item Clause.
- **A set-backed reason:** with roster Garchomp + Whimsicott (4 picks into the flow-test league), no ladder data gives Whimsicott Trick Room; a Whimsicott set with Trick Room makes Kingambit, Toxapex and Mawile-Mega (top 20) show "Completes Trick Room with Whimsicott (Whimsicott's half is from your set)." Whimsicott can learn Trick Room; Garchomp cannot.
- **Timings:** `team.flow.test.tsx` (11 tests) takes about 12 s; the whole unit suite about 22 s.

## Environment notes

- Windows + PowerShell. A fresh shell may not find `node`/`npm`. Start every PowerShell command with:
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User");`
- The repo path contains a space: quote it.
- Single test file: `npx vitest run <path>`. Whole unit suite: `npm test`. Types: `npm run typecheck`. Build: `npm run build`. The baseline before this plan is 699 unit tests and 21 integration tests, all passing.
- Work on branch `feat/app-teambuilder` (already created; the spec is committed at 718e47b).
- Every file block below is the complete file content: create the file, or replace the existing file entirely, with exactly that text. Edits to existing files are exact find/replace pairs (each find text occurs exactly once). The code typechecks under `strict`; if a line fails typecheck, report the exact TS error and apply the smallest fix that keeps the test's intent; do not silently rewrite a test.

---

## File Structure

```
Create: src/app/team/options.ts, options.test.ts       picker options with ladder shares, natureLabel, commonSet
Create: src/app/text/problems.ts, problems.test.ts     setProblemText, teamProblemText
Modify: src/app/state/draft-store.ts, draft-store.test.ts   set and team actions, undo removes your set and team slots
Create: src/app/FileButton.tsx                         the one file-picker button (reads the file)
Modify: src/app/browser.ts                             copy(), fileBase()
Modify: src/app/test-support.ts                        fakeActions records copies, copyFails
Modify: src/app/setup/SetupView.tsx, setup/PriceImport.tsx, room/DraftRoom.tsx, Workspace.tsx   use FileButton
Create: src/app/team/OptionPicker.tsx, flash.ts, StatPoints.tsx, SetEditor.tsx, RosterList.tsx,
        PastePanel.tsx, MatchTeams.tsx, TeambuilderView.tsx
Modify: src/app/Workspace.tsx                          view switcher, the Teambuilder view, the undo question
Modify: src/app/room/DraftRoom.tsx                     the Setup button moves to the switcher
Create: src/app/team.flow.test.tsx                     the UI flows
Modify: src/app/app.css, docs/STATUS.md, README.md
```

Task 5 adds React components whose behaviour is tested through the whole app in Task 6 (the flow tests need the Workspace wiring). Its gate is the typecheck; its reviewer checks the components against the spec's Teambuilder view section.

---

### Task 1: Picker options and the common set

**Files:**
- Create: `src/app/team/options.ts`, `src/app/team/options.test.ts`

**Interfaces:**
- Consumes: from `src/domain`: `toID`, `ID`; `NATURES`, `NATURE_NAMES`, `isNatureName`, `NatureName`; `STAT_NAMES`, `PokemonSet`, `StatPoints`; `ItemEntry`, `Snapshot`, `SpeciesEntry`, `StatName`, `UsageEntry`; test helpers `setSnapshot` (`src/domain/test-support.ts`), `realData` (`src/app/test-support.ts`), `validateSetAgainstSnapshot`.
- Produces: `interface Option { id: ID; name: string; share: number | null }`; `type OptionSnapshot = Pick<Snapshot, 'species'|'moves'|'learnsets'|'items'|'usage'>`; `STAT_LABELS: Readonly<Record<StatName, string>>` (HP, Atk, Def, SpA, SpD, Spe); `shareText(share): string` ("97.8%"); `abilityOptions(species, snapshot): Option[]`; `requiredItemOf(species, snapshot: Pick<Snapshot,'species'>): ID | null`; `itemOptions(species, snapshot): Option[]`; `moveOptions(species, snapshot): Option[]`; `natureLabel(nature: NatureName): string`; `NATURE_OPTIONS: readonly NatureName[]` (alphabetical); `commonSet(species, snapshot): PokemonSet | null`.

- [ ] **Step 1: Write the tests: create `src/app/team/options.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { setSnapshot } from '../../domain/test-support';
import type { UsageEntry } from '../../domain/types';
import { validateSetAgainstSnapshot } from '../../domain/set-check';
import { realData } from '../test-support';
import { NATURE_OPTIONS, abilityOptions, commonSet, itemOptions, moveOptions, natureLabel, requiredItemOf, shareText, type OptionSnapshot } from './options';

const incineroarUsage: UsageEntry = {
  id: 'incineroar',
  weight: 100,
  usage: 0.5,
  abilities: [['intimidate', 0.9], ['blaze', 0.1]],
  // 'nothing' and 'staraptite' (not holdable) are skipped; 'leftovers' and 'sitrusberry' are kept in share order.
  items: [['nothing', 0.3], ['staraptite', 0.25], ['leftovers', 0.2], ['sitrusberry', 0.15]],
  // 'closecombat' is not in Incineroar's learnset.
  moves: [['closecombat', 0.95], ['partingshot', 0.9], ['fakeout', 0.85], ['flareblitz', 0.4]],
  spreads: [
    { nature: 'Nope', points: [1, 1, 1, 1, 1, 1], share: 0.5 },
    { nature: 'Careful', points: [32, 4, 0, 0, 30, 0], share: 0.3 },
  ],
  teammates: [],
};

const snapshot: OptionSnapshot = {
  ...setSnapshot(),
  usage: { teams: 10, cutoff: 0, battles: 5, species: { incineroar: incineroarUsage } },
};

describe('pickers', () => {
  it('orders abilities by ladder share, then the rest in the species order', () => {
    expect(abilityOptions('incineroar', snapshot)).toEqual([
      { id: 'intimidate', name: 'Intimidate', share: 0.9 },
      { id: 'blaze', name: 'Blaze', share: 0.1 },
    ]);
    expect(abilityOptions('kingambit', snapshot).map((o) => [o.name, o.share])).toEqual([
      ['Defiant', null],
      ['Supreme Overlord', null],
      ['Pressure', null],
    ]);
    expect(abilityOptions('missingno', snapshot)).toEqual([]);
  });

  it('offers only items the species can hold: ladder ones by share, then the rest alphabetically', () => {
    expect(itemOptions('incineroar', snapshot).map((o) => [o.id, o.share])).toEqual([
      ['leftovers', 0.2],
      ['sitrusberry', 0.15],
      ['choicescarf', null],
      ['passhoberry', null],
    ]);
    // The base species may hold its stone; Kingambit may not.
    expect(itemOptions('staraptor', snapshot).map((o) => o.id)).toContain('staraptite');
    expect(itemOptions('kingambit', snapshot).map((o) => o.id)).not.toContain('staraptite');
  });

  it('offers only learnable moves: ladder ones by share, then the rest alphabetically', () => {
    expect(moveOptions('incineroar', snapshot)).toEqual([
      { id: 'partingshot', name: 'Parting Shot', share: 0.9 },
      { id: 'fakeout', name: 'Fake Out', share: 0.85 },
      { id: 'flareblitz', name: 'Flare Blitz', share: 0.4 },
      { id: 'throatchop', name: 'Throat Chop', share: null },
    ]);
    expect(moveOptions('sinistcha', snapshot)).toEqual([]);
  });

  it('knows the required item of a Mega form', () => {
    expect(requiredItemOf('staraptormega', snapshot)).toBe('staraptite');
    expect(requiredItemOf('staraptor', snapshot)).toBeNull();
  });

  it('labels natures with their effect and shares as percentages', () => {
    expect(natureLabel('Adamant')).toBe('Adamant (+Atk, −SpA)');
    expect(natureLabel('Hardy')).toBe('Hardy (neutral)');
    expect(NATURE_OPTIONS).toHaveLength(25);
    expect(NATURE_OPTIONS[0]).toBe('Adamant');
    expect(shareText(0.978299)).toBe('97.8%');
  });
});

describe('commonSet', () => {
  it('builds the top ability, holdable item, learnable moves and the first valid spread', () => {
    expect(commonSet('incineroar', snapshot)).toEqual({
      species: 'incineroar',
      ability: 'intimidate',
      item: 'leftovers',
      moves: ['partingshot', 'fakeout', 'flareblitz'],
      nature: 'Careful',
      points: { hp: 32, atk: 4, def: 0, spa: 0, spd: 30, spe: 0 },
    });
  });

  it('is null without ladder usage', () => {
    expect(commonSet('kingambit', snapshot)).toBeNull();
    expect(commonSet('incineroar', { ...snapshot, usage: null })).toBeNull();
  });

  it('gives legal sets on the real snapshot, with a Mega form holding its stone', () => {
    const { snapshot: real } = realData();
    expect(commonSet('garchomp', real)).toEqual({
      species: 'garchomp',
      ability: 'roughskin',
      item: 'lifeorb',
      moves: ['dragonclaw', 'earthquake', 'rockslide', 'protect'],
      nature: 'Jolly',
      points: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
    });
    expect(commonSet('charizardmegay', real)?.item).toBe('charizarditey');
    expect(commonSet('charizard', real)).toBeNull();
    const withUsage = Object.keys(real.usage!.species);
    expect(withUsage.length).toBeGreaterThan(200);
    const illegal = withUsage.filter((id) => validateSetAgainstSnapshot(commonSet(id, real)!, real, id).length > 0);
    expect(illegal).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/app/team/options.test.ts`
Expected: FAIL (`options.ts` does not exist).

- [ ] **Step 3: Create `src/app/team/options.ts`**

```ts
import { toID, type ID } from '../../domain/id';
import { NATURES, NATURE_NAMES, isNatureName, type NatureName } from '../../domain/natures';
import { STAT_NAMES, type PokemonSet, type StatPoints } from '../../domain/set';
import type { ItemEntry, Snapshot, SpeciesEntry, StatName, UsageEntry } from '../../domain/types';

/** One choice in a picker: ladder choices carry their share of this species' teams; the rest have null. */
export interface Option {
  id: ID;
  name: string;
  share: number | null;
}

export type OptionSnapshot = Pick<Snapshot, 'species' | 'moves' | 'learnsets' | 'items' | 'usage'>;

export const STAT_LABELS: Readonly<Record<StatName, string>> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

function speciesOf(id: ID, snapshot: Pick<Snapshot, 'species'>): SpeciesEntry | null {
  return Object.hasOwn(snapshot.species, id) ? snapshot.species[id] : null;
}

function usageOf(id: ID, snapshot: Pick<Snapshot, 'usage'>): UsageEntry | null {
  return snapshot.usage !== null && Object.hasOwn(snapshot.usage.species, id) ? snapshot.usage.species[id] : null;
}

/** Ladder rows first (in share order, each candidate once), then the remaining candidates in the order given. */
function ladderFirst(candidates: Array<{ id: ID; name: string }>, rows: ReadonlyArray<[ID, number]>): Option[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const used = new Set<ID>();
  const out: Option[] = [];
  for (const [id, share] of rows) {
    const candidate = byId.get(id);
    if (candidate === undefined || used.has(id)) continue;
    used.add(id);
    out.push({ id, name: candidate.name, share });
  }
  for (const candidate of candidates) if (!used.has(candidate.id)) out.push({ ...candidate, share: null });
  return out;
}

/** "97.8%". */
export function shareText(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/** The species' abilities: ladder ones by share, then the others in the species' own order. */
export function abilityOptions(species: ID, snapshot: OptionSnapshot): Option[] {
  const entry = speciesOf(species, snapshot);
  if (entry === null) return [];
  const candidates = entry.abilities.map((name) => ({ id: toID(name), name }));
  return ladderFirst(candidates, usageOf(species, snapshot)?.abilities ?? []);
}

/** The item a species must hold (Mega forms and similar), or null. */
export function requiredItemOf(species: ID, snapshot: Pick<Snapshot, 'species'>): ID | null {
  const entry = speciesOf(species, snapshot);
  return entry !== null && entry.requiredItem ? toID(entry.requiredItem) : null;
}

/** Whether `species` may hold `item` under the item's holder restriction (the same rule as the set check). */
function canHold(item: ItemEntry, species: SpeciesEntry): boolean {
  if (!item.usableBy) return true;
  return item.usableBy.includes(species.id) || item.usableBy.includes(toID(species.baseSpecies));
}

/** Legal items this species can hold: ladder ones by share, then the rest alphabetically. */
export function itemOptions(species: ID, snapshot: OptionSnapshot): Option[] {
  const entry = speciesOf(species, snapshot);
  if (entry === null) return [];
  const candidates = Object.values(snapshot.items)
    .filter((item) => canHold(item, entry))
    .map((item) => ({ id: item.id, name: item.name }))
    .sort(byName);
  return ladderFirst(candidates, usageOf(species, snapshot)?.items ?? []);
}

/** The species' learnset: ladder moves by share, then the rest alphabetically. */
export function moveOptions(species: ID, snapshot: OptionSnapshot): Option[] {
  const learnset = Object.hasOwn(snapshot.learnsets, species) ? snapshot.learnsets[species] : [];
  const candidates = learnset
    .filter((id) => Object.hasOwn(snapshot.moves, id))
    .map((id) => ({ id, name: snapshot.moves[id].name }))
    .sort(byName);
  return ladderFirst(candidates, usageOf(species, snapshot)?.moves ?? []);
}

/** "Adamant (+Atk, −SpA)", or "Hardy (neutral)". */
export function natureLabel(nature: NatureName): string {
  const { plus, minus } = NATURES[nature];
  return plus === null || minus === null ? `${nature} (neutral)` : `${nature} (+${STAT_LABELS[plus]}, −${STAT_LABELS[minus]})`;
}

/** Every nature in alphabetical order. */
export const NATURE_OPTIONS: readonly NatureName[] = [...NATURE_NAMES].sort();

/**
 * The ladder's most common set for a species: its top ability, its required item or else its top legal holdable
 * item, its top four learnable moves, and its top spread. Null when the species has no ladder usage.
 */
export function commonSet(species: ID, snapshot: OptionSnapshot): PokemonSet | null {
  const usage = usageOf(species, snapshot);
  if (usage === null || speciesOf(species, snapshot) === null) return null;
  const set: PokemonSet = { species };

  const ability = abilityOptions(species, snapshot).find((option) => option.share !== null);
  if (ability) set.ability = ability.id;

  const item = requiredItemOf(species, snapshot) ?? itemOptions(species, snapshot).find((option) => option.share !== null)?.id;
  if (item) set.item = item;

  const moves = moveOptions(species, snapshot)
    .filter((option) => option.share !== null)
    .slice(0, 4)
    .map((option) => option.id);
  if (moves.length > 0) set.moves = moves;

  const spread = usage.spreads.find((candidate) => isNatureName(candidate.nature));
  if (spread) {
    set.nature = spread.nature as NatureName;
    set.points = Object.fromEntries(STAT_NAMES.map((stat, i) => [stat, spread.points[i]])) as StatPoints;
  }
  return set;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run src/app/team/options.test.ts` then `npm test` then `npm run typecheck`
Expected: PASS (8 tests); the whole suite then has 707 tests; typecheck clean.

Mutation proof (do it, then undo it): in `itemOptions`, change `.filter((item) => canHold(item, entry))` to `.filter(() => true)`; the test "offers only items the species can hold" must fail. Restore the line.

- [ ] **Step 5: Commit**

```bash
git add src/app/team/options.ts src/app/team/options.test.ts
git commit -m "feat(app): picker options with ladder shares, and the common set" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Set and team problems as plain sentences

**Files:**
- Create: `src/app/text/problems.ts`, `src/app/text/problems.test.ts`

**Interfaces:**
- Consumes: `toID`, `ID`, `Problem`, `PokemonSet`, `MatchTeam`, `RosterSets`, `Snapshot` (domain); test helpers `setSnapshot`, `validateSetAgainstSnapshot`, `validateTeam`.
- Produces: `type ProblemSnapshot = Pick<Snapshot, 'species'|'moves'|'items'>`; `setProblemText(problem: Problem, set: PokemonSet, snapshot: ProblemSnapshot): string`; `teamProblemText(problem: Problem, team: MatchTeam, sets: RosterSets, snapshot: ProblemSnapshot): string`.

- [ ] **Step 1: Write the tests: create `src/app/text/problems.test.ts`**

The tests feed the domain's own problems (from `validateSetAgainstSnapshot` and `validateTeam` on the hand-built `setSnapshot()`), so a change in the domain's wording breaks them instead of silently falling back.

```ts
import { describe, expect, it } from 'vitest';
import { validateSetAgainstSnapshot } from '../../domain/set-check';
import type { PokemonSet } from '../../domain/set';
import { validateTeam, type MatchTeam, type RosterSets } from '../../domain/team';
import { setSnapshot } from '../../domain/test-support';
import { setProblemText, teamProblemText } from './problems';

// The problems are produced by the domain's own checks, so a change in their wording breaks these tests.
const snapshot = setSnapshot();
const sentences = (set: PokemonSet) =>
  validateSetAgainstSnapshot(set, snapshot, `sets.${set.species}`).map((p) => setProblemText(p, set, snapshot));
const teamSentences = (team: MatchTeam, sets: RosterSets, roster: string[] = team.members) =>
  validateTeam(team, roster, sets, snapshot, 6, 'teams[0]').problems.map((p) => teamProblemText(p, team, sets, snapshot));

describe('setProblemText', () => {
  it('names a wrong ability', () => {
    expect(sentences({ species: 'incineroar', ability: 'roughskin' })).toEqual(["Incineroar can't have the ability roughskin."]);
  });

  it('names a move the species cannot learn, by its display name', () => {
    expect(sentences({ species: 'garchomp', moves: ['earthquake', 'fakeout'] })).toEqual(["Garchomp can't learn Fake Out in this format."]);
  });

  it('explains the three item problems', () => {
    expect(sentences({ species: 'garchomp', item: 'lifeorb' })).toEqual(["lifeorb isn't a legal item in this format."]);
    expect(sentences({ species: 'garchomp', item: 'staraptite' })).toEqual(["Garchomp can't hold Staraptite."]);
    expect(sentences({ species: 'staraptormega', item: 'leftovers' })).toEqual(['Staraptor-Mega must hold Staraptite.']);
  });

  it('gives the stat point total', () => {
    const points = { hp: 32, atk: 32, def: 32, spa: 0, spd: 0, spe: 0 };
    expect(sentences({ species: 'garchomp', points })).toEqual(['Stat points add up to 96; the limit is 66.']);
  });

  it('keeps the domain message for anything else', () => {
    expect(setProblemText({ path: 'sets.x.nature', message: 'unknown nature "Brave-ish"' }, { species: 'x' }, snapshot)).toBe(
      'unknown nature "Brave-ish"',
    );
  });
});

describe('teamProblemText', () => {
  it('names both Pokémon for the Species Clause, earlier one first', () => {
    expect(teamSentences({ name: 'T', members: ['charizard', 'garchomp', 'charizardmegax'] }, { charizardmegax: { species: 'charizardmegax', item: 'charizarditex' } })).toEqual([
      'Species Clause: Charizard and Charizard-Mega-X are the same Pokémon.',
    ]);
  });

  it('names both Pokémon and the item for the Item Clause', () => {
    const sets: RosterSets = { garchomp: { species: 'garchomp', item: 'leftovers' }, kingambit: { species: 'kingambit', item: 'leftovers' } };
    expect(teamSentences({ name: 'T', members: ['garchomp', 'kingambit'] }, sets)).toEqual([
      'Item Clause: Garchomp and Kingambit both hold Leftovers.',
    ]);
  });

  it('says when a team is too big or holds someone not on your roster', () => {
    const seven = ['incineroar', 'staraptor', 'charizard', 'floetteeternal', 'kingambit', 'garchomp', 'sinistcha'];
    expect(teamSentences({ name: 'T', members: seven }, {})).toEqual(['A team has at most 6 Pokémon.']);
    expect(teamSentences({ name: 'T', members: ['garchomp'] }, {}, [])).toEqual(['Garchomp is not on your roster.']);
  });

  it("prefixes a member's set problem with its name", () => {
    const sets: RosterSets = { garchomp: { species: 'garchomp', moves: ['fakeout'] } };
    expect(teamSentences({ name: 'T', members: ['garchomp'] }, sets)).toEqual(["Garchomp: Garchomp can't learn Fake Out in this format."]);
  });

  it('keeps the domain message for anything else', () => {
    expect(teamProblemText({ path: 'teams[0]', message: 'team must have a list of members' }, { name: 'T', members: [] }, {}, snapshot)).toBe(
      'team must have a list of members',
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/app/text/problems.test.ts`
Expected: FAIL (`problems.ts` does not exist).

- [ ] **Step 3: Create `src/app/text/problems.ts`**

```ts
import { toID, type ID } from '../../domain/id';
import type { Problem } from '../../domain/problem';
import type { PokemonSet } from '../../domain/set';
import type { MatchTeam, RosterSets } from '../../domain/team';
import type { Snapshot } from '../../domain/types';

export type ProblemSnapshot = Pick<Snapshot, 'species' | 'moves' | 'items'>;

const speciesName = (id: string, snapshot: ProblemSnapshot): string =>
  Object.hasOwn(snapshot.species, id) ? snapshot.species[id].name : id;
const moveName = (id: string, snapshot: ProblemSnapshot): string => (Object.hasOwn(snapshot.moves, id) ? snapshot.moves[id].name : id);
const itemName = (id: string, snapshot: ProblemSnapshot): string => (Object.hasOwn(snapshot.items, id) ? snapshot.items[id].name : id);

function abilityName(set: PokemonSet, snapshot: ProblemSnapshot): string {
  const ability = set.ability ?? '';
  const species = Object.hasOwn(snapshot.species, set.species) ? snapshot.species[set.species] : null;
  return species?.abilities.find((name) => toID(name) === ability) ?? ability;
}

/**
 * One plain sentence for a problem with a set, using display names. The problem's path says which field it is
 * about (`….ability`, `….moves[i]`, `….item`, `….points`); anything not recognised keeps the domain's message.
 */
export function setProblemText(problem: Problem, set: PokemonSet, snapshot: ProblemSnapshot): string {
  const species = speciesName(set.species, snapshot);
  const { path, message } = problem;

  if (path.endsWith('.ability') && message.includes('is not an ability of')) {
    return `${species} can't have the ability ${abilityName(set, snapshot)}.`;
  }
  const move = /\.moves\[(\d+)\]$/.exec(path);
  if (move && message.includes('is not a legal move')) {
    const id = set.moves?.[Number(move[1])] ?? '';
    return `${species} can't learn ${moveName(id, snapshot)} in this format.`;
  }
  if (path.endsWith('.item')) {
    const item = itemName(set.item ?? '', snapshot);
    if (message.includes('is not a legal item')) return `${item} isn't a legal item in this format.`;
    if (message.includes('can only be held by')) return `${species} can't hold ${item}.`;
    const required = / must hold (.+)$/.exec(message);
    if (required) return `${species} must hold ${required[1]}.`;
  }
  const total = /^total (\d+) is over the (\d+)-point limit$/.exec(message);
  if (path.endsWith('.points') && total) return `Stat points add up to ${total[1]}; the limit is ${total[2]}.`;
  return message;
}

/**
 * One plain sentence for a problem from `validateTeam`. Clause problems name both Pokémon; a member's set
 * problem is prefixed with the member's name. Anything not recognised keeps the domain's message.
 */
export function teamProblemText(problem: Problem, team: MatchTeam, sets: RosterSets, snapshot: ProblemSnapshot): string {
  const { path, message } = problem;
  const name = (id: string) => speciesName(id, snapshot);

  const size = /^at most (\d+) members/.exec(message);
  if (path.endsWith('.members') && size) return `A team has at most ${size[1]} Pokémon.`;

  const species = /^"([^"]+)" and "([^"]+)" are the same Pokémon \(dex number \d+\); Species Clause$/.exec(message);
  if (species) return `Species Clause: ${name(species[2])} and ${name(species[1])} are the same Pokémon.`;

  const item = /^"([^"]+)" and "([^"]+)" both hold (.+); Item Clause$/.exec(message);
  if (item) return `Item Clause: ${name(item[2])} and ${name(item[1])} both hold ${item[3]}.`;

  const member = /\.members\[(\d+)\](\..+)?$/.exec(path);
  if (member) {
    const id: ID = team.members[Number(member[1])] ?? '';
    if (message.endsWith('is not on your roster')) return `${name(id)} is not on your roster.`;
    if (member[2] !== undefined) {
      const set = Object.hasOwn(sets, id) ? sets[id] : { species: id };
      return `${name(id)}: ${setProblemText(problem, set, snapshot)}`;
    }
  }
  return message;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run src/app/text/problems.test.ts` then `npm test` then `npm run typecheck`
Expected: PASS (10 tests); the whole suite then has 717 tests; typecheck clean.

Mutation proof (do it, then undo it): in `teamProblemText`, swap `${name(species[2])} and ${name(species[1])}` to `${name(species[1])} and ${name(species[2])}`; the Species Clause test must fail (it checks the earlier member comes first). Restore the line.

- [ ] **Step 5: Commit**

```bash
git add src/app/text/problems.ts src/app/text/problems.test.ts
git commit -m "feat(app): set and team problems as plain sentences" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Set and team actions in the draft store

**Files:**
- Modify: `src/app/state/draft-store.ts` (replace the whole file), `src/app/state/draft-store.test.ts` (replace the whole file: the increment 1 tests are kept unchanged and new ones are appended)

**Interfaces:**
- Consumes: `deriveDraft` (`src/domain/derive.ts`); `applyPick`, `checkPick`, `undoPick`; `validateLeague`, `LeagueConfig`, `LegalSpeciesSource`; `validateSet`, `PokemonSet`; `DraftFile`; `Problem`; `ID`.
- Produces: `DraftAction` gains `{type:'set-set';species:ID;set:PokemonSet}`, `{type:'clear-set';species:ID}`, `{type:'add-team';name:string}`, `{type:'rename-team';index:number;name:string}`, `{type:'set-team-members';index:number;members:ID[]}`, `{type:'delete-team';index:number}`; `DEFAULT_TEAM_SIZE = 6`; `makeDraftReducer(snapshot: LegalSpeciesSource, teamSize = DEFAULT_TEAM_SIZE)`. `undo` of your own pick also removes its set and team slots. `DraftStoreState` is unchanged.

- [ ] **Step 1: Write the tests: replace `src/app/state/draft-store.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { DraftFile } from '../../domain/file';
import { leagueOf, snapshotOf } from '../../domain/test-support';
import { makeDraftReducer, type DraftStoreState } from './draft-store';

// leagueOf(): drafters Ana, Ben, Cy (snake, 2 rounds, budget 50, me = Ben); prices a 30, b 20, c 10, d 5, e 5, f 1, g 0;
// 'e' is banned and 'h' has no price.
const reduce = makeDraftReducer(snapshotOf());
const empty: DraftStoreState = { file: null, errors: [] };
const fileWith = (picks: string[]): DraftStoreState => ({
  file: { schemaVersion: 2, league: leagueOf(), picks, sets: {}, teams: [] },
  errors: [],
});

describe('set-league', () => {
  it('creates the file from nothing, with no picks, sets or teams', () => {
    const next = reduce(empty, { type: 'set-league', league: leagueOf() });
    expect(next).toEqual({ file: { schemaVersion: 2, league: leagueOf(), picks: [], sets: {}, teams: [] }, errors: [] });
  });

  it('refuses an invalid league and keeps the state', () => {
    const next = reduce(empty, { type: 'set-league', league: leagueOf({ name: ' ', budget: 0 }) });
    expect(next.file).toBeNull();
    expect(next.errors.map((p) => p.path)).toEqual(['league.name', 'league.budget']);
  });

  it('replaces the league and keeps picks, sets and teams', () => {
    const start: DraftStoreState = { file: { ...fileWith(['a']).file!, sets: { a: { species: 'a' } }, teams: [{ name: 'T', members: ['a'] }] }, errors: [] };
    const next = reduce(start, { type: 'set-league', league: leagueOf({ name: 'Renamed', budget: 60 }) });
    expect(next.errors).toEqual([]);
    expect(next.file?.league.name).toBe('Renamed');
    expect(next.file?.picks).toEqual(['a']);
    expect(next.file?.sets).toEqual({ a: { species: 'a' } });
    expect(next.file?.teams).toEqual([{ name: 'T', members: ['a'] }]);
  });

  it('locks drafters, order, rounds and your slot once a pick is recorded', () => {
    const start = fileWith(['a']);
    const changes = [
      { drafters: ['Ana', 'Ben', 'Dee'] },
      { order: 'linear' as const },
      { rounds: 3 },
      { me: 0 },
    ];
    for (const change of changes) {
      const next = reduce(start, { type: 'set-league', league: leagueOf(change) });
      expect(next.file, JSON.stringify(change)).toBe(start.file);
      expect(next.errors[0].message, JSON.stringify(change)).toMatch(/cannot change once picks are recorded/);
    }
    // Without picks the same changes are fine.
    expect(reduce(fileWith([]), { type: 'set-league', league: leagueOf({ rounds: 3 }) }).errors).toEqual([]);
  });

  it('refuses a price or ban change that would break a recorded pick, naming the pick', () => {
    const start = fileWith(['c', 'a']);
    const banned = reduce(start, { type: 'set-league', league: leagueOf({ extraBans: ['e', 'a'] }) });
    expect(banned.file).toBe(start.file);
    expect(banned.errors).toEqual([{ path: 'picks[1]', message: 'this would break pick 2: "a" is banned in this league' }]);
    const tooExpensive = reduce(start, { type: 'set-league', league: leagueOf({ prices: { ...leagueOf().prices, a: 51 } }) });
    expect(tooExpensive.errors[0].path).toBe('picks[1]');
  });
});

describe('pick and undo', () => {
  it('appends a pick the domain allows', () => {
    expect(reduce(fileWith([]), { type: 'pick', species: 'a' }).file?.picks).toEqual(['a']);
  });

  it('refuses a pick the domain refuses, with its message, and keeps the file', () => {
    const start = fileWith(['a']);
    for (const species of ['a', 'e', 'h', 'zz']) {
      const next = reduce(start, { type: 'pick', species });
      expect(next.file, species).toBe(start.file);
      expect(next.errors, species).toHaveLength(1);
    }
    expect(reduce(start, { type: 'pick', species: 'e' }).errors[0].message).toBe('"e" is banned in this league');
  });

  it('refuses a pick before a league exists', () => {
    expect(reduce(empty, { type: 'pick', species: 'a' })).toEqual({ file: null, errors: [{ path: 'picks', message: 'set up a league first' }] });
  });

  it('undoes the last pick, and does nothing with no picks or no file', () => {
    expect(reduce(fileWith(['a', 'b']), { type: 'undo' }).file?.picks).toEqual(['a']);
    const none = fileWith([]);
    expect(reduce(none, { type: 'undo' }).file).toBe(none.file);
    expect(reduce(empty, { type: 'undo' })).toEqual(empty);
  });

  it('clears the errors on the next successful action', () => {
    const refused = reduce(fileWith([]), { type: 'pick', species: 'e' });
    expect(refused.errors).toHaveLength(1);
    expect(reduce(refused, { type: 'pick', species: 'a' }).errors).toEqual([]);
  });
});

describe('replace and clear', () => {
  it('replaces the file, and clears it', () => {
    const other: DraftFile = { schemaVersion: 2, league: leagueOf({ name: 'Other' }), picks: ['b'], sets: {}, teams: [] };
    expect(reduce(fileWith(['a']), { type: 'replace', file: other })).toEqual({ file: other, errors: [] });
    expect(reduce(fileWith(['a']), { type: 'clear' })).toEqual({ file: null, errors: [] });
  });
});

describe('robustness', () => {
  it('never modifies the state or the action it is given', () => {
    const start = fileWith(['a']);
    const league = leagueOf({ name: 'X' });
    const before = JSON.stringify({ start, league });
    reduce(start, { type: 'pick', species: 'b' });
    reduce(start, { type: 'undo' });
    reduce(start, { type: 'set-league', league });
    expect(JSON.stringify({ start, league })).toBe(before);
  });
});

// Snake picks go Ana, Ben (you), Cy, Cy, Ben, Ana: in fileWith(['a', 'b', 'c']) your roster is ['b'].
const mine = (extra: Partial<DraftFile> = {}): DraftStoreState => ({ file: { ...fileWith(['a', 'b', 'c']).file!, ...extra }, errors: [] });

describe('sets', () => {
  it('stores a set for a Pokémon on your roster', () => {
    const set = { species: 'b', moves: ['m1'], nature: 'Jolly' as const };
    const next = reduce(mine(), { type: 'set-set', species: 'b', set });
    expect(next.errors).toEqual([]);
    expect(next.file?.sets).toEqual({ b: set });
  });

  it('refuses a set for a Pokémon that is not yours, under the wrong key, or badly shaped', () => {
    const start = mine();
    const cases = [
      { species: 'a', set: { species: 'a' }, message: 'a is not on your roster' },
      { species: 'b', set: { species: 'c' }, message: 'this set is for c, not b' },
      { species: 'b', set: { species: 'b', moves: ['m1', 'm1'] }, message: 'duplicate move "m1"' },
    ];
    for (const { species, set, message } of cases) {
      const next = reduce(start, { type: 'set-set', species, set });
      expect(next.file, message).toBe(start.file);
      expect(next.errors.map((p) => p.message), message).toEqual([message]);
    }
    expect(reduce(empty, { type: 'set-set', species: 'b', set: { species: 'b' } }).errors[0].message).toBe('set up a league first');
  });

  it('clears a set, and does nothing for a Pokémon without one', () => {
    const start = mine({ sets: { b: { species: 'b' } } });
    expect(reduce(start, { type: 'clear-set', species: 'b' }).file?.sets).toEqual({});
    const none = mine();
    expect(reduce(none, { type: 'clear-set', species: 'b' }).file).toBe(none.file);
  });
});

describe('teams', () => {
  it('adds, renames and deletes teams', () => {
    let state = reduce(mine(), { type: 'add-team', name: ' Rain ' });
    state = reduce(state, { type: 'add-team', name: 'Sun' });
    expect(state.file?.teams).toEqual([{ name: 'Rain', members: [] }, { name: 'Sun', members: [] }]);
    state = reduce(state, { type: 'rename-team', index: 1, name: 'Trick Room' });
    expect(state.file?.teams.map((t) => t.name)).toEqual(['Rain', 'Trick Room']);
    state = reduce(state, { type: 'delete-team', index: 0 });
    expect(state.file?.teams).toEqual([{ name: 'Trick Room', members: [] }]);
  });

  it('refuses an empty name and a team that does not exist', () => {
    const start = mine({ teams: [{ name: 'T', members: [] }] });
    expect(reduce(start, { type: 'add-team', name: '  ' }).errors).toEqual([{ path: 'teams', message: 'a team needs a name' }]);
    expect(reduce(start, { type: 'rename-team', index: 0, name: '' }).errors).toEqual([{ path: 'teams[0].name', message: 'a team needs a name' }]);
    for (const action of [
      { type: 'rename-team' as const, index: 1, name: 'X' },
      { type: 'set-team-members' as const, index: -1, members: [] },
      { type: 'delete-team' as const, index: 1 },
    ]) {
      const next = reduce(start, action);
      expect(next.file, action.type).toBe(start.file);
      expect(next.errors[0].message, action.type).toBe('there is no such team');
    }
  });

  it('sets members from your roster, refusing others, repeats and more than the team size', () => {
    // A 3-round league so that your roster can hold two Pokémon: picks a (Ana), b (you), c, d (Cy), f (you).
    const reduce3 = makeDraftReducer(snapshotOf(), 1);
    const file: DraftFile = { schemaVersion: 2, league: leagueOf({ rounds: 3 }), picks: ['a', 'b', 'c', 'd', 'f'], sets: {}, teams: [{ name: 'T', members: [] }] };
    const start: DraftStoreState = { file, errors: [] };
    expect(reduce(start, { type: 'set-team-members', index: 0, members: ['f', 'b'] }).file?.teams[0].members).toEqual(['f', 'b']);
    expect(reduce(start, { type: 'set-team-members', index: 0, members: ['b', 'a'] }).errors[0].message).toBe('a is not on your roster');
    expect(reduce(start, { type: 'set-team-members', index: 0, members: ['b', 'b'] }).errors[0].message).toBe('b is listed twice');
    expect(reduce3(start, { type: 'set-team-members', index: 0, members: ['b', 'f'] }).errors).toEqual([
      { path: 'teams[0].members', message: 'a team has at most 1 Pokémon' },
    ]);
    expect(reduce3(start, { type: 'set-team-members', index: 0, members: ['f'] }).errors).toEqual([]);
  });
});

describe('undo with sets and teams', () => {
  it('removes your undone Pokémon from your sets and every team', () => {
    // picks a (Ana), b (you): undoing b is undoing your pick.
    const start: DraftStoreState = {
      file: { ...fileWith(['a', 'b']).file!, sets: { b: { species: 'b' } }, teams: [{ name: 'T', members: ['b'] }, { name: 'U', members: [] }] },
      errors: [],
    };
    const next = reduce(start, { type: 'undo' });
    expect(next.file?.picks).toEqual(['a']);
    expect(next.file?.sets).toEqual({});
    expect(next.file?.teams).toEqual([{ name: 'T', members: [] }, { name: 'U', members: [] }]);
    expect(next.file?.teams[1]).toBe(start.file?.teams[1]);
  });

  it("leaves sets and teams alone when undoing another drafter's pick", () => {
    const start = mine({ sets: { b: { species: 'b' } }, teams: [{ name: 'T', members: ['b'] }] });
    const next = reduce(start, { type: 'undo' });
    expect(next.file?.picks).toEqual(['a', 'b']);
    expect(next.file?.sets).toBe(start.file?.sets);
    expect(next.file?.teams).toBe(start.file?.teams);
  });

  it('never modifies the state it is given', () => {
    const start = mine({ sets: { b: { species: 'b' } }, teams: [{ name: 'T', members: ['b'] }] });
    const before = JSON.stringify(start);
    reduce(start, { type: 'set-set', species: 'b', set: { species: 'b', moves: ['m'] } });
    reduce(start, { type: 'clear-set', species: 'b' });
    reduce(start, { type: 'set-team-members', index: 0, members: [] });
    reduce(start, { type: 'rename-team', index: 0, name: 'X' });
    reduce(start, { type: 'delete-team', index: 0 });
    reduce({ ...start, file: { ...start.file!, picks: ['a', 'b'] } }, { type: 'undo' });
    expect(JSON.stringify(start)).toBe(before);
  });
});
```

- [ ] **Step 2: Run them to see the new ones fail**

Run: `npx vitest run src/app/state/draft-store.test.ts`
Expected: FAIL in the new `sets`, `teams` and `undo with sets and teams` tests (unknown action types fall through and keep the state); the increment 1 tests still pass.

- [ ] **Step 3: Replace `src/app/state/draft-store.ts`**

```ts
import { deriveDraft } from '../../domain/derive';
import { applyPick, checkPick, undoPick } from '../../domain/draft';
import type { DraftFile } from '../../domain/file';
import type { ID } from '../../domain/id';
import { validateLeague, type LeagueConfig, type LegalSpeciesSource } from '../../domain/league';
import type { Problem } from '../../domain/problem';
import { validateSet, type PokemonSet } from '../../domain/set';

export interface DraftStoreState {
  /** The one draft file, or null before a league is set up. Never invalid. */
  file: DraftFile | null;
  /** Why the last action was refused; empty after a successful action. */
  errors: Problem[];
}

export type DraftAction =
  | { type: 'set-league'; league: LeagueConfig }
  | { type: 'pick'; species: ID }
  | { type: 'undo' }
  | { type: 'replace'; file: DraftFile }
  | { type: 'clear' }
  | { type: 'set-set'; species: ID; set: PokemonSet }
  | { type: 'clear-set'; species: ID }
  | { type: 'add-team'; name: string }
  | { type: 'rename-team'; index: number; name: string }
  | { type: 'set-team-members'; index: number; members: ID[] }
  | { type: 'delete-team'; index: number };

/** The team size of the shipped format (`meta.showdown.rules.minTeamSize`). */
export const DEFAULT_TEAM_SIZE = 6;

/** Fields that cannot change once a pick is recorded: they decide who picked what. */
const LOCKED = ['drafters', 'order', 'rounds', 'me'] as const;

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Why `league` cannot replace the league of `file`, or an empty list when it can. */
function leagueProblems(file: DraftFile | null, league: LeagueConfig, snapshot: LegalSpeciesSource): Problem[] {
  const invalid = validateLeague(league, 'league');
  if (invalid.length > 0) return invalid;
  if (file === null || file.picks.length === 0) return [];

  const locked = LOCKED.filter((key) => !sameValue(file.league[key], league[key]));
  if (locked.length > 0) {
    return locked.map((key) => ({ path: `league.${key}`, message: `${key} cannot change once picks are recorded` }));
  }
  for (let i = 0; i < file.picks.length; i++) {
    const problem = checkPick(league, file.picks.slice(0, i), file.picks[i], snapshot);
    if (problem !== null) return [{ path: `picks[${i}]`, message: `this would break pick ${i + 1}: ${problem.message}` }];
  }
  return [];
}

/**
 * The reducer over the one draft file. It never throws, never modifies its inputs, and never stores an invalid
 * file: a refused action returns the same file with `errors` set. `teamSize` caps a match team's members.
 */
export function makeDraftReducer(snapshot: LegalSpeciesSource, teamSize: number = DEFAULT_TEAM_SIZE) {
  const nameOf = (id: ID): string => {
    const entry = Object.hasOwn(snapshot.species, id) ? snapshot.species[id] : undefined;
    return entry !== undefined && typeof entry.name === 'string' ? entry.name : id;
  };
  const rosterOf = (file: DraftFile): ID[] => deriveDraft(file.league, file.picks, snapshot).drafters[file.league.me]?.roster ?? [];
  const hasTeam = (file: DraftFile, index: number): boolean => Number.isInteger(index) && index >= 0 && index < file.teams.length;
  const refuse = (state: DraftStoreState, path: string, message: string): DraftStoreState => ({
    file: state.file,
    errors: [{ path, message }],
  });
  const noFile = (state: DraftStoreState, path: string): DraftStoreState => refuse(state, path, 'set up a league first');

  return function draftReducer(state: DraftStoreState, action: DraftAction): DraftStoreState {
    switch (action.type) {
      case 'set-league': {
        const errors = leagueProblems(state.file, action.league, snapshot);
        if (errors.length > 0) return { file: state.file, errors };
        const file: DraftFile =
          state.file === null
            ? { schemaVersion: 2, league: action.league, picks: [], sets: {}, teams: [] }
            : { ...state.file, league: action.league };
        return { file, errors: [] };
      }
      case 'pick': {
        if (state.file === null) return noFile(state, 'picks');
        const result = applyPick(state.file.league, state.file.picks, action.species, snapshot);
        if (!result.ok) return { file: state.file, errors: [result.problem] };
        return { file: { ...state.file, picks: result.picks }, errors: [] };
      }
      case 'undo': {
        const file = state.file;
        if (file === null || file.picks.length === 0) return { file, errors: [] };
        const undone = file.picks[file.picks.length - 1];
        const picks = undoPick(file.picks);
        if (!rosterOf(file).includes(undone)) return { file: { ...file, picks }, errors: [] };
        const sets = { ...file.sets };
        delete sets[undone];
        const teams = file.teams.map((team) =>
          team.members.includes(undone) ? { ...team, members: team.members.filter((id) => id !== undone) } : team,
        );
        return { file: { ...file, picks, sets, teams }, errors: [] };
      }
      case 'replace':
        return { file: action.file, errors: [] };
      case 'clear':
        return { file: null, errors: [] };
      case 'set-set': {
        const file = state.file;
        const path = `sets.${action.species}`;
        if (file === null) return noFile(state, path);
        if (!rosterOf(file).includes(action.species)) return refuse(state, path, `${nameOf(action.species)} is not on your roster`);
        if (action.set?.species !== action.species) {
          return refuse(state, path, `this set is for ${nameOf(String(action.set?.species))}, not ${nameOf(action.species)}`);
        }
        const structural = validateSet(action.set, path);
        if (structural.length > 0) return { file, errors: structural };
        const sets = { ...file.sets };
        Object.defineProperty(sets, action.species, { value: action.set, enumerable: true, writable: true, configurable: true });
        return { file: { ...file, sets }, errors: [] };
      }
      case 'clear-set': {
        const file = state.file;
        if (file === null) return noFile(state, `sets.${action.species}`);
        if (!Object.hasOwn(file.sets, action.species)) return { file, errors: [] };
        const sets = { ...file.sets };
        delete sets[action.species];
        return { file: { ...file, sets }, errors: [] };
      }
      case 'add-team': {
        const file = state.file;
        if (file === null) return noFile(state, 'teams');
        const name = typeof action.name === 'string' ? action.name.trim() : '';
        if (name === '') return refuse(state, 'teams', 'a team needs a name');
        return { file: { ...file, teams: [...file.teams, { name, members: [] }] }, errors: [] };
      }
      case 'rename-team': {
        const file = state.file;
        const path = `teams[${action.index}]`;
        if (file === null) return noFile(state, path);
        if (!hasTeam(file, action.index)) return refuse(state, path, 'there is no such team');
        const name = typeof action.name === 'string' ? action.name.trim() : '';
        if (name === '') return refuse(state, `${path}.name`, 'a team needs a name');
        const teams = file.teams.map((team, i) => (i === action.index ? { ...team, name } : team));
        return { file: { ...file, teams }, errors: [] };
      }
      case 'set-team-members': {
        const file = state.file;
        const path = `teams[${action.index}]`;
        if (file === null) return noFile(state, path);
        if (!hasTeam(file, action.index)) return refuse(state, path, 'there is no such team');
        const members = Array.isArray(action.members) ? action.members : [];
        if (members.length > teamSize) return refuse(state, `${path}.members`, `a team has at most ${teamSize} Pokémon`);
        const roster = rosterOf(file);
        const seen = new Set<ID>();
        for (const id of members) {
          if (!roster.includes(id)) return refuse(state, `${path}.members`, `${nameOf(id)} is not on your roster`);
          if (seen.has(id)) return refuse(state, `${path}.members`, `${nameOf(id)} is listed twice`);
          seen.add(id);
        }
        const teams = file.teams.map((team, i) => (i === action.index ? { ...team, members: [...members] } : team));
        return { file: { ...file, teams }, errors: [] };
      }
      case 'delete-team': {
        const file = state.file;
        const path = `teams[${action.index}]`;
        if (file === null) return noFile(state, path);
        if (!hasTeam(file, action.index)) return refuse(state, path, 'there is no such team');
        return { file: { ...file, teams: file.teams.filter((_, i) => i !== action.index) }, errors: [] };
      }
      default:
        return state;
    }
  };
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run src/app/state` then `npm test` then `npm run typecheck`
Expected: PASS; the whole suite then has 726 tests; typecheck clean. (`Workspace.tsx` still calls `makeDraftReducer(data.snapshot)`; the default team size keeps it compiling until Task 6.)

Mutation proof (do it, then undo it): in the `undo` case, delete the line `if (!rosterOf(file).includes(undone)) return { file: { ...file, picks }, errors: [] };`; the test "leaves sets and teams alone when undoing another drafter's pick" must fail. Restore the line.

- [ ] **Step 5: Commit**

```bash
git add src/app/state/draft-store.ts src/app/state/draft-store.test.ts
git commit -m "feat(app): set and team actions in the draft store; undo removes your set and team slots" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: One file button, clipboard copy and file names

**Files:**
- Create: `src/app/FileButton.tsx`
- Modify: `src/app/browser.ts`, `src/app/test-support.ts`, `src/app/setup/SetupView.tsx`, `src/app/setup/PriceImport.tsx`, `src/app/room/DraftRoom.tsx`, `src/app/Workspace.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `FileButton(props: { label: string; accept: string; onText(text: string | null, fileName: string): void })`; `BrowserActions.copy(text: string): Promise<boolean>`; `fileBase(name: string): string`; `fakeActions(answers?, options?: { copyFails?: boolean })` also returns `copies: string[]`; `SetupView`'s `onImport?(text: string | null)` and `DraftRoom`'s `onImport(text: string | null)`.

This is a refactor with no new behaviour on screen: the increment 1 flow tests (setup import, room import, the unreadable file) cover it.

- [ ] **Step 1: Create `src/app/FileButton.tsx`**

```tsx
interface Props {
  /** The button's text; also the file input's accessible name. */
  label: string;
  /** The file types offered, as for `<input accept>`. */
  accept: string;
  /** The chosen file's text and name; null text when the file could not be read. */
  onText(text: string | null, fileName: string): void;
}

/** A button that opens the file picker and reads the chosen file as text. Choosing the same file again works. */
export function FileButton({ label, accept, onText }: Props) {
  return (
    <label className="file-button">
      {label}
      <input
        type="file"
        accept={accept}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          let text: string;
          try {
            text = await file.text();
          } catch {
            onText(null, file.name);
            return;
          }
          onText(text, file.name);
        }}
      />
    </label>
  );
}
```

- [ ] **Step 2: Add `copy` and `fileBase` to `src/app/browser.ts`**

In `src/app/browser.ts`, find:
```ts
  confirm(message: string): boolean;
}
```
Replace with:
```ts
  confirm(message: string): boolean;
  /** Puts `text` on the clipboard; false when the browser refuses or has no clipboard. */
  copy(text: string): Promise<boolean>;
}
```

In `src/app/browser.ts`, find:
```ts
  confirm: (message) => window.confirm(message),
```
Replace with:
```ts
  confirm: (message) => window.confirm(message),
  async copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  },
```

In `src/app/browser.ts`, find:
```ts
export function exportFileName(leagueName: string): string {
  const base = leagueName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'draft'}.draftlab.json`;
}
```
Replace with:
```ts
export function exportFileName(leagueName: string): string {
  return `${fileBase(leagueName)}.draftlab.json`;
}

/** A name as a file name part: lower-case letters, digits and dashes ("Test League" → "test-league"). */
export function fileBase(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'draft';
}
```

- [ ] **Step 3: Let the fake browser record copies, in `src/app/test-support.ts`**

In `src/app/test-support.ts`, find:
```ts
/** Browser actions that record downloads and confirm questions; confirms answer from `answers` in order (default yes). */
export function fakeActions(answers: boolean[] = []) {
  const downloads: Array<{ filename: string; text: string }> = [];
  const questions: string[] = [];
```
Replace with:
```ts
/**
 * Browser actions that record downloads, confirm questions and copies. Confirms answer from `answers` in order
 * (default yes); with `copyFails` every copy reports failure.
 */
export function fakeActions(answers: boolean[] = [], options: { copyFails?: boolean } = {}) {
  const downloads: Array<{ filename: string; text: string }> = [];
  const questions: string[] = [];
  const copies: string[] = [];
```

In `src/app/test-support.ts`, find:
```ts
      return answers.length > 0 ? (answers.shift() as boolean) : true;
    },
  };
  return { actions, downloads, questions };
```
Replace with:
```ts
      return answers.length > 0 ? (answers.shift() as boolean) : true;
    },
    copy: async (text) => {
      if (options.copyFails) return false;
      copies.push(text);
      return true;
    },
  };
  return { actions, downloads, questions, copies };
```

- [ ] **Step 4: Use `FileButton` in the setup view**

In `src/app/setup/SetupView.tsx`, find:
```tsx
import type { AppData } from '../data/snapshot';
```
Replace with:
```tsx
import type { AppData } from '../data/snapshot';
import { FileButton } from '../FileButton';
```

In `src/app/setup/SetupView.tsx`, find:
```tsx
  /** Import a saved draft file (only when there is no draft yet). */
  onImport?(file: File): void;
```
Replace with:
```tsx
  /** Import a saved draft file's text, or null when it could not be read (only when there is no draft yet). */
  onImport?(text: string | null): void;
```

In `src/app/setup/SetupView.tsx`, find:
```tsx
          <label className="file-button">
            Import a draft file
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                if (chosen) onImport(chosen);
                event.target.value = '';
              }}
            />
          </label>
```
Replace with:
```tsx
          <FileButton label="Import a draft file" accept=".json,application/json" onText={(text) => onImport(text)} />
```

- [ ] **Step 5: Use `FileButton` in the price import**

In `src/app/setup/PriceImport.tsx`, find:
```tsx
import { parsePriceCsv, type PriceImport as PriceImportResult } from '../../domain/prices';
```
Replace with:
```tsx
import { parsePriceCsv, type PriceImport as PriceImportResult } from '../../domain/prices';
import { FileButton } from '../FileButton';
```

In `src/app/setup/PriceImport.tsx`, find:
```tsx
        <label className="file-button">
          Upload a file
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              let contents: string;
              try {
                contents = await file.text();
              } catch {
                setResult(null);
                setReadError(true);
                return;
              }
              setReadError(false);
              run(contents);
            }}
          />
        </label>
```
Replace with:
```tsx
        <FileButton
          label="Upload a file"
          accept=".csv,.tsv,.txt"
          onText={(contents) => {
            if (contents === null) {
              setResult(null);
              setReadError(true);
              return;
            }
            setReadError(false);
            run(contents);
          }}
        />
```

- [ ] **Step 6: Use `FileButton` in the draft room**

In `src/app/room/DraftRoom.tsx`, find:
```tsx
import type { AppData } from '../data/snapshot';
```
Replace with:
```tsx
import type { AppData } from '../data/snapshot';
import { FileButton } from '../FileButton';
```

In `src/app/room/DraftRoom.tsx`, find:
```tsx
  onImport(file: File): void;
  onSetup(): void;
```
Replace with:
```tsx
  /** A draft file's text to import, or null when the chosen file could not be read. */
  onImport(text: string | null): void;
  onSetup(): void;
```

In `src/app/room/DraftRoom.tsx`, find:
```tsx
          <label className="file-button">
            Import
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                if (chosen) onImport(chosen);
                event.target.value = '';
              }}
            />
          </label>
```
Replace with:
```tsx
          <FileButton label="Import" accept=".json,application/json" onText={(text) => onImport(text)} />
```

- [ ] **Step 7: Import text instead of a `File` in `src/app/Workspace.tsx`**

In `src/app/Workspace.tsx`, find:
```tsx
  const importFile = async (chosen: File) => {
    let text: string;
    try {
      text = await chosen.text();
    } catch {
      setImportErrors([{ path: 'file', message: 'the file could not be read' }]);
      return;
    }
```
Replace with:
```tsx
  const importFile = (text: string | null) => {
    if (text === null) {
      setImportErrors([{ path: 'file', message: 'the file could not be read' }]);
      return;
    }
```

- [ ] **Step 8: Run the suite and the typecheck**

Run: `npm test` then `npm run typecheck`
Expected: the whole suite then has 726 tests (the increment 1 import tests, including "imports a saved draft file from the setup screen", the import round trip and the unreadable file, pass through `FileButton`); typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add src/app/FileButton.tsx src/app/browser.ts src/app/test-support.ts src/app/setup/SetupView.tsx src/app/setup/PriceImport.tsx src/app/room/DraftRoom.tsx src/app/Workspace.tsx
git commit -m "refactor(app): one FileButton for every file picker; clipboard copy and file names" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The teambuilder components

**Files:**
- Create: `src/app/team/OptionPicker.tsx`, `src/app/team/flash.ts`, `src/app/team/StatPoints.tsx`, `src/app/team/SetEditor.tsx`, `src/app/team/RosterList.tsx`, `src/app/team/PastePanel.tsx`, `src/app/team/MatchTeams.tsx`, `src/app/team/TeambuilderView.tsx`

**Interfaces:**
- Consumes: Task 1 (`options.ts`), Task 2 (`setProblemText`, `teamProblemText`), Task 3 (`DraftAction`, `DraftStoreState`), Task 4 (`FileButton`, `BrowserActions.copy`, `fileBase`); `Names`, `joinList` (`text/names.ts`); `AppData`; domain `deriveDraft`, `validateSetAgainstSnapshot`, `validateTeam`, `computeSetStats`, `parsePaste`, `exportSet`, `exportSets`, `exportTeam`, `NATURES`, `isNatureName`, `MAX_STAT_POINT`, `MAX_TOTAL_STAT_POINTS`, `STAT_NAMES`.
- Produces: `TeambuilderView(props: { data: AppData; file: DraftFile; names: Names; errors: Problem[]; dispatch(action: DraftAction): DraftStoreState; actions: BrowserActions })`. Texts and labels the flow tests rely on: roster buttons "<name> <types> <status>" with status "No set" / "Set ready" / "N problem(s)"; the empty roster "Your roster is empty: draft a Pokémon first."; tabs "Set" and "Paste"; the editor heading (the display name), "<name>'s ability" (select), "<name>'s item" and "Move 1" to "Move 4" (comboboxes), "Nature" (select), "HP points" … "Spe points", "N of 66 points left", the stat with " ↑" / " ↓", the hint "0 to N", "Start from the common set", "No ladder data for this Pokémon.", "(<name> must hold <item>)", "Copy set", "Clear set" (asks "Clear <name>'s set?"); the paste panel's "Paste sets from Showdown", "Also make a team from this paste", "Import", "Import a paste file", "N set(s) imported.", "<name> is not on your roster; skipped.", the question "Replace the existing sets of <names>?", "Copy all sets", "Download all sets" (`<base>.sets.txt`); match teams' "New team", articles labelled by team name, "Name of team N", one checkbox per roster Pokémon (its display name), "Complete" / "N of 6", "A team needs a name", "Copy team", "Download team" (`<base>.<team>.txt`), "Delete team" (asks "Delete <team>?"); "Copied." / "Couldn't copy: use Download instead.".

- [ ] **Step 1: Create the shared combobox and the copy message**

```tsx
import { useId, useState } from 'react';
import type { ID } from '../../domain/id';
import { shareText, type Option } from './options';

interface Props {
  label: string;
  options: readonly Option[];
  /** The chosen id, or undefined for none. */
  value: ID | undefined;
  /** What the box shows when it is not being typed in. */
  valueName: string;
  /** The choice that clears the value, e.g. "No item". */
  noneLabel: string;
  onChange(id: ID | undefined): void;
}

const MAX_OPTIONS = 8;

const optionText = (option: Option): string => (option.share === null ? option.name : `${option.name} (${shareText(option.share)})`);

/**
 * A combobox over a fixed list of options (an item, a move): type to filter by name, arrows to move, Enter or a
 * click to choose, Escape to stop. The none choice comes last in the list.
 */
export function OptionPicker({ label, options, value, valueName, noneLabel, onChange }: Props) {
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const needle = (query ?? '').trim().toLowerCase();
  const shown =
    query === null
      ? []
      : [
          ...options.filter((option) => option.name.toLowerCase().includes(needle)).slice(0, MAX_OPTIONS),
          { id: '', name: noneLabel, share: null },
        ];
  const current = Math.min(active, Math.max(shown.length - 1, 0));

  const choose = (index: number) => {
    const option = shown[index];
    if (!option) return;
    onChange(option.id === '' ? undefined : option.id);
    setQuery(null);
    setActive(0);
  };

  return (
    <div className="picker">
      <label htmlFor={`${listId}-input`}>{label}</label>
      <input
        id={`${listId}-input`}
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown.length > 0 ? `${listId}-${current}` : undefined}
        autoComplete="off"
        placeholder={noneLabel}
        value={query ?? (value === undefined ? '' : valueName)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onBlur={() => setQuery(null)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (query === null) setQuery('');
            else setActive(Math.min(current + 1, shown.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(Math.max(current - 1, 0));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            choose(current);
          } else if (event.key === 'Escape') {
            setQuery(null);
          }
        }}
      />
      {shown.length > 0 && (
        <ul id={listId} role="listbox" className="options">
          {shown.map((option, index) => (
            <li
              key={option.id === '' ? '(none)' : option.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === current}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              {optionText(option)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

```ts
import { useEffect, useState } from 'react';

/** How long a short confirmation ("Copied.") stays on screen. */
export const FLASH_MS = 4000;

/** A message that clears itself after `FLASH_MS`; a new message restarts the clock. */
export function useFlash(): [string, (message: string) => void] {
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (message === '') return;
    const timer = setTimeout(() => setMessage(''), FLASH_MS);
    return () => clearTimeout(timer);
  }, [message]);
  return [message, setMessage];
}

/** Copies `text` and reports the outcome in plain words. */
export async function copyWithMessage(copy: (text: string) => Promise<boolean>, text: string, flash: (message: string) => void) {
  flash((await copy(text)) ? 'Copied.' : "Couldn't copy: use Download instead.");
}
```

- [ ] **Step 2: Create the set editor and its stat points**

```tsx
import { useState } from 'react';
import { NATURES, type NatureName } from '../../domain/natures';
import { MAX_STAT_POINT, MAX_TOTAL_STAT_POINTS, STAT_NAMES, type StatPoints as Points } from '../../domain/set';
import type { Stats } from '../../domain/stats';
import type { StatName } from '../../domain/types';
import { STAT_LABELS } from './options';

interface Props {
  points: Points | undefined;
  nature: NatureName | undefined;
  /** Level-50 stats for the current set, or null when they cannot be computed. */
  stats: Stats | null;
  onChange(points: Points): void;
}

const ZERO: Points = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

/**
 * Six stat-point inputs with the points left and the resulting level-50 stats. A value that is not a whole
 * number, is over 32, or would take the total over 66 stays in its box with the allowed range as a hint and is
 * not saved: the draft file never holds a set over the limit.
 */
export function StatPoints({ points, nature, stats, onChange }: Props) {
  const [drafts, setDrafts] = useState<Partial<Record<StatName, string>>>({});
  const current = points ?? ZERO;
  const total = STAT_NAMES.reduce((sum, stat) => sum + current[stat], 0);
  const left = Math.max(MAX_TOTAL_STAT_POINTS - total, 0);
  const effect = nature ? NATURES[nature] : null;

  return (
    <fieldset className="stat-points">
      <legend>Stat points</legend>
      <p className="points-left">
        {left} of {MAX_TOTAL_STAT_POINTS} points left
      </p>
      {STAT_NAMES.map((stat) => {
        const draft = drafts[stat];
        const max = Math.min(MAX_STAT_POINT, current[stat] + left);
        const arrow = effect?.plus === stat ? ' ↑' : effect?.minus === stat ? ' ↓' : '';
        return (
          <div className="stat-row" key={stat}>
            <label htmlFor={`points-${stat}`}>{STAT_LABELS[stat]} points</label>
            <input
              id={`points-${stat}`}
              type="number"
              min={0}
              max={max}
              step={1}
              value={draft ?? String(current[stat])}
              onChange={(event) => {
                const text = event.target.value;
                const value = Number(text);
                if (/^[0-9]+$/.test(text.trim()) && value <= max) {
                  setDrafts(({ [stat]: _dropped, ...rest }) => rest);
                  onChange({ ...current, [stat]: value });
                } else {
                  setDrafts((before) => ({ ...before, [stat]: text }));
                }
              }}
            />
            <span className="stat-value">{stats === null ? '' : `${stats[stat]}${arrow}`}</span>
            {draft !== undefined && <span className="field-error">0 to {max}</span>}
          </div>
        );
      })}
    </fieldset>
  );
}
```

```tsx
import { useMemo } from 'react';
import type { ID } from '../../domain/id';
import { isNatureName } from '../../domain/natures';
import type { Problem } from '../../domain/problem';
import type { PokemonSet } from '../../domain/set';
import { computeSetStats } from '../../domain/stats';
import type { Snapshot } from '../../domain/types';
import type { Names } from '../text/names';
import { setProblemText } from '../text/problems';
import { OptionPicker } from './OptionPicker';
import { NATURE_OPTIONS, abilityOptions, commonSet, itemOptions, moveOptions, natureLabel, requiredItemOf, shareText } from './options';
import { StatPoints } from './StatPoints';

interface Props {
  species: ID;
  /** The saved set, or undefined when there is none yet. */
  set: PokemonSet | undefined;
  price: number | undefined;
  snapshot: Snapshot;
  names: Names;
  /** The set's problems from `validateSetAgainstSnapshot`. */
  problems: Problem[];
  onChange(set: PokemonSet): void;
  onClear(): void;
  onCopy(): void;
}

const MOVE_SLOTS = 4;

/** Drops the fields that are undefined, so a cleared choice leaves no key behind. */
const withoutEmpty = (set: PokemonSet): PokemonSet =>
  Object.fromEntries(Object.entries(set).filter(([, value]) => value !== undefined)) as unknown as PokemonSet;

/** The form for one roster Pokémon's set. Every change is handed to `onChange` at once. */
export function SetEditor({ species, set, price, snapshot, names, problems, onChange, onClear, onCopy }: Props) {
  const name = names.species(species);
  const current: PokemonSet = set ?? { species };
  const required = requiredItemOf(species, snapshot);
  const abilities = useMemo(() => abilityOptions(species, snapshot), [species, snapshot]);
  const items = useMemo(() => itemOptions(species, snapshot), [species, snapshot]);
  const moves = useMemo(() => moveOptions(species, snapshot), [species, snapshot]);
  const common = useMemo(() => commonSet(species, snapshot), [species, snapshot]);
  const stats = computeSetStats(current, snapshot);
  const empty = set === undefined || Object.keys(set).every((key) => key === 'species');
  const itemName = (id: ID) => (Object.hasOwn(snapshot.items, id) ? snapshot.items[id].name : id);

  const update = (patch: Partial<PokemonSet>) => {
    const next: PokemonSet = { ...current, ...patch, species };
    if (required !== null) next.item = required;
    onChange(withoutEmpty(next));
  };

  const setMove = (slot: number, id: ID | undefined) => {
    const list = [...(current.moves ?? [])];
    if (id === undefined) list.splice(slot, 1);
    else if (slot < list.length) list[slot] = id;
    else list.push(id);
    update({ moves: list.length > 0 ? list : undefined });
  };

  const abilityKnown = current.ability === undefined || abilities.some((option) => option.id === current.ability);

  return (
    <section className="set-editor" aria-labelledby="set-editor-title">
      <h2 id="set-editor-title">{name}</h2>
      <p className="types">
        {names.types(species).join(' / ')}
        {price !== undefined && ` · ${price} pts`}
      </p>
      <div className="row">
        {empty && common !== null && (
          <button type="button" onClick={() => onChange(common)}>
            Start from the common set
          </button>
        )}
        {empty && common === null && <p className="note">No ladder data for this Pokémon.</p>}
        {set !== undefined && (
          <>
            <button type="button" onClick={onCopy}>
              Copy set
            </button>
            <button type="button" className="danger" onClick={onClear}>
              Clear set
            </button>
          </>
        )}
      </div>

      <div className="field">
        <label htmlFor="set-ability">{name}'s ability</label>
        <select
          id="set-ability"
          value={current.ability ?? ''}
          onChange={(event) => update({ ability: event.target.value === '' ? undefined : event.target.value })}
        >
          {abilities.map((option) => (
            <option key={option.id} value={option.id}>
              {option.share === null ? option.name : `${option.name} (${shareText(option.share)})`}
            </option>
          ))}
          {!abilityKnown && <option value={current.ability}>{current.ability} (not its ability)</option>}
          <option value="">No ability chosen</option>
        </select>
      </div>

      {required !== null ? (
        <p className="field">
          Item: {itemName(required)} <span className="note">({name} must hold {itemName(required)})</span>
        </p>
      ) : (
        <OptionPicker
          label={`${name}'s item`}
          options={items}
          value={current.item}
          valueName={current.item === undefined ? '' : itemName(current.item)}
          noneLabel="No item"
          onChange={(id) => update({ item: id })}
        />
      )}

      <fieldset className="moves">
        <legend>Moves</legend>
        {Array.from({ length: MOVE_SLOTS }, (_, slot) => {
          const chosen = current.moves?.[slot];
          const others = new Set((current.moves ?? []).filter((_, i) => i !== slot));
          return (
            <OptionPicker
              key={slot}
              label={`Move ${slot + 1}`}
              options={moves.filter((option) => !others.has(option.id))}
              value={chosen}
              valueName={chosen === undefined ? '' : names.move(chosen)}
              noneLabel="No move"
              onChange={(id) => setMove(slot, id)}
            />
          );
        })}
      </fieldset>

      <div className="field">
        <label htmlFor="set-nature">Nature</label>
        <select
          id="set-nature"
          value={current.nature ?? ''}
          onChange={(event) => update({ nature: isNatureName(event.target.value) ? event.target.value : undefined })}
        >
          {NATURE_OPTIONS.map((nature) => (
            <option key={nature} value={nature}>
              {natureLabel(nature)}
            </option>
          ))}
          <option value="">No nature chosen</option>
        </select>
      </div>

      <StatPoints points={current.points} nature={current.nature} stats={stats} onChange={(points) => update({ points })} />

      <ul className="problems" aria-live="polite">
        {problems.map((problem) => (
          <li key={`${problem.path}:${problem.message}`}>{setProblemText(problem, current, snapshot)}</li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Create the roster list, the paste panel and the match teams**

```tsx
import type { ID } from '../../domain/id';
import type { Problem } from '../../domain/problem';
import type { RosterSets } from '../../domain/team';
import type { Names } from '../text/names';

interface Props {
  roster: readonly ID[];
  sets: RosterSets;
  /** Each roster Pokémon's set problems (empty for one without a set). */
  problems: Readonly<Record<ID, Problem[]>>;
  selected: ID | null;
  names: Names;
  onSelect(species: ID): void;
}

/** "No set", "Set ready" or "N problems". */
export function setStatus(hasSet: boolean, problemCount: number): string {
  if (!hasSet) return 'No set';
  if (problemCount === 0) return 'Set ready';
  return `${problemCount} problem${problemCount === 1 ? '' : 's'}`;
}

/** Your drafted Pokémon in pick order, each with its set status; choosing one opens it in the editor. */
export function RosterList({ roster, sets, problems, selected, names, onSelect }: Props) {
  return (
    <section className="roster-list" aria-labelledby="roster-list-title">
      <h2 id="roster-list-title">Your roster</h2>
      {roster.length === 0 ? (
        <p>Your roster is empty: draft a Pokémon first.</p>
      ) : (
        <ul>
          {roster.map((id) => (
            <li key={id}>
              <button type="button" aria-current={id === selected ? 'true' : undefined} onClick={() => onSelect(id)}>
                <span className="name">{names.species(id)}</span>{' '}
                <span className="types">{names.types(id).join(' / ')}</span>{' '}
                <span className="set-status">{setStatus(Object.hasOwn(sets, id), problems[id]?.length ?? 0)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

```tsx
import { useState } from 'react';
import type { DraftFile } from '../../domain/file';
import type { ID } from '../../domain/id';
import { exportSets } from '../../domain/paste-export';
import { parsePaste } from '../../domain/paste';
import type { PokemonSet } from '../../domain/set';
import type { Snapshot } from '../../domain/types';
import type { BrowserActions } from '../browser';
import { FileButton } from '../FileButton';
import type { DraftAction, DraftStoreState } from '../state/draft-store';
import { joinList, type Names } from '../text/names';
import { setProblemText } from '../text/problems';
import { copyWithMessage, useFlash } from './flash';

interface Props {
  file: DraftFile;
  roster: readonly ID[];
  snapshot: Snapshot;
  names: Names;
  teamSize: number;
  /** The league's name as a file name part, for downloads. */
  base: string;
  dispatch(action: DraftAction): DraftStoreState;
  actions: BrowserActions;
}

interface ImportResult {
  imported: number;
  /** One line per block that was skipped or has problems or notes. */
  lines: string[];
}

/** Imports a Showdown paste into your roster's sets (optionally as a team too), and exports your sets. */
export function PastePanel({ file, roster, snapshot, names, teamSize, base, dispatch, actions }: Props) {
  const [text, setText] = useState('');
  const [makeTeam, setMakeTeam] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [readError, setReadError] = useState(false);
  const [flash, setFlash] = useFlash();

  const importPaste = (input: string, teamName: string) => {
    const blocks = parsePaste(input, snapshot);
    const lines: string[] = [];
    const chosen: PokemonSet[] = [];
    blocks.forEach((block, index) => {
      const set = block.set;
      const label = `Block ${index + 1}${set ? ` (${names.species(set.species)})` : ''}`;
      if (set && !roster.includes(set.species)) {
        lines.push(`${names.species(set.species)} is not on your roster; skipped.`);
        return;
      }
      if (set && chosen.some((other) => other.species === set.species)) {
        lines.push(`${label}: ${names.species(set.species)} appears earlier in this paste; skipped.`);
        return;
      }
      for (const note of block.notes) lines.push(`${label}: ${note}`);
      for (const problem of block.problems) lines.push(`${label}: ${set ? setProblemText(problem, set, snapshot) : problem.message}`);
      if (set) chosen.push(set);
    });

    const existing = chosen.filter((set) => Object.hasOwn(file.sets, set.species));
    const replace =
      existing.length === 0 ||
      actions.confirm(`Replace the existing sets of ${joinList(existing.map((set) => names.species(set.species)))}?`);
    let imported = 0;
    for (const set of chosen) {
      if (!replace && Object.hasOwn(file.sets, set.species)) continue;
      const refused = dispatch({ type: 'set-set', species: set.species, set }).errors;
      if (refused.length === 0) imported++;
      else lines.push(`${names.species(set.species)} was not imported: ${refused.map((p) => setProblemText(p, set, snapshot)).join(' ')}`);
    }

    if (makeTeam && chosen.length > 0) {
      const added = dispatch({ type: 'add-team', name: teamName });
      const index = (added.file?.teams.length ?? 0) - 1;
      const members = chosen.slice(0, teamSize).map((set) => set.species);
      if (added.errors.length === 0 && dispatch({ type: 'set-team-members', index, members }).errors.length === 0) {
        lines.push(`Added the team "${teamName}".`);
      }
    }
    setReadError(false);
    setResult({ imported, lines });
  };

  const allSets = () => exportSets(roster.filter((id) => Object.hasOwn(file.sets, id)).map((id) => file.sets[id]), snapshot);

  return (
    <section className="paste-panel" aria-labelledby="paste-title">
      <h2 id="paste-title">Showdown paste</h2>
      <label htmlFor="paste-text">Paste sets from Showdown</label>
      <textarea id="paste-text" rows={10} value={text} onChange={(event) => setText(event.target.value)} />
      <label className="check">
        <input type="checkbox" checked={makeTeam} onChange={(event) => setMakeTeam(event.target.checked)} /> Also make a team from
        this paste
      </label>
      <div className="row">
        <button type="button" onClick={() => importPaste(text, 'Pasted team')} disabled={text.trim() === ''}>
          Import
        </button>
        <FileButton
          label="Import a paste file"
          accept=".txt,text/plain"
          onText={(contents, fileName) => {
            if (contents === null) {
              setResult(null);
              setReadError(true);
              return;
            }
            importPaste(contents, fileName.replace(/\.[^.]*$/, '') || 'Pasted team');
          }}
        />
      </div>
      <div className="import-result" aria-live="polite">
        {readError && <p>That file could not be read.</p>}
        {result && (
          <>
            <p>
              {result.imported} set{result.imported === 1 ? '' : 's'} imported.
            </p>
            {result.lines.length > 0 && (
              <ul className="problems">
                {result.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <h3>Export your sets</h3>
      <div className="row">
        <button type="button" onClick={() => copyWithMessage(actions.copy, allSets(), setFlash)}>
          Copy all sets
        </button>
        <button type="button" onClick={() => actions.download(`${base}.sets.txt`, allSets())}>
          Download all sets
        </button>
      </div>
      <p aria-live="polite" className="flash">
        {flash}
      </p>
    </section>
  );
}
```

```tsx
import { useState } from 'react';
import type { DraftFile } from '../../domain/file';
import type { ID } from '../../domain/id';
import { exportTeam } from '../../domain/paste-export';
import { validateTeam, type MatchTeam } from '../../domain/team';
import type { Snapshot } from '../../domain/types';
import { fileBase, type BrowserActions } from '../browser';
import type { DraftAction, DraftStoreState } from '../state/draft-store';
import type { Names } from '../text/names';
import { teamProblemText } from '../text/problems';
import { copyWithMessage, useFlash } from './flash';

interface Props {
  file: DraftFile;
  roster: readonly ID[];
  snapshot: Snapshot;
  names: Names;
  teamSize: number;
  base: string;
  dispatch(action: DraftAction): DraftStoreState;
  actions: BrowserActions;
}

/** "Team N" with the smallest N that no team already uses. */
export function nextTeamName(teams: readonly MatchTeam[]): string {
  const used = new Set(teams.map((team) => team.name));
  let n = 1;
  while (used.has(`Team ${n}`)) n++;
  return `Team ${n}`;
}

interface TeamProps extends Omit<Props, 'file'> {
  file: DraftFile;
  team: MatchTeam;
  index: number;
}

function TeamCard({ file, team, index, roster, snapshot, names, teamSize, base, dispatch, actions }: TeamProps) {
  const [name, setName] = useState(team.name);
  const [flash, setFlash] = useFlash();
  const check = validateTeam(team, [...roster], file.sets, snapshot, teamSize, `teams[${index}]`);
  const full = team.members.length >= teamSize;
  const paste = () => exportTeam(team, file.sets, snapshot);

  const toggle = (id: ID, on: boolean) => {
    const members = on ? [...team.members, id] : team.members.filter((member) => member !== id);
    dispatch({ type: 'set-team-members', index, members });
  };

  return (
    <article className="team" aria-label={team.name}>
      <div className="field">
        <label htmlFor={`team-name-${index}`}>Name of team {index + 1}</label>
        <input
          id={`team-name-${index}`}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (event.target.value.trim() !== '') dispatch({ type: 'rename-team', index, name: event.target.value });
          }}
        />
        {name.trim() === '' && <p className="field-error">A team needs a name</p>}
      </div>
      <fieldset>
        <legend>Members</legend>
        {roster.map((id) => {
          const on = team.members.includes(id);
          return (
            <label key={id} className="check">
              <input type="checkbox" checked={on} disabled={!on && full} onChange={(event) => toggle(id, event.target.checked)} />{' '}
              {names.species(id)}
            </label>
          );
        })}
      </fieldset>
      <p className="team-status">{check.complete ? 'Complete' : `${team.members.length} of ${teamSize}`}</p>
      <ul className="problems" aria-live="polite">
        {check.problems.map((problem) => (
          <li key={`${problem.path}:${problem.message}`}>{teamProblemText(problem, team, file.sets, snapshot)}</li>
        ))}
      </ul>
      <div className="row">
        <button type="button" onClick={() => copyWithMessage(actions.copy, paste(), setFlash)}>
          Copy team
        </button>
        <button type="button" onClick={() => actions.download(`${base}.${fileBase(team.name)}.txt`, paste())}>
          Download team
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (actions.confirm(`Delete ${team.name}?`)) dispatch({ type: 'delete-team', index });
          }}
        >
          Delete team
        </button>
      </div>
      <p aria-live="polite" className="flash">
        {flash}
      </p>
    </article>
  );
}

/** Your match teams: up to `teamSize` roster Pokémon each, checked with the Species and Item Clauses. */
export function MatchTeams(props: Props) {
  const { file, dispatch } = props;
  return (
    <section className="match-teams" aria-labelledby="match-teams-title">
      <h2 id="match-teams-title">Match teams</h2>
      <button type="button" onClick={() => dispatch({ type: 'add-team', name: nextTeamName(file.teams) })}>
        New team
      </button>
      {file.teams.length === 0 && <p>No teams yet.</p>}
      {file.teams.map((team, index) => (
        <TeamCard key={`${index}:${file.teams.length}`} {...props} team={team} index={index} />
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Create the view**

```tsx
import { useMemo, useState } from 'react';
import { deriveDraft } from '../../domain/derive';
import type { DraftFile } from '../../domain/file';
import type { ID } from '../../domain/id';
import { exportSet } from '../../domain/paste-export';
import type { Problem } from '../../domain/problem';
import { validateSetAgainstSnapshot } from '../../domain/set-check';
import { fileBase, type BrowserActions } from '../browser';
import type { AppData } from '../data/snapshot';
import type { DraftAction, DraftStoreState } from '../state/draft-store';
import type { Names } from '../text/names';
import { copyWithMessage, useFlash } from './flash';
import { MatchTeams } from './MatchTeams';
import { PastePanel } from './PastePanel';
import { RosterList } from './RosterList';
import { SetEditor } from './SetEditor';

interface Props {
  data: AppData;
  file: DraftFile;
  names: Names;
  /** The store's refusal of the last action, if any. */
  errors: Problem[];
  dispatch(action: DraftAction): DraftStoreState;
  actions: BrowserActions;
}

/** The teambuilder: your roster, the set editor (or the paste panel) and your match teams. */
export function TeambuilderView({ data, file, names, errors, dispatch, actions }: Props) {
  const { snapshot } = data;
  const teamSize = data.meta.showdown.rules.minTeamSize;
  const base = fileBase(file.league.name);
  const roster = useMemo(
    () => deriveDraft(file.league, file.picks, snapshot).drafters[file.league.me]?.roster ?? [],
    [file.league, file.picks, snapshot],
  );
  const problems = useMemo(() => {
    const out: Record<ID, Problem[]> = {};
    for (const id of roster) out[id] = Object.hasOwn(file.sets, id) ? validateSetAgainstSnapshot(file.sets[id], snapshot, `sets.${id}`) : [];
    return out;
  }, [roster, file.sets, snapshot]);
  const [chosen, setChosen] = useState<ID | null>(null);
  const [tab, setTab] = useState<'set' | 'paste'>('set');
  const [flash, setFlash] = useFlash();
  const selected = chosen !== null && roster.includes(chosen) ? chosen : (roster[0] ?? null);
  const set = selected !== null && Object.hasOwn(file.sets, selected) ? file.sets[selected] : undefined;

  return (
    <div className="teambuilder">
      <header className="room-header">
        <h1>{file.league.name}</h1>
        <p className="status">Teambuilder</p>
      </header>
      <div className={errors.length > 0 ? 'refusal' : undefined} aria-live="polite">
        {errors.map((p) => (
          <p key={`${p.path}:${p.message}`}>{p.message}</p>
        ))}
      </div>
      <div className="columns">
        <div className="column">
          <RosterList roster={roster} sets={file.sets} problems={problems} selected={selected} names={names} onSelect={setChosen} />
        </div>
        <div className="column">
          <div className="row tabs">
            <button type="button" aria-pressed={tab === 'set'} onClick={() => setTab('set')}>
              Set
            </button>
            <button type="button" aria-pressed={tab === 'paste'} onClick={() => setTab('paste')}>
              Paste
            </button>
          </div>
          {tab === 'paste' ? (
            <PastePanel
              file={file}
              roster={roster}
              snapshot={snapshot}
              names={names}
              teamSize={teamSize}
              base={base}
              dispatch={dispatch}
              actions={actions}
            />
          ) : selected === null ? null : (
            <>
              <SetEditor
                key={selected}
                species={selected}
                set={set}
                price={file.league.prices[selected]}
                snapshot={snapshot}
                names={names}
                problems={problems[selected] ?? []}
                onChange={(next) => dispatch({ type: 'set-set', species: selected, set: next })}
                onClear={() => {
                  if (actions.confirm(`Clear ${names.species(selected)}'s set?`)) dispatch({ type: 'clear-set', species: selected });
                }}
                onCopy={() => {
                  if (set !== undefined) void copyWithMessage(actions.copy, exportSet(set, snapshot), setFlash);
                }}
              />
              <p aria-live="polite" className="flash">
                {flash}
              </p>
            </>
          )}
        </div>
        <div className="column">
          <MatchTeams
            file={file}
            roster={roster}
            snapshot={snapshot}
            names={names}
            teamSize={teamSize}
            base={base}
            dispatch={dispatch}
            actions={actions}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck and run the suite**

Run: `npm run typecheck` then `npm test`
Expected: typecheck clean; the whole suite then has 726 tests (the components are exercised by the flow tests in Task 6).

- [ ] **Step 6: Commit**

```bash
git add src/app/team/OptionPicker.tsx src/app/team/flash.ts src/app/team/StatPoints.tsx src/app/team/SetEditor.tsx src/app/team/RosterList.tsx src/app/team/PastePanel.tsx src/app/team/MatchTeams.tsx src/app/team/TeambuilderView.tsx
git commit -m "feat(app): the teambuilder components: roster list, set editor, paste panel, match teams" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The view switcher, the Teambuilder view and the undo question, with the UI flow tests

**Files:**
- Create: `src/app/team.flow.test.tsx`
- Modify: `src/app/Workspace.tsx` (replace the whole file), `src/app/room/DraftRoom.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing new for other code. `Workspace` renders `<nav aria-label="Views">` with "Draft room", "Teambuilder" and "Setup" (`aria-current="page"` on the current one) once a draft exists, passes `meta.showdown.rules.minTeamSize` to the reducer, and asks "Undo <name>? Its set will be deleted and it will be removed from N team(s)." (only the parts that apply) before undoing your own Pokémon that has a set or is on a team.

- [ ] **Step 1: Write the flow tests: create `src/app/team.flow.test.tsx`**

The league: You and Rival alternate (linear, 7 rounds, every legal species costs 5); your picks are Garchomp, Whimsicott, Incineroar, Kingambit, Charizard-Mega-X, Charizard-Mega-Y and Charizard (no ladder usage). See "Pre-verification results" for why Whimsicott's Trick Room is the set-backed suggestion.

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { parseDraftFile, serializeDraftFile, type DraftFile } from '../domain/file';
import { exportSet, exportSets, exportTeam } from '../domain/paste-export';
import type { RosterSets } from '../domain/team';
import { computeSetStats } from '../domain/stats';
import { App } from './App';
import { STORAGE_KEY } from './state/storage';
import { commonSet } from './team/options';
import { fakeActions, fakeStorage, realData } from './test-support';

afterEach(cleanup);

const data = realData();
const load = async () => data;

/** You and Rival alternate (linear, 7 rounds); your picks are the even ones. Every legal species costs 5. */
const MINE = ['garchomp', 'whimsicott', 'incineroar', 'kingambit', 'charizardmegax', 'charizardmegay', 'charizard'];
const RIVAL = ['rotomwash', 'pelipper', 'torkoal', 'venusaur', 'swampertmega', 'tyranitar'];
const ALL_PICKS = MINE.flatMap((id, i) => (i < RIVAL.length ? [id, RIVAL[i]] : [id]));
const prices = Object.fromEntries(Object.keys(data.snapshot.species).map((id) => [id, 5]));

const leagueFile = (pickCount = ALL_PICKS.length, extra: Partial<DraftFile> = {}): DraftFile => ({
  schemaVersion: 2,
  league: { name: 'Test League', formatId: data.snapshot.formatId, drafters: ['You', 'Rival'], order: 'linear', rounds: 7, me: 0, budget: 200, prices, extraBans: [] },
  picks: ALL_PICKS.slice(0, pickCount),
  sets: {},
  teams: [],
  ...extra,
});
const stored = (file: DraftFile) => ({ [STORAGE_KEY]: serializeDraftFile(file) });
const savedFile = (storage: Map<string, string>): DraftFile => {
  const parsed = parseDraftFile(storage.get(STORAGE_KEY) ?? '', data.snapshot);
  if (!parsed.ok) throw new Error('the saved file could not be read');
  return parsed.file;
};

async function openTeambuilder(file: DraftFile, actions = fakeActions().actions) {
  const user = userEvent.setup();
  const { storage, data: saved } = fakeStorage(stored(file));
  render(<App load={load} storage={storage} actions={actions} />);
  await user.click(await screen.findByRole('button', { name: 'Teambuilder' }));
  return { user, saved };
}

/** Types into a combobox and presses Enter on the first match. */
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, text: string) {
  await user.type(screen.getByRole('combobox', { name: label }), text);
  await user.keyboard('{Enter}');
}

async function setPoints(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  await user.type(input, value);
}

describe('the set editor', () => {
  it('builds a full set with the form, shows level-50 stats, and saves every change', async () => {
    const { user, saved } = await openTeambuilder(leagueFile());
    expect(screen.getByRole('heading', { name: 'Garchomp' })).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /^Garchomp/ })).getByText('No set')).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Garchomp's ability"), 'roughskin');
    await choose(user, "Garchomp's item", 'Life Orb');
    await choose(user, 'Move 1', 'Earthquake');
    await choose(user, 'Move 2', 'Dragon Claw');
    await choose(user, 'Move 3', 'Protect');
    await choose(user, 'Move 4', 'Rock Slide');
    await user.selectOptions(screen.getByLabelText('Nature'), 'Jolly');
    await setPoints(user, 'HP points', '2');
    await setPoints(user, 'Atk points', '32');
    await setPoints(user, 'Spe points', '32');

    const expected = {
      species: 'garchomp',
      ability: 'roughskin',
      item: 'lifeorb',
      moves: ['earthquake', 'dragonclaw', 'protect', 'rockslide'],
      nature: 'Jolly' as const,
      points: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
    };
    expect(savedFile(saved).sets.garchomp).toEqual(expected);
    expect(screen.getByText('0 of 66 points left')).toBeTruthy();
    const stats = computeSetStats(expected, data.snapshot)!;
    expect(screen.getByText(`${stats.spe} ↑`)).toBeTruthy();
    expect(screen.getByText(`${stats.spa} ↓`)).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /^Garchomp/ })).getByText('Set ready')).toBeTruthy();
  });

  it('starts from the common set, and does not save points over 32 or past the 66 total', async () => {
    const { user, saved } = await openTeambuilder(leagueFile());
    await user.click(screen.getByRole('button', { name: /^Incineroar/ }));
    await user.click(screen.getByRole('button', { name: 'Start from the common set' }));
    const common = commonSet('incineroar', data.snapshot)!;
    expect(savedFile(saved).sets.incineroar).toEqual(common);
    expect((screen.getByRole('combobox', { name: 'Move 1' }) as HTMLInputElement).value).toBe('Fake Out');
    expect(screen.queryByRole('button', { name: 'Start from the common set' })).toBeNull();

    // The common spread uses all 66 points (Atk 0, Spe 3), so Atk can take nothing more.
    await setPoints(user, 'Atk points', '5');
    expect(screen.getByText('0 to 0')).toBeTruthy();
    expect(savedFile(saved).sets.incineroar?.points).toEqual(common.points);

    await setPoints(user, 'Spe points', '0');
    expect(screen.getByText('3 of 66 points left')).toBeTruthy();
    await setPoints(user, 'Atk points', '3');
    expect(savedFile(saved).sets.incineroar?.points).toEqual({ ...common.points, spe: 0, atk: 3 });
    await setPoints(user, 'HP points', '40');
    expect(screen.getByText('0 to 32')).toBeTruthy();
  });

  it('shows problems in plain words, says when there is no ladder data, and clears a set after asking', async () => {
    const sets: RosterSets = {
      garchomp: { species: 'garchomp', moves: ['trickroom'] },
      charizardmegax: { species: 'charizardmegax', item: 'charizarditex' },
    };
    const { actions, questions } = fakeActions([false, true]);
    const { user, saved } = await openTeambuilder(leagueFile(undefined, { sets }), actions);
    expect(screen.getByText("Garchomp can't learn Trick Room in this format.")).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /^Garchomp/ })).getByText('1 problem')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^Charizard Fire/ }));
    expect(screen.getByText('No ladder data for this Pokémon.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start from the common set' })).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Charizard-Mega-X/ }));
    expect(screen.getByText('(Charizard-Mega-X must hold Charizardite X)')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear set' }));
    expect(savedFile(saved).sets.charizardmegax).toEqual(sets.charizardmegax);
    await user.click(screen.getByRole('button', { name: 'Clear set' }));
    expect(questions).toEqual(["Clear Charizard-Mega-X's set?", "Clear Charizard-Mega-X's set?"]);
    expect(savedFile(saved).sets).toEqual({ garchomp: sets.garchomp });
  });
});

describe('Showdown paste', () => {
  it('imports roster sets, skips other Pokémon, asks before replacing, and can make a team', async () => {
    const garchomp = commonSet('garchomp', data.snapshot)!;
    const kingambit = commonSet('kingambit', data.snapshot)!;
    const tyranitar = commonSet('tyranitar', data.snapshot)!;
    const { actions, questions } = fakeActions([true]);
    const { user, saved } = await openTeambuilder(leagueFile(undefined, { sets: { garchomp: { species: 'garchomp' } } }), actions);
    await user.click(screen.getByRole('button', { name: 'Paste' }));
    await user.click(screen.getByLabelText('Paste sets from Showdown'));
    await user.paste(exportSets([garchomp, tyranitar, kingambit], data.snapshot));
    await user.click(screen.getByLabelText('Also make a team from this paste'));
    await user.click(screen.getByRole('button', { name: 'Import' }));

    expect(questions).toEqual(['Replace the existing sets of Garchomp?']);
    expect(screen.getByText('2 sets imported.')).toBeTruthy();
    expect(screen.getByText('Tyranitar is not on your roster; skipped.')).toBeTruthy();
    const file = savedFile(saved);
    expect(file.sets).toEqual({ garchomp, kingambit });
    expect(file.teams).toEqual([{ name: 'Pasted team', members: ['garchomp', 'kingambit'] }]);
    expect(screen.getByRole('article', { name: 'Pasted team' })).toBeTruthy();
  });

  it('keeps existing sets when you say no, and still adds the new ones', async () => {
    const { actions } = fakeActions([false]);
    const { user, saved } = await openTeambuilder(leagueFile(undefined, { sets: { garchomp: { species: 'garchomp' } } }), actions);
    await user.click(screen.getByRole('button', { name: 'Paste' }));
    await user.click(screen.getByLabelText('Paste sets from Showdown'));
    await user.paste(exportSets([commonSet('garchomp', data.snapshot)!, commonSet('kingambit', data.snapshot)!], data.snapshot));
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByText('1 set imported.')).toBeTruthy();
    expect(savedFile(saved).sets.garchomp).toEqual({ species: 'garchomp' });
    expect(savedFile(saved).sets.kingambit).toEqual(commonSet('kingambit', data.snapshot));
  });

  it('copies and downloads your sets, and says when copying fails', async () => {
    const sets: RosterSets = { garchomp: commonSet('garchomp', data.snapshot)!, incineroar: commonSet('incineroar', data.snapshot)! };
    const { actions, copies, downloads } = fakeActions();
    const { user } = await openTeambuilder(leagueFile(undefined, { sets }), actions);
    await user.click(screen.getByRole('button', { name: 'Copy set' }));
    expect(copies).toEqual([exportSet(sets.garchomp, data.snapshot)]);
    expect(await screen.findByText('Copied.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Paste' }));
    await user.click(screen.getByRole('button', { name: 'Copy all sets' }));
    await user.click(screen.getByRole('button', { name: 'Download all sets' }));
    const all = exportSets([sets.garchomp, sets.incineroar], data.snapshot);
    expect(copies[1]).toBe(all);
    expect(downloads).toEqual([{ filename: 'test-league.sets.txt', text: all }]);
    cleanup();

    const failing = fakeActions([], { copyFails: true });
    const second = await openTeambuilder(leagueFile(undefined, { sets }), failing.actions);
    await second.user.click(screen.getByRole('button', { name: 'Copy set' }));
    expect(await screen.findByText("Couldn't copy: use Download instead.")).toBeTruthy();
  });
});

describe('match teams', () => {
  it('builds a team, explains the Species and Item Clauses, and stops at six', async () => {
    const sets: RosterSets = {
      garchomp: { species: 'garchomp', item: 'leftovers' },
      kingambit: { species: 'kingambit', item: 'leftovers' },
    };
    const { user, saved } = await openTeambuilder(leagueFile(undefined, { sets }));
    await user.click(screen.getByRole('button', { name: 'New team' }));
    const team = screen.getByRole('article', { name: 'Team 1' });
    for (const name of ['Garchomp', 'Kingambit', 'Charizard-Mega-X', 'Charizard-Mega-Y']) await user.click(within(team).getByLabelText(name));

    expect(within(team).getByText('Item Clause: Garchomp and Kingambit both hold Leftovers.')).toBeTruthy();
    expect(within(team).getByText('Species Clause: Charizard-Mega-X and Charizard-Mega-Y are the same Pokémon.')).toBeTruthy();
    expect(within(team).getByText('4 of 6')).toBeTruthy();

    await user.click(within(team).getByLabelText('Whimsicott'));
    await user.click(within(team).getByLabelText('Incineroar'));
    expect((within(team).getByLabelText('Charizard') as HTMLInputElement).disabled).toBe(true);
    expect(savedFile(saved).teams[0].members).toEqual(['garchomp', 'kingambit', 'charizardmegax', 'charizardmegay', 'whimsicott', 'incineroar']);

    await user.clear(within(team).getByLabelText('Name of team 1'));
    expect(within(team).getByText('A team needs a name')).toBeTruthy();
    await user.type(within(team).getByLabelText('Name of team 1'), 'Rain');
    expect(savedFile(saved).teams[0].name).toBe('Rain');
  });

  it('exports a team and deletes it after asking', async () => {
    const file = leagueFile(undefined, { teams: [{ name: 'Main', members: ['garchomp', 'incineroar'] }] });
    const { actions, copies, downloads, questions } = fakeActions([true]);
    const { user, saved } = await openTeambuilder(file, actions);
    const team = screen.getByRole('article', { name: 'Main' });
    await user.click(within(team).getByRole('button', { name: 'Copy team' }));
    await user.click(within(team).getByRole('button', { name: 'Download team' }));
    const paste = exportTeam(file.teams[0], {}, data.snapshot);
    expect(copies).toEqual([paste]);
    expect(downloads).toEqual([{ filename: 'test-league.main.txt', text: paste }]);
    await user.click(within(team).getByRole('button', { name: 'Delete team' }));
    expect(questions).toEqual(['Delete Main?']);
    expect(savedFile(saved).teams).toEqual([]);
  });
});

describe('with the draft', () => {
  it('asks before undoing your Pokémon that has a set and is on a team, then removes both', async () => {
    const file = leagueFile(undefined, { sets: { charizard: { species: 'charizard' } }, teams: [{ name: 'Main', members: ['garchomp', 'charizard'] }] });
    const { actions, questions } = fakeActions([false, true]);
    const user = userEvent.setup();
    const { storage, data: saved } = fakeStorage(stored(file));
    render(<App load={load} storage={storage} actions={actions} />);
    await user.click(await screen.findByRole('button', { name: 'Undo last pick' }));
    expect(savedFile(saved).picks).toHaveLength(13);
    await user.click(screen.getByRole('button', { name: 'Undo last pick' }));
    expect(questions).toEqual([
      'Undo Charizard? Its set will be deleted and it will be removed from 1 team.',
      'Undo Charizard? Its set will be deleted and it will be removed from 1 team.',
    ]);
    const after = savedFile(saved);
    expect(after.picks).toHaveLength(12);
    expect(after.sets).toEqual({});
    expect(after.teams).toEqual([{ name: 'Main', members: ['garchomp'] }]);

    // Rival's pick is undone without a question.
    await user.click(screen.getByRole('button', { name: 'Undo last pick' }));
    expect(questions).toHaveLength(2);
  });

  it("uses your set in the suggestions: Whimsicott's Trick Room", async () => {
    const { user } = await openTeambuilder(leagueFile(4));
    await user.click(screen.getByRole('button', { name: /^Whimsicott/ }));
    expect(screen.getByRole('button', { name: 'Draft room' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: 'Teambuilder' }).getAttribute('aria-current')).toBe('page');
    await choose(user, 'Move 1', 'Trick Room');
    await user.click(screen.getByRole('button', { name: 'Draft room' }));
    expect((await screen.findAllByText("Completes Trick Room with Whimsicott (Whimsicott's half is from your set).")).length).toBeGreaterThan(0);
  });

  it('shows an empty roster before your first pick', async () => {
    await openTeambuilder(leagueFile(0));
    expect(screen.getByText('Your roster is empty: draft a Pokémon first.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/app/team.flow.test.tsx`
Expected: FAIL (there is no "Teambuilder" button yet).

- [ ] **Step 3: Move the Setup button out of the draft room**

In `src/app/room/DraftRoom.tsx`, find:
```tsx
  onImport(text: string | null): void;
  onSetup(): void;
}
```
Replace with:
```tsx
  onImport(text: string | null): void;
}
```

In `src/app/room/DraftRoom.tsx`, find:
```tsx
export function DraftRoom({ data, file, names, errors, onPick, onUndo, onExport, onImport, onSetup }: Props) {
```
Replace with:
```tsx
export function DraftRoom({ data, file, names, errors, onPick, onUndo, onExport, onImport }: Props) {
```

In `src/app/room/DraftRoom.tsx`, find:
```tsx
          <FileButton label="Import" accept=".json,application/json" onText={(text) => onImport(text)} />
          <button type="button" onClick={onSetup}>
            Setup
          </button>
```
Replace with:
```tsx
          <FileButton label="Import" accept=".json,application/json" onText={(text) => onImport(text)} />
```

- [ ] **Step 4: Replace `src/app/Workspace.tsx`**

```tsx
import { useMemo, useRef, useState } from 'react';
import { deriveDraft } from '../domain/derive';
import { parseDraftFile, serializeDraftFile, type DraftFile } from '../domain/file';
import type { LeagueConfig } from '../domain/league';
import type { Problem } from '../domain/problem';
import { exportFileName, type BrowserActions } from './browser';
import type { AppData } from './data/snapshot';
import { SetupView } from './setup/SetupView';
import { makeDraftReducer, type DraftAction, type DraftStoreState } from './state/draft-store';
import { loadDraft, saveDraft, type DraftStorage } from './state/storage';
import { DraftRoom } from './room/DraftRoom';
import { TeambuilderView } from './team/TeambuilderView';
import { makeNames } from './text/names';

type View = 'room' | 'team' | 'setup';

const VIEW_LABELS: ReadonlyArray<[View, string]> = [
  ['room', 'Draft room'],
  ['team', 'Teambuilder'],
  ['setup', 'Setup'],
];

interface Props {
  data: AppData;
  storage: DraftStorage;
  actions: BrowserActions;
}

function ProblemList({ problems }: { problems: readonly Problem[] }) {
  return (
    <ul className="problems">
      {problems.map((p) => (
        <li key={`${p.path}:${p.message}`}>
          <code>{p.path}</code>: {p.message}
        </li>
      ))}
    </ul>
  );
}

/** Owns the one draft file: loads it, applies actions, saves after each change, and picks the view. */
export function Workspace({ data, storage, actions }: Props) {
  const reducer = useMemo(() => makeDraftReducer(data.snapshot, data.meta.showdown.rules.minTeamSize), [data]);
  const names = useMemo(() => makeNames(data.snapshot), [data.snapshot]);
  const [initial] = useState(() => loadDraft(storage, data.snapshot));
  const [state, setState] = useState<DraftStoreState>({ file: initial.kind === 'ok' ? initial.file : null, errors: [] });
  const stateRef = useRef(state);
  const [recovery, setRecovery] = useState(initial.kind === 'corrupt' ? initial : null);
  const [warnings, setWarnings] = useState<Problem[]>(initial.kind === 'ok' ? initial.warnings : []);
  const [saveFailed, setSaveFailed] = useState(initial.kind === 'unavailable');
  const [importErrors, setImportErrors] = useState<Problem[]>([]);
  const [view, setView] = useState<View>(state.file === null ? 'setup' : 'room');

  const apply = (action: DraftAction): DraftStoreState => {
    const next = reducer(stateRef.current, action);
    stateRef.current = next;
    setState(next);
    if (next.errors.length === 0) setSaveFailed(!saveDraft(storage, next.file));
    return next;
  };

  const offerDownload = (file: DraftFile) => {
    if (actions.confirm('Download a copy of the current draft first?')) {
      actions.download(exportFileName(file.league.name), serializeDraftFile(file));
    }
  };

  /** Switches view, dropping the last refusal so it does not show up on the next screen. */
  const go = (next: View) => {
    stateRef.current = { ...stateRef.current, errors: [] };
    setState(stateRef.current);
    setView(next);
  };

  /** Undoes the last pick; when it is one of yours with a set or on a team, asks first. */
  const undoLast = () => {
    const current = stateRef.current.file;
    if (current !== null && current.picks.length > 0) {
      const last = current.picks[current.picks.length - 1];
      const roster = deriveDraft(current.league, current.picks, data.snapshot).drafters[current.league.me]?.roster ?? [];
      const hasSet = Object.hasOwn(current.sets, last);
      const teams = current.teams.filter((team) => team.members.includes(last)).length;
      if (roster.includes(last) && (hasSet || teams > 0)) {
        const parts = [
          ...(hasSet ? ['its set will be deleted'] : []),
          ...(teams > 0 ? [`it will be removed from ${teams} team${teams === 1 ? '' : 's'}`] : []),
        ].join(' and ');
        const question = `Undo ${names.species(last)}? ${parts.charAt(0).toUpperCase()}${parts.slice(1)}.`;
        if (!actions.confirm(question)) return;
      }
    }
    apply({ type: 'undo' });
  };

  const importFile = (text: string | null) => {
    if (text === null) {
      setImportErrors([{ path: 'file', message: 'the file could not be read' }]);
      return;
    }
    const parsed = parseDraftFile(text, data.snapshot);
    if (!parsed.ok) {
      setImportErrors(parsed.errors);
      return;
    }
    const current = stateRef.current.file;
    if (current !== null) {
      if (!actions.confirm('Replace the current draft with the imported file?')) return;
      offerDownload(current);
    }
    setImportErrors([]);
    setWarnings(parsed.warnings);
    apply({ type: 'replace', file: parsed.file });
    setView('room');
  };

  if (recovery !== null) {
    return (
      <main className="recovery">
        <h1>The saved draft could not be read</h1>
        <ProblemList problems={recovery.errors} />
        <div className="row">
          <button type="button" onClick={() => actions.download('draftlab-recovered.json', recovery.raw)}>
            Download raw file
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (!actions.confirm('Delete the saved draft and start over?')) return;
              setRecovery(null);
              apply({ type: 'clear' });
              setView('setup');
            }}
          >
            Start over
          </button>
        </div>
      </main>
    );
  }

  const file = state.file;
  return (
    <>
      {file !== null && (
        <nav className="view-nav" aria-label="Views">
          {VIEW_LABELS.map(([id, label]) => (
            <button key={id} type="button" aria-current={view === id ? 'page' : undefined} onClick={() => go(id)}>
              {label}
            </button>
          ))}
        </nav>
      )}
      {saveFailed && (
        <div className="banner warning" role="alert">
          Changes aren't being saved in this browser — use Export.
        </div>
      )}
      {warnings.length > 0 && (
        <div className="banner" role="status">
          <ProblemList problems={warnings} />
          <button type="button" onClick={() => setWarnings([])}>
            Dismiss
          </button>
        </div>
      )}
      <div aria-live="polite">
        {importErrors.length > 0 && (
          <div className="banner warning">
            <p>That file could not be imported; nothing was changed.</p>
            <ProblemList problems={importErrors} />
            <button type="button" onClick={() => setImportErrors([])}>
              Dismiss
            </button>
          </div>
        )}
      </div>
      {view === 'setup' || file === null ? (
        <SetupView
          key={file === null ? 'new' : 'edit'}
          data={data}
          file={file}
          errors={state.errors}
          onSave={(league: LeagueConfig) => {
            if (apply({ type: 'set-league', league }).errors.length === 0) setView('room');
          }}
          onCancel={file === null ? undefined : () => go('room')}
          onNewLeague={
            file === null
              ? undefined
              : () => {
                  if (!actions.confirm('Start a new league? The current draft will be deleted.')) return;
                  offerDownload(file);
                  apply({ type: 'clear' });
                }
          }
          onImport={file === null ? importFile : undefined}
        />
      ) : view === 'team' ? (
        <TeambuilderView data={data} file={file} names={names} errors={state.errors} dispatch={apply} actions={actions} />
      ) : (
        <DraftRoom
          data={data}
          file={file}
          names={names}
          errors={state.errors}
          onPick={(species) => apply({ type: 'pick', species })}
          onUndo={undoLast}
          onExport={() => actions.download(exportFileName(file.league.name), serializeDraftFile(file))}
          onImport={importFile}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run src/app/team.flow.test.tsx` then `npm test` then `npm run typecheck`
Expected: PASS (11 tests, about 12 s); the whole suite then has 737 tests (the increment 1 flow tests that click "Setup" now click the switcher's button); typecheck clean.

Mutation proof (do it, then undo it): in `Workspace.tsx`, change `if (roster.includes(last) && (hasSet || teams > 0)) {` to `if (false) {`; the test "asks before undoing your Pokémon that has a set and is on a team" must fail. Restore the line.

- [ ] **Step 6: Commit**

```bash
git add src/app/team.flow.test.tsx src/app/Workspace.tsx src/app/room/DraftRoom.tsx
git commit -m "feat(app): the Teambuilder view, a view switcher and the undo question, with UI flow tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Styles and docs

**Files:**
- Modify: `src/app/app.css`, `docs/STATUS.md`, `README.md`

**Interfaces:** none.

- [ ] **Step 1: Add the teambuilder styles to `src/app/app.css`**

In `src/app/app.css`, find:
```css
.roster .warning {
  color: var(--text);
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--warn-line);
  border-radius: var(--radius);
}
```
Replace with:
```css
.roster .warning {
  color: var(--text);
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--warn-line);
  border-radius: var(--radius);
}

/* View switcher (all views once a draft exists) */
.view-nav {
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem calc(var(--space) * 1.5) 0;
  background: var(--panel);
}
.view-nav button[aria-current='page'] {
  background: var(--accent-soft);
  border-color: var(--accent);
  font-weight: 600;
  text-decoration: underline;
}

/* Teambuilder */
.roster-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.roster-list button {
  width: 100%;
  margin-bottom: 0.25rem;
  text-align: left;
}
.roster-list button[aria-current='true'] {
  border-color: var(--accent);
  background: var(--accent-soft);
  font-weight: 600;
}
.roster-list .types,
.set-status {
  color: var(--muted);
  font-size: 0.9em;
}
.set-status {
  display: block;
}
.tabs {
  margin-bottom: var(--space);
}
.tabs button[aria-pressed='true'] {
  border-color: var(--accent);
  background: var(--accent-soft);
  font-weight: 600;
}
.set-editor .field,
.set-editor .picker {
  margin-top: var(--space);
}
.picker {
  position: relative;
}
.picker label,
.set-editor .field label {
  display: block;
}
.picker input,
.set-editor select {
  width: 100%;
}
.moves,
.stat-points,
.team fieldset {
  margin: var(--space) 0 0;
  padding: 0.5rem var(--space);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.stat-row {
  display: grid;
  grid-template-columns: 6rem 5rem 4rem auto;
  gap: 0.5rem;
  align-items: center;
  margin-top: 0.25rem;
}
.stat-value {
  font-variant-numeric: tabular-nums;
}
.points-left {
  margin: 0;
  color: var(--muted);
}
.check {
  display: block;
}
.team {
  margin-top: var(--space);
  padding-top: var(--space);
  border-top: 1px solid var(--line);
}
.team-status {
  margin: 0.5rem 0 0;
  font-weight: 600;
}
.flash {
  min-height: 1.2em;
  margin: 0.25rem 0 0;
  color: var(--muted);
}
.paste-panel textarea {
  width: 100%;
}
.paste-panel h3 {
  margin-top: var(--space);
}
```

- [ ] **Step 2: Update `docs/STATUS.md`**

In `docs/STATUS.md`, find:
```text
Last updated 2026-09-30.
```
Replace with:
```text
Last updated 2026-10-03.
```

In `docs/STATUS.md`, find:
```text
The UI so far is the draft room: league setup, a live draft with suggestions, autosaved in the browser. The teambuilder UI and hosting come next.
```
Replace with:
```text
The UI so far is the draft room (league setup, a live draft with suggestions) and the teambuilder (sets for your roster, Showdown paste import and export, match teams), autosaved in the browser. Hosting comes next.
```

In `docs/STATUS.md`, find:
```text
| 9 | App shell, increment 2: the teambuilder | not started | |
```
Replace with:
```text
| 9 | App shell, increment 2: the teambuilder (set editor, Showdown paste, match teams; your sets feed the suggestions) | `specs/2026-10-03-app-teambuilder-design.md`, `plans/2026-10-03-app-teambuilder.md` | done: built and reviewed |
```

In `docs/STATUS.md`, find:
```text
Tests, all passing: 699 unit tests
```
Replace with:
```text
Tests, all passing: 737 unit tests
```

In `docs/STATUS.md`, find:
```text
src/app/         React + Vite UI (increment 8): league setup, the draft room, sentences for the engine's reasons.
```
Replace with:
```text
src/app/         React + Vite UI (increments 8-9): league setup, the draft room, the teambuilder, sentences for the engine's reasons.
```

- [ ] **Step 3: Update `README.md`**

In `README.md`, find:
```text
`src/app/` is the React UI: league setup with a CSV price import, the draft room with suggestions as sentences, autosaved in the browser.
```
Replace with:
```text
`src/app/` is the React UI: league setup with a CSV price import, the draft room with suggestions as sentences, and the teambuilder (a set editor, Showdown paste import and export, match teams), autosaved in the browser.
```

- [ ] **Step 4: Typecheck, test and build**

Run: `npm run typecheck` then `npm test` then `npm run build`
Expected: typecheck clean; the whole suite then has 737 tests; the build succeeds with no chunk-size warning.

Optional manual check: `npm run dev`, open http://localhost:5173, record a pick, open Teambuilder and press "Start from the common set".

- [ ] **Step 5: Commit**

```bash
git add src/app/app.css docs/STATUS.md README.md
git commit -m "style(app): teambuilder layout; docs for the teambuilder" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-Review (spec coverage)

- Decisions (form plus paste, own screen, autosave, undo question, ladder helpers): Tasks 1, 3, 5, 6.
- Draft store actions and refusals, team size from the format, undo removing your set and team slots: Task 3; the team size wiring and the undo question: Task 6.
- Header switcher with `aria-current`: Task 6.
- Roster list statuses and the empty roster; the set editor (common set, no ladder data, clear with a question, ability select with shares, item combobox with holdable items and the fixed required item, four move comboboxes from the learnset without repeats, nature labels, stat points with points left, level-50 stats and arrows, problems as sentences, immediate saving): Task 5; flows in Task 6.
- Common set rules: Task 1 (including every species with usage on the real snapshot).
- Paste panel (import with roster matching, skipped Pokémon, one replace question, notes and problems, make a team, export copy and download, copy set): Task 5; flows in Task 6.
- Match teams (new team naming, rename with the empty-name hint, members with the 6 limit, status and clause sentences, copy, download, delete with a question): Task 5; flows in Task 6.
- Copy feedback, `BrowserActions.copy`: Tasks 4 and 5.
- Problem sentences (every table row and the fallback): Task 2.
- `FileButton` replacing the three file inputs (with the unreadable-file handling and the focus ring, which the stylesheet already has): Task 4.
- Testing section: Tasks 1, 2, 3 and 6; build: Task 7.
- The spec's stat-point rule is amended with this plan (clarification 1).

## Later increments

3. Hosting and data refresh: GitHub Pages, a scheduled sync and rebuild, the data's age and fallback warnings in the UI, browser end-to-end tests against the deployed build.
