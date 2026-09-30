# Draft Lab

Draft Lab is a single-user web app for Pokemon VGC draft leagues. You describe your league, record the draft as it happens, build your roster with full sets, and get explained teammate suggestions drawn from ladder usage, typing, roles and mechanics. The design is in `docs/superpowers/specs/2026-09-20-draft-lab-design.md`. For where the project stands and how it is built, see `docs/STATUS.md`.

This repo currently contains the data layer (the sync step in `sync/` that produces the data files the app will read, the snapshot, and the usage math) and the domain logic in `src/domain/`: the set model, league config, draft board, price-list import, the saved-draft file, and the teambuilder logic (checking a set against the format, stat calculation, roster sets and match teams with Item and Species Clause checks), and Showdown paste import and export for sets and teams. `src/engine/` holds the suggestion engine through stage 3: candidates that fit the budget, ranked by usage lift, type synergy (including ability immunities), role fit (speed control, Fake Out, redirection and similar) and partner combos (Trick Room, weather, redirection with setup moves, Helping Hand), each with typed reasons. Where you have entered a set for a roster member, the engine reads the set instead of ladder averages. `src/app/` is the React UI: league setup with a CSV price import, the draft room with suggestions as sentences, autosaved in the browser. `npm run dev` starts it at http://localhost:5173; `npm run build` writes a static site to `dist/`.

## Prerequisites

Node.js 20 or newer, then `npm install`.

## Commands

- `npm test` runs the unit tests. They need no network and do not load `pokemon-showdown`.
- `npm run test:integration` runs the tests that load the real `pokemon-showdown` package (about 150 MB). It is slow.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run sync` regenerates the data files for every format in `sync/formats.config.ts`. `npm run sync -- --format <id>` does one format. It makes network requests to Smogon and rewrites the committed files under `data/`, so review the diff before committing.

## Data layout

`sync` writes two files per format:

- `data/<formatId>/snapshot.json`: legal species, moves, learnsets, items and pruned ladder usage.
- `data/<formatId>/meta.json`: where and when the data came from (package version, stats month, rules, warnings).

The app is meant to read only these files. It never talks to Smogon or `pokemon-showdown` at runtime. If a source changes shape, the sync fails and the last committed snapshot stays in place.

## Known limitation and adding formats

Only Reg M-B (`gen9championsvgc2026regmb`) ships. The released `pokemon-showdown` 0.11.11 does not include Reg M-C, and legality comes from that package.

To add a format, add one entry to `FORMATS` in `sync/formats.config.ts` and run `npm run sync`. The comment in that file has the ready-made Reg M-C entry, to use once a package release (or a pinned build) knows the format. It uses Reg M-B usage as a fallback until Smogon publishes Reg M-C stats.
