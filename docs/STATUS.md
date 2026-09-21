# Draft Lab: project status

Last updated 2026-09-21. This file is a map for someone new to the repo: where the project stands, how it has been built, and what is deliberately unfinished. The README covers commands and data layout.

## What it is

A single-user web app for Pokémon VGC draft leagues. You describe your league (format, drafters, draft order, points budget), record the draft, build your roster with full sets, and get explained suggestions for who to draft next. It is aimed at people who do not know the less popular ladder picks. The current ladder is Pokémon Champions, Reg M-B.

There is no UI yet. What exists is the data pipeline and the pure logic the UI will call.

## Where we are

All work so far happened on 2026-09-20 and 2026-09-21. Each increment went through the same cycle (see "How it is built").

| # | Increment | Spec and plan (in `docs/superpowers/`) | State |
|---|---|---|---|
| 1 | Data layer: sync from Showdown's Champions mod and Smogon usage into a committed snapshot | `specs/2026-09-20-draft-lab-design.md`, `plans/2026-09-20-draft-lab-data-layer.md` | merged, pushed |
| 2 | League and draft logic: league config, draft board, prices, the saved-draft file | `specs/2026-09-20-league-draft-design.md`, `plans/2026-09-20-league-draft.md` | merged, pushed |
| 3 | Teambuilder logic: item table, set checks, stat calculation, match teams with Item and Species Clause | `specs/2026-09-20-teambuilder-design.md`, `plans/2026-09-20-teambuilder.md` | merged, pushed |
| 4 | Showdown paste import and export | `specs/2026-09-21-showdown-paste-design.md`, `plans/2026-09-21-showdown-paste.md` | merged, pushed |
| 5 | Suggestion engine, stage 1: candidate selection under the budget, usage lift and type synergy signals, explained rankings | `specs/2026-09-21-suggestion-engine-stage1-design.md`, `plans/2026-09-21-suggestion-engine-stage1.md` | done: built and reviewed |
| 6 | Suggestion engine, stage 2: role and mechanics tags (speed control, Fake Out, redirection, ability immunities) | not started | |
| 7 | Suggestion engine, stage 3: scoring that uses the sets you have entered | not started | |
| 8 | App shell, UI and hosting | not started | |

Tests, all passing: 459 unit tests and 21 integration tests.

## Architecture

```
sync/            Node script. Reads the pokemon-showdown npm package (legal species, moves, items, type data)
                 and Smogon's usage stats, and writes data/<formatId>/snapshot.json + meta.json.
data/            The committed snapshot the app reads. The app never calls Smogon or Showdown at runtime.
src/domain/      Pure logic: types, league and draft rules, sets, teams, saved file, paste import/export.
src/engine/      Pure suggestion engine (increment 5). Imports only from src/domain.
src/app/         Planned React UI. Does not exist yet.
```

Dependencies point one way (`app -> engine -> domain`, `sync -> domain`). Everything below the UI is pure functions: no throwing on bad input (they return problem lists or typed notes), no mutation of arguments, deterministic output. The engine never produces display text, only typed reasons the UI will phrase.

## How it is built

Every increment follows the same steps, using the superpowers plugin for Claude Code:

1. Brainstorm, then a written spec, reviewed by the author.
2. A task-by-task implementation plan with the full code and test text in it.
3. One fresh subagent per task, followed by an independent review of the task (spec compliance and code quality). Findings go through fix rounds with a re-review.
4. A whole-branch review by a stronger model, one fix wave, then a local merge and push.

The plans record the real-data facts they rely on: the numbers were checked against the committed snapshot and against the real package before any test asserts them. Every test is meant to be able to fail; reviewers check that with mutations. The execution ledgers and review packages are local scratch and are not in the repo, so the specs, plans and commit history are the record.

Commits are co-authored by the model that wrote them (see the trailer). Tests: `npm test`, `npm run test:integration` (slow, loads the real package) and `npm run typecheck`.

## Decisions worth knowing

- Every Pokémon form (each Mega form, Charizard, Charizard-Mega-X and so on) is its own draft pick. The Species Clause is a team rule, so a roster may hold two forms but a team may not.
- Champions has no Tera and no IVs. Sets are a nature plus six stat points (0 to 32 each, 66 total) at level 50.
- Usage lift, not raw popularity, is what surfaces niche picks. Smogon's teammate data is symmetric and stored for the top 80 teammates per species, so a missing pair means "no data", not "lift 0".
- Showdown paste import rewrites a base species holding its Mega stone into the Mega form. Meowstic is the one exception in the data (two Mega forms share one stone).
- The engine computes its own budget reserve from the pool (price plus the cheapest prices of the other open slots) instead of using the draft state's `pointsNeededToFill`.
- The scale constants in the engine (`DEFENSIVE_SCALE = 12` and friends) were measured on real rosters, not fitted. They are starting values and are meant to be tuned.

## Known gaps and deferred items

- Only Reg M-B ships. The released `pokemon-showdown` 0.11.11 has no Reg M-C, so M-C waits for a newer package release or a pinned build.
- Three Ogerpon tera forms are legal picks whose required item is not a legal item, so they can never have a legal set. The UI should surface `meta.warnings`, or the sync should drop them.
- Suggestion engine stage 1 ignores abilities (Levitate, Flash Fire and similar) and does not weigh how noisy a lift is for rare pairs. On the real six-member rosters measured, the offensive part of type synergy drops out, because the roster already hits all 18 types (not necessarily true for every roster). Stage 2's tags are meant to carry more of the signal there.
- Suggestion engine stage 1 treats a missing signal as a ranking bonus (weights are re-normalized over the signals that have data). On the real snapshot about 37% of candidates have no usage lift for a two-species roster and 38% for a six-species roster; those candidates fill half of the top 20 (10 of 20 and 14 of 20) because the lift score is centred near 0.3 while the defensive score is centred near 0.5, so 177 of 221 (pair) and 189 of 215 (six) candidates that do have lift data score below their own type-synergy score. This is what the spec prescribes; stage 2 should re-tune it (for example shrink a missing signal toward 0.5 or weight by coverage).
- Combined scores cluster at 0.3 to 0.6, so a raw score reads low as a quality number to a user; it is only meaningful for ranking.
- Small parked items from earlier reviews: a saved set or team keeps unknown nested keys through a save; item legality ignores the format's rule table (Reg M-B has no item bans); the paste parser does not keep each block's source text for highlighting; draft-state derivation is recomputed per `checkPick` call, so the UI should derive the draft once and pass it around.

## Good places for a reviewer to push

- The type-synergy scoring in `src/engine/type-signal.ts` (exposure, relief and harm, and the constants).
- The budget reserve in `src/engine/candidates.ts` and its tests.
- The lift score mapping (log scale, clamped to lifts between 1/8 and 8) in `src/engine/lift-signal.ts`.
- The plan and spec quality themselves: they are long and detailed on purpose, and feedback on what is over- or under-specified is useful.
