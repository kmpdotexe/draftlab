# Showdown Paste Import and Export (Teambuilder Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read and write Pokémon Showdown's text format for sets and teams: a lenient import that flags problems instead of rejecting, and an export that Showdown's own code reads back.

**Architecture:** Two pure modules in `src/domain/`. `paste.ts` turns text into `ParsedSet[]` (ids via `toID`, then legality from the existing `validateSetAgainstSnapshot`) and assembles a `MatchTeam`. `paste-export.ts` writes sets and teams with display names from the snapshot. The real `pokemon-showdown` package is used only as an oracle in the integration suite, never at runtime.

**Tech Stack:** TypeScript (ESM), Vitest, the existing `pokemon-showdown` dev dependency (oracle test only). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-21-showdown-paste-design.md` (parents: `docs/superpowers/specs/2026-09-20-teambuilder-design.md`, `docs/superpowers/specs/2026-09-20-draft-lab-design.md`). Read the paste spec first; it is the binding authority for this plan.

## Global Constraints

- Scope: paste import and export of sets and teams. Out of scope: any UI, clipboard or file handling, Showdown team-folder or backup structure beyond ignoring `===` header lines, Tera, IVs, gender, shiny, happiness, auto-filling a missing Mega stone, choosing which 4 Pokémon to bring, the suggestion engine.
- Nothing in these modules throws on any input, none modifies its arguments, none keeps state between calls. Use `Object.hasOwn` for every lookup keyed by a species, item, move or ability id or by a pasted label.
- Import is lenient: every name becomes an id with `toID`, unknown names are kept as written, and legality comes from `validateSetAgainstSnapshot` (`problems`). Lines the set model has no place for are dropped and listed in `notes`. `set` is `null` only when a block has no readable species.
- Mega rewrite on import: if the species is legal, has no `requiredItem` of its own, the set has an item, and EXACTLY ONE legal species `S` has `toID(S.requiredItem) === item` and `toID(S.baseSpecies) === toID(species.baseSpecies)` (base species, not species name), the set's species becomes `S.id` and a note is added. Zero or two-or-more candidates: no rewrite. A Mega form pasted without a stone is not auto-filled.
- Export: `Level: 50` always; `EVs:` only for non-zero stats in the order HP, Atk, Def, SpA, SpD, Spe; display names from `snapshot.species`, `snapshot.items`, `snapshot.moves` and `species.abilities`, falling back to the id as written; no trailing spaces; export never rewrites a set.
- Round trip: for every set valid in the snapshot, `parsePaste(exportSet(set, snapshot), snapshot)[0].set` equals `set` with empty `problems` and `notes`. Only exception: all-zero `points` write no `EVs:` line and come back with no `points`.
- File imports: `src/domain/paste.ts` imports only from `./id`, `./natures`, `./problem`, `./set`, `./set-check`, `./team`, `./types`. `src/domain/paste-export.ts` imports only from `./id`, `./set`, `./set-check`, `./team`, `./types`. Nothing in `src/domain/` imports from `sync/`. `sync/` may import from `src/domain/`.
- The oracle test lives at `sync/showdown/paste.integration.test.ts` because `vitest.integration.config.ts` only includes `sync/**/*.integration.test.ts`. A real-data or oracle mismatch is a FINDING to report, not a reason to change an expectation, a floor or production code.
- Commits end with the trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (copy it verbatim; never substitute another model name).

**Plan clarification (a ruling on a spec gap):** `exportTeam` uses the member's saved set only if `exportSet` can write it; if the saved set is unusable (for example a number) it falls back to a species-only block, the same as a member with no saved set. This keeps "exporting never fails on an odd set" true for teams.

## Environment notes

- Windows + PowerShell. Node was installed after the Claude app started, so a fresh shell may not find `node`/`npm`. Start every PowerShell command with:
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User");`
- The repo path contains a space: quote it.
- Single test file: `npx vitest run <path>`. Whole unit suite: `npm test`. Types: `npm run typecheck`. Real-package tests (slow): `npm run test:integration`. The baseline before this plan is 268 unit tests and 13 integration tests, all passing.
- Work on branch `feat/showdown-paste` (already created; the spec is committed at dcdb336).

---

## File Structure

```
Create: src/domain/paste.ts, paste.test.ts               ParsedSet, parsePaste, PastedTeam, pasteToTeam
Create: src/domain/paste-export.ts, paste-export.test.ts exportSet, exportSets, exportTeam (+ round-trip tests)
Create: src/domain/paste-real.test.ts                    real-snapshot round trip and Mega-rewrite sweep
Create: sync/showdown/paste.integration.test.ts          oracle against the real pokemon-showdown Teams
Modify: README.md                                        one sentence
```

Existing code these build on (do not modify): `src/domain/set.ts` (`PokemonSet`, `StatPoints`, `STAT_NAMES`), `src/domain/set-check.ts` (`SetSnapshot`, `validateSetAgainstSnapshot`), `src/domain/team.ts` (`RosterSets`, `MatchTeam`), `src/domain/natures.ts` (`isNatureName`), `src/domain/id.ts` (`toID`, `ID`), `src/domain/problem.ts` (`Problem`), `src/domain/test-support.ts` (`setSnapshot`, `speciesEntry`).

---

### Task 1: Reading a paste

**Files:**
- Create: `src/domain/paste.ts`
- Test: `src/domain/paste.test.ts`

**Interfaces:**
- Consumes: `toID`, `ID` from `./id`; `isNatureName` from `./natures`; `Problem` from `./problem`; `PokemonSet`, `StatPoints` from `./set`; `validateSetAgainstSnapshot`, `SetSnapshot` from `./set-check`; `MatchTeam`, `RosterSets` from `./team`; `SpeciesEntry`, `StatName` from `./types`; test helpers `setSnapshot`, `speciesEntry` from `./test-support`.
- Produces:
  - `interface ParsedSet { set: PokemonSet | null; problems: Problem[]; notes: string[] }`
  - `parsePaste(text: string, snapshot: SetSnapshot): ParsedSet[]`
  - `interface PastedTeam { team: MatchTeam; sets: RosterSets; problems: Problem[] }`
  - `pasteToTeam(parsed: ParsedSet[], name: string): PastedTeam`
- Fixture facts used by the tests (from `setSnapshot()`, formatId `fmt`): `incineroar` (Blaze, Intimidate; moves fakeout, flareblitz, partingshot, throatchop), `staraptor` (base of `staraptormega`, which requires Staraptite; moves bravebird, closecombat), `charizard` (base of `charizardmegax`, which requires Charizardite X), `floetteeternal` (its `baseSpecies` in this fixture is `Floette-Eternal`, unlike the real data where it is `Floette`) and `floettemega` (base species `Floette`, requires Floettite), `kingambit` (moves suckerpunch, kowtowcleave), `garchomp`, `sinistcha`. Items: sitrusberry, passhoberry, leftovers, choicescarf, staraptite (usableBy staraptor), charizarditex (usableBy charizard), floettite (usableBy floetteeternal). The species entries' `name` is the display name (`Staraptor-Mega`, `Charizard-Mega-X`, `Floette-Mega`).

- [ ] **Step 1: Write the failing tests**

