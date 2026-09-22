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
| 6 | Suggestion engine, stage 2: role and mechanics tags, ability immunities, rank-based combining | `specs/2026-09-21-suggestion-engine-stage2-design.md` (no separate plan document; see the note below) | done: built and reviewed |
| 7 | Suggestion engine, stage 3: scoring that uses the sets you have entered | not started | |
| 8 | App shell, UI and hosting | not started | |

Tests, all passing: 565 unit tests and 21 integration tests.

## Architecture

```
sync/            Node script. Reads the pokemon-showdown npm package (legal species, moves, items, type data)
                 and Smogon's usage stats, and writes data/<formatId>/snapshot.json + meta.json.
data/            The committed snapshot the app reads. The app never calls Smogon or Showdown at runtime.
src/domain/      Pure logic: types, league and draft rules, sets, teams, saved file, paste import/export.
src/engine/      Pure suggestion engine (increments 5-6). Imports only from src/domain.
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

Stage 2 is the one exception to step 2: the implementation plan document was not written (a session-continuation gap, not a deliberate process change), so its work went straight from the approved spec to implementation and a whole-branch review. The review still happened and its findings were fixed before merge; only the separate plan file and its per-task subagent dispatch are missing from the record for that increment.

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
- Suggestion engine stage 2 still does not weigh how noisy a lift is for rare pairs, and does not model role conflicts (a Tailwind team versus a Trick Room team) or partial-resistance abilities (Thick Fat, Heatproof, Fluffy, Filter, Solid Rock). Those wait for a later increment.
- The stage 2 spec's tuning target for `MISSING_WEIGHT_FACTOR` ("about 3 to 5 of the top 20 have no lift data") turned out to be unreachable once the third signal (`roleFit`) was added: on the real pair, six-species and trio rosters the measured counts at factor 0.5 are 0, 1 and 0 of the top 20 (they were 0 and 2 with only two signals, at plan time). The constant stayed at 0.5 — evidence still leads clearly, just more than the spec's rough target assumed — and `suggest-real.test.ts` asserts real floors and ceilings on those counts, not just a comment.
- The role-fit signal's `can-learn` credit (half importance, for a species with no ladder data that could learn a signature move) works a little against "evidence leads": on paper a no-usage species could out-score a low-usage one on `roleFit` alone. Not biting on the real rosters checked so far (their top 20 is dominated by species with usage data), but stage 3 should look at it deliberately rather than by accident.
- `Suggestion.score` is now a percentile-based fit score, not an absolute grade: it means "how this candidate compares with the rest of the pool for this roster", and is not comparable across different rosters or calls. The per-signal absolute scores are still in `signals[].score`.
- Combined scores are ranking-only, more than ever: two different `suggest()` calls can both put their best candidate near 1.0, even though one roster's pool is stronger than the other's.
- Small parked items from earlier reviews: a saved set or team keeps unknown nested keys through a save; item legality ignores the format's rule table (Reg M-B has no item bans); the paste parser does not keep each block's source text for highlighting; draft-state derivation is recomputed per `checkPick` call, so the UI should derive the draft once and pass it around.

## Good places for a reviewer to push

- The type-synergy scoring in `src/engine/type-signal.ts` (exposure, relief and harm, and the constants), now including ability immunities (`src/engine/abilities.ts`).
- The budget reserve in `src/engine/candidates.ts` and its tests.
- The lift score mapping (log scale, clamped to lifts between 1/8 and 8) in `src/engine/lift-signal.ts`.
- The role table (`src/engine/roles.ts`) is hand-curated and small on purpose; which roles or moves it should grow to cover next is worth a second opinion.
- The rank-based combining rule (`src/engine/combine.ts`) and `MISSING_WEIGHT_FACTOR`: see the note above about the unreachable tuning target.
- The plan and spec quality themselves: they are long and detailed on purpose, and feedback on what is over- or under-specified is useful.
