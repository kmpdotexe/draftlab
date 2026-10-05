# Setup: price tiers and a bans list — Design

Date: 2026-10-05. Status: design approved in conversation; awaiting spec review.

Parents: `docs/superpowers/specs/2026-09-29-app-draft-room-design.md` (Views → Setup, the store, sentences) and its successors for the teambuilder and hosting. The domain, the engine, the draft file format and the reducer are used as they are.

## Purpose

League setup today shows a CSV box and a table of all 355 legal Pokémon, each with an empty points box and a Ban checkbox. Users found it intimidating. This change replaces the table with a short **tier board** (Pokémon grouped by price), offers three clear starting points (paste a list, start from suggested prices, build tiers by hand), and moves bans into their own small list.

## Decisions (settled in brainstorming)

- Leagues get prices both ways: from an organizer's list and by inventing tiers; both must be easy.
- **A tier is all the Pokémon with the same points.** Tiers are a view of `league.prices`, not stored: the draft file, `validateLeague`, the reducer and exports are unchanged. Tiers have no names.
- **Suggested prices** fill tiers from ladder usage, with editable tier sizes and points.
- **Bans** are a separate search-and-add list.

## Facts established (2026-10-05, committed snapshot, usage 2026-09)

- 355 legal species, 220 of them with ladder usage.
- `LeagueConfig.prices: Record<ID, number>` (no entry = not draftable), `extraBans: ID[]`; `validateLeague` requires whole numbers ≥ 0; the reducer refuses a league change that would break a recorded pick (`this would break pick N: …`).
- `parsePriceCsv(text, snapshot)` returns matched prices, unmatched names and problems by line (unchanged, reused).
- The teambuilder's `OptionPicker` (`src/app/team/OptionPicker.tsx`) is a keyboard-operable combobox over a list of options (reused for "Add a Pokémon…").
- Tests that use today's table: `setup.flow.test.tsx` ("Points for Torkoal"), `room.flow.test.tsx` and `team.flow.test.tsx` ("Ban Incineroar", "Ban Garchomp").

## Out of scope

Named tiers, tier colours, drag and drop, saving tier layouts separately from prices, price history, changes to the draft room or teambuilder, and any change to `src/domain/`, `src/engine/` or the draft file.

## The prices area

Inside `SetupView`, replacing `PriceTable` (the league fields, the Save/Start draft button and the rest of setup stay as they are).

**Start here** — shown while no Pokémon has a price. Heading "How do you want to set prices?" and three choices, each a button that opens its panel below:
1. **Paste or upload a price list** — today's `PriceImport` (textarea, Import, Upload a file, the result lines), plus an example line under the label ("Garchomp,16") and a **Download a template** button: a CSV of every legal Pokémon's display name with an empty points column, header `Pokemon,Points`, file `draftlab-prices-template.csv`, sorted by name.
2. **Start from suggested prices** — the suggestion form (below).
3. **Build tiers by hand** — creates one empty 10-point tier and shows the board.

Once any price exists, the board is shown, with the three choices still available as small buttons above it ("Paste a list", "Suggest prices", "Add tier").

**The tier board.**
- One card per distinct point value, highest first. Card heading: "{points} points · {n} Pokémon" (singular "1 Pokémon"). An input "Points for this tier" (whole number ≥ 0) changes every member's price; an invalid or blank value is not applied and shows "Whole points, 0 or more". **Remove tier** (asks "Remove the {points}-point tier? Its {n} Pokémon will not be in this draft." when it is not empty).
- Members as tags in name order: "Garchomp ×"; the × is a button named "Remove Garchomp from the {points}-point tier" and moves it to "Not in this draft". A drafted member also shows "drafted by {drafter}".
- **Add a Pokémon…** (an `OptionPicker` over every legal Pokémon not in this tier, by display name): picking one sets its price to the tier's points. When it was in another tier, a note says "{name} moved from {old} to {new} points."
- Changing a tier's points onto a value another tier already has merges them; note: "Merged into the {points}-point tier."
- **Add tier** creates an empty tier. Its points (`nextTierPoints`): 10 when there are no tiers; otherwise half the lowest tier's points rounded down (5 below 10) when that is lower than the lowest tier; otherwise (the lowest tier is 0 or 1) the highest tier's points plus 5. The value can be edited at once. Empty tiers live only in the view (they have no Pokémon, so no prices) until a Pokémon is added; they disappear on reload.
- **Not in this draft ({n})** — a collapsed `<details>` with a search box and a list of the unpriced legal Pokémon (name and types), each with an **Add to tier** select over the current tiers' points.
- Notes (moved / merged / not applied) appear in one polite live region above the board and are replaced by the next note.