`src/domain/paste.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parsePaste, pasteToTeam, type ParsedSet } from './paste';
import { setSnapshot, speciesEntry } from './test-support';

const snapshot = setSnapshot();
const parse = (text: string, from = snapshot) => parsePaste(text, from);
const one = (text: string, from = snapshot): ParsedSet => {
  const result = parse(text, from);
  expect(result).toHaveLength(1);
  return result[0];
};
const lines = (...rows: string[]) => rows.join('\n');
const paths = (parsed: ParsedSet) => parsed.problems.map((p) => p.path);

const FULL = lines(
  'Incineroar @ Sitrus Berry',
  'Ability: Intimidate',
  'Level: 50',
  'EVs: 2 HP / 32 Atk / 32 Spe',
  'Jolly Nature',
  '- Fake Out',
  '- Flare Blitz',
  '- Parting Shot',
  '- Throat Chop',
);
const FULL_SET = {
  species: 'incineroar',
  item: 'sitrusberry',
  ability: 'intimidate',
  points: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
  nature: 'Jolly',
  moves: ['fakeout', 'flareblitz', 'partingshot', 'throatchop'],
};

describe('parsePaste', () => {
  it('reads a full block into the exact set, with no problems and no notes', () => {
    expect(one(FULL)).toEqual({ set: FULL_SET, problems: [], notes: [] });
  });

  it('does not care what order the body lines come in', () => {
    const shuffled = lines(
      'Incineroar @ Sitrus Berry',
      '- Fake Out',
      '- Flare Blitz',
      '- Parting Shot',
      '- Throat Chop',
      'Jolly Nature',
      'EVs: 2 HP / 32 Atk / 32 Spe',
      'Ability: Intimidate',
    );
    expect(one(shuffled)).toEqual({ set: FULL_SET, problems: [], notes: [] });
  });

  it('reads labels and natures without regard to case', () => {
    const text = lines(
      'incineroar @ sitrus berry',
      'ability: intimidate',
      'evs: 2 hp / 32 ATK',
      'jolly nature',
      '- fake out',
    );
    expect(one(text)).toEqual({
      set: {
        species: 'incineroar',
        item: 'sitrusberry',
        ability: 'intimidate',
        points: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 0 },
        nature: 'Jolly',
        moves: ['fakeout'],
      },
      problems: [],
      notes: [],
    });
  });

  it('lets a later ability, EVs or nature line override an earlier one', () => {
    const parsed = one(lines('Incineroar', 'Ability: Blaze', 'Ability: Intimidate', 'Jolly Nature', 'Timid Nature'));
    expect(parsed.set).toEqual({ species: 'incineroar', ability: 'intimidate', nature: 'Timid' });
    expect(parsed.problems).toEqual([]);
  });

  it('reads an EVs line that names only some stats, with the others at 0', () => {
    expect(one('Incineroar\nEVs: 32 Atk').set?.points).toEqual({ hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 0 });
    expect(one('Incineroar\nEVs: 4 SpA / 4 SpD').set?.points).toEqual({ hp: 0, atk: 0, def: 0, spa: 4, spd: 4, spe: 0 });
  });

  it('reads a species-only block, and a block with an empty "@"', () => {
    expect(one('Incineroar')).toEqual({ set: { species: 'incineroar' }, problems: [], notes: [] });
    expect(one('Incineroar @')).toEqual({ set: { species: 'incineroar' }, problems: [], notes: [] });
  });

  describe('first line and ignored lines', () => {
    it('reads a messy block: nickname, gender, Level 100, Shiny, Tera, IVs, CRLF and trailing spaces', () => {
      const messy = [
        'Kitty (Incineroar) (F) @ Sitrus Berry  ',
        'Ability: Intimidate  ',
        'Level: 100',
        'Shiny: Yes',
        'Tera Type: Fire',
        'EVs: 2 HP / 32 Atk / 32 Spe',
        'Jolly Nature',
        'IVs: 0 Atk',
        '- Fake Out',
        '- Flare Blitz  ',
      ].join('\r\n');
      expect(one(messy)).toEqual({
        set: {
          species: 'incineroar',
          item: 'sitrusberry',
          ability: 'intimidate',
          points: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
          nature: 'Jolly',
          moves: ['fakeout', 'flareblitz'],
        },
        problems: [],
        notes: [
          'nickname "Kitty"',
          'gender F',
          'Level 100 ignored (Champions battles are level 50)',
          'Shiny: Yes',
          'Tera Type: Fire',
          'IVs: 0 Atk',
        ],
      });
    });

    it('reads a gender on its own, and says nothing about Level: 50', () => {
      expect(one('Incineroar (M)\nLevel: 50')).toEqual({
        set: { species: 'incineroar' },
        problems: [],
        notes: ['gender M'],
      });
    });

    it('notes every ignorable line and every line it does not recognize, in reading order', () => {
      const parsed = one(
        lines(
          'Incineroar',
          'Some random text',
          'Happiness: 255',
          'Hidden Power: Fire',
          'Pokeball: Ultra Ball',
          'Dynamax Level: 10',
          'Gigantamax: Yes',
          'Gender: F',
          'Mystery: thing',
          '-',
        ),
      );
      expect(parsed.set).toEqual({ species: 'incineroar' });
      expect(parsed.problems).toEqual([]);
      expect(parsed.notes).toEqual([
        'unrecognized line: Some random text',
        'Happiness: 255',
        'Hidden Power: Fire',
        'Pokeball: Ultra Ball',
        'Dynamax Level: 10',
        'Gigantamax: Yes',
        'Gender: F',
        'unrecognized line: Mystery: thing',
        'empty move line skipped',
      ]);
    });
  });

  describe('blocks', () => {
    it('returns nothing for empty text, blank text and non-string input', () => {
      expect(parse('')).toEqual([]);
      expect(parse('  \n\r\n \n')).toEqual([]);
      expect(parsePaste(5 as unknown as string, snapshot)).toEqual([]);
      expect(parsePaste(null as unknown as string, snapshot)).toEqual([]);
      expect(parsePaste(undefined as unknown as string, snapshot)).toEqual([]);
    });

    it('keeps blocks in paste order', () => {
      // The reverse of the fixture's own order, so an implementation that sorts or re-orders fails.
      const result = parse(lines('Garchomp', '', 'Kingambit', '', 'Incineroar'));
      expect(result.map((entry) => entry.set?.species)).toEqual(['garchomp', 'kingambit', 'incineroar']);
    });

    it('splits on === header lines as well as blank lines, and copes with CRLF', () => {
      const text = [
        '=== [fmt] Folder/Team ===',
        '',
        'Incineroar @ Sitrus Berry',
        '- Fake Out',
        '',
        '=== [fmt] Other ===',
        'Kingambit',
        '',
      ].join('\r\n');
      const result = parse(text);
      expect(result).toHaveLength(2);
      expect(result[0].set).toEqual({ species: 'incineroar', item: 'sitrusberry', moves: ['fakeout'] });
      expect(result[1].set).toEqual({ species: 'kingambit' });
    });

    it('numbers problem paths by block', () => {
      const result = parse(lines('Incineroar', '', 'Ghost', '', 'Kingambit', '- Fake Out'));
      expect(result.map(paths)).toEqual([[], ['paste[1].species'], ['paste[2].moves[0]']]);
    });

    it('returns a null set with a "no species found" problem when there is nothing to read as a species', () => {
      expect(one('@ Sitrus Berry')).toEqual({
        set: null,
        problems: [{ path: 'paste[0]', message: 'no species found' }],
        notes: [],
      });
      expect(one('???').set).toBeNull();
    });
  });

  describe('Mega rewrite', () => {
    it('turns a base species holding its stone into the Mega form and says so', () => {
      expect(one('Staraptor @ Staraptite')).toEqual({
        set: { species: 'staraptormega', item: 'staraptite' },
        problems: [],
        notes: ['read "Staraptor" holding Staraptite as Staraptor-Mega'],
      });
      expect(one('Charizard @ Charizardite X')).toEqual({
        set: { species: 'charizardmegax', item: 'charizarditex' },
        problems: [],
        notes: ['read "Charizard" holding Charizardite X as Charizard-Mega-X'],
      });
    });

    it('matches on the base species, so Floette-Eternal holding Floettite becomes Floette-Mega', () => {
      // In the real data floetteeternal.baseSpecies is 'Floette'; the shared fixture says 'Floette-Eternal'.
      const real = setSnapshot();
      real.species.floetteeternal = { ...real.species.floetteeternal, baseSpecies: 'Floette', forme: 'Eternal' };
      expect(one('Floette-Eternal @ Floettite', real)).toEqual({
        set: { species: 'floettemega', item: 'floettite' },
        problems: [],
        notes: ['read "Floette-Eternal" holding Floettite as Floette-Mega'],
      });
      // With the fixture as it is the base species differs, so there is no rewrite (proves the comparison is on baseSpecies).
      expect(one('Floette-Eternal @ Floettite').set).toEqual({ species: 'floetteeternal', item: 'floettite' });
    });

    it('does not rewrite a species that is already a Mega form', () => {
      expect(one('Staraptor-Mega @ Staraptite')).toEqual({
        set: { species: 'staraptormega', item: 'staraptite' },
        problems: [],
        notes: [],
      });
    });

    it('does not rewrite when the stone belongs to a different Pokémon, and reports the stone as illegal for it', () => {
      const parsed = one('Incineroar @ Staraptite');
      expect(parsed.set).toEqual({ species: 'incineroar', item: 'staraptite' });
      expect(parsed.problems).toEqual([
        { path: 'paste[0].item', message: '"Staraptite" can only be held by Staraptor' },
      ]);
      expect(parsed.notes).toEqual([]);
      expect(one('Staraptor @ Charizardite X').set).toEqual({ species: 'staraptor', item: 'charizarditex' });
    });

    it('does not rewrite an unknown species', () => {
      expect(one('Ghost @ Staraptite')).toEqual({
        set: { species: 'ghost', item: 'staraptite' },
        problems: [{ path: 'paste[0].species', message: '"ghost" is not legal in fmt' }],
        notes: [],
      });
    });

    it('does not rewrite when two forms want the same stone, and the base set stays legal', () => {
      const twoForms = setSnapshot();
      twoForms.species.staraptormegab = speciesEntry('staraptormegab', 'Staraptor-Mega-B', {
        num: 398,
        abilities: ['Intimidate'],
        baseSpecies: 'Staraptor',
        forme: 'Mega-B',
        requiredItem: 'Staraptite',
      });
      expect(one('Staraptor @ Staraptite', twoForms)).toEqual({
        set: { species: 'staraptor', item: 'staraptite' },
        problems: [],
        notes: [],
      });
    });

    it('does not fill in a missing stone: a Mega form with no item is imported as written and flagged', () => {
      expect(one('Staraptor-Mega')).toEqual({
        set: { species: 'staraptormega' },
        problems: [{ path: 'paste[0].item', message: 'Staraptor-Mega must hold Staraptite' }],
        notes: [],
      });
    });
  });

  describe('problems', () => {
    it('reports an EVs line it cannot read, and gives the set no points', () => {
      for (const value of ['lots', '5 Foo', '2 HP / 3 HP', '2 HP / / 3 Atk']) {
        const parsed = one(`Incineroar\nEVs: ${value}`);
        expect(parsed.problems, value).toEqual([
          { path: 'paste[0].points', message: `could not read EVs "${value}"` },
        ]);
        expect(parsed.set, value).toEqual({ species: 'incineroar' });
      }
    });

    it('reports an unknown nature and leaves the nature out', () => {
      const parsed = one('Incineroar\nFoo Nature');
      expect(parsed.problems).toEqual([{ path: 'paste[0].nature', message: 'unknown nature "Foo"' }]);
      expect(parsed.set).toEqual({ species: 'incineroar' });
    });

    it('reports five moves, and a repeated move, through the existing structural check', () => {
      const five = one(lines('Incineroar', '- Fake Out', '- Flare Blitz', '- Parting Shot', '- Throat Chop', '- Earthquake'));
      expect(five.problems).toEqual([{ path: 'paste[0].moves', message: 'at most 4 moves (found 5)' }]);
      const repeated = one(lines('Incineroar', '- Fake Out', '- Fake Out'));
      expect(repeated.problems).toEqual([{ path: 'paste[0].moves[1]', message: 'duplicate move "fakeout"' }]);
    });

    it('keeps an unknown species and reports it', () => {
      expect(one('Ghost')).toEqual({
        set: { species: 'ghost' },
        problems: [{ path: 'paste[0].species', message: '"ghost" is not legal in fmt' }],
        notes: [],
      });
    });

    it('reports illegal ability, move and item together, in rule order, and keeps the set as written', () => {
      const parsed = one(lines('Incineroar @ Assault Vest', 'Ability: Levitate', '- Close Combat'));
      expect(parsed.set).toEqual({
        species: 'incineroar',
        item: 'assaultvest',
        ability: 'levitate',
        moves: ['closecombat'],
      });
      expect(paths(parsed)).toEqual(['paste[0].ability', 'paste[0].moves[0]', 'paste[0].item']);
    });

    it('reports over-limit points alone (structural problems come first and stop the legality check)', () => {
      const parsed = one(lines('Incineroar', 'EVs: 252 HP / 252 Atk / 4 Spe', '- Close Combat'));
      expect(parsed.problems).toEqual([
        { path: 'paste[0].points.hp', message: 'hp must be a whole number from 0 to 32 (found 252)' },
        { path: 'paste[0].points.atk', message: 'atk must be a whole number from 0 to 32 (found 252)' },
      ]);
    });

    it('lists parse problems before legality problems', () => {
      const parsed = one(lines('Incineroar', 'Foo Nature', '- Close Combat'));
      expect(paths(parsed)).toEqual(['paste[0].nature', 'paste[0].moves[0]']);
    });
  });

  it('does not modify the snapshot and keeps no state between calls', () => {
    const before = JSON.stringify(snapshot);
    const first = parse(lines(FULL, '', 'Staraptor @ Staraptite'));
    const second = parse(lines(FULL, '', 'Staraptor @ Staraptite'));
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(second).toEqual(first);
  });
});

describe('pasteToTeam', () => {
  it('lists members in paste order and keeps the first block for a repeated species', () => {
    // Paste order is the reverse of alphabetical, and the repeated Kingambit has a move the first one lacks.
    const parsed = parse(lines('Kingambit', '', 'Incineroar', '', 'Kingambit', '- Sucker Punch'));
    const result = pasteToTeam(parsed, 'Mine');
    expect(result.team).toEqual({ name: 'Mine', members: ['kingambit', 'incineroar'] });
    expect(result.sets).toEqual({ kingambit: { species: 'kingambit' }, incineroar: { species: 'incineroar' } });
    expect(result.problems).toEqual([
      { path: 'paste[2]', message: '"kingambit" already appears in block 1 of this paste; this one is ignored' },
    ]);
  });

  it('skips a block with no species but reports it', () => {
    const result = pasteToTeam(parse(lines('@ Sitrus Berry', '', 'Incineroar')), 'T');
    expect(result.team.members).toEqual(['incineroar']);
    expect(Object.keys(result.sets)).toEqual(['incineroar']);
    expect(result.problems).toEqual([{ path: 'paste[0]', message: 'no species found' }]);
  });

  it('has no size limit: a paste of seven gives seven members', () => {
    const names = ['Incineroar', 'Staraptor', 'Charizard', 'Kingambit', 'Garchomp', 'Sinistcha', 'Floette-Eternal'];
    const result = pasteToTeam(parse(names.join('\n\n')), 'Roster');
    expect(result.team.members).toEqual([
      'incineroar', 'staraptor', 'charizard', 'kingambit', 'garchomp', 'sinistcha', 'floetteeternal',
    ]);
    expect(result.problems).toEqual([]);
  });

  it('flattens every set problem in block order, with repeated-species problems after them', () => {
    const parsed = parse(lines('Ghost', '', 'Incineroar', '- Close Combat', '', 'Ghost'));
    const result = pasteToTeam(parsed, 'T');
    expect(result.team.members).toEqual(['ghost', 'incineroar']);
    expect(result.problems.map((p) => p.path)).toEqual([
      'paste[0].species',
      'paste[1].moves[0]',
      'paste[2].species',
      'paste[2]',
    ]);
  });

  it('returns an empty team for an empty paste', () => {
    expect(pasteToTeam([], 'Empty')).toEqual({ team: { name: 'Empty', members: [] }, sets: {}, problems: [] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx vitest run src/domain/paste.test.ts
```

