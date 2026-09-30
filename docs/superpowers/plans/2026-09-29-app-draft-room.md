# App Shell, Increment 1: The Draft Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Draft Lab its first UI: set up a league (with a CSV price import), record a live draft, and see the engine's suggestions with reasons as sentences, autosaved in the browser with export, import and recovery.

**Architecture:** A Vite + React app under `src/app/`. One pure reducer holds the draft file; the draft state, the engine context and the suggestions are derived from it on each render. Storage and browser side effects (download, confirm) are passed into `<App>` so the UI flow tests run in jsdom against the real snapshot with fakes.

**Tech Stack:** React 19.3.0, Vite 8.3.1, TypeScript (strict, ESM), hand-written CSS; Vitest 5 with jsdom 30.1.1, React Testing Library 16.3.3 and user-event 14.6.7 for the UI tests.

**Spec:** `docs/superpowers/specs/2026-09-29-app-draft-room-design.md` (parents: `docs/superpowers/specs/2026-09-20-draft-lab-design.md` and the league/draft and engine specs in the same folder). Read the spec first; it is the binding authority for this plan.

## Global Constraints

- Scope: increment 1 only. Out of scope: the teambuilder, hosting, data refresh, several saved drafts, signal-weight controls, mobile-specific layouts, browser end-to-end tests, and any change to `src/domain/` or `src/engine/`.
- Plain React + Vite + TypeScript, hand-written CSS, no state library, no router, no component library. Dependencies are pinned exactly: `react` 19.3.0, `react-dom` 19.3.0 (dependencies); `vite` 8.3.1, `@vitejs/plugin-react` 6.1.1, `@types/react` 19.3.0, `@types/react-dom` 19.3.0, `@testing-library/react` 16.3.3, `@testing-library/user-event` 14.6.7, `@testing-library/dom` 10.4.2, `jsdom` 30.1.1 (devDependencies).
- Dependencies point one way: `src/app/` imports from `src/engine/` (its index only) and `src/domain/`; nothing imports from `src/app/`.
- Display names everywhere; species ids stay internal. Every sentence is exactly the spec's table text.
- The reducer never throws, never modifies its inputs and never stores an invalid file. Locked fields once a pick exists: `drafters`, `order`, `rounds`, `me`.
- Storage key `draftlab.draft.v1`. The save banner text is exactly "Changes aren't being saved in this browser — use Export."
- UI tests opt into jsdom with the first line `// @vitest-environment jsdom`; domain, engine and the app's pure tests stay in Node.
- Commits end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (copy it verbatim; never substitute another model name).

**Plan clarifications (rulings on gaps in the spec, made at plan time):**
1. **`noteText(note)` takes no `names`.** The spec lists `noteText(note, names)`, but no note mentions a Pokémon, move or ability, so the parameter would be unused.
2. **The reducer state's field is `errors`** (the spec writes `error: Problem[]`); it is a list, so the plural name is used.
3. **File layout.** The spec's component list (`LeagueForm`, `Header`, `SuggestionCard`) is realised as `setup/SetupView.tsx` (the league form, price import and table together), `room/DraftRoom.tsx` (the header and the three columns) and `room/Suggestions.tsx` (the panel with its cards). Two files the spec does not list: `src/app/Workspace.tsx` (owns the draft file: load, apply, save, banners, recovery, which view shows) and `src/app/browser.ts` (the `download` and `confirm` side effects, passed into `<App>` so tests can replace them). `src/app/test-support.ts` holds the test fakes.
4. **Import from the setup screen.** With no draft file, the setup screen also offers "Import a draft file", so a file exported on another device can be opened without first creating a league.
5. **The error boundary** offers "Download saved draft" (the raw stored text as `draftlab-backup.json`) instead of Export, because after a render error the in-memory state cannot be trusted; the stored text is the last good save.
6. **An unaffordable Pokémon cannot be chosen from the pick box** (its option is `aria-disabled` and Enter/click ignore it), so the domain's refusal message is shown for refusals the box cannot prevent; the flow test checks that choosing it records nothing.
7. **`@testing-library/dom` is installed explicitly**: it is a peer dependency of `@testing-library/react` 16 and npm does not add it by itself. `@testing-library/jest-dom` (optional in the spec) is not used.
8. **`src/app/vite-env.d.ts`** (`/// <reference types="vite/client" />`) is needed so `import './app.css'` typechecks.
9. **`realData()` reads the snapshot from `process.cwd()`**: under jsdom, `import.meta.url` is not a file URL.
10. **`chunkSizeWarningLimit: 1500`** in `vite.config.ts`: the snapshot is deliberately its own 1.3 MB chunk, and Vite's 500 kB warning would fire on every build.

## Pre-verification results (measured 2026-09-29 with the prototype of this plan's code)

The plan's code was built and run in full before this plan was written, and the plan was then replayed task by task in a clean checkout of c2c55d4 (each task's commands, edits and files applied exactly as written below): every task ends green, every prototype file is reproduced byte for byte, and the four mutation proofs in Tasks 1, 2 and 5 are each caught by exactly one failing test.

Unit test counts after Tasks 1 to 6: 657, 676, 676, 676, 693, 693 (baseline 633). Typecheck is clean after every task, and `npm run build` succeeds after Task 6. The 21 integration tests are unchanged.

- **Toolchain:** the pinned versions install on Node 24 with npm 11 (npm reports that some install scripts, esbuild's and sqlite3's, were not run; harmless: tests and the build work). Vitest 5 runs the jsdom files with React Testing Library; the first jsdom run in a fresh checkout takes about a minute (dependency warm-up), later runs about 2 s for a trivial file.
- **Typecheck:** adding `"DOM", "DOM.Iterable"` and `"jsx": "react-jsx"` to `tsconfig.json` keeps `npm run typecheck` clean for `src/`, `sync/` and the configs.
- **UI flow timings on the real snapshot:** `setup.flow.test.tsx` (3 tests) and `room.flow.test.tsx` (14 tests) take about 8 to 11 s per file; the whole unit suite about 15 s.
- **Build:** `npm run build` succeeds in about 1 to 4 s: the snapshot is its own chunk of 1343 kB (368 kB gzip), the app chunk 274 kB (86 kB gzip).

## Environment notes

- Windows + PowerShell. A fresh shell may not find `node`/`npm`. Start every PowerShell command with:
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User");`
- The repo path contains a space: quote it.
- Single test file: `npx vitest run <path>`. Whole unit suite: `npm test`. Types: `npm run typecheck`. Real-package tests (slow): `npm run test:integration`. The baseline before this plan is 633 unit tests and 21 integration tests, all passing.
- Work on branch `feat/app-draft-room` (already created; the spec is committed at c2c55d4).
- Every file block below is the complete file content: create the file, or replace the existing file entirely, with exactly that text. Edits to existing files other than whole-file blocks are exact find/replace pairs. The code typechecks under `strict`; if a line fails typecheck, report the exact TS error and apply the smallest fix that keeps the test's intent; do not silently rewrite a test.

---

## File Structure

```
Modify: package.json, package-lock.json   pinned dependencies (Task 1); dev/build/preview scripts (Task 6)
Modify: tsconfig.json                      DOM libs, react-jsx, vite.config.ts included
Modify: vitest.config.ts                   also runs src/**/*.test.tsx
Create: src/app/text/names.ts, names.test.ts        makeNames, ROLE_LABELS, COMBO_LABELS, joinList
Create: src/app/text/reasons.ts, reasons.test.ts    reasonText, noteText
Create: src/app/state/draft-store.ts, draft-store.test.ts   makeDraftReducer, DraftAction, DraftStoreState
Create: src/app/state/storage.ts, storage.test.ts   STORAGE_KEY, loadDraft, saveDraft, browserStorage
Create: src/app/data/snapshot.ts           AppData, loadAppData (dynamic import of the JSON)
Create: src/app/browser.ts                 BrowserActions, browserActions, exportFileName
Create: src/app/test-support.ts            realData, fakeStorage, fakeActions
Create: src/app/setup/PriceImport.tsx, PriceTable.tsx, SetupView.tsx
Create: src/app/room/PickEntry.tsx, PickLog.tsx, Rosters.tsx, Suggestions.tsx, DraftRoom.tsx
Create: src/app/Workspace.tsx, src/app/App.tsx
Create: src/app/setup.flow.test.tsx, src/app/room.flow.test.tsx
Create: index.html, vite.config.ts, src/app/main.tsx, src/app/app.css, src/app/vite-env.d.ts
Modify docs: docs/STATUS.md, README.md
```

Tasks 3 and 4 add React components whose behaviour is tested through the whole app in Task 5 (the flow tests need `App`, which needs both views). Their gate is the typecheck; their reviewers check them against the spec's Views section.

---

### Task 1: Toolchain and sentences

**Files:**
- Modify: `package.json`, `package-lock.json` (by `npm install`), `tsconfig.json`, `vitest.config.ts`
- Create: `src/app/text/names.ts`, `src/app/text/names.test.ts`, `src/app/text/reasons.ts`, `src/app/text/reasons.test.ts`

**Interfaces:**
- Consumes: from `src/engine` (index): `Reason`, `Note`, `RoleId`, `ComboId`, `ROLES`, `COMBOS`; from `src/domain`: `ID`, `Snapshot`; test helpers `speciesEntry`, `moveEntry` (`src/domain/test-support.ts`).
- Produces: `interface Names { species(id: ID): string; move(id: ID): string; types(id: ID): string[] }`; `makeNames(snapshot: Pick<Snapshot,'species'|'moves'>): Names`; `ROLE_LABELS: Readonly<Record<RoleId,string>>`; `COMBO_LABELS: Readonly<Record<ComboId,string>>`; `joinList(items: readonly string[], conjunction?: 'and'|'or'): string`; `reasonText(reason: Reason, names: Names): string`; `noteText(note: Note): string`.

- [ ] **Step 1: Install the pinned dependencies**

Run: `npm install --save-exact react@19.3.0 react-dom@19.3.0`
Run: `npm install --save-exact --save-dev vite@8.3.1 @vitejs/plugin-react@6.1.1 @types/react@19.3.0 @types/react-dom@19.3.0 @testing-library/react@16.3.3 @testing-library/user-event@14.6.7 @testing-library/dom@10.4.2 jsdom@30.1.1`
Expected: `package.json` gains exactly these entries (no `^`), and `package-lock.json` changes. Warnings about install scripts that were not run are harmless.

- [ ] **Step 2: Replace `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src", "sync", "vitest.config.ts", "vitest.integration.config.ts", "vite.config.ts"]
}
```

- [ ] **Step 3: Replace `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

// Unit tests run in Node; UI tests (src/app/**/*.test.tsx) opt into jsdom with a `// @vitest-environment jsdom` first line.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'sync/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
  },
});
```

Run: `npm run typecheck` then `npm test`
Expected: typecheck clean; 633 tests pass (nothing new yet).

- [ ] **Step 4: Write the tests: create `src/app/text/names.test.ts` and `src/app/text/reasons.test.ts`**

`reasons.test.ts` keys its samples by `Reason['kind']` and `Note['kind']` in `Record` types, so a new kind in the engine is a compile error here until it has a sentence.

```ts
import { describe, expect, it } from 'vitest';
import { moveEntry, speciesEntry } from '../../domain/test-support';
import { COMBOS, ROLES } from '../../engine';
import { COMBO_LABELS, ROLE_LABELS, joinList, makeNames } from './names';

const names = makeNames({
  species: { incineroar: speciesEntry('incineroar', 'Incineroar', { types: ['Fire', 'Dark'] }) },
  moves: { fakeout: moveEntry('fakeout', 'Fake Out') },
});

describe('makeNames', () => {
  it('gives display names and types from the snapshot', () => {
    expect(names.species('incineroar')).toBe('Incineroar');
    expect(names.move('fakeout')).toBe('Fake Out');
    expect(names.types('incineroar')).toEqual(['Fire', 'Dark']);
  });

  it('falls back to the id, and to no types, for something the snapshot does not have', () => {
    expect(names.species('missingno')).toBe('missingno');
    expect(names.move('gonemove')).toBe('gonemove');
    expect(names.types('missingno')).toEqual([]);
    // Prototype names are not species.
    expect(names.species('constructor')).toBe('constructor');
    expect(names.types('toString')).toEqual([]);
  });
});

