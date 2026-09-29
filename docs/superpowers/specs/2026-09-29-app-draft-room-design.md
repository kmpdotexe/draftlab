# App shell, increment 1: the draft room — Design

Date: 2026-09-29. Status: design approved in conversation; awaiting spec review.

Parents: `docs/superpowers/specs/2026-09-20-draft-lab-design.md` (Architecture, League config, Draft board, Error handling, Testing), the league and draft spec (`2026-09-20-league-draft-design.md`) and the suggestion engine specs (stages 1 to 3). The domain (`src/domain/`) and the engine (`src/engine/`) are finished and are used as they are.

## Purpose

Give Draft Lab its first user interface: set up a league, record a live draft, and see the engine's suggestions with their reasons as sentences, all in the browser, saved automatically. This is the smallest slice a user can take into a real draft.

## The app shell as three increments (settled in brainstorming)

1. **Draft room** (this spec): Vite + React setup, the snapshot, one autosaved draft file with export and import, league setup, the draft board, the suggestions panel.
2. **Teambuilder:** sets per roster slot with plain-language validation, Showdown paste import and export, match teams; entered sets feed the suggestions (`contextFor` already takes them).
3. **Hosting and data refresh:** GitHub Pages, a scheduled GitHub Action that re-syncs the snapshot and rebuilds, the data's age and fallback warnings in the UI, browser end-to-end tests against the deployed build.

## Decisions (settled in brainstorming)

- **One draft at a time**, autosaved in browser storage. Starting a new league or importing a file replaces it, after offering to download the current one.
- **One screen, three columns** for the draft room; league setup is its own view.
- **Prices come from a spreadsheet**: paste or upload a CSV, see which rows did not match, then fix single prices in a searchable table.
- **Plain React + Vite + TypeScript, hand-written CSS, no state library, no router, no component library.** One reducer holds the draft file; everything else is derived.
- **Display names everywhere**; species ids stay internal.

## Facts established (2026-09-29)

- The only format shipped is `gen9championsvgc2026regmb`; `data/gen9championsvgc2026regmb/snapshot.json` is 1.3 MB and `meta.json` has `label: "Champions VGC 2026 Reg M-B"`.
- The domain already provides everything the draft room needs: `validateLeague`, `parsePriceCsv` (matched prices, unmatched names, problems by line), `checkPick` / `applyPick` / `undoPick`, `deriveDraft` (pool, drafters with `remaining`, `openSlots`, `cannotFillRoster`, `onTheClock`, `complete`), and `serializeDraftFile` / `parseDraftFile` (four layers of errors, plus warnings). The engine provides `contextFor(league, draft, i, sets?)` and `suggest`.
- `checkPick` derives the whole draft on each call (about 0.4 ms); the UI derives once per change and compares prices with `remaining` for greying out.
- The repo has no React, Vite, jsdom or DOM types yet; `tsconfig.json` has `lib: ["ES2022"]` and `types: ["node"]`.

## Out of scope

The teambuilder, hosting, data refresh, several saved drafts, signal-weight controls, mobile-specific layouts (the UI must not break on a narrow window, but is not designed for it), browser end-to-end tests, and changes to `src/domain/` or `src/engine/` other than exports the UI needs (none are expected).

## Architecture

```
index.html                      Vite entry
vite.config.ts                  React plugin; the build writes dist/
src/app/
  main.tsx                      mounts <App/>
  App.tsx                       loading / error / recovery / Setup view / Draft room view
  app.css                       the whole stylesheet (CSS custom properties for colours and spacing)
  state/draft-store.ts          the reducer over the draft file (pure)
  state/storage.ts              load and save the one draft file (pure apart from the Storage it is given)
  data/snapshot.ts              lazy-loads the snapshot and meta once
  setup/                        LeagueForm, PriceImport, PriceTable (with Ban)
  room/                         Header, PickEntry, PickLog, Suggestions, SuggestionCard, Rosters
  text/reasons.ts               Reason and Note -> English sentences (pure)
  text/names.ts                 display names for species, moves, types, roles, combos (pure)
```

Dependencies point one way: `src/app/` imports from `src/engine/` (its index only) and `src/domain/`; nothing imports from `src/app/`.

**Data flow.** The reducer holds `DraftFile | null`. From it, memoized: `draft = deriveDraft(league, picks, snapshot)`, `ctx = contextFor(league, draft, league.me, sets)`, `result = suggest(ctx, snapshot, { limit, maxUsage, minUsage })`. The limit and the usage filter are view state (not saved).

**The snapshot** is loaded with a dynamic `import()` of the JSON (its own chunk). While it loads the app shows "Loading data…"; if it fails, an error screen with **Retry**.

## The draft store (`state/draft-store.ts`)

`type DraftAction =`
- `{ type: 'set-league'; league: LeagueConfig }` — creates the file (`picks: []`, `sets: {}`, `teams: []`) or replaces the league of the existing one, keeping picks, sets and teams;
- `{ type: 'pick'; species: ID }`;
- `{ type: 'undo' }`;
- `{ type: 'replace'; file: DraftFile }` — an imported file that `parseDraftFile` accepted;
- `{ type: 'clear' }` — start over (the file becomes `null`).