Expected: FAIL (cannot resolve `./paste`).

- [ ] **Step 3: Implement**

`src/domain/paste.ts`:

```ts
import { toID, type ID } from './id';
import { isNatureName } from './natures';
import type { Problem } from './problem';
import type { PokemonSet, StatPoints } from './set';
import { validateSetAgainstSnapshot, type SetSnapshot } from './set-check';
import type { MatchTeam, RosterSets } from './team';
import type { SpeciesEntry, StatName } from './types';

export interface ParsedSet {
  /** null only when the block has no readable species. */
  set: PokemonSet | null;
  /** Parse problems first, then the legality problems from `validateSetAgainstSnapshot`. Paths start "paste[i]". */
  problems: Problem[];
  /** Things dropped or rewritten, in reading order. */
  notes: string[];
}

export interface PastedTeam {
  team: MatchTeam;
  sets: RosterSets;
  problems: Problem[];
}

/** The labels on an EVs line. Champions writes stat points there, 1:1. */
const STAT_LABELS: Record<string, StatName> = { hp: 'hp', atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe' };

/** Lines the set model has no place for: noted and ignored. */
const IGNORED_LABELS = new Set([
  'ivs',
  'shiny',
  'tera type',
  'gender',
  'happiness',
  'hidden power',
  'pokeball',
  'dynamax level',
  'gigantamax',
]);

/** Blocks of non-blank lines. A line starting with "===" separates blocks like a blank line does. */
function splitBlocks(text: string): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('===')) {
      if (current.length > 0) blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

/** `[Nickname (]Species[)] [(M|F)] [@ Item]`. */
function parseFirstLine(line: string): { species: string; item: string; notes: string[] } {
  const at = line.indexOf('@');
  const item = at === -1 ? '' : line.slice(at + 1).trim();
  let name = (at === -1 ? line : line.slice(0, at)).trim();
  const gender = /\s\(([MF])\)$/.exec(name);
  if (gender) name = name.slice(0, gender.index).trim();
  const nickname = /^(.*)\s\(([^()]+)\)$/.exec(name);
  if (nickname) name = nickname[2].trim();
  const notes: string[] = [];
  if (nickname) notes.push(`nickname "${nickname[1].trim()}"`);
  if (gender) notes.push(`gender ${gender[1]}`);
  return { species: name, item, notes };
}

/**
 * The Mega form a legal base species turns into when it holds that form's stone: exactly one legal species
 * that requires the item and shares the base species. Compared on `baseSpecies`, not the species name, so
 * Floette-Eternal holding Floettite finds Floette-Mega.
 */
function megaFormFor(speciesId: ID, itemId: ID, snapshot: SetSnapshot): SpeciesEntry | null {
  if (itemId === '' || !Object.hasOwn(snapshot.species, speciesId)) return null;
  const base = snapshot.species[speciesId];
  if (base.requiredItem) return null;
  const baseSpecies = toID(base.baseSpecies);
  const candidates = Object.values(snapshot.species).filter(
    (s) => s.id !== base.id && s.requiredItem && toID(s.requiredItem) === itemId && toID(s.baseSpecies) === baseSpecies,
  );
  return candidates.length === 1 ? candidates[0] : null;
}

/** "2 HP / 32 Atk / 32 Spe" -> points (stats not named are 0), or null if any part cannot be read. */
function parseEvs(value: string): StatPoints | null {
  const points: StatPoints = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const seen = new Set<StatName>();
  for (const part of value.split('/')) {
    const match = /^(\d+)\s*([a-z]+)$/i.exec(part.trim());
    if (!match) return null;
    const label = match[2].toLowerCase();
    if (!Object.hasOwn(STAT_LABELS, label)) return null;
    const stat = STAT_LABELS[label];
    if (seen.has(stat)) return null;
    seen.add(stat);
    points[stat] = Number(match[1]);
  }
  return points;
}

function parseBlock(blockLines: string[], index: number, snapshot: SetSnapshot): ParsedSet {
  const at = `paste[${index}]`;
  const first = parseFirstLine(blockLines[0]);
  const notes = [...first.notes];

  const speciesId = toID(first.species);
  if (speciesId === '') {
    return { set: null, problems: [{ path: at, message: 'no species found' }], notes };
  }

  const set: PokemonSet = { species: speciesId };
  const itemId = toID(first.item);
  if (itemId !== '') set.item = itemId;

  const mega = megaFormFor(speciesId, itemId, snapshot);
  if (mega !== null) {
    notes.push(`read "${snapshot.species[speciesId].name}" holding ${first.item} as ${mega.name}`);
    set.species = mega.id;
  }

  const parseProblems: Problem[] = [];
  const moves: ID[] = [];
  for (const line of blockLines.slice(1)) {
    const move = /^-\s*(.*)$/.exec(line);
    if (move) {
      const id = toID(move[1]);
      if (id === '') notes.push('empty move line skipped');
      else moves.push(id);
      continue;
    }

    const nature = /^([A-Za-z]+) Nature$/i.exec(line);
    if (nature) {
      const name = nature[1].charAt(0).toUpperCase() + nature[1].slice(1).toLowerCase();
      if (isNatureName(name)) set.nature = name;
      else parseProblems.push({ path: `${at}.nature`, message: `unknown nature "${nature[1]}"` });
      continue;
    }

    const labelled = /^([A-Za-z ]+?)\s*:\s*(.*)$/.exec(line);
    if (!labelled) {
      notes.push(`unrecognized line: ${line}`);
      continue;
    }
    const label = labelled[1].toLowerCase();
    const value = labelled[2].trim();
    if (label === 'ability') {
      if (toID(value) !== '') set.ability = toID(value);
    } else if (label === 'level') {
      if (value !== '50') notes.push(`Level ${value} ignored (Champions battles are level 50)`);
    } else if (label === 'evs') {
      const points = parseEvs(value);
      if (points !== null) {
        set.points = points;
      } else {
        delete set.points;
        parseProblems.push({ path: `${at}.points`, message: `could not read EVs "${value}"` });
      }
    } else if (IGNORED_LABELS.has(label)) {
      notes.push(line);
    } else {
      notes.push(`unrecognized line: ${line}`);
    }
  }
  if (moves.length > 0) set.moves = moves;

  return { set, problems: [...parseProblems, ...validateSetAgainstSnapshot(set, snapshot, at)], notes };
}

/**
 * Reads Showdown-format text into one `ParsedSet` per block. Lenient: names become ids as written and legality
 * problems are reported beside the set instead of rejecting it. Never throws; text that is not a string gives [].
 */
export function parsePaste(text: string, snapshot: SetSnapshot): ParsedSet[] {
  if (typeof text !== 'string') return [];
  return splitBlocks(text).map((blockLines, index) => parseBlock(blockLines, index, snapshot));
}

/**
 * Turns parsed blocks into a team: members are the species of the readable sets in paste order. A species that
 * appears in more than one block keeps its first block; the later ones are left out and reported. No size limit
 * (`validateTeam` applies it, and a pasted roster may be longer than a team). `problems` is every block's
 * problems in block order, followed by the repeated-species problems.
 */
export function pasteToTeam(parsed: ParsedSet[], name: string): PastedTeam {
  const members: ID[] = [];
  const sets: RosterSets = {};
  const problems: Problem[] = [];
  const repeats: Problem[] = [];
  const firstBlock = new Map<ID, number>();

  parsed.forEach((entry, index) => {
    problems.push(...entry.problems);
    if (entry.set === null) return;
    const id = entry.set.species;
    const earlier = firstBlock.get(id);
    if (earlier !== undefined) {
      repeats.push({
        path: `paste[${index}]`,
        message: `"${id}" already appears in block ${earlier + 1} of this paste; this one is ignored`,
      });
      return;
    }
    firstBlock.set(id, index);
    members.push(id);
    sets[id] = entry.set;
  });

  return { team: { name, members }, sets, problems: [...problems, ...repeats] };
}
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run src/domain/paste.test.ts
npm run typecheck
```