**Suggested prices.** `suggestedPrices(snapshot, tiers)` (pure, `src/app/setup/suggest-prices.ts`): ranks legal Pokémon with usage by `usage` descending (ties by display name), and fills `tiers` in order, each `{ count, points }`; then every remaining Pokémon with usage gets `restPoints` (or nothing when `restPoints` is null); Pokémon without usage get no price. Defaults: `[{count: 10, points: 20}, {count: 20, points: 15}, {count: 30, points: 10}, {count: 60, points: 5}]`, `restPoints: 1`. The form shows these rows as editable number pairs ("Top {count} at {points} points"), an "Everyone else with ladder use at {restPoints} points" row (with a "leave them out" checkbox), a preview line ("120 Pokémon in 4 tiers, 100 more at 1 point; 135 without ladder use are left out"), and **Apply**. With prices already set, Apply asks "Replace the current prices with the suggested ones?". With no usage data the choice is disabled and says "No ladder data to suggest from." Apply replaces `prices` entirely (bans are untouched).

**Price list import** behaves as today: matched prices replace those Pokémon's prices; the result shows "{n} prices imported.", the unmatched names and the problems by line.

## Bans

A section "Banned in this league" below the board: a short note ("A banned Pokémon cannot be drafted even if it has a price."), an `OptionPicker` "Ban a Pokémon…" over legal Pokémon not yet banned, and the bans as tags "{name} ×" (button "Unban {name}"). Empty state: "No extra bans." A banned Pokémon that is priced also shows "banned" on its tag in the board.

## Mid-draft editing

Unchanged rules: the setup still saves through `set-league`, so removing a drafted Pokémon's price, changing a price so a recorded pick no longer fits, or banning a drafted Pokémon is refused with the existing "this would break pick N: …" message, shown as today. The board's "drafted by" marks explain which Pokémon are affected.

## Architecture

```
src/app/setup/
  tiers.ts             pure: tiersOf(prices, legalIds), nextTierPoints(tiers), templateCsv(snapshot)
  suggest-prices.ts    pure: DEFAULT_SUGGESTION, suggestedPrices(snapshot, suggestion)
  PriceStart.tsx       the three starting choices
  SuggestPrices.tsx    the suggestion form
  TierBoard.tsx        tier cards, add/remove, merge and move notes, "Not in this draft"
  BanList.tsx          the bans section
  PriceImport.tsx      gains the example line and the template download
  SetupView.tsx        uses PriceStart / TierBoard / BanList instead of PriceTable
  PriceTable.tsx       removed
```

`SetupView` keeps owning `prices` and `bans` state (as today) and passes setters down; `TierBoard` keeps the empty tiers and the note as view state. `BrowserActions.download` is used for the template.

## Testing

- **`tiers.test.ts`:** grouping by points, order, counts, unpriced list; `nextTierPoints` cases (no tiers, halving, lowest tier 0 or 1); the template's header, row count (355) and sorting.
- **`suggest-prices.test.ts`:** defaults on the real snapshot (tier sizes 10/20/30/60, 100 at 1 point, the rest unpriced, the top Pokémon at 20); ties by name; `restPoints: null`; counts larger than the Pokémon with usage; no usage data gives an empty result.
- **UI flows (jsdom, real snapshot):** a fresh setup shows the three choices; suggested prices then Start draft (the saved league has the suggested prices); paste a list, then move one Pokémon to another tier and change a tier's points (merge note); build by hand: add tier, add Pokémon, remove one; the template download; ban and unban; the existing mid-draft refusals (ban a drafted Pokémon; remove a drafted Pokémon's price) with the new controls. The existing tests that use "Points for …" and "Ban …" are rewritten for the board and the bans list with the same assertions.
- **Browser test:** the first gate test keeps pasting a CSV; it still finds "6 prices imported." and the board.

## Plan-time pre-verification

Measure the suggestion on the real snapshot (tier sizes, how many Pokémon end up unpriced); check `OptionPicker` works for a 355-entry list (filtering and the 8-option cap); confirm every existing test that touches setup prices is found and rewritten.