The reducer never throws and never stores an invalid state: `pick` goes through `applyPick` and returns the same state plus an error on refusal; `set-league` is refused (same state plus errors) when `validateLeague` finds problems or, with picks recorded, when replaying the picks with `checkPick` against the new league fails. The reducer state is `{ file: DraftFile | null; error: Problem[] }`; `error` is cleared by the next successful action. The snapshot is a parameter of the reducer factory (`makeDraftReducer(snapshot)`).

**Locked fields.** With at least one pick recorded, `set-league` is refused if `drafters`, `order`, `rounds` or `me` differ from the current league (`name`, `budget`, `prices`, `extraBans` may change, subject to the replay).

## Storage (`state/storage.ts`)

Key: `draftlab.draft.v1`. `loadDraft(storage, snapshot)` returns one of `{ kind: 'empty' }`, `{ kind: 'ok'; file; warnings }`, `{ kind: 'corrupt'; raw: string; errors: Problem[] }`, `{ kind: 'unavailable' }` (reading threw). `saveDraft(storage, file | null)` returns `true` or `false` (writing threw, e.g. quota or blocked storage); `null` removes the key. The app saves after every successful action. A `false` shows the banner "Changes aren't being saved in this browser — use Export." until a later save succeeds.

## Views

**Loading / error / recovery.** Recovery (stored file is corrupt) lists the errors with their paths and offers **Download raw file** (the raw text as `draftlab-recovered.json`) and **Start over** (asks first).

**Setup** (shown when there is no file, and behind the **Setup** button):
- League: name; drafters (one per line, 2 to 32); order (snake / linear); rounds (1 to 30); your slot (a select over the drafter names); budget; the format shown read-only as the meta label.
- Prices: a textarea with **Import** and a file picker (`.csv`, `.tsv`, `.txt`). The import runs `parsePriceCsv` and shows "N prices imported", the unmatched names and the problems by line; imported prices replace the table's prices for the matched species only.
- Price table: every legal species (display name, types), a price input (blank = no price = unavailable) and a **Ban** checkbox; search by name; a "priced only" filter; a count of priced species.
- `validateLeague` problems are shown next to their fields; **Start draft** (or **Save** when a file exists) dispatches `set-league`; refusals from the reducer are shown in place. Locked fields are disabled with a note once picks exist.
- **New league** (only when a file exists) asks first and offers to download the current file.