Expected: all paste tests PASS; no type errors. If a hand-computed expectation in the test file disagrees with the code, do NOT edit the assertion or the code to force a pass: report the discrepancy with the actual output (it is a plan defect for the controller to rule on).

- [ ] **Step 5: Run the whole unit suite**

```powershell
npm test
```

Expected: PASS (268 plus the new paste tests), output without warnings or noise.

- [ ] **Step 6: Commit**

```powershell
git add src/domain/paste.ts src/domain/paste.test.ts
git commit -m "feat(domain): read Showdown pastes into sets and teams" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Writing a paste, and the round trip

**Files:**
- Create: `src/domain/paste-export.ts`
- Test: `src/domain/paste-export.test.ts`

**Interfaces:**
- Consumes: `toID` from `./id`; `STAT_NAMES`, `PokemonSet` from `./set`; `SetSnapshot` from `./set-check`; `MatchTeam`, `RosterSets` from `./team`; `StatName` from `./types`; from Task 1: `parsePaste` (round-trip tests only); test helper `setSnapshot` from `./test-support`.
- Produces:
  - `exportSet(set: PokemonSet, snapshot: SetSnapshot): string`
  - `exportSets(sets: PokemonSet[], snapshot: SetSnapshot): string`
  - `exportTeam(team: MatchTeam, sets: RosterSets, snapshot: SetSnapshot): string`

- [ ] **Step 1: Write the failing tests**

`src/domain/paste-export.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parsePaste } from './paste';
import { exportSet, exportSets, exportTeam } from './paste-export';
import type { PokemonSet, StatPoints } from './set';
import type { MatchTeam, RosterSets } from './team';
import { setSnapshot } from './test-support';

