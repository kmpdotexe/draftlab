# Draft Lab — Design

Date: 2026-09-20
Status: Draft for review

## Purpose

A single-user web app that makes Pokémon VGC draft leagues easier to navigate for someone unfamiliar with less popular ladder picks. The user describes their league (format, regulation, draft order, point values), records the draft as it happens, builds their roster with full sets, and gets explained teammate suggestions drawn from usage data, typing, roles and mechanics, and the sets they have entered.

The core value is surfacing niche picks that pair well with a roster, with a plain-language reason for each.

## Scope

In scope for v1:
- Auto-fetched, cached data on current regulations, legal Pokémon, moves, and ladder usage.
- League setup: format, drafters, draft order, point values, budget, league-specific rules.
- Draft board that tracks picks and derives the available pool, remaining budget, and turn.
- Teambuilder for the user's roster with set entry, validation, and Showdown paste import/export.
- Explainable suggestion engine using four signals (staged, see below).

Out of scope for v1:
- Shared live drafts, accounts, or any server-side state.
- Evaluating the bring-4/bring-6 subset of a roster for a given match. The engine evaluates the full roster.
- Learned or embedding-based suggestions.
- Mobile-specific layouts (the UI should not break on narrow screens, but it is not designed for them).

## Findings that shaped the design (verified 2026-09-20)

- The current VGC ladder is **Pokémon Champions**. Showdown lists `[Gen 9 Champions] VGC 2026 Reg M-B` and `Reg M-C`, each with a Bo3 variant. The older `gen9vgc…` formats are not current.
- Smogon publishes gzipped JSON usage data, for example `https://www.smogon.com/stats/2026-08/chaos/gen9championsvgc2026regmb-1760.json.gz`. The trailing number is the rating cutoff (0, 1500, 1630, 1760). The chaos file includes teammates, moves, items, abilities, and spreads.
- Showdown's `pokedex.json` and `learnsets.json` (under `play.pokemonshowdown.com/data/`) and `config/formats.ts` on GitHub are served with `Access-Control-Allow-Origin: *`.
- Smogon's stats pages send no CORS header, so the browser cannot fetch them directly. This is why a sync step exists.
- As of 2026-08 the latest stats month has Reg M-B data. Reg M-C exists as a format but has **no stats yet** (no `regmc` files in 2026-08).
- **Champions legality is not in the static JSON or in `formats.ts` rules.** Each format points at a Showdown mod (`champions` for M-C, `championsregmb` for M-B). Legality, learnsets, moves, abilities and items live in TypeScript files under `data/mods/champions/`; a species is illegal when its `formats-data.ts` entry has `isNonstandard: "Past"`. The static `pokedex.json` / `moves.json` reflect the mainline games only. `abilities.json` and `items.json` do not exist under `/data/`.
- The `pokemon-showdown` npm package (v0.11.11, published 2026-07-28, ~147 MB unpacked) loads these mods through `Dex.mod(...)`. Whether that release includes Reg M-C is verified by the first plan task.
- Flat Rules for these formats: level 50, Species Clause, Item Clause = 1, Mythical and Restricted Legendary banned, Bring 6 pick 3–6 depending on game type.
- **Smogon chaos semantics (verified against `2026-08/chaos/gen9championsvgc2026regmb-1630.json.gz`):** `usage` is the fraction of teams containing the Pokémon (sums to 6 across the file, matching team size). A Pokémon's weighted appearance count is `W = sum(Abilities values)`; `W / usage ≈ 195,000` (weighted team count) for every Pokémon tested. `Raw count` is a different unit and is not used. `Teammates` values are raw weighted co-occurrence counts in the same units as `W`, and are symmetric (Kingambit→Incineroar = Incineroar→Kingambit = 14,648).
- **Champions spreads are a nature plus six stat points of 0–32 each, summing to 66** (for example `Jolly:2/32/0/0/0/32`), not EVs and IVs.
- The chaos file for one format and cutoff is ~13.8 MB uncompressed (283 Pokémon), so the snapshot prunes it.

## Architecture

One TypeScript repository. Dependencies point one way: `app → engine → domain`, and `sync → domain`. The engine never imports from `app`.

```
sync/            Data-sync script (Node). Fetches, normalizes, writes snapshots.
data/<formatId>/ Committed snapshots: snapshot.json + meta.json.
src/domain/      Shared types: species, sets, league config, draft state.
src/engine/      Suggestion engine. Pure functions, no UI or browser dependencies.
src/app/         React UI: league setup, draft board, teambuilder, suggestions panel.
```

Stack: TypeScript, React, Vite. The sync script needs Node 20 or later (not currently installed on the development machine). Hosting is a static site plus a scheduled job that runs the sync and rebuilds. There is no server and no database. League state lives in browser storage.

## Data layer

**Sources**
- The `pokemon-showdown` npm package, loaded through `Dex` for the format's mod: legal species (types, base stats, abilities, tags), legal moves, learnsets, and the format's rules. This replaces the static-JSON approach in the original draft, which cannot express Champions legality. Ability and item description tables are not fetched in v1; names come from species data and usage data.
- Smogon chaos JSON: usage, teammates, and common moves, items, abilities, spreads per Pokémon.

**Sync script** fetches and normalizes these, drops fields the app does not use, and writes `data/<formatId>/snapshot.json` plus `meta.json` (source stats month, fetch time, rating cutoff). It runs on a schedule and on demand.