**Draft room** (three columns; below 900 px wide the columns stack):
- Header: league name; "Pick 14 of 48 · Round 3 · Ben is on the clock" or "Draft complete"; **Undo last pick** (disabled with no picks), **Export** (downloads `serializeDraftFile` as `<league name>.draftlab.json`), **Import** (file picker → `parseDraftFile`; errors listed, nothing replaced; on success asks before replacing, offers a download of the current file, then shows warnings), **Setup**.
- Left: **Record a pick** — a combobox over the pool (display names, price; species the on-the-clock drafter cannot afford are shown disabled with "costs N, has M"); Enter or click dispatches `pick`; a refusal shows the domain's message. Then the pick log, newest first: number, round, drafter, species, price.
- Middle: **Suggestions for you** — note sentences at the top; a filter (All / Niche: `maxUsage: 0.03` / Ladder staples: `minUsage: 0.05`) and a count (10 / 20 / 50, default 20); one card per suggestion: display name, types, price, a bar for `score` (labelled "relative fit"), every reason as a sentence, and a collapsible breakdown (each signal's score or "no data", rank and weight as percentages). A **Pick** button on each card when you are on the clock.
- Right: **Rosters** — each drafter: name (yours highlighted), "N of B points left", open slots, the roster in pick order with prices, and "can't fill the roster" when `cannotFillRoster`.

## Sentences (`text/reasons.ts`, `text/names.ts`)

`reasonText(reason, names)` and `noteText(note, names)`, where `names` resolves species, move and ability display names from the snapshot (falling back to the id). A `switch` over `kind` with a `never` check makes a new kind a compile error. Numbers: lifts with one decimal and "×"; usage as a percentage with one decimal. Lists: "A", "A and B", "A, B and C".

| kind | sentence |
|---|---|
| `pairs-often-with` | "Paired with {with} {lift}× more often than expected on ladder." |
| `pairs-rarely-with` | "Rarely paired with {with} ({lift}× the expected rate)." |
| `lift-coverage` | "Ladder pairing data covers {covered} of your {of} Pokémon." |
| `covers-weakness`, `resists` | "Resists {type}, which {weakMembers} {is/are} weak to." |
| `covers-weakness`, `immune` | "Immune to {type} by typing, which {weakMembers} {is/are} weak to." |
| `covers-weakness`, `ability` | "Immune to {type} through {ability}, which {weakMembers} {is/are} weak to." |
| `adds-weakness` | "Also weak to {type}, like {weakMembers}." |
| `adds-coverage` | "Hits {types} super effectively, which your roster can't yet." |
| `fills-role`, `runs` | "Fills {role}: runs {move}." (+ " (from your set)" when `from` is `set`) |
| `fills-role`, `ability` | "Fills {role}: its ability is {ability}." |
| `fills-role`, `can-learn` | "Could fill {role}: it can learn {move} (no ladder data)." |
| `completes-combo`, `beneficiary` | "Completes {combo} with {with}." (+ " ({with}'s half is from your set)" when `from` is `set`) |
| `completes-combo`, `enabler` | "Sets up {combo} for {with}." (+ the same set suffix) |
| `low-usage` | "Rarely used on ladder ({usage}% of teams)." |
| `no-ladder-usage` | "No ladder usage data." |

When `weakMembers` is empty the "which … weak to" clause is left out.

Role labels: fakeOut "Fake Out", redirection "redirection", speedControl "speed control", intimidate "Intimidate", weatherTerrain "weather or terrain", pivot "pivoting", screens "screens", support "support moves", priority "priority moves", disruption "disruption". Combo labels: trickRoom "Trick Room", redirectSetup "redirection and setup", rain "rain", sun "sun", sand "sand", snow "snow", electricTerrain "Electric Terrain", helpingHand "Helping Hand and a spread attack".

| note | sentence |
|---|---|
| `invalid-context`, `invalid-snapshot` | "Suggestions are unavailable (the draft data could not be read)." |
| `roster-full` | "Your roster is full." |
| `empty-roster` | "Suggestions start after your first pick." |
| `cannot-fill-roster` | "Only {poolSize} Pokémon are left for your {openSlots} open slots." |
| `no-affordable-candidates` | "Nothing left fits your remaining points." |
| `no-usage-data` | "No ladder usage data is loaded, so pairing data is not used." |
| `roster-lacks-roles` | "Your roster has no {roles} yet." |
| `unscored-candidates` | "{count} Pokémon could not be scored with the current settings." |

## Errors and robustness

Never a blank screen: loading, snapshot error (Retry), recovery, and the save banner as above. Nothing in `src/app/` catches and hides an exception from the domain or the engine (they do not throw on plain data); a React error boundary around the app shows "Something went wrong" with **Export** (if a file exists) and **Reload**.

## Accessibility

Every input has a label; the pick combobox is keyboard-operable (arrows, Enter, Escape); buttons are real buttons; the on-the-clock line and refusal messages use `aria-live="polite"`; colour is never the only signal (disabled and warning states have text).

## Tooling

- New dependencies: `react`, `react-dom`, `@types/react`, `@types/react-dom`, `vite`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` (optional matchers), `jsdom`. Exact versions are chosen at plan time (latest compatible with Node 24 and the existing Vitest 5 / TypeScript 7).
- Scripts: `dev` (vite), `build` (typecheck + vite build), `preview`. `npm test` keeps running everything; app tests run in jsdom (per-file environment or a Vitest project), domain and engine tests stay in Node.
- `tsconfig`: add the DOM libs and `jsx: "react-jsx"` so `npm run typecheck` covers `src/app/` (the plan checks this does not disturb `sync/`).

## Testing

Every test must be able to fail (reversed inputs where order matters, `not.toBeNull()` before narrowing, mutation proofs called out in the plan for the ones that could be vacuous).

- **`draft-store.test.ts`:** each action; refusals keep the state and set `error`; locked fields with picks; a price or ban change that breaks a recorded pick is refused; `error` clears on the next success; the reducer never mutates its input.
- **`storage.test.ts`:** against a fake `Storage` that can be empty, hold good or corrupt text, throw on read, or throw on write: every `loadDraft` kind and `saveDraft` result; a save/load round trip.
- **`reasons.test.ts` / `names.test.ts`:** one test per reason kind and variant and per note kind (the exact sentences above), list joining, number formatting, name fallbacks; a test that enumerates the kinds from a list typed as `Reason['kind'][]` so a new kind cannot be forgotten.
- **UI flows** (React Testing Library + user-event in jsdom, on the real snapshot): create a league by pasting a CSV (unmatched rows shown); fix a price in the table; start the draft; record picks for several drafters; a refused pick shows the message; the suggestions panel shows sentences and notes; **Pick** from a card on your turn; undo; a remount restores from storage; export then import round-trips; corrupt storage shows recovery; a mid-draft ban of a drafted Pokémon is refused; storage that throws on write shows the banner.
- **Build:** `npm run build` succeeds and `npm run typecheck` covers `src/app/`.

## Plan-time pre-verification

Before the plan asserts anything: install the chosen versions and confirm Vitest 5 + jsdom + React Testing Library run a trivial component test in this repo; confirm the TypeScript config change keeps `npm run typecheck` clean for `src/`, `sync/` and the configs; measure how long the real-snapshot UI flow tests take; confirm `vite build` handles the JSON chunk and report its size.

## Later increments

Teambuilder (increment 2), then hosting and data refresh (increment 3).