const snapshot = setSnapshot();
const lines = (...rows: string[]) => rows.join('\n');
const points = (overrides: Partial<StatPoints> = {}): StatPoints => ({
  hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...overrides,
});

const FULL_SET: PokemonSet = {
  species: 'incineroar',
  item: 'sitrusberry',
  ability: 'intimidate',
  points: points({ hp: 2, atk: 32, spe: 32 }),
  nature: 'Jolly',
  moves: ['fakeout', 'flareblitz', 'partingshot', 'throatchop'],
};
const FULL_TEXT = lines(
  'Incineroar @ Sitrus Berry',
  'Ability: Intimidate',
  'Level: 50',
  'EVs: 2 HP / 32 Atk / 32 Spe',
  'Jolly Nature',
  '- Fake Out',
  '- Flare Blitz',
  '- Parting Shot',
  '- Throat Chop',
);

describe('exportSet', () => {
  it('writes the full example exactly, with display names and no trailing spaces', () => {
    const text = exportSet(FULL_SET, snapshot);
    expect(text).toBe(FULL_TEXT);
    expect(text.split('\n').every((line) => line === line.trimEnd())).toBe(true);
  });

  it('writes only the lines the set has, and always Level: 50', () => {
    expect(exportSet({ species: 'incineroar' }, snapshot)).toBe(lines('Incineroar', 'Level: 50'));
    expect(exportSet({ species: 'incineroar', ability: 'blaze' }, snapshot)).toBe(
      lines('Incineroar', 'Ability: Blaze', 'Level: 50'),
    );
    expect(exportSet({ species: 'incineroar', item: 'leftovers' }, snapshot)).toBe(
      lines('Incineroar @ Leftovers', 'Level: 50'),
    );
    expect(exportSet({ species: 'incineroar', nature: 'Timid' }, snapshot)).toBe(
      lines('Incineroar', 'Level: 50', 'Timid Nature'),
    );
    expect(exportSet({ species: 'incineroar', moves: ['fakeout'] }, snapshot)).toBe(
      lines('Incineroar', 'Level: 50', '- Fake Out'),
    );
  });

  it('writes no EVs line for absent or all-zero points', () => {
    expect(exportSet({ species: 'incineroar', points: points() }, snapshot)).toBe(lines('Incineroar', 'Level: 50'));
  });

  it('lists only non-zero stats, in the order HP, Atk, Def, SpA, SpD, Spe', () => {
    expect(exportSet({ species: 'incineroar', points: points({ def: 4, spa: 32, spe: 30 }) }, snapshot)).toBe(
      lines('Incineroar', 'Level: 50', 'EVs: 4 Def / 32 SpA / 30 Spe'),
    );
    // Keys inserted in the reverse of the display order: the order must come from the stat list, not the object.
    const reversed = { spe: 1, spd: 2, spa: 3, def: 4, atk: 5, hp: 6 } as StatPoints;
    expect(exportSet({ species: 'incineroar', points: reversed }, snapshot)).toBe(
      lines('Incineroar', 'Level: 50', 'EVs: 6 HP / 5 Atk / 4 Def / 3 SpA / 2 SpD / 1 Spe'),
    );
  });

  it('writes a Mega form with its stone and never rewrites the set', () => {
    expect(exportSet({ species: 'staraptormega', item: 'staraptite' }, snapshot)).toBe(
      lines('Staraptor-Mega @ Staraptite', 'Level: 50'),
    );
    expect(exportSet({ species: 'staraptor', item: 'staraptite' }, snapshot)).toBe(
      lines('Staraptor @ Staraptite', 'Level: 50'),
    );
  });

  it('falls back to the id as written when a name cannot be found', () => {
    expect(exportSet({ species: 'incineroar', ability: 'levitate', item: 'zzz', moves: ['notamove'] }, snapshot)).toBe(
      lines('Incineroar @ zzz', 'Ability: levitate', 'Level: 50', '- notamove'),
    );
    expect(exportSet({ species: 'ghost', item: 'sitrusberry' }, snapshot)).toBe(
      lines('ghost @ Sitrus Berry', 'Level: 50'),
    );
    expect(exportSet({ species: 'ghost', ability: 'levitate' }, snapshot)).toBe(
      lines('ghost', 'Ability: levitate', 'Level: 50'),
    );
    expect(exportSet({ species: 'constructor', item: 'constructor', moves: ['constructor'] }, snapshot)).toBe(
      lines('constructor @ constructor', 'Level: 50', '- constructor'),
    );
  });

  it('returns an empty string for something that is not a usable set', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { species: 5 }, { species: '' }]) {
      expect(exportSet(bad as unknown as PokemonSet, snapshot), JSON.stringify(bad)).toBe('');
    }
  });

  it('does not modify its inputs', () => {
    const set: PokemonSet = { ...FULL_SET };
    const before = JSON.stringify({ set, snapshot });
    exportSet(set, snapshot);
    expect(JSON.stringify({ set, snapshot })).toBe(before);
  });
});

describe('exportSets', () => {
  const kingambit: PokemonSet = { species: 'kingambit', item: 'leftovers', moves: ['suckerpunch'] };

  it('joins blocks with one blank line, in the order given, skipping anything unusable', () => {
    // Order is the reverse of the fixture's own, so re-ordering fails.
    const text = exportSets([kingambit, null as unknown as PokemonSet, FULL_SET], snapshot);
    expect(text).toBe(
      lines('Kingambit @ Leftovers', 'Level: 50', '- Sucker Punch', '', FULL_TEXT),
    );
  });

  it('returns an empty string for an empty list or something that is not a list', () => {
    expect(exportSets([], snapshot)).toBe('');
    expect(exportSets(5 as unknown as PokemonSet[], snapshot)).toBe('');
  });
});

describe('exportTeam', () => {
  const sets: RosterSets = { incineroar: { species: 'incineroar', item: 'leftovers', moves: ['fakeout'] } };

  it('writes the members in team order, with a species-only block for a member that has no saved set', () => {
    const team: MatchTeam = { name: 'T', members: ['kingambit', 'incineroar'] };
    expect(exportTeam(team, sets, snapshot)).toBe(
      lines('Kingambit', 'Level: 50', '', 'Incineroar @ Leftovers', 'Level: 50', '- Fake Out'),
    );
  });

  it('falls back to a species-only block when the saved set cannot be written, or there are no sets at all', () => {
    const team: MatchTeam = { name: 'T', members: ['kingambit'] };
    expect(exportTeam(team, { kingambit: 5 } as unknown as RosterSets, snapshot)).toBe(lines('Kingambit', 'Level: 50'));
    expect(exportTeam(team, null as unknown as RosterSets, snapshot)).toBe(lines('Kingambit', 'Level: 50'));
  });

  it('does not treat inherited object properties as saved sets', () => {
    const team: MatchTeam = { name: 'T', members: ['constructor'] };
    expect(exportTeam(team, {}, snapshot)).toBe(lines('constructor', 'Level: 50'));
  });

  it('skips members that are not species ids, and returns an empty string for a malformed team', () => {
    const odd = { name: 'T', members: [5, '', 'incineroar'] } as unknown as MatchTeam;
    expect(exportTeam(odd, {}, snapshot)).toBe(lines('Incineroar', 'Level: 50'));
    expect(exportTeam(null as unknown as MatchTeam, {}, snapshot)).toBe('');
    expect(exportTeam({ name: 'x' } as unknown as MatchTeam, {}, snapshot)).toBe('');
  });

  it('does not modify its inputs', () => {
    const team: MatchTeam = { name: 'T', members: ['kingambit', 'incineroar'] };
    const before = JSON.stringify({ team, sets, snapshot });
    exportTeam(team, sets, snapshot);
    expect(JSON.stringify({ team, sets, snapshot })).toBe(before);
  });
});