**Decisions**
- Everything is keyed by a format id such as `gen9championsvgc2026regmc`. Supporting a new regulation is a config change, not a code change.
- The default rating cutoff is 1630 and is configurable per format. The sync uses the latest stats month that has data for the chosen format.
- Missing usage data is an expected state. The snapshot marks usage as unavailable and the engine falls back to the other signals.
- **Usage fallback:** a format may list several stats format ids in priority order. Reg M-C is configured to use Reg M-B stats until M-C stats are published. The snapshot's `meta.json` records which stats format and month were used and whether it was a fallback, and the UI must show this. Usage entries for species that are not legal in the target format are dropped, with a warning.
- The snapshot stores, per species, `weight` (`W` above) and `usage`, plus the snapshot-wide weighted team count, so the engine can compute lift.
- Parsing is defensive. If a source's shape changes, the sync fails loudly and the last good snapshot is kept.
- The app never fetches Smogon directly. It reads only the snapshot.
- The set model uses a nature plus six stat points (0–32 each, total 66), matching the Smogon spread data, and has no EVs or IVs. The 32 and 66 limits are observed in the data and are confirmed against the Showdown Champions mod (`scripts.ts`) before set validation is implemented.

## League config

Saved in browser storage, with export/import as JSON.

- **Basics:** league name, format id (chosen from synced formats), number of drafters.
- **Draft order:** ordered drafters, snake or linear, number of rounds, and the user's slot. The number of rounds is the roster size.
- **Points:** a point value per Pokémon (CSV import or manual table) and a team budget. Unpriced Pokémon are treated as unavailable.
- **League rules:** extra bans and per-team limits (for example a species clause) layered on top of the regulation's rules.

## Draft board

Records picks (pick number, drafter, Pokémon) and derives:
- the available pool: undrafted, legal, and priced;
- the user's remaining budget and open roster slots;
- whose turn it is.

Supports undo of the last pick.

## Teambuilder

Covers the user's roster only.
- Each slot holds a species and an optional set (moves, item, ability, tera or format equivalent, stat spread). A slot may hold only a species.
- Sets are validated against the format rules and the learnset, with plain-language errors such as "can't learn X in this format".
- Import and export use Showdown paste format.

## Suggestion engine

Signature: `suggest(roster, availablePool, budget, snapshot, options) → ranked suggestions`. A pure function with no knowledge of the UI. `options` carries UI-controlled inputs (which slot is being filled, filters, signal weight overrides).

**Pipeline:** candidates → per-signal scores → combined ranking → structured reasons.

**Candidates** are the available pool, restricted to Pokémon whose price fits the remaining budget after reserving the cheapest available price for each other empty slot.

**Signals.** Each scorer returns a score in [0, 1] plus reasons, or "no data".
1. **Usage-stat teammates.** Uses Smogon teammate data as *lift*: how often the candidate appears with the roster's Pokémon versus its overall usage. Raw frequency is not used because it only recommends popular picks; lift surfaces rarely used Pokémon that are disproportionately common alongside the roster. Formula: `lift(candidate | given) = co(given, candidate) / (W_given × usage_candidate)`, where `co` is the symmetric co-occurrence weight. A missing co-occurrence entry means "not observed among the stored top teammates", which is treated as no data for that pair, not as lift 0. Lift above 1 means the pair appears together more often than chance.
2. **Type synergy.** Scores how the candidate covers the roster's shared weaknesses, adds resistances, and widens offensive coverage, computed from types and moves.
3. **Role and mechanics.** Uses a tag table (speed control, Fake Out, redirection, Intimidate, weather and terrain setters, ability combos) and checks what the roster lacks. The table starts small and hand-curated, partly derived from moves and abilities in the snapshot.
4. **Set-specific.** Adjusts when sets are entered, for example a partner that benefits from the roster's move or item. Returns "no data" when no relevant set detail exists.

**Combining.** Weighted sum over signals that returned data, with weights re-normalized when a signal is missing. Initial default weights: usage lift 0.35, type synergy 0.30, role 0.25, set-specific 0.10. These are starting values to tune and are adjustable in the UI.

**Output.** A ranked list; each entry has a score, a per-signal breakdown, and typed reasons such as `{kind: "covers-weakness", type: "Fairy", by: "Steel typing"}`. The UI renders reasons as sentences; the engine never produces display text.

**Staging.** Stage 1: the pipeline plus type synergy and usage lift. Stage 2: role tags. Stage 3: set-specific scoring. The engine interface is unchanged across stages.

## Error handling

- **Sync:** fails loudly and keeps the last good snapshot. The app shows the snapshot's age and warns when it is stale.
- **Missing usage data:** a soft state. The engine drops that signal and the UI says so.
- **Bad user input:** invalid sets and unpriced Pokémon get inline plain-language messages. A bad import never crashes the app.
- **Corrupt saved league:** fails validation on load and offers "reset" or "export raw JSON".

## Testing

- **Engine:** unit tests on small hand-built rosters with known answers (shared Fairy weakness, lift calculation, budget cutoff, missing-signal re-normalization).
- **Sync parsers:** tests against saved fixture files from the real sources, so a source format change breaks a test rather than production.
- **Draft board:** snake order, undo, and pool derivation.
- **UI:** a few end-to-end flows: create a league, record picks, build a team, see suggestions.

## Build order

The data layer comes first because everything depends on it. Then domain types, league config and draft board, teambuilder, and the engine in its three stages. Each can be planned and built as its own increment.