describe('labels', () => {
  it('labels every role and every combo in the engine tables', () => {
    for (const role of ROLES) expect(ROLE_LABELS[role.id], role.id).toMatch(/\S/);
    for (const combo of COMBOS) expect(COMBO_LABELS[combo.id], combo.id).toMatch(/\S/);
    expect(Object.keys(ROLE_LABELS)).toHaveLength(ROLES.length);
    expect(Object.keys(COMBO_LABELS)).toHaveLength(COMBOS.length);
  });
});

describe('joinList', () => {
  it('joins zero, one, two and three items', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['A'])).toBe('A');
    expect(joinList(['A', 'B'])).toBe('A and B');
    expect(joinList(['A', 'B', 'C'])).toBe('A, B and C');
    expect(joinList(['A', 'B', 'C'], 'or')).toBe('A, B or C');
  });
});
```

```ts
import { describe, expect, it } from 'vitest';
import { moveEntry, speciesEntry } from '../../domain/test-support';
import type { Note, Reason } from '../../engine';
import { makeNames } from './names';
import { noteText, reasonText } from './reasons';

const names = makeNames({
  species: {
    incineroar: speciesEntry('incineroar', 'Incineroar'),
    kingambit: speciesEntry('kingambit', 'Kingambit'),
    pelipper: speciesEntry('pelipper', 'Pelipper'),
  },
  moves: { tailwind: moveEntry('tailwind', 'Tailwind'), fakeout: moveEntry('fakeout', 'Fake Out') },
});
const text = (reason: Reason) => reasonText(reason, names);

/**
 * One sample per reason kind and variant, with its exact sentence. Typed so that a new `Reason` kind is a compile error
 * here until it has a sample (the object must have every kind as a key).
 */
const REASONS: Record<Reason['kind'], Array<[Reason, string]>> = {
  'pairs-often-with': [[{ kind: 'pairs-often-with', with: 'incineroar', lift: 2.345 }, 'Paired with Incineroar 2.3× more often than expected on ladder.']],
  'pairs-rarely-with': [[{ kind: 'pairs-rarely-with', with: 'kingambit', lift: 0.44 }, 'Rarely paired with Kingambit (0.4× the expected rate).']],
  'lift-coverage': [[{ kind: 'lift-coverage', covered: 1, of: 2 }, 'Ladder pairing data covers 1 of your 2 Pokémon.']],
  'covers-weakness': [
    [{ kind: 'covers-weakness', type: 'Ground', by: 'resists', weakMembers: ['kingambit'] }, 'Resists Ground, which Kingambit is weak to.'],
    [
      { kind: 'covers-weakness', type: 'Ground', by: 'immune', weakMembers: ['incineroar', 'kingambit'] },
      'Immune to Ground by typing, which Incineroar and Kingambit are weak to.',
    ],
    [
      { kind: 'covers-weakness', type: 'Ground', by: 'ability', weakMembers: ['kingambit'], ability: 'Levitate' },
      'Immune to Ground through Levitate, which Kingambit is weak to.',
    ],
    [{ kind: 'covers-weakness', type: 'Water', by: 'resists', weakMembers: [] }, 'Resists Water.'],
  ],
  'adds-weakness': [
    [{ kind: 'adds-weakness', type: 'Ice', weakMembers: ['kingambit'] }, 'Also weak to Ice, like Kingambit.'],
    [{ kind: 'adds-weakness', type: 'Ice', weakMembers: [] }, 'Also weak to Ice.'],
  ],
  'adds-coverage': [[{ kind: 'adds-coverage', types: ['Fairy', 'Steel'] }, "Hits Fairy and Steel super effectively, which your roster can't yet."]],
  'fills-role': [
    [{ kind: 'fills-role', role: 'speedControl', source: 'runs', via: 'tailwind', from: 'ladder' }, 'Fills speed control: runs Tailwind.'],
    [{ kind: 'fills-role', role: 'speedControl', source: 'runs', via: 'tailwind', from: 'set' }, 'Fills speed control: runs Tailwind (from your set).'],
    [{ kind: 'fills-role', role: 'intimidate', source: 'ability', via: 'Intimidate', from: 'ladder' }, 'Fills Intimidate: its ability is Intimidate.'],
    [
      { kind: 'fills-role', role: 'fakeOut', source: 'can-learn', via: 'fakeout', from: 'ladder' },
      'Could fill Fake Out: it can learn Fake Out (no ladder data).',
    ],
  ],
  'completes-combo': [
    [{ kind: 'completes-combo', combo: 'rain', side: 'beneficiary', with: 'pelipper', from: 'ladder' }, 'Completes rain with Pelipper.'],
    [{ kind: 'completes-combo', combo: 'trickRoom', side: 'enabler', with: 'kingambit', from: 'species' }, 'Sets up Trick Room for Kingambit.'],
    [
      { kind: 'completes-combo', combo: 'rain', side: 'beneficiary', with: 'pelipper', from: 'set' },
      "Completes rain with Pelipper (Pelipper's half is from your set).",
    ],
  ],
  'low-usage': [[{ kind: 'low-usage', usage: 0.0123 }, 'Rarely used on ladder (1.2% of teams).']],
  'no-ladder-usage': [[{ kind: 'no-ladder-usage' }, 'No ladder usage data.']],
};

const NOTES: Record<Note['kind'], Array<[Note, string]>> = {
  'invalid-context': [[{ kind: 'invalid-context' }, 'Suggestions are unavailable (the draft data could not be read).']],
  'invalid-snapshot': [[{ kind: 'invalid-snapshot' }, 'Suggestions are unavailable (the draft data could not be read).']],
  'roster-full': [[{ kind: 'roster-full' }, 'Your roster is full.']],
  'empty-roster': [[{ kind: 'empty-roster' }, 'Suggestions start after your first pick.']],
  'cannot-fill-roster': [[{ kind: 'cannot-fill-roster', poolSize: 2, openSlots: 3 }, 'Only 2 Pokémon are left for your 3 open slots.']],
  'no-affordable-candidates': [[{ kind: 'no-affordable-candidates' }, 'Nothing left fits your remaining points.']],
  'no-usage-data': [[{ kind: 'no-usage-data' }, 'No ladder usage data is loaded, so pairing data is not used.']],
  'roster-lacks-roles': [
    [{ kind: 'roster-lacks-roles', roles: ['fakeOut', 'speedControl', 'redirection'] }, 'Your roster has no Fake Out, speed control or redirection yet.'],
    [{ kind: 'roster-lacks-roles', roles: ['screens'] }, 'Your roster has no screens yet.'],
  ],
  'unscored-candidates': [[{ kind: 'unscored-candidates', count: 4 }, '4 Pokémon could not be scored with the current settings.']],
};

describe('reasonText', () => {
  for (const [kind, samples] of Object.entries(REASONS)) {
    it(`writes a sentence for ${kind}`, () => {
      for (const [reason, sentence] of samples) expect(text(reason)).toBe(sentence);
    });
  }

  it('uses the id when a name is unknown', () => {
    expect(text({ kind: 'pairs-often-with', with: 'missingno', lift: 1.5 })).toBe('Paired with missingno 1.5× more often than expected on ladder.');
  });
});

describe('noteText', () => {
  for (const [kind, samples] of Object.entries(NOTES)) {
    it(`writes a sentence for ${kind}`, () => {
      for (const [note, sentence] of samples) expect(noteText(note)).toBe(sentence);
    });
  }
});
```

- [ ] **Step 5: Run the tests to see them fail**

Run: `npx vitest run src/app/text`
Expected: FAIL (`names.ts` and `reasons.ts` do not exist).

- [ ] **Step 6: Create `src/app/text/names.ts` and `src/app/text/reasons.ts`**

```ts
import type { ID } from '../../domain/id';
import type { Snapshot } from '../../domain/types';
import type { ComboId, RoleId } from '../../engine';

/** Display names from the snapshot. An id the snapshot does not have is shown as it is. */
export interface Names {
  species(id: ID): string;
  move(id: ID): string;
  types(id: ID): string[];
}

export function makeNames(snapshot: Pick<Snapshot, 'species' | 'moves'>): Names {
  return {
    species: (id) => (Object.hasOwn(snapshot.species, id) ? snapshot.species[id].name : id),
    move: (id) => (Object.hasOwn(snapshot.moves, id) ? snapshot.moves[id].name : id),
    types: (id) => (Object.hasOwn(snapshot.species, id) ? [...snapshot.species[id].types] : []),
  };
}

export const ROLE_LABELS: Readonly<Record<RoleId, string>> = {
  fakeOut: 'Fake Out',
  redirection: 'redirection',
  speedControl: 'speed control',
  intimidate: 'Intimidate',
  weatherTerrain: 'weather or terrain',
  pivot: 'pivoting',
  screens: 'screens',
  support: 'support moves',
  priority: 'priority moves',
  disruption: 'disruption',
};

export const COMBO_LABELS: Readonly<Record<ComboId, string>> = {
  trickRoom: 'Trick Room',
  redirectSetup: 'redirection and setup',
  rain: 'rain',
  sun: 'sun',
  sand: 'sand',
  snow: 'snow',
  electricTerrain: 'Electric Terrain',
  helpingHand: 'Helping Hand and a spread attack',
};

/** "A", "A and B", "A, B and C" (or "or" instead of "and"). An empty list gives "". */
export function joinList(items: readonly string[], conjunction: 'and' | 'or' = 'and'): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`;
}
```

```ts
import type { Note, Reason } from '../../engine';
import { COMBO_LABELS, ROLE_LABELS, joinList, type Names } from './names';

const times = (lift: number): string => `${lift.toFixed(1)}×`;
const percent = (share: number): string => `${(share * 100).toFixed(1)}%`;

/** ", which A is weak to" / ", which A and B are weak to"; nothing when no member is weak. */
function weakClause(members: readonly string[], names: Names): string {
  if (members.length === 0) return '';
  const who = joinList(members.map((id) => names.species(id)));
  return `, which ${who} ${members.length === 1 ? 'is' : 'are'} weak to`;
}

/** One English sentence for an engine reason. */
export function reasonText(reason: Reason, names: Names): string {
  switch (reason.kind) {
    case 'pairs-often-with':
      return `Paired with ${names.species(reason.with)} ${times(reason.lift)} more often than expected on ladder.`;
    case 'pairs-rarely-with':
      return `Rarely paired with ${names.species(reason.with)} (${times(reason.lift)} the expected rate).`;
    case 'lift-coverage':
      return `Ladder pairing data covers ${reason.covered} of your ${reason.of} Pokémon.`;
    case 'covers-weakness': {
      const clause = weakClause(reason.weakMembers, names);
      if (reason.by === 'resists') return `Resists ${reason.type}${clause}.`;
      if (reason.by === 'immune') return `Immune to ${reason.type} by typing${clause}.`;
      return `Immune to ${reason.type} through ${reason.ability ?? 'its ability'}${clause}.`;
    }
    case 'adds-weakness':
      return reason.weakMembers.length === 0
        ? `Also weak to ${reason.type}.`
        : `Also weak to ${reason.type}, like ${joinList(reason.weakMembers.map((id) => names.species(id)))}.`;
    case 'adds-coverage':
      return `Hits ${joinList(reason.types)} super effectively, which your roster can't yet.`;
    case 'fills-role': {
      const role = ROLE_LABELS[reason.role];
      if (reason.source === 'ability') return `Fills ${role}: its ability is ${reason.via}.`;
      if (reason.source === 'can-learn') return `Could fill ${role}: it can learn ${names.move(reason.via)} (no ladder data).`;
      return `Fills ${role}: runs ${names.move(reason.via)}${reason.from === 'set' ? ' (from your set)' : ''}.`;
    }
    case 'completes-combo': {
      const combo = COMBO_LABELS[reason.combo];
      const partner = names.species(reason.with);
      const suffix = reason.from === 'set' ? ` (${partner}'s half is from your set)` : '';
      return reason.side === 'beneficiary'
        ? `Completes ${combo} with ${partner}${suffix}.`
        : `Sets up ${combo} for ${partner}${suffix}.`;
    }
    case 'low-usage':
      return `Rarely used on ladder (${percent(reason.usage)} of teams).`;
    case 'no-ladder-usage':
      return 'No ladder usage data.';
    default: {
      const unknown: never = reason;
      return String((unknown as { kind: unknown }).kind);
    }
  }
}