describe('round trip: parsePaste(exportSet(set)) gives the set back', () => {
  const roundTrip = (set: PokemonSet) => {
    const parsed = parsePaste(exportSet(set, snapshot), snapshot);
    expect(parsed).toHaveLength(1);
    return parsed[0];
  };

  it('for a set with every field', () => {
    expect(roundTrip(FULL_SET)).toEqual({ set: FULL_SET, problems: [], notes: [] });
  });

  it('for a set with only some stats spent', () => {
    const set: PokemonSet = { species: 'kingambit', points: points({ atk: 5 }) };
    expect(roundTrip(set)).toEqual({ set, problems: [], notes: [] });
  });

  it('for a Mega form with its stone', () => {
    const set: PokemonSet = { species: 'staraptormega', item: 'staraptite', moves: ['bravebird'] };
    expect(roundTrip(set)).toEqual({ set, problems: [], notes: [] });
  });

  it('for a species-only set', () => {
    expect(roundTrip({ species: 'incineroar' })).toEqual({ set: { species: 'incineroar' }, problems: [], notes: [] });
  });

  it('except that all-zero points come back as no points', () => {
    const parsed = roundTrip({ species: 'incineroar', item: 'leftovers', points: points() });
    expect(parsed.set).toEqual({ species: 'incineroar', item: 'leftovers' });
    expect(parsed.set !== null && 'points' in parsed.set).toBe(false);
    expect(parsed.problems).toEqual([]);
    expect(parsed.notes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```powershell
npx vitest run src/domain/paste-export.test.ts
```

Expected: FAIL (cannot resolve `./paste-export`).

- [ ] **Step 3: Implement**

`src/domain/paste-export.ts`:

```ts
import { toID } from './id';
import { STAT_NAMES, type PokemonSet } from './set';
import type { SetSnapshot } from './set-check';
import type { MatchTeam, RosterSets } from './team';
import type { StatName } from './types';

const STAT_LABEL: Record<StatName, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

/** The display name for an id, or the id itself when the table has no such entry. */
function displayName(table: Record<string, { name: string }>, id: string): string {
  return Object.hasOwn(table, id) ? table[id].name : id;
}

/** "2 HP / 32 Atk / 32 Spe": non-zero stats only, in the fixed order. Empty when nothing is spent. */
function evsLine(points: unknown): string {
  if (typeof points !== 'object' || points === null || Array.isArray(points)) return '';
  const record = points as Partial<Record<StatName, unknown>>;
  const parts: string[] = [];
  for (const stat of STAT_NAMES) {
    const value = record[stat];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) parts.push(`${value} ${STAT_LABEL[stat]}`);
  }
  return parts.join(' / ');
}

/**
 * One Showdown block. Champions stat points go on the EVs line 1:1 and the level is always 50. A set whose
 * points are all zero writes no EVs line, so it reads back with no points. Names come from the snapshot and
 * fall back to the id as written. Never rewrites a set. Returns '' for something that is not a usable set.
 */
export function exportSet(set: PokemonSet, snapshot: SetSnapshot): string {
  if (typeof set !== 'object' || set === null || typeof set.species !== 'string' || set.species === '') return '';

  const species = Object.hasOwn(snapshot.species, set.species) ? snapshot.species[set.species] : null;
  let first = species ? species.name : set.species;
  if (typeof set.item === 'string' && set.item !== '') first += ` @ ${displayName(snapshot.items, set.item)}`;
  const out = [first];

  if (typeof set.ability === 'string' && set.ability !== '') {
    const name = species?.abilities.find((candidate) => toID(candidate) === set.ability);
    out.push(`Ability: ${name ?? set.ability}`);
  }
  out.push('Level: 50');
  const evs = evsLine(set.points);
  if (evs !== '') out.push(`EVs: ${evs}`);
  if (typeof set.nature === 'string' && set.nature !== '') out.push(`${set.nature} Nature`);
  for (const move of Array.isArray(set.moves) ? set.moves : []) {
    if (typeof move === 'string' && move !== '') out.push(`- ${displayName(snapshot.moves, move)}`);
  }
  return out.join('\n');
}

/** Blocks for each set, in the order given, joined by one blank line. Unusable entries are skipped. */
export function exportSets(sets: PokemonSet[], snapshot: SetSnapshot): string {
  if (!Array.isArray(sets)) return '';
  return sets
    .map((set) => exportSet(set, snapshot))
    .filter((block) => block !== '')
    .join('\n\n');
}

/**
 * The team's members in team order. A member with no saved set, or whose saved set cannot be written, gets a
 * species-only block. Returns '' for a team without a list of members.
 */
export function exportTeam(team: MatchTeam, sets: RosterSets, snapshot: SetSnapshot): string {
  if (typeof team !== 'object' || team === null || !Array.isArray(team.members)) return '';
  const blocks: string[] = [];
  for (const id of team.members) {
    if (typeof id !== 'string' || id === '') continue;
    const saved = typeof sets === 'object' && sets !== null && Object.hasOwn(sets, id) ? sets[id] : undefined;
    const block = saved === undefined ? '' : exportSet(saved, snapshot);
    blocks.push(block !== '' ? block : exportSet({ species: id }, snapshot));
  }
  return blocks.join('\n\n');
}
```

- [ ] **Step 4: Run tests and typecheck**

```powershell
npx vitest run src/domain/paste-export.test.ts
npm run typecheck
```

Expected: all export and round-trip tests PASS; no type errors. If a hand-computed expectation disagrees with the code, report the numbers or text; do not edit the assertion or the code to force a pass.

- [ ] **Step 5: Run the whole unit suite**

```powershell
npm test
```

Expected: PASS, output without warnings or noise.

- [ ] **Step 6: Commit**

```powershell
git add src/domain/paste-export.ts src/domain/paste-export.test.ts
git commit -m "feat(domain): write sets and teams as Showdown pastes" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Real-snapshot tests

This task adds a test file only. The production code exists, so the new tests are expected to pass on the first run; a failure is a real finding about the data or an earlier task and must be reported, not worked around by editing assertions.

**Files:**
- Test: `src/domain/paste-real.test.ts`

**Interfaces:**
- Consumes: `parsePaste`, `pasteToTeam` (Task 1); `exportSet`, `exportTeam` (Task 2); `isNatureName`, `toID`, `ID`, `PokemonSet`, `Snapshot`, `RosterSets`, and the committed version-2 snapshot at `data/gen9championsvgc2026regmb/snapshot.json`.
- Produces: nothing later tasks use.
- Pre-verified on 2026-09-21 against the committed snapshot: `toID(name) === id` for every legal species, move and item; the 40 most used species all have an ability, an item, four moves, a nature and non-zero spread points; none of their items triggers a Mega rewrite; 15 of them are Mega forms; the rewrite sweep below finds 80 rewrites and the only ambiguous bases are `meowstic` and `meowsticf` (Meowsticite is required by both `meowsticmmega` and `meowsticfmega`).

- [ ] **Step 1: Write the tests**

`src/domain/paste-real.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toID, type ID } from './id';
import { isNatureName } from './natures';
import { parsePaste, pasteToTeam } from './paste';
import { exportSet, exportTeam } from './paste-export';
import type { PokemonSet } from './set';
import type { RosterSets } from './team';
import type { Snapshot } from './types';

const snapshot = JSON.parse(
  readFileSync(new URL('../../data/gen9championsvgc2026regmb/snapshot.json', import.meta.url), 'utf8'),
) as Snapshot;
if (!snapshot.usage) throw new Error('the committed snapshot has no usage data');
const usage = snapshot.usage;
const ranked = Object.values(usage.species).sort((a, b) => b.usage - a.usage);

/** A set built from what real ladder teams run on the species: top ability, top real item, top four moves, top spread. */
function setFromUsage(id: ID): PokemonSet {
  const entry = usage.species[id];
  const set: PokemonSet = { species: id, moves: entry.moves.slice(0, 4).map(([move]) => move) };
  const ability = entry.abilities[0]?.[0];
  if (ability) set.ability = ability;
  const item = entry.items.find(([itemId]) => itemId !== 'nothing')?.[0]; // Smogon's id for "no item"
  if (item) set.item = item;
  const spread = entry.spreads[0];
  if (spread) {
    if (isNatureName(spread.nature)) set.nature = spread.nature;
    const [hp, atk, def, spa, spd, spe] = spread.points;
    set.points = { hp, atk, def, spa, spd, spe };
  }
  return set;
}

describe('Showdown paste on the real Reg M-B snapshot', () => {
  it('writes and re-reads a set built from real usage for each of the 40 most used species', () => {
    let withStone = 0;
    let checked = 0;
    for (const { id } of ranked.slice(0, 40)) {
      const set = setFromUsage(id);
      if (snapshot.species[id].requiredItem) withStone += 1;
      const parsed = parsePaste(exportSet(set, snapshot), snapshot);
      expect(parsed, id).toHaveLength(1);
      expect(parsed[0], id).toEqual({ set, problems: [], notes: [] });
      checked += 1;
    }
    expect(checked).toBe(40);
    expect(withStone).toBeGreaterThanOrEqual(5); // 15 when this was written: Mega forms are common
  });

  it('round-trips a full six-member team through exportTeam and pasteToTeam', () => {
    // The most used Mega form first, then the most used non-Mega species with a new dex number and a new item.
    const mega = ranked.find((entry) => snapshot.species[entry.id].requiredItem);
    if (!mega) throw new Error('no Mega form in the usage data');
    const candidates = [mega, ...ranked.filter((entry) => entry !== mega && !snapshot.species[entry.id].requiredItem)];

    const sets: RosterSets = {};
    const members: ID[] = [];
    const numbers = new Set<number>();
    const items = new Set<string>();
    for (const { id } of candidates) {
      const set = setFromUsage(id);
      const num = snapshot.species[id].num;
      if (numbers.has(num) || (set.item !== undefined && items.has(set.item))) continue;
      numbers.add(num);
      if (set.item !== undefined) items.add(set.item);
      sets[id] = set;
      members.push(id);
      if (members.length === 6) break;
    }
    expect(members).toHaveLength(6);
    expect(sets[members[0]].item).toBe(toID(snapshot.species[members[0]].requiredItem));

    const text = exportTeam({ name: 'Real', members }, sets, snapshot);
    const parsed = parsePaste(text, snapshot);
    expect(parsed).toHaveLength(6);
    expect(pasteToTeam(parsed, 'Real')).toEqual({ team: { name: 'Real', members }, sets, problems: [] });
  });

  it('turns a base species holding a Mega stone into that Mega form, except where two forms share the stone', () => {
    let rewritten = 0;
    const unchanged = new Set<string>();
    for (const mega of Object.values(snapshot.species)) {
      if (!mega.requiredItem) continue;
      for (const base of Object.values(snapshot.species)) {
        if (base.requiredItem || toID(base.baseSpecies) !== toID(mega.baseSpecies)) continue;
        const label = `${base.name} @ ${mega.requiredItem}`;
        const parsed = parsePaste(label, snapshot);
        expect(parsed, label).toHaveLength(1);
        const species = parsed[0].set?.species;
        if (species === base.id) {
          unchanged.add(base.id);
        } else {
          expect(species, label).toBe(mega.id);
          rewritten += 1;
        }
      }
    }
    expect(rewritten).toBeGreaterThanOrEqual(50); // 80 when this was written, so the sweep cannot pass vacuously
    // Meowsticite is required by both Meowstic-M-Mega and Meowstic-F-Mega, so these two stay as written.
    // If a data update adds another shared stone this fails: review it, then update the list.
    expect([...unchanged].sort()).toEqual(['meowstic', 'meowsticf']);
  });
});
```

- [ ] **Step 2: Run the tests**

```powershell
npx vitest run src/domain/paste-real.test.ts
```

Expected: PASS (3 tests). If one fails, capture the exact failing message and report it: it is either a data finding or a defect in Task 1 or 2. Do not edit an assertion, a floor or production code to force a pass.

- [ ] **Step 3: Run the whole unit suite and typecheck**

```powershell
npm test
npm run typecheck
```

Expected: PASS, output without warnings or noise.

- [ ] **Step 4: Commit**

```powershell
git add src/domain/paste-real.test.ts
git commit -m "test(domain): Showdown paste against the real Reg M-B snapshot" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Oracle test against the real package, and README

This task adds an integration test and a README sentence. The production code exists, so the oracle tests are expected to pass on the first run; a failure is a finding about our format versus Showdown's and must be reported with the exact text of both sides, not worked around by editing an expectation.

**Files:**
- Test: `sync/showdown/paste.integration.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `exportSet`, `exportSets` (Task 2); `parsePaste` (Task 1); the real `pokemon-showdown` package's `Teams.export(sets)` and `Teams.import(text)`; the committed snapshot.
- Produces: nothing later tasks use.
- Pre-verified on 2026-09-21: for the 40 most used real sets `Teams.export` text equals `exportSet` text after trimming trailing whitespace on each line (three sets joined equal `exportSets`); `Teams.import` of our text returns the same species name, item, ability, moves, nature, level 50 and `evs` equal to our `points`; `Teams.export` of a species-only set is `Incineroar\nLevel: 50` (plus trailing spaces and blank lines) and of an all-zero `evs` set has no `EVs:` line.

- [ ] **Step 1: Write the oracle tests**

`sync/showdown/paste.integration.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { toID, type ID } from '../../src/domain/id';
import { isNatureName } from '../../src/domain/natures';
import { parsePaste } from '../../src/domain/paste';
import { exportSet, exportSets } from '../../src/domain/paste-export';
import type { PokemonSet } from '../../src/domain/set';
import type { Snapshot } from '../../src/domain/types';

// The slice of the pokemon-showdown API this test relies on. Kept local, like the loader does.
interface ShowdownSet {
  name: string;
  species: string;
  item: string;
  ability: string;
  moves: string[];
  nature: string;
  evs?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  level: number;
  gender: string;
}
interface ShowdownTeams {
  export(sets: ShowdownSet[]): string;
  import(text: string): Array<Partial<ShowdownSet>> | null;
}
const { Teams } = createRequire(import.meta.url)('pokemon-showdown') as { Teams: ShowdownTeams };

const snapshot = JSON.parse(
  readFileSync(new URL('../../data/gen9championsvgc2026regmb/snapshot.json', import.meta.url), 'utf8'),
) as Snapshot;
if (!snapshot.usage) throw new Error('the committed snapshot has no usage data');
const usage = snapshot.usage;
const ranked = Object.values(usage.species).sort((a, b) => b.usage - a.usage);

/** A set built from what real ladder teams run on the species (same builder as the unit tests). */
function setFromUsage(id: ID): PokemonSet {
  const entry = usage.species[id];
  const set: PokemonSet = { species: id, moves: entry.moves.slice(0, 4).map(([move]) => move) };
  const ability = entry.abilities[0]?.[0];
  if (ability) set.ability = ability;
  const item = entry.items.find(([itemId]) => itemId !== 'nothing')?.[0]; // Smogon's id for "no item"
  if (item) set.item = item;
  const spread = entry.spreads[0];
  if (spread) {
    if (isNatureName(spread.nature)) set.nature = spread.nature;
    const [hp, atk, def, spa, spd, spe] = spread.points;
    set.points = { hp, atk, def, spa, spd, spe };
  }
  return set;
}

const nameOf = (table: Record<string, { name: string }>, id: string): string => {
  if (!Object.hasOwn(table, id)) throw new Error(`"${id}" is not in the snapshot`);
  return table[id].name;
};

/** The same set in Showdown's own shape, using display names. */
function toShowdownSet(set: PokemonSet): ShowdownSet {
  const species = snapshot.species[set.species];
  const abilityName = set.ability ? species.abilities.find((name) => toID(name) === set.ability) : '';
  if (set.ability && !abilityName) throw new Error(`${set.species} has no ability "${set.ability}"`);
  return {
    name: '',
    species: species.name,
    item: set.item ? nameOf(snapshot.items, set.item) : '',
    ability: abilityName ?? '',
    moves: (set.moves ?? []).map((move) => nameOf(snapshot.moves, move)),
    nature: set.nature ?? '',
    evs: set.points ? { ...set.points } : undefined,
    level: 50,
    gender: '',
  };
}

/** Showdown writes two trailing spaces on each line and blank lines at the end; ours has neither. */
const normalize = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

const sets = ranked.slice(0, 40).map(({ id }) => setFromUsage(id));

describe('paste format against the real pokemon-showdown package', () => {
  it('writes the same text as Teams.export for each of the 40 most used sets', () => {
    expect(sets).toHaveLength(40);
    const mismatches: string[] = [];
    for (const set of sets) {
      const ours = exportSet(set, snapshot);
      const theirs = normalize(Teams.export([toShowdownSet(set)]));
      if (ours !== theirs) mismatches.push(`${set.species}\nours:\n${ours}\ntheirs:\n${theirs}`);
    }
    expect(mismatches).toEqual([]);
  });

  it('writes the same text as Teams.export for a whole team that includes a Mega form', () => {
    const mega = sets.find((set) => snapshot.species[set.species].requiredItem);
    if (!mega) throw new Error('no Mega form among the 40 most used sets');
    const team = [mega, ...sets.filter((set) => set !== mega).slice(0, 5)];
    expect(team).toHaveLength(6);
    expect(exportSets(team, snapshot)).toBe(normalize(Teams.export(team.map(toShowdownSet))));
  });

  it('lets Teams.import read our text back to the same data', () => {
    const mismatches: string[] = [];
    for (const set of sets) {
      const imported = Teams.import(exportSet(set, snapshot));
      const expected = toShowdownSet(set);
      const got = imported?.[0];
      const same =
        imported?.length === 1 &&
        got?.species === expected.species &&
        (got.item ?? '') === expected.item &&
        (got.ability ?? '') === expected.ability &&
        JSON.stringify(got.moves) === JSON.stringify(expected.moves) &&
        (got.nature ?? '') === expected.nature &&
        got.level === 50 &&
        JSON.stringify(got.evs) === JSON.stringify(expected.evs);
      if (!same) mismatches.push(`${set.species}: ${JSON.stringify(got)}`);
    }
    expect(mismatches).toEqual([]);
  });

  it('reads Teams.export output back to the original set', () => {
    for (const set of sets) {
      const parsed = parsePaste(Teams.export([toShowdownSet(set)]), snapshot);
      expect(parsed, set.species).toEqual([{ set, problems: [], notes: [] }]);
    }
  });

  it('agrees with Teams.export on a species-only set and on all-zero points', () => {
    const bare: ShowdownSet = { name: '', species: 'Incineroar', item: '', ability: '', moves: [], nature: '', level: 50, gender: '' };
    expect(exportSet({ species: 'incineroar' }, snapshot)).toBe(normalize(Teams.export([bare])));

    const zero: PokemonSet = {
      species: 'incineroar',
      item: 'sitrusberry',
      ability: 'intimidate',
      nature: 'Jolly',
      moves: ['fakeout'],
      points: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    };
    expect(exportSet(zero, snapshot)).toBe(normalize(Teams.export([toShowdownSet(zero)])));
    expect(exportSet(zero, snapshot)).not.toContain('EVs');
  });
});
```

- [ ] **Step 2: Run the oracle tests**

```powershell
npx vitest run --config vitest.integration.config.ts sync/showdown/paste.integration.test.ts
```

Expected: PASS (5 tests). If one fails, print the mismatch (both texts) and report it. Do not edit an expectation to force a pass.

- [ ] **Step 3: Update the README**

In `README.md`, in the first paragraph, replace this sentence tail:

```md
roster sets and match teams with Item and Species Clause checks). There is no UI yet, and Showdown paste import and export is not built yet.
```

with:

```md
roster sets and match teams with Item and Species Clause checks), and Showdown paste import and export for sets and teams. There is no UI yet.
```

- [ ] **Step 4: Run everything**

```powershell
npm test
npm run test:integration
npm run typecheck
```

Expected: all green, with no warnings or noise in the output. Unit total is 268 plus the tests added in Tasks 1 to 3; integration total is 13 plus 5.

- [ ] **Step 5: Commit**

```powershell
git add sync/showdown/paste.integration.test.ts README.md
git commit -m "test(sync): check the paste format against Showdown's own import and export" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review (spec coverage)

| Spec requirement | Task |
|---|---|
| `ParsedSet` (`set`, `problems`, `notes`), `parsePaste`; non-string, empty and blank text give `[]` | 1 |
| Block splitting: blank lines, `===` headers, CRLF, trailing spaces; block-indexed paths | 1 |
| First line: item after `@`, gender and nickname noted, species by `toID`, no species gives `set: null` | 1 |
| Mega rewrite on base species, unique candidate, note text, zero or two candidates leave it alone, no stone auto-fill | 1 (fixture), 3 (real sweep with the Meowstic exception pinned) |
| Body lines: Ability, Level, EVs (all label cases, unreadable parts), nature, moves, ignored and unrecognized lines, later lines override | 1 |
| Legality problems from `validateSetAgainstSnapshot`, parse problems first, structural problems alone | 1 |
| `pasteToTeam`: order, first block wins, null sets skipped, no size limit, flattened problems | 1 |
| `exportSet` line rules, EVs order and zero-skipping, display names with id fallback, no trailing spaces, Mega written as-is, `''` for unusable | 2 |
| `exportSets`, `exportTeam` (order, species-only for a member with no saved set, `''` for a malformed team) | 2 |
| Round trip and the all-zero-points exception | 2 (fixture), 3 (real top-40 and six-member team) |
| Oracle: our export equals `Teams.export`, `Teams.import` reads our text back, our parser reads `Teams.export` output | 4 |
| Nothing throws, arguments not modified, `Object.hasOwn` for id and label lookups | 1 and 2 (tests), Global Constraints |
| README and out-of-scope items | 4 and Global Constraints |

Type and name consistency was checked across tasks: `ParsedSet`, `PastedTeam`, `parsePaste`, `pasteToTeam`, `exportSet`, `exportSets`, `exportTeam`, `SetSnapshot`, `RosterSets`, `MatchTeam`, the note wording (`read "X" holding Y as Z`, `nickname "…"`, `gender F`, `Level N ignored (Champions battles are level 50)`, `empty move line skipped`, `unrecognized line: …`) and the problem wording (`no species found`, `could not read EVs "…"`, `unknown nature "…"`, `"x" already appears in block N of this paste; this one is ignored`).

One spec gap ruled in the plan header: `exportTeam` falls back to a species-only block when a saved set cannot be written.

---

## Later increments (outlined; each gets its own plan)

1. **Suggestion engine, stages 1 to 3** (see the parent spec); it should recompute its budget reserve from the pool, since `pointsNeededToFill` reserves for all open slots.
2. **App shell and hosting.** The UI calls `parsePaste` and shows `problems` and `notes` per block, calls `pasteToTeam` for a team import, and `exportTeam` for a copy button. It should surface `meta.warnings` (for example the three Ogerpon tera formes that can never have a legal set).