/** One English sentence for an engine note. */
export function noteText(note: Note): string {
  switch (note.kind) {
    case 'invalid-context':
    case 'invalid-snapshot':
      return 'Suggestions are unavailable (the draft data could not be read).';
    case 'roster-full':
      return 'Your roster is full.';
    case 'empty-roster':
      return 'Suggestions start after your first pick.';
    case 'cannot-fill-roster':
      return `Only ${note.poolSize} Pokémon are left for your ${note.openSlots} open slots.`;
    case 'no-affordable-candidates':
      return 'Nothing left fits your remaining points.';
    case 'no-usage-data':
      return 'No ladder usage data is loaded, so pairing data is not used.';
    case 'roster-lacks-roles':
      return `Your roster has no ${joinList(note.roles.map((role) => ROLE_LABELS[role]), 'or')} yet.`;
    case 'unscored-candidates':
      return `${note.count} Pokémon could not be scored with the current settings.`;
    default: {
      const unknown: never = note;
      return String((unknown as { kind: unknown }).kind);
    }
  }
}
```

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npx vitest run src/app/text` then `npm test` then `npm run typecheck`
Expected: PASS; the whole suite then has 657 tests; typecheck clean.

Mutation proof (do it, then undo it): in `reasons.ts`, change `members.length === 1 ? 'is' : 'are'` to `'are'`; a `covers-weakness` test must fail. Restore the line.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/app/text
git commit -m "feat(app): add React, Vite and the test toolchain; engine reasons and notes as sentences" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The draft store and storage

**Files:**
- Create: `src/app/state/draft-store.ts`, `src/app/state/draft-store.test.ts`, `src/app/state/storage.ts`, `src/app/state/storage.test.ts`, `src/app/data/snapshot.ts`, `src/app/browser.ts`, `src/app/test-support.ts`

**Interfaces:**
- Consumes: from `src/domain`: `applyPick`, `checkPick`, `undoPick` (`draft.ts`); `DraftFile`, `parseDraftFile`, `serializeDraftFile` (`file.ts`); `validateLeague`, `LeagueConfig`, `LegalSpeciesSource` (`league.ts`); `Problem`; `Snapshot`, `SnapshotMeta` (`types.ts`); test helpers `leagueOf`, `snapshotOf`.
- Produces:
  - `interface DraftStoreState { file: DraftFile | null; errors: Problem[] }`; `type DraftAction = {type:'set-league';league:LeagueConfig} | {type:'pick';species:ID} | {type:'undo'} | {type:'replace';file:DraftFile} | {type:'clear'}`; `makeDraftReducer(snapshot: LegalSpeciesSource): (state: DraftStoreState, action: DraftAction) => DraftStoreState`.
  - `STORAGE_KEY = 'draftlab.draft.v1'`; `type DraftStorage = Pick<Storage,'getItem'|'setItem'|'removeItem'>`; `type LoadResult = {kind:'empty'} | {kind:'ok';file;warnings:Problem[]} | {kind:'corrupt';raw:string;errors:Problem[]} | {kind:'unavailable'}`; `loadDraft(storage, snapshot): LoadResult`; `saveDraft(storage, file: DraftFile | null): boolean`; `browserStorage(): DraftStorage`.
  - `interface AppData { snapshot: Snapshot; meta: SnapshotMeta }`; `loadAppData(): Promise<AppData>`.
  - `interface BrowserActions { download(filename: string, text: string): void; confirm(message: string): boolean }`; `browserActions: BrowserActions`; `exportFileName(leagueName: string): string` (`'Test League'` → `'test-league.draftlab.json'`).
  - Test fakes: `realData(): AppData`; `fakeStorage(initial?, { failRead?, failWrite? }?): { storage: DraftStorage; data: Map<string,string> }`; `fakeActions(answers?: boolean[]): { actions: BrowserActions; downloads: {filename:string;text:string}[]; questions: string[] }`.

- [ ] **Step 1: Write the tests: create `src/app/state/draft-store.test.ts` and `src/app/state/storage.test.ts`**

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
```

```ts
import { describe, expect, it } from 'vitest';
import { serializeDraftFile, type DraftFile } from '../../domain/file';
import { leagueOf, snapshotOf } from '../../domain/test-support';
import { fakeStorage } from '../test-support';
import { STORAGE_KEY, loadDraft, saveDraft } from './storage';

const snapshot = snapshotOf();
const file: DraftFile = { schemaVersion: 2, league: leagueOf(), picks: ['a', 'b'], sets: {}, teams: [] };

describe('loadDraft', () => {
  it('is empty when nothing is stored', () => {
    expect(loadDraft(fakeStorage().storage, snapshot)).toEqual({ kind: 'empty' });
  });

  it('reads a good file with its warnings', () => {
    const stored = serializeDraftFile({ ...file, league: leagueOf({ extraBans: ['e', 'zz'] }) });
    const result = loadDraft(fakeStorage({ [STORAGE_KEY]: stored }).storage, snapshot);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.file.picks).toEqual(['a', 'b']);
    expect(result.warnings.map((w) => w.path)).toEqual(['league.extraBans[1]']);
  });

  it('reports corrupt text, keeping the raw text for download', () => {
    for (const raw of ['{not json', JSON.stringify({ schemaVersion: 9 }), serializeDraftFile({ ...file, picks: ['a', 'a'] })]) {
      const result = loadDraft(fakeStorage({ [STORAGE_KEY]: raw }).storage, snapshot);
      expect(result.kind, raw).toBe('corrupt');
      if (result.kind !== 'corrupt') continue;
      expect(result.raw).toBe(raw);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('is unavailable when reading throws', () => {
    expect(loadDraft(fakeStorage({}, { failRead: true }).storage, snapshot)).toEqual({ kind: 'unavailable' });
  });
});

describe('saveDraft', () => {
  it('saves the serialized file and round-trips through loadDraft', () => {
    const { storage, data } = fakeStorage();
    expect(saveDraft(storage, file)).toBe(true);
    expect(data.get(STORAGE_KEY)).toBe(serializeDraftFile(file));
    const loaded = loadDraft(storage, snapshot);
    expect(loaded).toEqual({ kind: 'ok', file, warnings: [] });
  });

  it('removes the file for null', () => {
    const { storage, data } = fakeStorage({ [STORAGE_KEY]: 'x' });
    expect(saveDraft(storage, null)).toBe(true);
    expect(data.has(STORAGE_KEY)).toBe(false);
  });

  it('returns false instead of throwing when the storage refuses', () => {
    const { storage } = fakeStorage({}, { failWrite: true });
    expect(saveDraft(storage, file)).toBe(false);
    expect(saveDraft(storage, null)).toBe(false);
  });
});
```

- [ ] **Step 2: Create the test support, `src/app/test-support.ts`, and the two small modules it imports types from, `src/app/data/snapshot.ts` and `src/app/browser.ts`**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Snapshot, SnapshotMeta } from '../domain/types';
import type { BrowserActions } from './browser';
import type { AppData } from './data/snapshot';
import type { DraftStorage } from './state/storage';

let cached: AppData | null = null;

/**
 * The committed Reg M-B snapshot and meta, read once per test file. Read relative to the working directory (Vitest runs
 * from the repo root): under jsdom `import.meta.url` is a server path, not a file URL.
 */
export function realData(): AppData {
  if (cached === null) {
    const read = (name: string) => JSON.parse(readFileSync(join(process.cwd(), 'data', 'gen9championsvgc2026regmb', name), 'utf8'));
    cached = { snapshot: read('snapshot.json') as Snapshot, meta: read('meta.json') as SnapshotMeta };
  }
  return cached;
}

/** An in-memory Storage; `failRead` / `failWrite` make the matching calls throw like a blocked or full browser store. */
export function fakeStorage(initial: Record<string, string> = {}, options: { failRead?: boolean; failWrite?: boolean } = {}) {
  const data = new Map(Object.entries(initial));
  const storage: DraftStorage = {
    getItem: (key) => {
      if (options.failRead) throw new Error('blocked');
      return data.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (options.failWrite) throw new Error('QuotaExceededError');
      data.set(key, value);
    },
    removeItem: (key) => {
      if (options.failWrite) throw new Error('blocked');
      data.delete(key);
    },
  };
  return { storage, data };
}

/** Browser actions that record downloads and confirm questions; confirms answer from `answers` in order (default yes). */
export function fakeActions(answers: boolean[] = []) {
  const downloads: Array<{ filename: string; text: string }> = [];
  const questions: string[] = [];
  const actions: BrowserActions = {
    download: (filename, text) => {
      downloads.push({ filename, text });
    },
    confirm: (message) => {
      questions.push(message);
      return answers.length > 0 ? (answers.shift() as boolean) : true;
    },
  };
  return { actions, downloads, questions };
}
```

```ts
import type { Snapshot, SnapshotMeta } from '../../domain/types';

/** The data the app runs on: the one shipped format's snapshot and its metadata. */
export interface AppData {
  snapshot: Snapshot;
  meta: SnapshotMeta;
}

/** Loads the snapshot and its metadata as separate chunks, so the app shell renders before the 1.3 MB of data arrives. */
export async function loadAppData(): Promise<AppData> {
  const [snapshot, meta] = await Promise.all([
    import('../../../data/gen9championsvgc2026regmb/snapshot.json'),
    import('../../../data/gen9championsvgc2026regmb/meta.json'),
  ]);
  return { snapshot: snapshot.default as unknown as Snapshot, meta: meta.default as unknown as SnapshotMeta };
}
```

```ts
/** Side effects the app needs from the browser. Passed into <App> so tests can replace them. */
export interface BrowserActions {
  /** Offers `text` to the user as a file download. */
  download(filename: string, text: string): void;
  /** Asks a yes/no question; true for yes. */
  confirm(message: string): boolean;
}

export const browserActions: BrowserActions = {
  download(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
  confirm: (message) => window.confirm(message),
};

/** A file name made from a league name: letters, digits and dashes only. */
export function exportFileName(leagueName: string): string {
  const base = leagueName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'draft'}.draftlab.json`;
}
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/app/state`
Expected: FAIL (`draft-store.ts` and `storage.ts` do not exist).

- [ ] **Step 4: Create `src/app/state/draft-store.ts` and `src/app/state/storage.ts`**

```ts
import { applyPick, checkPick, undoPick } from '../../domain/draft';
import type { DraftFile } from '../../domain/file';
import type { ID } from '../../domain/id';
import { validateLeague, type LeagueConfig, type LegalSpeciesSource } from '../../domain/league';
import type { Problem } from '../../domain/problem';

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
  | { type: 'clear' };

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
 * file: a refused action returns the same file with `errors` set.
 */
export function makeDraftReducer(snapshot: LegalSpeciesSource) {
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
        if (state.file === null) return { file: null, errors: [{ path: 'picks', message: 'set up a league first' }] };
        const result = applyPick(state.file.league, state.file.picks, action.species, snapshot);
        if (!result.ok) return { file: state.file, errors: [result.problem] };
        return { file: { ...state.file, picks: result.picks }, errors: [] };
      }
      case 'undo':
        if (state.file === null || state.file.picks.length === 0) return { file: state.file, errors: [] };
        return { file: { ...state.file, picks: undoPick(state.file.picks) }, errors: [] };
      case 'replace':
        return { file: action.file, errors: [] };
      case 'clear':
        return { file: null, errors: [] };
      default:
        return state;
    }
  };
}
```

```ts
import { parseDraftFile, serializeDraftFile, type DraftFile } from '../../domain/file';
import type { LegalSpeciesSource } from '../../domain/league';
import type { Problem } from '../../domain/problem';

/** The browser storage key of the one draft file. */
export const STORAGE_KEY = 'draftlab.draft.v1';

/** The part of `Storage` the app uses. Any of the three may throw (private mode, quota, blocked storage). */
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'ok'; file: DraftFile; warnings: Problem[] }
  | { kind: 'corrupt'; raw: string; errors: Problem[] }
  | { kind: 'unavailable' };

/** Reads the stored draft file. Never throws. */
export function loadDraft(storage: DraftStorage, snapshot: LegalSpeciesSource): LoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { kind: 'unavailable' };
  }
  if (raw === null) return { kind: 'empty' };
  const parsed = parseDraftFile(raw, snapshot);
  return parsed.ok ? { kind: 'ok', file: parsed.file, warnings: parsed.warnings } : { kind: 'corrupt', raw, errors: parsed.errors };
}

/** Writes the draft file (or removes it for null). True when it was saved; false when the storage refused. */
export function saveDraft(storage: DraftStorage, file: DraftFile | null): boolean {
  try {
    if (file === null) storage.removeItem(STORAGE_KEY);
    else storage.setItem(STORAGE_KEY, serializeDraftFile(file));
    return true;
  } catch {
    return false;
  }
}

/** The browser's localStorage, or a storage whose every call throws when the browser refuses access to it. */
export function browserStorage(): DraftStorage {
  try {
    const storage = window.localStorage;
    if (storage) return storage;
  } catch {
    // Accessing localStorage itself can throw (blocked cookies, some private modes).
  }
  const refuse = (): never => {
    throw new Error('storage unavailable');
  };
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `npx vitest run src/app/state` then `npm test` then `npm run typecheck`
Expected: PASS; the whole suite then has 676 tests; typecheck clean.

Mutation proof (do it, then undo it): in `draft-store.ts`, delete the line `if (locked.length > 0) {` and its block (three lines); the locked-fields test must fail. Restore the lines.

- [ ] **Step 6: Commit**

```bash
git add src/app/state src/app/data src/app/browser.ts src/app/test-support.ts
git commit -m "feat(app): add the draft file reducer, browser storage and test fakes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The setup view

**Files:**
- Create: `src/app/setup/PriceImport.tsx`, `src/app/setup/PriceTable.tsx`, `src/app/setup/SetupView.tsx`

**Interfaces:**
- Consumes: `parsePriceCsv`, `PriceImport` type (`src/domain/prices.ts`); `validateLeague`, `DraftOrder`, `LeagueConfig`, `LegalSpeciesSource`; `DraftFile`; `Problem`; `ID`; `Snapshot`; `AppData` (Task 2).
- Produces: `SetupView(props: { data: AppData; file: DraftFile | null; errors: Problem[]; onSave(league: LeagueConfig): void; onCancel?: () => void; onNewLeague?: () => void; onImport?: (file: File) => void })`. Labels the flow tests rely on: "League name", "Drafters (one per line, in first-round order)", "Draft order", "Rounds (roster size)", "Your slot", "Budget (points per roster)", `Paste "name,points" lines…` (textarea), "Search", `Points for <name>`, `Ban <name>`, "Import a draft file"; buttons "Import", "Start draft" / "Save", "Back to the draft", "New league"; the heading "Set up your league"; the line "Format: <meta label>"; the import result in a `role="status"` region with "N prices imported.".

- [ ] **Step 1: Create the three components**

```tsx
import { useState } from 'react';
import type { ID } from '../../domain/id';
import type { LegalSpeciesSource } from '../../domain/league';
import { parsePriceCsv, type PriceImport as PriceImportResult } from '../../domain/prices';

interface Props {
  snapshot: LegalSpeciesSource;
  /** Receives the matched prices; the caller merges them into its table. */
  onImport(prices: Record<ID, number>): void;
}

/** Paste or upload a "name,points" list; shows what matched, what did not, and the problems by line. */
export function PriceImport({ snapshot, onImport }: Props) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<PriceImportResult | null>(null);

  const run = (input: string) => {
    const parsed = parsePriceCsv(input, snapshot);
    setResult(parsed);
    onImport(parsed.prices);
  };

  return (
    <section className="price-import" aria-labelledby="price-import-title">
      <h3 id="price-import-title">Import prices</h3>
      <label htmlFor="price-csv">Paste "name,points" lines (a header line is fine)</label>
      <textarea id="price-csv" rows={6} value={text} onChange={(event) => setText(event.target.value)} />
      <div className="row">
        <button type="button" onClick={() => run(text)} disabled={text.trim() === ''}>
          Import
        </button>
        <label className="file-button">
          Upload a file
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) run(await file.text());
              event.target.value = '';
            }}
          />
        </label>
      </div>
      {result && (
        <div className="import-result" role="status">
          <p>{Object.keys(result.prices).length} prices imported.</p>
          {result.unmatched.length > 0 && (
            <p>
              Not a legal Pokémon in this format ({result.unmatched.length}): {result.unmatched.join(', ')}
            </p>
          )}
          {result.problems.length > 0 && (
            <ul className="problems">
              {result.problems.map((problem) => (
                <li key={`${problem.path}:${problem.message}`}>
                  {problem.path}: {problem.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
```

```tsx
import { useMemo, useState } from 'react';
import type { ID } from '../../domain/id';
import type { Snapshot } from '../../domain/types';

interface Props {
  snapshot: Pick<Snapshot, 'species'>;
  prices: Record<ID, number>;
  bans: readonly ID[];
  onPrice(id: ID, price: number | null): void;
  onBan(id: ID, banned: boolean): void;
}

/** Every legal species with a price box (blank = no price = unavailable) and a Ban checkbox; searchable. */
export function PriceTable({ snapshot, prices, bans, onPrice, onBan }: Props) {
  const [search, setSearch] = useState('');
  const [pricedOnly, setPricedOnly] = useState(false);
  const all = useMemo(
    () => Object.values(snapshot.species).sort((a, b) => a.name.localeCompare(b.name)),
    [snapshot],
  );
  const needle = search.trim().toLowerCase();
  const rows = all.filter(
    (species) =>
      (needle === '' || species.name.toLowerCase().includes(needle)) &&
      (!pricedOnly || Object.hasOwn(prices, species.id)),
  );
  const pricedCount = all.filter((species) => Object.hasOwn(prices, species.id)).length;

  return (
    <section className="price-table" aria-labelledby="price-table-title">
      <h3 id="price-table-title">Prices and bans</h3>
      <div className="row">
        <label>
          Search <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label>
          <input type="checkbox" checked={pricedOnly} onChange={(event) => setPricedOnly(event.target.checked)} /> Priced only
        </label>
        <span>
          {pricedCount} of {all.length} priced
        </span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Pokémon</th>
              <th scope="col">Types</th>
              <th scope="col">Points</th>
              <th scope="col">Ban</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((species) => (
              <tr key={species.id}>
                <th scope="row">{species.name}</th>
                <td>{species.types.join(' / ')}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    aria-label={`Points for ${species.name}`}
                    value={Object.hasOwn(prices, species.id) ? prices[species.id] : ''}
                    onChange={(event) => onPrice(species.id, event.target.value === '' ? null : Number(event.target.value))}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Ban ${species.name}`}
                    checked={bans.includes(species.id)}
                    onChange={(event) => onBan(species.id, event.target.checked)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

```tsx
import { useState, type ReactNode } from 'react';
import type { DraftFile } from '../../domain/file';
import type { ID } from '../../domain/id';
import { validateLeague, type DraftOrder, type LeagueConfig } from '../../domain/league';
import type { Problem } from '../../domain/problem';
import type { AppData } from '../data/snapshot';
import { PriceImport } from './PriceImport';
import { PriceTable } from './PriceTable';

interface Props {
  data: AppData;
  file: DraftFile | null;
  /** The store's refusal of the last save, if any. */
  errors: Problem[];
  onSave(league: LeagueConfig): void;
  /** Back to the draft room without saving (only when a draft exists). */
  onCancel?(): void;
  /** Start over with a new league (only when a draft exists). */
  onNewLeague?(): void;
  /** Import a saved draft file (only when there is no draft yet). */
  onImport?(file: File): void;
}

const lines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

/** Problems whose path is `league.<field>` or below it. */
const problemsFor = (problems: readonly Problem[], field: string): Problem[] =>
  problems.filter((p) => p.path === `league.${field}` || p.path.startsWith(`league.${field}[`) || p.path.startsWith(`league.${field}.`));

function Field({ label, htmlFor, problems, children }: { label: string; htmlFor: string; problems: Problem[]; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {problems.map((p) => (
        <p key={`${p.path}:${p.message}`} className="field-error">
          {p.message}
        </p>
      ))}
    </div>
  );
}

/** League setup: the league fields, the price import and the price table. */
export function SetupView({ data, file, errors, onSave, onCancel, onNewLeague, onImport }: Props) {
  const existing = file?.league;
  const locked = (file?.picks.length ?? 0) > 0;
  const [name, setName] = useState(existing?.name ?? '');
  const [draftersText, setDraftersText] = useState(existing?.drafters.join('\n') ?? '');
  const [order, setOrder] = useState<DraftOrder>(existing?.order ?? 'snake');
  const [rounds, setRounds] = useState(String(existing?.rounds ?? 8));
  const [me, setMe] = useState(existing?.me ?? 0);
  const [budget, setBudget] = useState(String(existing?.budget ?? 100));
  const [prices, setPrices] = useState<Record<ID, number>>({ ...(existing?.prices ?? {}) });
  const [bans, setBans] = useState<ID[]>([...(existing?.extraBans ?? [])]);
  const [attempted, setAttempted] = useState(false);

  const drafters = lines(draftersText);
  const league: LeagueConfig = {
    name: name.trim(),
    formatId: data.snapshot.formatId,
    drafters,
    order,
    rounds: rounds.trim() === '' ? Number.NaN : Number(rounds),
    me: me < drafters.length ? me : 0,
    budget: budget.trim() === '' ? Number.NaN : Number(budget),
    prices,
    extraBans: bans,
  };
  const shown = attempted ? [...validateLeague(league, 'league'), ...errors] : errors;
  const other = shown.filter((p) => !['name', 'drafters', 'order', 'rounds', 'me', 'budget'].some((f) => problemsFor([p], f).length > 0));

  return (
    <main className="setup">
      <header className="setup-header">
        <h1>{existing ? 'League setup' : 'Set up your league'}</h1>
        <p>Format: {data.meta.label}</p>
      </header>

      {onImport && (
        <section aria-labelledby="import-title">
          <h2 id="import-title">Have a saved draft?</h2>
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
        </section>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setAttempted(true);
          if (validateLeague(league, 'league').length === 0) onSave(league);
        }}
      >
        <section aria-labelledby="league-title">
          <h2 id="league-title">League</h2>
          {locked && <p className="note">Drafters, order, rounds and your slot are locked once picks are recorded.</p>}
          <Field label="League name" htmlFor="league-name" problems={problemsFor(shown, 'name')}>
            <input id="league-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Drafters (one per line, in first-round order)" htmlFor="league-drafters" problems={problemsFor(shown, 'drafters')}>
            <textarea
              id="league-drafters"
              rows={6}
              value={draftersText}
              disabled={locked}
              onChange={(event) => setDraftersText(event.target.value)}
            />
          </Field>
          <Field label="Draft order" htmlFor="league-order" problems={problemsFor(shown, 'order')}>
            <select id="league-order" value={order} disabled={locked} onChange={(event) => setOrder(event.target.value as DraftOrder)}>
              <option value="snake">Snake</option>
              <option value="linear">Linear</option>
            </select>
          </Field>
          <Field label="Rounds (roster size)" htmlFor="league-rounds" problems={problemsFor(shown, 'rounds')}>
            <input id="league-rounds" type="number" min={1} max={30} value={rounds} disabled={locked} onChange={(event) => setRounds(event.target.value)} />
          </Field>
          <Field label="Your slot" htmlFor="league-me" problems={problemsFor(shown, 'me')}>
            <select id="league-me" value={league.me} disabled={locked || drafters.length === 0} onChange={(event) => setMe(Number(event.target.value))}>
              {drafters.map((drafter, i) => (
                <option key={`${i}:${drafter}`} value={i}>
                  {drafter}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Budget (points per roster)" htmlFor="league-budget" problems={problemsFor(shown, 'budget')}>
            <input id="league-budget" type="number" min={1} value={budget} onChange={(event) => setBudget(event.target.value)} />
          </Field>
        </section>

        <PriceImport snapshot={data.snapshot} onImport={(imported) => setPrices((current) => ({ ...current, ...imported }))} />
        <PriceTable
          snapshot={data.snapshot}
          prices={prices}
          bans={bans}
          onPrice={(id, price) =>
            setPrices((current) => {
              const next = { ...current };
              if (price === null) delete next[id];
              else next[id] = price;
              return next;
            })
          }
          onBan={(id, banned) => setBans((current) => (banned ? [...current.filter((b) => b !== id), id] : current.filter((b) => b !== id)))}
        />

        {other.length > 0 && (
          <ul className="problems" role="alert">
            {other.map((p) => (
              <li key={`${p.path}:${p.message}`}>{p.message}</li>
            ))}
          </ul>
        )}
        <div className="row actions">
          <button type="submit">{existing ? 'Save' : 'Start draft'}</button>
          {onCancel && (
            <button type="button" onClick={onCancel}>
              Back to the draft
            </button>
          )}
          {onNewLeague && (
            <button type="button" className="danger" onClick={onNewLeague}>
              New league
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck and run the suite**

Run: `npm run typecheck` then `npm test`
Expected: typecheck clean; the whole suite then has 676 tests (these components are exercised by the flow tests in Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/app/setup
git commit -m "feat(app): add the league setup view with CSV price import and the price table" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The draft room view

**Files:**
- Create: `src/app/room/PickEntry.tsx`, `src/app/room/PickLog.tsx`, `src/app/room/Rosters.tsx`, `src/app/room/Suggestions.tsx`, `src/app/room/DraftRoom.tsx`

**Interfaces:**
- Consumes: `deriveDraft`, `DraftState` (`src/domain/derive.ts`); `contextFor`, `suggest`, `SignalName`, `SuggestResult`, `Suggestion` (`src/engine`); `Names`, `reasonText`, `noteText` (Task 1); `AppData` (Task 2).
- Produces: `DraftRoom(props: { data: AppData; file: DraftFile; names: Names; errors: Problem[]; onPick(species: ID): void; onUndo(): void; onExport(): void; onImport(file: File): void; onSetup(): void })`; `type UsageFilter = 'all' | 'niche' | 'staples'`; `filterOptions(filter)` → `{}` / `{ maxUsage: 0.03 }` / `{ minUsage: 0.05 }`. Texts the flow tests rely on: the status line "Pick N of T · Round R · X is on the clock" / "… · You are on the clock" / "Draft complete"; the combobox "Pick for X (N points left)" with options showing "(costs N, has M)" when unaffordable; buttons "Undo last pick", "Export", "Setup", `Pick <name>`; "Import" file input; roster articles labelled "X's roster".

- [ ] **Step 1: Create the five components**

```tsx
import { useId, useState } from 'react';
import type { DraftState } from '../../domain/derive';
import type { LeagueConfig } from '../../domain/league';
import type { Names } from '../text/names';

interface Props {
  league: LeagueConfig;
  draft: DraftState;
  names: Names;
  onPick(species: string): void;
}

const MAX_OPTIONS = 8;

/**
 * Records the next pick for whoever is on the clock: a combobox over the pool by display name. Species the
 * on-the-clock drafter cannot afford are listed but cannot be chosen, with "costs N, has M".
 */
export function PickEntry({ league, draft, names, onPick }: Props) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const clock = draft.onTheClock;

  if (clock === null) {
    return (
      <section className="pick-entry" aria-labelledby="pick-entry-title">
        <h2 id="pick-entry-title">Record a pick</h2>
        <p>The draft is complete.</p>
      </section>
    );
  }

  const remaining = draft.drafters[clock.drafter].remaining;
  const needle = query.trim().toLowerCase();
  const options =
    needle === ''
      ? []
      : draft.pool
          .filter((id) => names.species(id).toLowerCase().includes(needle))
          .sort((a, b) => names.species(a).localeCompare(names.species(b)))
          .slice(0, MAX_OPTIONS)
          .map((id) => ({ id, price: league.prices[id], affordable: league.prices[id] <= remaining }));
  const current = Math.min(active, Math.max(options.length - 1, 0));

  const choose = (index: number) => {
    const option = options[index];
    if (!option || !option.affordable) return;
    onPick(option.id);
    setQuery('');
    setActive(0);
  };

  return (
    <section className="pick-entry" aria-labelledby="pick-entry-title">
      <h2 id="pick-entry-title">Record a pick</h2>
      <label htmlFor={`${listId}-input`}>
        Pick for {league.drafters[clock.drafter]} ({remaining} points left)
      </label>
      <input
        id={`${listId}-input`}
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={options.length > 0 ? `${listId}-${current}` : undefined}
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive(Math.min(current + 1, options.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(Math.max(current - 1, 0));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            choose(current);
          } else if (event.key === 'Escape') {
            setQuery('');
          }
        }}
      />
      {options.length > 0 && (
        <ul id={listId} role="listbox" className="options">
          {options.map((option, index) => (
            <li
              key={option.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === current}
              aria-disabled={!option.affordable}
              className={option.affordable ? '' : 'unaffordable'}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              {names.species(option.id)} — {option.price} pts
              {!option.affordable && ` (costs ${option.price}, has ${remaining})`}
            </li>
          ))}
        </ul>
      )}
      {needle !== '' && options.length === 0 && <p>No available Pokémon matches "{query}".</p>}
    </section>
  );
}
```

```tsx
import type { DraftState } from '../../domain/derive';
import type { Names } from '../text/names';

/** Every recorded pick, newest first. */
export function PickLog({ draft, names }: { draft: DraftState; names: Names }) {
  return (
    <section className="pick-log" aria-labelledby="pick-log-title">
      <h2 id="pick-log-title">Picks</h2>
      {draft.picks.length === 0 ? (
        <p>No picks yet.</p>
      ) : (
        <ol reversed>
          {[...draft.picks].reverse().map((pick) => (
            <li key={pick.number}>
              <span className="pick-number">#{pick.number}</span> R{pick.round} · {draft.drafters[pick.drafter].name} —{' '}
              {names.species(pick.species)} ({pick.price})
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
```

```tsx
import type { DraftState } from '../../domain/derive';
import type { LeagueConfig } from '../../domain/league';
import type { Names } from '../text/names';

/** Every drafter's roster, points left and open slots; yours is marked. */
export function Rosters({ league, draft, names }: { league: LeagueConfig; draft: DraftState; names: Names }) {
  return (
    <section className="rosters" aria-labelledby="rosters-title">
      <h2 id="rosters-title">Rosters</h2>
      {draft.drafters.map((drafter, index) => (
        <article key={drafter.name} className={index === league.me ? 'roster mine' : 'roster'} aria-label={`${drafter.name}'s roster`}>
          <h3>
            {drafter.name}
            {index === league.me && ' (you)'}
          </h3>
          <p>
            {drafter.remaining} of {league.budget} points left · {drafter.openSlots} open {drafter.openSlots === 1 ? 'slot' : 'slots'}
          </p>
          {drafter.cannotFillRoster && drafter.openSlots > 0 && <p className="warning">Can't fill the roster with the points left.</p>}
          <ul>
            {drafter.roster.map((id) => (
              <li key={id}>
                {names.species(id)} ({league.prices[id] ?? 0})
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
```

```tsx
import type { SignalName, SuggestResult, Suggestion } from '../../engine';
import type { Names } from '../text/names';
import { noteText, reasonText } from '../text/reasons';

export type UsageFilter = 'all' | 'niche' | 'staples';

/** The suggest() options for a filter: niche is at most 3% usage, staples at least 5%. */
export function filterOptions(filter: UsageFilter): { maxUsage?: number; minUsage?: number } {
  if (filter === 'niche') return { maxUsage: 0.03 };
  if (filter === 'staples') return { minUsage: 0.05 };
  return {};
}

const SIGNAL_LABELS: Record<SignalName, string> = {
  usageLift: 'Ladder pairing',
  typeSynergy: 'Type synergy',
  roleFit: 'Roles',
  comboFit: 'Combos',
};

const pct = (value: number): string => `${Math.round(value * 100)}%`;

function SuggestionCard({ suggestion, names, onPick }: { suggestion: Suggestion; names: Names; onPick?(): void }) {
  const name = names.species(suggestion.species);
  return (
    <li className="card">
      <div className="card-head">
        <h3>{name}</h3>
        <span className="types">{names.types(suggestion.species).join(' / ')}</span>
        <span className="price">{suggestion.price} pts</span>
      </div>
      <label className="fit">
        Relative fit <meter min={0} max={1} value={suggestion.score} /> {pct(suggestion.score)}
      </label>
      <ul className="reasons">
        {suggestion.reasons.map((reason, i) => (
          <li key={i}>{reasonText(reason, names)}</li>
        ))}
      </ul>
      <details>
        <summary>Signal breakdown</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Signal</th>
              <th scope="col">Score</th>
              <th scope="col">Rank</th>
              <th scope="col">Weight</th>
            </tr>
          </thead>
          <tbody>
            {suggestion.signals.map((signal) => (
              <tr key={signal.signal}>
                <th scope="row">{SIGNAL_LABELS[signal.signal]}</th>
                <td>{signal.score === null ? 'no data' : pct(signal.score)}</td>
                <td>{pct(signal.rank)}</td>
                <td>{pct(signal.weight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {onPick && (
        <button type="button" onClick={onPick}>
          Pick {name}
        </button>
      )}
    </li>
  );
}

interface Props {
  result: SuggestResult;
  names: Names;
  filter: UsageFilter;
  limit: number;
  onFilter(filter: UsageFilter): void;
  onLimit(limit: number): void;
  /** Present only when you are on the clock. */
  onPick?(species: string): void;
}

/** Suggestions for your next pick: the engine's notes as sentences, then one card per suggestion. */
export function Suggestions({ result, names, filter, limit, onFilter, onLimit, onPick }: Props) {
  return (
    <section className="suggestions" aria-labelledby="suggestions-title">
      <h2 id="suggestions-title">Suggestions for you</h2>
      <div className="row">
        <label>
          Show{' '}
          <select value={filter} onChange={(event) => onFilter(event.target.value as UsageFilter)}>
            <option value="all">All</option>
            <option value="niche">Niche (under 3% usage)</option>
            <option value="staples">Ladder staples (5% and up)</option>
          </select>
        </label>
        <label>
          Count{' '}
          <select value={limit} onChange={(event) => onLimit(Number(event.target.value))}>
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {result.notes.length > 0 && (
        <ul className="notes">
          {result.notes.map((note, i) => (
            <li key={i}>{noteText(note)}</li>
          ))}
        </ul>
      )}
      <ol className="cards">
        {result.suggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.species}
            suggestion={suggestion}
            names={names}
            onPick={onPick ? () => onPick(suggestion.species) : undefined}
          />
        ))}
      </ol>
    </section>
  );
}
```

```tsx
import { useMemo, useState } from 'react';
import { deriveDraft } from '../../domain/derive';
import type { DraftFile } from '../../domain/file';
import type { Problem } from '../../domain/problem';
import { contextFor, suggest } from '../../engine';
import type { AppData } from '../data/snapshot';
import type { Names } from '../text/names';
import { PickEntry } from './PickEntry';
import { PickLog } from './PickLog';
import { Rosters } from './Rosters';
import { Suggestions, filterOptions, type UsageFilter } from './Suggestions';

interface Props {
  data: AppData;
  file: DraftFile;
  names: Names;
  /** The store's refusal of the last action, if any. */
  errors: Problem[];
  onPick(species: string): void;
  onUndo(): void;
  onExport(): void;
  onImport(file: File): void;
  onSetup(): void;
}

/** The live draft: header, then record-a-pick and the log, suggestions for you, and every roster. */
export function DraftRoom({ data, file, names, errors, onPick, onUndo, onExport, onImport, onSetup }: Props) {
  const [filter, setFilter] = useState<UsageFilter>('all');
  const [limit, setLimit] = useState(20);
  const { league } = file;
  const draft = useMemo(() => deriveDraft(league, file.picks, data.snapshot), [league, file.picks, data.snapshot]);
  const result = useMemo(() => {
    const context = contextFor(league, draft, league.me, file.sets);
    return context === null
      ? { suggestions: [], considered: 0, notes: [{ kind: 'invalid-context' as const }] }
      : suggest(context, data.snapshot, { limit, ...filterOptions(filter) });
  }, [league, draft, file.sets, data.snapshot, limit, filter]);

  const total = league.drafters.length * league.rounds;
  const clock = draft.onTheClock;
  const myTurn = clock !== null && clock.drafter === league.me;

  return (
    <div className="room">
      <header className="room-header">
        <h1>{league.name}</h1>
        <p aria-live="polite" className="status">
          {clock === null
            ? 'Draft complete'
            : `Pick ${clock.number} of ${total} · Round ${clock.round} · ${myTurn ? 'You are' : `${league.drafters[clock.drafter]} is`} on the clock`}
        </p>
        <div className="row">
          <button type="button" onClick={onUndo} disabled={file.picks.length === 0}>
            Undo last pick
          </button>
          <button type="button" onClick={onExport}>
            Export
          </button>
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
          <button type="button" onClick={onSetup}>
            Setup
          </button>
        </div>
      </header>
      {errors.length > 0 && (
        <div className="refusal" role="alert">
          {errors.map((p) => (
            <p key={`${p.path}:${p.message}`}>{p.message}</p>
          ))}
        </div>
      )}
      <div className="columns">
        <div className="column">
          <PickEntry league={league} draft={draft} names={names} onPick={onPick} />
          <PickLog draft={draft} names={names} />
        </div>
        <div className="column">
          <Suggestions
            result={result}
            names={names}
            filter={filter}
            limit={limit}
            onFilter={setFilter}
            onLimit={setLimit}
            onPick={myTurn ? onPick : undefined}
          />
        </div>
        <div className="column">
          <Rosters league={league} draft={draft} names={names} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and run the suite**

Run: `npm run typecheck` then `npm test`
Expected: typecheck clean; the whole suite then has 676 tests (these components are exercised by the flow tests in Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/app/room
git commit -m "feat(app): add the draft room: pick entry, pick log, suggestions and rosters" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The app, autosave, import and recovery, with the UI flow tests

**Files:**
- Create: `src/app/setup.flow.test.tsx`, `src/app/room.flow.test.tsx`, `src/app/Workspace.tsx`, `src/app/App.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1 to 4.
- Produces: `App(props: { load?: () => Promise<AppData>; storage?: DraftStorage; actions?: BrowserActions })` (defaults: `loadAppData`, `browserStorage()`, `browserActions`); `Workspace(props: { data: AppData; storage: DraftStorage; actions: BrowserActions })`.

- [ ] **Step 1: Write the flow tests: create `src/app/setup.flow.test.tsx` and `src/app/room.flow.test.tsx`**

Both run in jsdom on the real snapshot, with `fakeStorage` and `fakeActions` in place of the browser. They take about 8 to 11 s per file (the first jsdom run in a fresh checkout takes about a minute longer).

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { parseDraftFile, serializeDraftFile, type DraftFile } from '../domain/file';
import { App } from './App';
import { STORAGE_KEY } from './state/storage';
import { fakeActions, fakeStorage, realData } from './test-support';

afterEach(cleanup);

const data = realData();
const load = async () => data;

const CSV = ['Pokemon,Points', 'Incineroar,20', 'Kingambit,18', 'Garchomp,16', 'Torkoal,4', 'Missingno,5', 'Venusaur,four'].join('\n');

describe('setting up a league', () => {
  it('imports prices from a pasted CSV, fixes one by hand, and starts the draft', async () => {
    const user = userEvent.setup();
    const { storage, data: stored } = fakeStorage();
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);

    expect(await screen.findByRole('heading', { name: 'Set up your league' })).toBeTruthy();
    expect(screen.getByText('Format: Champions VGC 2026 Reg M-B')).toBeTruthy();

    // CSV import: 4 matched, Missingno unmatched, Venusaur's points are not a number.
    await user.click(screen.getByLabelText(/Paste "name,points" lines/));
    await user.paste(CSV);
    await user.click(screen.getByRole('button', { name: 'Import' }));
    const result = screen.getByRole('status');
    expect(within(result).getByText('4 prices imported.')).toBeTruthy();
    expect(within(result).getByText(/Missingno/)).toBeTruthy();
    expect(within(result).getByText('line 7: "four" is not a whole number of points')).toBeTruthy();

    // Fix Torkoal's price in the table.
    await user.type(screen.getByLabelText('Search'), 'Torkoal');
    const torkoal = screen.getByLabelText('Points for Torkoal');
    expect((torkoal as HTMLInputElement).value).toBe('4');
    await user.clear(torkoal);
    await user.type(torkoal, '7');

    await user.type(screen.getByLabelText('League name'), 'Test League');
    await user.type(screen.getByLabelText(/Drafters/), 'Ana{Enter}Ben{Enter}Cy');
    await user.clear(screen.getByLabelText('Rounds (roster size)'));
    await user.type(screen.getByLabelText('Rounds (roster size)'), '2');
    await user.selectOptions(screen.getByLabelText('Your slot'), 'Ben');
    await user.clear(screen.getByLabelText('Budget (points per roster)'));
    await user.type(screen.getByLabelText('Budget (points per roster)'), '50');
    await user.click(screen.getByRole('button', { name: 'Start draft' }));

    expect(await screen.findByText('Pick 1 of 6 · Round 1 · Ana is on the clock')).toBeTruthy();
    const saved = parseDraftFile(stored.get(STORAGE_KEY) ?? '', data.snapshot);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.file.league).toMatchObject({ name: 'Test League', drafters: ['Ana', 'Ben', 'Cy'], rounds: 2, me: 1, budget: 50 });
    expect(saved.file.league.prices).toEqual({ incineroar: 20, kingambit: 18, garchomp: 16, torkoal: 7 });
  });

  it('shows what is wrong with the form instead of starting the draft', async () => {
    const user = userEvent.setup();
    const { storage, data: stored } = fakeStorage();
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    await screen.findByRole('heading', { name: 'Set up your league' });

    await user.type(screen.getByLabelText(/Drafters/), 'Ana{Enter}ana');
    await user.click(screen.getByRole('button', { name: 'Start draft' }));

    expect(screen.getByText('name is required')).toBeTruthy();
    expect(screen.getByText('duplicate name "ana" (same as drafters[0])')).toBeTruthy();
    expect(screen.queryByText(/on the clock/)).toBeNull();
    expect(stored.has(STORAGE_KEY)).toBe(false);
  });

  it('imports a saved draft file from the setup screen', async () => {
    const user = userEvent.setup();
    const file: DraftFile = {
      schemaVersion: 2,
      league: { name: 'Saved', formatId: data.snapshot.formatId, drafters: ['Ana', 'Ben'], order: 'snake', rounds: 1, me: 0, budget: 30, prices: { incineroar: 20 }, extraBans: [] },
      picks: ['incineroar'],
      sets: {},
      teams: [],
    };
    render(<App load={load} storage={fakeStorage().storage} actions={fakeActions().actions} />);
    await screen.findByRole('heading', { name: 'Set up your league' });
    await user.upload(screen.getByLabelText('Import a draft file'), new File([serializeDraftFile(file)], 'saved.json', { type: 'application/json' }));
    expect(await screen.findByText('Pick 2 of 2 · Round 1 · Ben is on the clock')).toBeTruthy();
  });
});
```

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { parseDraftFile, serializeDraftFile, type DraftFile } from '../domain/file';
import { App } from './App';
import { STORAGE_KEY } from './state/storage';
import { fakeActions, fakeStorage, realData } from './test-support';

afterEach(cleanup);

const data = realData();
const load = async () => data;

/** 3 drafters (Ana, Ben = you, Cy), snake, 2 rounds, 50 points; ten priced Pokémon. Pick order: Ana, Ben, Cy, Cy, Ben, Ana. */
const leagueFile = (picks: string[] = []): DraftFile => ({
  schemaVersion: 2,
  league: {
    name: 'Test League',
    formatId: data.snapshot.formatId,
    drafters: ['Ana', 'Ben', 'Cy'],
    order: 'snake',
    rounds: 2,
    me: 1,
    budget: 50,
    prices: {
      incineroar: 20,
      kingambit: 18,
      garchomp: 16,
      sneasler: 12,
      whimsicott: 10,
      rotomwash: 9,
      pelipper: 8,
      swampertmega: 6,
      torkoal: 4,
      venusaur: 4,
    },
    extraBans: [],
  },
  picks,
  sets: {},
  teams: [],
});
const stored = (file: DraftFile) => ({ [STORAGE_KEY]: serializeDraftFile(file) });

/** Types into the pick box and presses Enter on the first option. */
async function recordPick(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByRole('combobox', { name: /^Pick for / }), text);
  await user.keyboard('{Enter}');
}

const picksIn = (storage: Map<string, string>): string[] => {
  const parsed = parseDraftFile(storage.get(STORAGE_KEY) ?? '', data.snapshot);
  return parsed.ok ? parsed.file.picks : ['<unreadable>'];
};

describe('recording picks', () => {
  it('records picks for whoever is on the clock, shows them in the log and the rosters, and saves each one', async () => {
    const user = userEvent.setup();
    const { storage, data: saved } = fakeStorage(stored(leagueFile()));
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    expect(await screen.findByText('Pick 1 of 6 · Round 1 · Ana is on the clock')).toBeTruthy();

    await recordPick(user, 'Incin');
    expect(screen.getByText('Pick 2 of 6 · Round 1 · You are on the clock')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Picks' })).getByText(/Ana — Incineroar \(20\)/)).toBeTruthy();
    expect(within(screen.getByRole('article', { name: "Ana's roster" })).getByText('30 of 50 points left · 1 open slot')).toBeTruthy();
    expect(picksIn(saved)).toEqual(['incineroar']);

    await recordPick(user, 'Kinga');
    await recordPick(user, 'Garch');
    expect(picksIn(saved)).toEqual(['incineroar', 'kingambit', 'garchomp']);
    expect(screen.getByText('Pick 4 of 6 · Round 2 · Cy is on the clock')).toBeTruthy();
  });

  it('greys out and refuses a Pokémon the on-the-clock drafter cannot afford', async () => {
    const user = userEvent.setup();
    // A 1-round league with a 10-point budget: Ana cannot afford Incineroar (20).
    const file = leagueFile();
    file.league = { ...file.league, rounds: 1, budget: 10 };
    const { storage, data: saved } = fakeStorage(stored(file));
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    await screen.findByText('Pick 1 of 3 · Round 1 · Ana is on the clock');
    await recordPick(user, 'Incin');
    const option = within(screen.getByRole('listbox')).getByRole('option');
    expect(option.getAttribute('aria-disabled')).toBe('true');
    expect(option.textContent).toBe('Incineroar — 20 pts (costs 20, has 10)');
    expect(screen.getByText('Pick 1 of 3 · Round 1 · Ana is on the clock')).toBeTruthy();
    expect(saved.get(STORAGE_KEY)).toBe(serializeDraftFile(file));
  });

  it('undoes the last pick', async () => {
    const user = userEvent.setup();
    const { storage, data: saved } = fakeStorage(stored(leagueFile(['incineroar', 'kingambit'])));
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    await screen.findByText('Pick 3 of 6 · Round 1 · Cy is on the clock');
    await user.click(screen.getByRole('button', { name: 'Undo last pick' }));
    expect(screen.getByText('Pick 2 of 6 · Round 1 · You are on the clock')).toBeTruthy();
    expect(picksIn(saved)).toEqual(['incineroar']);
  });

  it('restores the draft from storage when the app is opened again', async () => {
    const { storage } = fakeStorage(stored(leagueFile()));
    const first = render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    await screen.findByText('Pick 1 of 6 · Round 1 · Ana is on the clock');
    await recordPick(userEvent.setup(), 'Incin');
    await screen.findByText('Pick 2 of 6 · Round 1 · You are on the clock');
    first.unmount();
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    expect(await screen.findByText('Pick 2 of 6 · Round 1 · You are on the clock')).toBeTruthy();
  });
});

describe('suggestions', () => {
  it('asks for a first pick, then shows cards with reasons as sentences and picks from a card on your turn', async () => {
    const user = userEvent.setup();
    // Ana took Incineroar: Ben (you) is on the clock with an empty roster.
    const { storage, data: saved } = fakeStorage(stored(leagueFile(['incineroar'])));
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    const panel = await screen.findByRole('region', { name: 'Suggestions for you' });
    expect(within(panel).getByText('Suggestions start after your first pick.')).toBeTruthy();

    await recordPick(user, 'Kinga'); // Ben
    await recordPick(user, 'Garch'); // Cy
    await recordPick(user, 'Snea'); // Cy; now Ben (you) is on the clock again
    expect(screen.getByText('Pick 5 of 6 · Round 2 · You are on the clock')).toBeTruthy();

    const cards = within(panel).getAllByRole('listitem').filter((item) => item.classList.contains('card'));
    expect(cards.length).toBeGreaterThanOrEqual(3);
    // Every reason is an English sentence, and the roster note is there.
    for (const card of cards) {
      for (const reason of within(card).getAllByRole('listitem')) expect(reason.textContent).toMatch(/^[A-Z].*\.$/);
    }
    expect(within(panel).getByText(/^Your roster has no .* yet\.$/)).toBeTruthy();

    const firstName = within(cards[0]).getByRole('heading').textContent ?? '';
    await user.click(within(cards[0]).getByRole('button', { name: `Pick ${firstName}` }));
    expect(screen.getByText('Pick 6 of 6 · Round 2 · Ana is on the clock')).toBeTruthy();
    const picks = picksIn(saved);
    expect(picks).toHaveLength(5);
    expect(data.snapshot.species[picks[4]].name).toBe(firstName);
    // Not your turn: no Pick buttons.
    expect(within(panel).queryAllByRole('button', { name: /^Pick / })).toEqual([]);
  });

  it('filters by usage', async () => {
    const user = userEvent.setup();
    const { storage } = fakeStorage(stored(leagueFile(['incineroar', 'kingambit'])));
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    const panel = await screen.findByRole('region', { name: 'Suggestions for you' });
    const names = () => within(panel).queryAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    const all = names();
    await user.selectOptions(within(panel).getByLabelText(/Show/), 'staples');
    const staples = names();
    expect(staples.length).toBeGreaterThan(0);
    expect(staples.length).toBeLessThan(all.length);
    for (const name of staples) expect(all).toContain(name);
  });
});

describe('export, import and recovery', () => {
  it('exports the draft file and imports it back into a fresh browser', async () => {
    const user = userEvent.setup();
    const { actions, downloads } = fakeActions();
    render(<App load={load} storage={fakeStorage(stored(leagueFile(['incineroar', 'kingambit']))).storage} actions={actions} />);
    await screen.findByText('Pick 3 of 6 · Round 1 · Cy is on the clock');
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe('test-league.draftlab.json');
    cleanup();

    const fresh = fakeStorage();
    render(<App load={load} storage={fresh.storage} actions={fakeActions().actions} />);
    await screen.findByRole('heading', { name: 'Set up your league' });
    await user.upload(screen.getByLabelText('Import a draft file'), new File([downloads[0].text], 'x.json'));
    expect(await screen.findByText('Pick 3 of 6 · Round 1 · Cy is on the clock')).toBeTruthy();
    expect(picksIn(fresh.data)).toEqual(['incineroar', 'kingambit']);
  });

  it('refuses a broken import and changes nothing', async () => {
    const user = userEvent.setup();
    const { storage, data: saved } = fakeStorage(stored(leagueFile(['incineroar'])));
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    await screen.findByText('Pick 2 of 6 · Round 1 · You are on the clock');
    await user.upload(screen.getByLabelText('Import'), new File(['{"schemaVersion": 7}'], 'bad.json'));
    expect(await screen.findByText('That file could not be imported; nothing was changed.')).toBeTruthy();
    expect(picksIn(saved)).toEqual(['incineroar']);
  });

  it('asks before an import replaces the current draft, and offers a download of it first', async () => {
    const user = userEvent.setup();
    const { actions, questions, downloads } = fakeActions([true, true]);
    const { storage, data: saved } = fakeStorage(stored(leagueFile(['incineroar'])));
    render(<App load={load} storage={storage} actions={actions} />);
    await screen.findByText('Pick 2 of 6 · Round 1 · You are on the clock');
    await user.upload(screen.getByLabelText('Import'), new File([serializeDraftFile(leagueFile(['incineroar', 'kingambit']))], 'x.json'));
    expect(await screen.findByText('Pick 3 of 6 · Round 1 · Cy is on the clock')).toBeTruthy();
    expect(questions).toEqual(['Replace the current draft with the imported file?', 'Download a copy of the current draft first?']);
    expect(downloads.map((d) => d.text)).toEqual([serializeDraftFile(leagueFile(['incineroar']))]);
    expect(picksIn(saved)).toEqual(['incineroar', 'kingambit']);
  });

  it('shows the recovery screen for a stored file that cannot be read, with download and start over', async () => {
    const user = userEvent.setup();
    const { actions, downloads } = fakeActions([true]);
    const { storage, data: saved } = fakeStorage({ [STORAGE_KEY]: '{broken' });
    render(<App load={load} storage={storage} actions={actions} />);
    expect(await screen.findByRole('heading', { name: 'The saved draft could not be read' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Download raw file' }));
    expect(downloads).toEqual([{ filename: 'draftlab-recovered.json', text: '{broken' }]);
    await user.click(screen.getByRole('button', { name: 'Start over' }));
    expect(await screen.findByRole('heading', { name: 'Set up your league' })).toBeTruthy();
    expect(saved.has(STORAGE_KEY)).toBe(false);
  });
});

describe('editing the league mid-draft', () => {
  it('refuses to ban a Pokémon that was already drafted, and saves an allowed change', async () => {
    const user = userEvent.setup();
    const { storage, data: saved } = fakeStorage(stored(leagueFile(['incineroar'])));
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    await screen.findByText('Pick 2 of 6 · Round 1 · You are on the clock');
    await user.click(screen.getByRole('button', { name: 'Setup' }));
    expect((screen.getByLabelText(/Drafters/) as HTMLTextAreaElement).disabled).toBe(true);

    await user.type(screen.getByLabelText('Search'), 'Incineroar');
    await user.click(screen.getByLabelText('Ban Incineroar'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('this would break pick 1: "incineroar" is banned in this league')).toBeTruthy();
    expect(saved.get(STORAGE_KEY)).toBe(serializeDraftFile(leagueFile(['incineroar'])));

    await user.click(screen.getByLabelText('Ban Incineroar'));
    await user.clear(screen.getByLabelText('League name'));
    await user.type(screen.getByLabelText('League name'), 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'Renamed' })).toBeTruthy();
  });
});

describe('when the browser gets in the way', () => {
  it('warns when changes cannot be saved, and keeps working', async () => {
    const user = userEvent.setup();
    const { storage } = fakeStorage(stored(leagueFile()), { failWrite: true });
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    await screen.findByText('Pick 1 of 6 · Round 1 · Ana is on the clock');
    expect(screen.queryByText(/aren't being saved/)).toBeNull();
    await recordPick(user, 'Incin');
    expect(screen.getByText("Changes aren't being saved in this browser — use Export.")).toBeTruthy();
    expect(screen.getByText('Pick 2 of 6 · Round 1 · You are on the clock')).toBeTruthy();
  });

  it('shows the warning from the start when storage cannot be read', async () => {
    render(<App load={load} storage={fakeStorage({}, { failRead: true, failWrite: true }).storage} actions={fakeActions().actions} />);
    expect(await screen.findByText("Changes aren't being saved in this browser — use Export.")).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Set up your league' })).toBeTruthy();
  });

  it('offers a retry when the data fails to load', async () => {
    const user = userEvent.setup();
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls === 1) throw new Error('network down');
      return data;
    };
    render(<App load={flaky} storage={fakeStorage().storage} actions={fakeActions().actions} />);
    expect(await screen.findByText('network down')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Set up your league' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/app/setup.flow.test.tsx src/app/room.flow.test.tsx`
Expected: FAIL (`App.tsx` does not exist).

- [ ] **Step 3: Create `src/app/Workspace.tsx` and `src/app/App.tsx`**

```tsx
import { useMemo, useRef, useState } from 'react';
import { parseDraftFile, serializeDraftFile, type DraftFile } from '../domain/file';
import type { LeagueConfig } from '../domain/league';
import type { Problem } from '../domain/problem';
import { exportFileName, type BrowserActions } from './browser';
import type { AppData } from './data/snapshot';
import { SetupView } from './setup/SetupView';
import { makeDraftReducer, type DraftAction, type DraftStoreState } from './state/draft-store';
import { loadDraft, saveDraft, type DraftStorage } from './state/storage';
import { DraftRoom } from './room/DraftRoom';
import { makeNames } from './text/names';

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
  const reducer = useMemo(() => makeDraftReducer(data.snapshot), [data.snapshot]);
  const names = useMemo(() => makeNames(data.snapshot), [data.snapshot]);
  const [initial] = useState(() => loadDraft(storage, data.snapshot));
  const [state, setState] = useState<DraftStoreState>({ file: initial.kind === 'ok' ? initial.file : null, errors: [] });
  const stateRef = useRef(state);
  const [recovery, setRecovery] = useState(initial.kind === 'corrupt' ? initial : null);
  const [warnings, setWarnings] = useState<Problem[]>(initial.kind === 'ok' ? initial.warnings : []);
  const [saveFailed, setSaveFailed] = useState(initial.kind === 'unavailable');
  const [importErrors, setImportErrors] = useState<Problem[]>([]);
  const [view, setView] = useState<'setup' | 'room'>(state.file === null ? 'setup' : 'room');

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

  const importFile = async (chosen: File) => {
    const parsed = parseDraftFile(await chosen.text(), data.snapshot);
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
      {importErrors.length > 0 && (
        <div className="banner warning" role="alert">
          <p>That file could not be imported; nothing was changed.</p>
          <ProblemList problems={importErrors} />
          <button type="button" onClick={() => setImportErrors([])}>
            Dismiss
          </button>
        </div>
      )}
      {view === 'setup' || file === null ? (
        <SetupView
          key={file === null ? 'new' : 'edit'}
          data={data}
          file={file}
          errors={state.errors}
          onSave={(league: LeagueConfig) => {
            if (apply({ type: 'set-league', league }).errors.length === 0) setView('room');
          }}
          onCancel={file === null ? undefined : () => setView('room')}
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
      ) : (
        <DraftRoom
          data={data}
          file={file}
          names={names}
          errors={state.errors}
          onPick={(species) => apply({ type: 'pick', species })}
          onUndo={() => apply({ type: 'undo' })}
          onExport={() => actions.download(exportFileName(file.league.name), serializeDraftFile(file))}
          onImport={importFile}
          onSetup={() => {
            stateRef.current = { ...stateRef.current, errors: [] };
            setState(stateRef.current);
            setView('setup');
          }}
        />
      )}
    </>
  );
}
```

```tsx
import { Component, useCallback, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { browserActions, type BrowserActions } from './browser';
import { loadAppData, type AppData } from './data/snapshot';
import { STORAGE_KEY, browserStorage, type DraftStorage } from './state/storage';
import { Workspace } from './Workspace';

export interface AppProps {
  load?: () => Promise<AppData>;
  storage?: DraftStorage;
  actions?: BrowserActions;
}

type Phase = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; data: AppData };

/** The last line of defence: a render error shows this instead of a blank page. */
class ErrorBoundary extends Component<{ storage: DraftStorage; actions: BrowserActions; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    let raw: string | null = null;
    try {
      raw = this.props.storage.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
    return (
      <main className="recovery">
        <h1>Something went wrong</h1>
        <p>Your last saved draft is still in this browser.</p>
        <div className="row">
          {raw !== null && (
            <button type="button" onClick={() => this.props.actions.download('draftlab-backup.json', raw)}>
              Download saved draft
            </button>
          )}
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </main>
    );
  }
}

/** Loads the data, then hands over to the workspace; loading and load errors get their own screens. */
export function App({ load = loadAppData, storage, actions = browserActions }: AppProps) {
  const [store] = useState<DraftStorage>(() => storage ?? browserStorage());
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  const start = useCallback(() => {
    setPhase({ kind: 'loading' });
    load().then(
      (data) => setPhase({ kind: 'ready', data }),
      (error: unknown) => setPhase({ kind: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
  }, [load]);

  useEffect(start, [start]);

  if (phase.kind === 'loading') return <p className="loading">Loading data…</p>;
  if (phase.kind === 'error') {
    return (
      <main className="recovery">
        <h1>The Pokémon data could not be loaded</h1>
        <p>{phase.message}</p>
        <button type="button" onClick={start}>
          Retry
        </button>
      </main>
    );
  }
  return (
    <ErrorBoundary storage={store} actions={actions}>
      <Workspace data={phase.data} storage={store} actions={actions} />
    </ErrorBoundary>
  );
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run src/app/setup.flow.test.tsx src/app/room.flow.test.tsx` then `npm test` then `npm run typecheck`
Expected: PASS (17 tests); the whole suite then has 693 tests; typecheck clean.

Mutation proofs (do each, then undo it): in `Workspace.tsx`, change `if (next.errors.length === 0) setSaveFailed(!saveDraft(storage, next.file));` to `if (next.errors.length === 0) saveDraft(storage, next.file);` — the test "warns when changes cannot be saved, and keeps working" must fail. In `PickEntry.tsx`, change `if (!option || !option.affordable) return;` to `if (!option) return;` — the test "greys out and refuses a Pokémon the on-the-clock drafter cannot afford" must fail. Restore both.

- [ ] **Step 5: Commit**

```bash
git add src/app/Workspace.tsx src/app/App.tsx src/app/setup.flow.test.tsx src/app/room.flow.test.tsx
git commit -m "feat(app): wire the app: autosave, export and import, recovery, with UI flow tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Entry point, stylesheet, build and docs

**Files:**
- Create: `index.html`, `vite.config.ts`, `src/app/main.tsx`, `src/app/app.css`, `src/app/vite-env.d.ts`
- Modify: `package.json` (scripts), `docs/STATUS.md`, `README.md`

**Interfaces:**
- Consumes: `App` (Task 5). Produces nothing new.

- [ ] **Step 1: Create the entry files and the stylesheet**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Draft Lab</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/app/main.tsx"></script>
  </body>
</html>
```

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The app's dev server and production build. Tests use vitest.config.ts.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // The snapshot is loaded as its own ~1.35 MB chunk on purpose (src/app/data/snapshot.ts); warn only above that.
    chunkSizeWarningLimit: 1500,
  },
});
```

```ts
/// <reference types="vite/client" />
```

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './app.css';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

The whole stylesheet (CSS custom properties for colours and spacing; the three columns stack below 900 px):

```css
:root {
  --bg: #f7f7f5;
  --panel: #ffffff;
  --text: #1d1d1f;
  --muted: #5f6368;
  --line: #d9d9d6;
  --accent: #2458c6;
  --accent-soft: #e6edfb;
  --warn-bg: #fff4e5;
  --warn-line: #e5a23a;
  --danger: #b3261e;
  --space: 0.75rem;
  --radius: 6px;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: var(--text);
  background: var(--bg);
  line-height: 1.45;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #17181a;
    --panel: #212226;
    --text: #ececec;
    --muted: #a6a8ad;
    --line: #3a3c41;
    --accent: #8ab0ff;
    --accent-soft: #26324a;
    --warn-bg: #3a2c16;
    --warn-line: #c98a2c;
    --danger: #ff8a80;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
}

h1 {
  font-size: 1.4rem;
  margin: 0;
}
h2 {
  font-size: 1.1rem;
  margin: 0 0 var(--space);
}
h3 {
  font-size: 1rem;
  margin: 0;
}

button,
.file-button {
  font: inherit;
  padding: 0.35rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--panel);
  color: var(--text);
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
button[type='submit'] {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
button.danger {
  color: var(--danger);
}
.file-button input[type='file'] {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.file-button {
  position: relative;
  display: inline-block;
}

input,
select,
textarea {
  font: inherit;
  color: inherit;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 0.3rem 0.5rem;
}
textarea {
  width: 100%;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space);
  align-items: center;
}

.loading,
.recovery,
.setup {
  max-width: 60rem;
  margin: 0 auto;
  padding: calc(var(--space) * 2);
}
.setup section,
.setup form > section {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: var(--space) calc(var(--space) * 1.5);
  margin-bottom: var(--space);
}
.setup-header {
  margin-bottom: var(--space);
}
.field {
  display: grid;
  gap: 0.25rem;
  margin-bottom: var(--space);
}
.field-error,
.problems {
  color: var(--danger);
  margin: 0;
}
.note {
  color: var(--muted);
}
.actions {
  margin-top: var(--space);
}
.table-scroll {
  max-height: 28rem;
  overflow: auto;
}
table {
  border-collapse: collapse;
  width: 100%;
}
th,
td {
  text-align: left;
  padding: 0.2rem 0.5rem;
  border-bottom: 1px solid var(--line);
}
td input[type='number'] {
  width: 5rem;
}

.banner {
  display: flex;
  gap: var(--space);
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--space) calc(var(--space) * 1.5);
  background: var(--accent-soft);
  border-bottom: 1px solid var(--line);
}
.banner.warning,
.refusal,
.warning {
  background: var(--warn-bg);
  border-color: var(--warn-line);
}
.refusal {
  margin: 0 var(--space);
  padding: 0.5rem var(--space);
  border: 1px solid var(--warn-line);
  border-radius: var(--radius);
}

.room-header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space);
  align-items: center;
  justify-content: space-between;
  padding: var(--space) calc(var(--space) * 1.5);
  background: var(--panel);
  border-bottom: 1px solid var(--line);
}
.status {
  margin: 0;
  color: var(--muted);
}
.columns {
  display: grid;
  grid-template-columns: minmax(16rem, 1fr) minmax(22rem, 2fr) minmax(16rem, 1fr);
  gap: var(--space);
  padding: var(--space);
  align-items: start;
}
@media (max-width: 900px) {
  .columns {
    grid-template-columns: 1fr;
  }
}
.column > section {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: var(--space);
  margin-bottom: var(--space);
}

.pick-entry input {
  width: 100%;
}
.options {
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.options li {
  padding: 0.3rem 0.5rem;
  cursor: pointer;
}
.options li[aria-selected='true'] {
  background: var(--accent-soft);
}
.options li.unaffordable {
  color: var(--muted);
  cursor: not-allowed;
}
.pick-log ol {
  padding-left: 1.2rem;
  margin: 0;
}
.pick-number {
  color: var(--muted);
}

.notes {
  margin: 0 0 var(--space);
  padding-left: 1.2rem;
  color: var(--muted);
}
.cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space);
}
.card {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: var(--space);
}
.card-head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: baseline;
}
.types,
.price {
  color: var(--muted);
}
.fit {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin: 0.25rem 0;
}
.reasons {
  margin: 0.25rem 0;
  padding-left: 1.2rem;
}

.roster {
  border-top: 1px solid var(--line);
  padding: 0.5rem 0;
}
.roster.mine h3 {
  color: var(--accent);
}
.roster p {
  margin: 0.2rem 0;
  color: var(--muted);
}
.roster .warning {
  color: var(--text);
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--warn-line);
  border-radius: var(--radius);
}
```

- [ ] **Step 2: Add the scripts**

In `package.json`, find:
```json
    "sync": "tsx sync/index.ts"
```
Replace with:
```json
    "sync": "tsx sync/index.ts",
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
```

- [ ] **Step 3: Typecheck, test and build**

Run: `npm run typecheck` then `npm test` then `npm run build`
Expected: typecheck clean; the whole suite then has 693 tests; the build writes `dist/` with a snapshot chunk of about 1343 kB and an app chunk of about 274 kB, and no chunk-size warning. (`dist/` is already in `.gitignore`; check with `git status` that it does not show.)

Optional manual check: `npm run dev`, open http://localhost:5173, set up a two-drafter league and record a pick.

- [ ] **Step 4: Update `docs/STATUS.md`**

In `docs/STATUS.md`, find:
```text
| 8 | App shell, UI and hosting | not started | |
```
Replace with:
```text
| 8 | App shell, increment 1: the draft room (league setup, CSV prices, live draft, suggestions as sentences, autosave, export and import) | `specs/2026-09-29-app-draft-room-design.md`, `plans/2026-09-29-app-draft-room.md` | done: built and reviewed |
| 9 | App shell, increment 2: the teambuilder | not started | |
| 10 | App shell, increment 3: hosting and data refresh | not started | |
```

In `docs/STATUS.md`, find:
```text
Tests, all passing: 631 unit tests and 21 integration tests.
```
Replace with:
```text
Tests, all passing: 693 unit tests (including the UI flow tests, which run in jsdom) and 21 integration tests.
```

In `docs/STATUS.md`, find:
```text
src/app/         Planned React UI. Does not exist yet.
```
Replace with:
```text
src/app/         React + Vite UI (increment 8): league setup, the draft room, sentences for the engine's reasons.
```

In `docs/STATUS.md`, find:
```text
There is no UI yet. What exists is the data pipeline and the pure logic the UI will call.
```
Replace with:
```text
The UI so far is the draft room: league setup, a live draft with suggestions, autosaved in the browser. The teambuilder UI and hosting come next.
```

- [ ] **Step 5: Update `README.md`**

In `README.md`, find:
```text
Where you have entered a set for a roster member, the engine reads the set instead of ladder averages. There is no UI yet.
```
Replace with:
```text
Where you have entered a set for a roster member, the engine reads the set instead of ladder averages. `src/app/` is the React UI: league setup with a CSV price import, the draft room with suggestions as sentences, autosaved in the browser. `npm run dev` starts it at http://localhost:5173; `npm run build` writes a static site to `dist/`.
```

- [ ] **Step 6: Commit**

```bash
git add index.html vite.config.ts package.json src/app/main.tsx src/app/app.css src/app/vite-env.d.ts docs/STATUS.md README.md
git commit -m "feat(app): add the entry point, stylesheet and build; docs for the draft room" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-Review (spec coverage)

- Tooling (dependencies, scripts, tsconfig, jsdom per file): Tasks 1 and 6; pre-verification above.
- Sentences for every reason kind and variant, every note kind, role and combo labels, list joining, number formatting, name fallbacks, a kind list typed from `Reason['kind']`: Task 1.
- Draft store (every action, refusals keep the state, locked fields, replay of picks, errors clear, no mutation): Task 2.
- Storage (every `loadDraft` kind, `saveDraft` results, round trip, the throwing fallback): Task 2.
- Setup view (league fields, CSV paste and file import with unmatched names and problems by line, price table with search, priced-only filter, count and bans, problems next to fields, locked fields disabled with a note, New league asking first): Task 3; flows in Task 5.
- Draft room (status line, undo, export, import with confirm and warnings, the pick combobox with unaffordable options, pick log, suggestions with notes, filter, count, cards with bar, reasons and breakdown, Pick buttons, rosters): Task 4; flows in Task 5.
- Loading, load error with Retry, recovery, save banner, error boundary: Task 5 (`App.tsx`, `Workspace.tsx`).
- Every UI flow the spec lists (CSV league creation with unmatched rows, fixing a price, starting, picks for several drafters, refused pick, suggestions with sentences and notes, Pick from a card, undo, remount restore, export/import round trip, corrupt storage recovery, mid-draft ban refused, storage failing on write): Task 5.
- Build and the chunk sizes, docs: Task 6.

## Later increments (outlined; each gets its own spec and plan)

2. Teambuilder: sets per roster slot with plain-language validation, Showdown paste import and export, match teams; entered sets feed the suggestions.
3. Hosting and data refresh: GitHub Pages, a scheduled sync and rebuild, the data's age and fallback warnings in the UI, browser end-to-end tests against the deployed build.
