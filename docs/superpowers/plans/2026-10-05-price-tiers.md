# Setup: Price Tiers and a Bans List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace league setup's 355-row price table with three clear starting points (paste a list, suggested prices from ladder use, build by hand), a tier board (Pokémon grouped by price) and a separate bans list.

**Architecture:** Tiers are a view of `league.prices` (Pokémon with the same points), computed by pure helpers in `src/app/setup/tiers.ts`; suggested prices come from `src/app/setup/suggest-prices.ts`. New components under `src/app/setup/` replace `PriceTable`; `SetupView` keeps owning `prices` and `bans`, so the draft file, `validateLeague` and the reducer are unchanged.

**Tech Stack:** React 19 + TypeScript (strict, ESM), hand-written CSS; Vitest 5 + jsdom + React Testing Library; Playwright for the browser tests.

**Spec:** `docs/superpowers/specs/2026-10-05-price-tiers-design.md`. Read it first; it is the binding authority for this plan.

## Global Constraints

- No change to `src/domain/`, `src/engine/`, the draft file format or the reducer. No new dependencies.
- A tier is all the Pokémon with the same points; tiers have no names and are not stored. Empty tiers are view state only.
- Suggested prices: legal Pokémon with usage ranked by `usage` descending, ties by display name; defaults `{10 at 20, 20 at 15, 30 at 10, 60 at 5}`, everyone else with usage at 1; Pokémon without usage get no price; Apply replaces all prices (asks first when prices exist: "Replace the current prices with the suggested ones?").
- `nextTierPoints`: 10 with no tiers; half the lowest tier rounded down when the lowest is 2 or more; otherwise the highest plus 5.
- Texts as in the spec: "How do you want to set prices?", the three choices, "{points} points · {n} Pokémon", "Points for this tier", "Whole points, 0 or more", "Remove tier" and its question, "Remove {name} from the {points}-point tier", "{name} moved from {old} to {new} points.", "Merged into the {points}-point tier.", "Not in this draft ({n})", "Banned in this league", "Unban {name}", "No extra bans.", "drafted by {drafter}", the template file `draftlab-prices-template.csv` with header `Pokemon,Points`.
- Real-data tests assert relationships, not this month's numbers (the data refreshes weekly).
- Commits end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (copy it verbatim; never substitute another model name).

**Plan clarifications (rulings on gaps in the spec, made at plan time):**
1. **A tier's points are applied on Enter or when the box loses focus**, not on every keystroke: typing "25" over "20" would otherwise pass through "2" and could merge into a 2-point tier by accident (merges cannot be undone).
2. **"Add a Pokémon…" reuses the teambuilder's `OptionPicker`** with `noneLabel` "Add a Pokémon…" (also its placeholder); choosing that none entry does nothing. The bans list uses it the same way ("Ban a Pokémon…").
3. **`SetupView` gains an `actions: BrowserActions` prop** (for the template download and the questions), and `Workspace` passes it.
4. **The "Not in this draft" list is rendered only while it is open**, and `TierBoard` is memoised: typing in the league fields re-rendered all ~350 unpriced rows (each with a tier select), which made the jsdom flow tests time out.
5. **The starting choices stay visible above the board** in a compact form ("Prices: more ways to fill them": Paste…, Suggest…); "Add tier" is on the board itself.
6. **`rankedByUsage` and `suggestionSummary`** are exported from `suggest-prices.ts` for the preview line and the tests.
7. **The suggestion preview** says "{n} without ladder use are left out" by default and "{n} others are left out" when "leave them out" is ticked.

## Pre-verification results (measured 2026-10-05 with the prototype of this plan's code, on the committed snapshot, usage 2026-09)

The plan's code was built and run in full before this plan was written, and the plan was then replayed task by task in a clean checkout of 449300b (each task's commands, edits and files applied exactly as written below): every task ends green and every prototype file is reproduced byte for byte.

Unit test counts after Tasks 1 to 4: 760, 760, 768, 768 (baseline 752). Typecheck is clean after every task, the build succeeds after Task 4, and the 4 browser tests pass after Task 3. The 21 integration tests are unchanged.

- **Suggestion on the real snapshot:** 355 legal Pokémon, 220 with usage: tiers of 10/20/30/60 at 20/15/10/5, 100 more at 1 point, 135 left out. The preview reads "120 Pokémon in 4 tiers, 100 more at 1 point; 135 without ladder use are left out."
- **`OptionPicker` with 355 entries** filters by name and shows at most 8 options; typing a full name and Enter picks it (the flow tests do this for Garchomp, Kingambit, Torkoal and Incineroar).
- **Every test that used the table** was found and rewritten: `setup.flow.test.tsx` ("Points for Torkoal", the "Search" box), `room.flow.test.tsx` and `team.flow.test.tsx` ("Ban Incineroar", "Ban Garchomp"), and the first browser test (it now opens "Paste or upload a price list" first).
- **Speed:** before clarification 4 the first setup flow test timed out (15 s); after it, the three changed flow files take about 33 s together and the new `prices.flow.test.tsx` (8 tests) about 10 s.
- **Looks:** checked in the dev server: the three choices, the suggestion form (narrow number boxes) and the board with tags.

## Environment notes

- Windows + PowerShell. A fresh shell may not find `node`/`npm`. Start every PowerShell command with:
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User");`
- The repo path contains a space: quote it.
- Single test file: `npx vitest run <path>`. Whole unit suite: `npm test`. Types: `npm run typecheck`. Browser tests: `npm run e2e`. The baseline before this plan is 752 unit tests, 21 integration tests and 4 browser tests, all passing.
- Work on branch `feat/price-tiers` (already created; the spec is committed at 449300b).
- Every file block below is the complete file content: create the file, or replace the existing file entirely, with exactly that text. Edits to existing files are exact find/replace pairs (each find text occurs exactly once; files may have CRLF line endings, so match the text). If a line fails typecheck, report the exact error and apply the smallest fix that keeps the test's intent; do not silently rewrite a test.

---

## File Structure

```
Create: src/app/setup/tiers.ts, tiers.test.ts                    Tier, tiersOf, unpricedOf, nextTierPoints, templateCsv
Create: src/app/setup/suggest-prices.ts, suggest-prices.test.ts  PriceSuggestion, DEFAULT_SUGGESTION, rankedByUsage, suggestedPrices, suggestionSummary
Create: src/app/setup/TierBoard.tsx, BanList.tsx, SuggestPrices.tsx, PriceStart.tsx
Modify: src/app/setup/PriceImport.tsx                            example line, Download a template
Modify: src/app/setup/SetupView.tsx (replace), src/app/Workspace.tsx   the new prices area; actions
Delete: src/app/setup/PriceTable.tsx
Create: src/app/prices.flow.test.tsx
Modify: src/app/setup.flow.test.tsx (replace), room.flow.test.tsx, team.flow.test.tsx, e2e/app.e2e.ts
Modify: src/app/app.css, docs/STATUS.md, README.md
```

Task 2 adds components that Task 3 wires in and tests through the whole app; its gate is the typecheck.

---

### Task 1: Tiers and suggested prices

**Files:**
- Create: `src/app/setup/tiers.ts`, `src/app/setup/tiers.test.ts`, `src/app/setup/suggest-prices.ts`, `src/app/setup/suggest-prices.test.ts`

**Interfaces:**
- Consumes: `ID`, `SpeciesEntry`, `Snapshot`, `UsageEntry` (domain types); `speciesEntry` (`src/domain/test-support.ts`); `realData()` (`src/app/test-support.ts`).
- Produces: `interface Tier { points: number; members: ID[] }`; `tiersOf(prices, species): Tier[]` (highest first, members by name, non-legal ids ignored); `unpricedOf(prices, species): ID[]`; `nextTierPoints(points: readonly number[]): number`; `templateCsv(species): string`; `interface PriceSuggestion { tiers: ReadonlyArray<{count: number; points: number}>; restPoints: number | null }`; `DEFAULT_SUGGESTION`; `rankedByUsage(snapshot): ID[]`; `suggestedPrices(snapshot, suggestion): Record<ID, number>`; `interface SuggestionSummary { tiered; tierCount; rest; left }`; `suggestionSummary(snapshot, suggestion)`.

- [ ] **Step 1: Write the tests: create `src/app/setup/tiers.test.ts` and `src/app/setup/suggest-prices.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { realData } from '../test-support';
import { nextTierPoints, templateCsv, tiersOf, unpricedOf } from './tiers';

const species = {
  a: { name: 'Alpha' },
  b: { name: 'Bravo' },
  c: { name: 'Charlie' },
  d: { name: 'Delta' },
};

describe('tiersOf / unpricedOf', () => {
  it('groups legal Pokémon by points, highest first, members by name', () => {
    expect(tiersOf({ d: 5, a: 20, c: 5, zz: 20 }, species)).toEqual([
      { points: 20, members: ['a'] },
      { points: 5, members: ['c', 'd'] },
    ]);
    expect(tiersOf({}, species)).toEqual([]);
  });

  it('lists the unpriced legal Pokémon by name, and keeps a 0-point tier', () => {
    expect(unpricedOf({ b: 0 }, species)).toEqual(['a', 'c', 'd']);
    expect(tiersOf({ b: 0 }, species)).toEqual([{ points: 0, members: ['b'] }]);
  });
});

describe('nextTierPoints', () => {
  it('starts at 10, halves the lowest tier, and goes above the highest when it cannot halve', () => {
    expect(nextTierPoints([])).toBe(10);
    expect(nextTierPoints([20, 10])).toBe(5);
    expect(nextTierPoints([3])).toBe(1);
    expect(nextTierPoints([15, 1])).toBe(20);
    expect(nextTierPoints([0])).toBe(5);
  });
});

describe('templateCsv', () => {
  it('has a header and one empty-priced row per legal Pokémon, by name', () => {
    expect(templateCsv(species)).toBe('Pokemon,Points\nAlpha,\nBravo,\nCharlie,\nDelta,\n');
    const real = templateCsv(realData().snapshot.species).trimEnd().split('\n');
    expect(real).toHaveLength(Object.keys(realData().snapshot.species).length + 1);
    expect(real).toContain('Garchomp,');
  });
});
```

```ts
import { describe, expect, it } from 'vitest';
import { speciesEntry } from '../../domain/test-support';
import type { Snapshot, UsageEntry } from '../../domain/types';
import { realData } from '../test-support';
import { DEFAULT_SUGGESTION, rankedByUsage, suggestedPrices, suggestionSummary } from './suggest-prices';

const usageEntry = (id: string, usage: number): UsageEntry => ({
  id,
  weight: 1,
  usage,
  abilities: [],
  items: [],
  moves: [],
  spreads: [],
  teammates: [],
});

// b and c tie on usage (Bravo before Charlie by name); d has no usage; zz is not legal.
const snapshot: Pick<Snapshot, 'species' | 'usage'> = {
  species: {
    a: speciesEntry('a', 'Alpha'),
    b: speciesEntry('b', 'Bravo'),
    c: speciesEntry('c', 'Charlie'),
    d: speciesEntry('d', 'Delta'),
  },
  usage: {
    teams: 10,
    cutoff: 1630,
    battles: 5,
    species: { c: usageEntry('c', 0.3), a: usageEntry('a', 0.5), b: usageEntry('b', 0.3), zz: usageEntry('zz', 0.9) },
  },
};

describe('suggestedPrices', () => {
  it('fills the tiers in usage order, ties by name, then the rest; no usage, no price', () => {
    expect(rankedByUsage(snapshot)).toEqual(['a', 'b', 'c']);
    const suggestion = { tiers: [{ count: 1, points: 20 }, { count: 1, points: 10 }], restPoints: 1 };
    expect(suggestedPrices(snapshot, suggestion)).toEqual({ a: 20, b: 10, c: 1 });
    expect(suggestionSummary(snapshot, suggestion)).toEqual({ tiered: 2, tierCount: 2, rest: 1, left: 1 });
  });

  it('leaves the rest out with restPoints null, and copes with tiers larger than the ranked list', () => {
    const suggestion = { tiers: [{ count: 2, points: 9 }, { count: 50, points: 4 }, { count: 5, points: 2 }], restPoints: null };
    expect(suggestedPrices(snapshot, suggestion)).toEqual({ a: 9, b: 9, c: 4 });
    expect(suggestionSummary(snapshot, suggestion)).toEqual({ tiered: 3, tierCount: 2, rest: 0, left: 1 });
  });

  it('is empty without usage data', () => {
    expect(suggestedPrices({ ...snapshot, usage: null }, DEFAULT_SUGGESTION)).toEqual({});
    expect(suggestionSummary({ ...snapshot, usage: null }, DEFAULT_SUGGESTION)).toEqual({ tiered: 0, tierCount: 0, rest: 0, left: 4 });
  });

  it('gives the default tier sizes on the real snapshot, the most used Pokémon at 20', () => {
    const { snapshot: real } = realData();
    const ranked = rankedByUsage(real);
    expect(ranked.length).toBeGreaterThan(120);
    const prices = suggestedPrices(real, DEFAULT_SUGGESTION);
    const count = (points: number) => Object.values(prices).filter((p) => p === points).length;
    expect([count(20), count(15), count(10), count(5)]).toEqual([10, 20, 30, 60]);
    expect(count(1)).toBe(ranked.length - 120);
    expect(prices[ranked[0]]).toBe(20);
    expect(Object.keys(prices)).toHaveLength(ranked.length);
    const summary = suggestionSummary(real, DEFAULT_SUGGESTION);
    expect(summary).toEqual({ tiered: 120, tierCount: 4, rest: ranked.length - 120, left: Object.keys(real.species).length - ranked.length });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/app/setup/tiers.test.ts src/app/setup/suggest-prices.test.ts`
Expected: FAIL (`tiers.ts` and `suggest-prices.ts` do not exist).

- [ ] **Step 3: Create `src/app/setup/tiers.ts` and `src/app/setup/suggest-prices.ts`**

```ts
import type { ID } from '../../domain/id';
import type { SpeciesEntry } from '../../domain/types';

/** All the Pokémon with the same price: a tier is a view of `league.prices`, not stored. */
export interface Tier {
  points: number;
  /** Species ids in display-name order. */
  members: ID[];
}

type SpeciesTable = Readonly<Record<ID, Pick<SpeciesEntry, 'name'>>>;

const byName = (species: SpeciesTable) => (a: ID, b: ID) => species[a].name.localeCompare(species[b].name);

/** The priced legal Pokémon grouped by points, highest first. Prices for ids that are not legal are ignored. */
export function tiersOf(prices: Readonly<Record<ID, number>>, species: SpeciesTable): Tier[] {
  const groups = new Map<number, ID[]>();
  for (const [id, points] of Object.entries(prices)) {
    if (!Object.hasOwn(species, id)) continue;
    groups.set(points, [...(groups.get(points) ?? []), id]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([points, members]) => ({ points, members: members.sort(byName(species)) }));
}

/** The legal Pokémon with no price (not in this draft), in display-name order. */
export function unpricedOf(prices: Readonly<Record<ID, number>>, species: SpeciesTable): ID[] {
  return Object.keys(species)
    .filter((id) => !Object.hasOwn(prices, id))
    .sort(byName(species));
}

/**
 * The points for a new, empty tier: 10 with no tiers; half the lowest tier (rounded down) when that is lower
 * than it; otherwise (the lowest tier is 0 or 1) the highest tier plus 5.
 */
export function nextTierPoints(points: readonly number[]): number {
  if (points.length === 0) return 10;
  const lowest = Math.min(...points);
  return lowest >= 2 ? Math.floor(lowest / 2) : Math.max(...points) + 5;
}

/** A price-list template: every legal Pokémon's display name with an empty points column, sorted by name. */
export function templateCsv(species: SpeciesTable): string {
  const names = Object.values(species)
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  return ['Pokemon,Points', ...names.map((name) => `${name},`)].join('\n') + '\n';
}
```

```ts
import type { ID } from '../../domain/id';
import type { Snapshot } from '../../domain/types';

/** How to turn ladder usage into prices: the most used Pokémon fill the tiers in order. */
export interface PriceSuggestion {
  tiers: ReadonlyArray<{ count: number; points: number }>;
  /** Points for every other Pokémon with ladder use, or null to leave them out of the draft. */
  restPoints: number | null;
}

export const DEFAULT_SUGGESTION: PriceSuggestion = {
  tiers: [
    { count: 10, points: 20 },
    { count: 20, points: 15 },
    { count: 30, points: 10 },
    { count: 60, points: 5 },
  ],
  restPoints: 1,
};

type UsageSnapshot = Pick<Snapshot, 'species' | 'usage'>;

/** Legal Pokémon with ladder usage, most used first; ties by display name. */
export function rankedByUsage(snapshot: UsageSnapshot): ID[] {
  const usage = snapshot.usage;
  if (usage === null) return [];
  return Object.values(usage.species)
    .filter((entry) => Object.hasOwn(snapshot.species, entry.id))
    .sort((a, b) => b.usage - a.usage || snapshot.species[a.id].name.localeCompare(snapshot.species[b.id].name))
    .map((entry) => entry.id);
}

/** A whole price list from ladder usage. Pokémon without usage get no price; no usage data gives an empty list. */
export function suggestedPrices(snapshot: UsageSnapshot, suggestion: PriceSuggestion): Record<ID, number> {
  const ranked = rankedByUsage(snapshot);
  const prices: Record<ID, number> = {};
  let next = 0;
  for (const { count, points } of suggestion.tiers) {
    for (const id of ranked.slice(next, next + Math.max(0, count))) prices[id] = points;
    next += Math.max(0, count);
  }
  if (suggestion.restPoints !== null) for (const id of ranked.slice(next)) prices[id] = suggestion.restPoints;
  return prices;
}

export interface SuggestionSummary {
  /** Pokémon placed in the listed tiers. */
  tiered: number;
  /** Listed tiers that receive at least one Pokémon. */
  tierCount: number;
  /** Other Pokémon with ladder use, priced at `restPoints` (0 when it is null). */
  rest: number;
  /** Legal Pokémon left out of the draft. */
  left: number;
}

/** What `suggestedPrices` would do, for the preview line. */
export function suggestionSummary(snapshot: UsageSnapshot, suggestion: PriceSuggestion): SuggestionSummary {
  const ranked = rankedByUsage(snapshot).length;
  const legal = Object.keys(snapshot.species).length;
  let tiered = 0;
  let tierCount = 0;
  for (const { count } of suggestion.tiers) {
    const placed = Math.min(Math.max(0, count), ranked - tiered);
    if (placed > 0) tierCount++;
    tiered += placed;
  }
  const rest = suggestion.restPoints === null ? 0 : ranked - tiered;
  return { tiered, tierCount, rest, left: legal - tiered - rest };
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run src/app/setup` then `npm test` then `npm run typecheck`
Expected: PASS (8 tests); the whole suite then has 760 tests; typecheck clean.

Mutation proof (do it, then undo it): in `rankedByUsage`, delete ` || snapshot.species[a.id].name.localeCompare(snapshot.species[b.id].name)`; the test "fills the tiers in usage order, ties by name, then the rest" must fail. Restore the line.

- [ ] **Step 5: Commit**

```bash
git add src/app/setup/tiers.ts src/app/setup/tiers.test.ts src/app/setup/suggest-prices.ts src/app/setup/suggest-prices.test.ts
git commit -m "feat(app): price tiers as a view of prices, and suggested prices from ladder use" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The tier board, the bans list, the suggestion form and the starting choices

**Files:**
- Create: `src/app/setup/TierBoard.tsx`, `src/app/setup/BanList.tsx`, `src/app/setup/SuggestPrices.tsx`, `src/app/setup/PriceStart.tsx`
- Modify: `src/app/setup/PriceImport.tsx`

**Interfaces:**
- Consumes: Task 1; `OptionPicker` (`src/app/team/OptionPicker.tsx`) and `Option` (`src/app/team/options.ts`).
- Produces: `TierBoard(props: { species; prices; bans; draftedBy: Record<ID, string>; emptyTiers: readonly number[]; onEmptyTiers(points: number[]); onPrices(prices); confirm(message): boolean })` (memoised); `BanList(props: { species; bans; onBans(bans: ID[]) })`; `SuggestPrices(props: { snapshot; hasPrices; confirm; onApply(prices) })`; `type PricePanel = 'paste' | 'suggest' | null`; `PriceStart(props: { first; panel; onPanel(panel); onBuild() })`; `PriceImport` gains `onTemplate(): void`.

- [ ] **Step 1: Create the four components**

```tsx
import { memo, useMemo, useState } from 'react';
import type { ID } from '../../domain/id';
import type { SpeciesEntry } from '../../domain/types';
import { OptionPicker } from '../team/OptionPicker';
import type { Option } from '../team/options';
import { nextTierPoints, tiersOf, unpricedOf, type Tier } from './tiers';

type SpeciesTable = Readonly<Record<ID, SpeciesEntry>>;

interface Props {
  species: SpeciesTable;
  prices: Readonly<Record<ID, number>>;
  bans: readonly ID[];
  /** Drafter name per drafted species, to explain refusals before they happen. */
  draftedBy: Readonly<Record<ID, string>>;
  /** Tiers with no Pokémon yet (view state, kept by the setup view). */
  emptyTiers: readonly number[];
  onEmptyTiers(points: number[]): void;
  onPrices(prices: Record<ID, number>): void;
  confirm(message: string): boolean;
}

const POINTS_HINT = 'Whole points, 0 or more';

const parsePoints = (text: string): number | null => (/^\s*\d+\s*$/.test(text) ? Number(text) : null);
const pokemon = (n: number) => `${n} Pokémon`;

interface CardProps {
  tier: Tier;
  props: Props;
  options: readonly Option[];
  note(text: string): void;
}

function TierCard({ tier, props, options, note }: CardProps) {
  const { species, prices, bans, draftedBy, emptyTiers, onEmptyTiers, onPrices, confirm } = props;
  const [draft, setDraft] = useState<string | null>(null);
  const title = `${tier.points}-point tier`;
  const others = useMemo(() => options.filter((option) => prices[option.id] !== tier.points), [options, prices, tier.points]);

  const commitPoints = () => {
    if (draft === null) return;
    const points = parsePoints(draft);
    if (points === null) return;
    setDraft(null);
    if (points === tier.points) return;
    const merging = Object.values(prices).includes(points) || emptyTiers.includes(points);
    const rest = emptyTiers.filter((p) => p !== tier.points);
    onEmptyTiers(tier.members.length === 0 && !merging ? [...rest, points] : rest);
    if (tier.members.length > 0) {
      const next = { ...prices };
      for (const id of tier.members) next[id] = points;
      onPrices(next);
    }
    if (merging) note(`Merged into the ${points}-point tier.`);
  };

  const remove = () => {
    if (tier.members.length > 0 && !confirm(`Remove the ${title}? Its ${pokemon(tier.members.length)} will not be in this draft.`)) return;
    onEmptyTiers(emptyTiers.filter((p) => p !== tier.points));
    if (tier.members.length > 0) {
      const next = { ...prices };
      for (const id of tier.members) delete next[id];
      onPrices(next);
    }
  };

  const add = (id: ID | undefined) => {
    if (id === undefined) return;
    const before = Object.hasOwn(prices, id) ? prices[id] : undefined;
    onPrices({ ...prices, [id]: tier.points });
    onEmptyTiers(emptyTiers.filter((p) => p !== tier.points));
    if (before !== undefined && before !== tier.points) note(`${species[id].name} moved from ${before} to ${tier.points} points.`);
  };

  return (
    <section className="tier" role="group" aria-label={`${title}, ${pokemon(tier.members.length)}`}>
      <div className="tier-head">
        <h4>
          {tier.points} points · {tier.members.length === 1 ? '1 Pokémon' : pokemon(tier.members.length)}
        </h4>
        <label>
          Points for this tier{' '}
          <input
            type="number"
            min={0}
            step={1}
            value={draft ?? String(tier.points)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitPoints}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitPoints();
              }
            }}
          />
        </label>
        {draft !== null && parsePoints(draft) === null && <span className="field-error">{POINTS_HINT}</span>}
        <button type="button" className="danger" onClick={remove}>
          Remove tier
        </button>
      </div>
      <ul className="tags">
        {tier.members.map((id) => (
          <li key={id}>
            {species[id].name}
            {draftedBy[id] !== undefined && <span className="tag-note"> · drafted by {draftedBy[id]}</span>}
            {bans.includes(id) && <span className="tag-note"> · banned</span>}{' '}
            <button
              type="button"
              aria-label={`Remove ${species[id].name} from the ${title}`}
              onClick={() => {
                const next = { ...prices };
                delete next[id];
                onPrices(next);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <OptionPicker label={`Add a Pokémon to the ${title}`} options={others} value={undefined} valueName="" noneLabel="Add a Pokémon…" onChange={add} />
    </section>
  );
}

/**
 * The prices as tiers (Pokémon grouped by points), with the unpriced Pokémon in a collapsed group. Memoised, and
 * the unpriced list is only rendered while open: typing in the league fields must not re-render ~350 rows.
 */
export const TierBoard = memo(function TierBoard(props: Props) {
  const { species, prices, emptyTiers, onEmptyTiers, onPrices } = props;
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const options = useMemo<Option[]>(
    () =>
      Object.values(species)
        .map((entry) => ({ id: entry.id, name: entry.name, share: null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [species],
  );
  const priced = tiersOf(prices, species);
  const tiers: Tier[] = [...priced, ...emptyTiers.filter((p) => !priced.some((t) => t.points === p)).map((points) => ({ points, members: [] }))].sort(
    (a, b) => b.points - a.points,
  );
  const unpriced = unpricedOf(prices, species);
  const needle = search.trim().toLowerCase();
  const shown = unpriced.filter((id) => needle === '' || species[id].name.toLowerCase().includes(needle));

  return (
    <section className="tier-board" aria-labelledby="tier-board-title">
      <h3 id="tier-board-title">Prices</h3>
      <p aria-live="polite" className="note">
        {message}
      </p>
      {tiers.map((tier) => (
        <TierCard key={tier.points} tier={tier} props={props} options={options} note={setMessage} />
      ))}
      <button type="button" onClick={() => onEmptyTiers([...emptyTiers, nextTierPoints(tiers.map((t) => t.points))])}>
        Add tier
      </button>
      <details className="unpriced" onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>Not in this draft ({unpriced.length})</summary>
        <label>
          Search Pokémon not in this draft <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        {!open ? null : tiers.length === 0 ? (
          <p>Add a tier first.</p>
        ) : (
          <ul>
            {shown.map((id) => (
              <li key={id}>
                {species[id].name} <span className="types">{species[id].types.join(' / ')}</span>{' '}
                <select
                  aria-label={`Add ${species[id].name} to a tier`}
                  value=""
                  onChange={(event) => {
                    const points = Number(event.target.value);
                    onPrices({ ...prices, [id]: points });
                    onEmptyTiers(emptyTiers.filter((p) => p !== points));
                  }}
                >
                  <option value="">Add to tier…</option>
                  {tiers.map((tier) => (
                    <option key={tier.points} value={tier.points}>
                      {tier.points} points
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
});
```

```tsx
import { useMemo } from 'react';
import type { ID } from '../../domain/id';
import type { SpeciesEntry } from '../../domain/types';
import { OptionPicker } from '../team/OptionPicker';

interface Props {
  species: Readonly<Record<ID, SpeciesEntry>>;
  bans: readonly ID[];
  onBans(bans: ID[]): void;
}

/** The league's extra bans: search to add, × to remove. */
export function BanList({ species, bans, onBans }: Props) {
  const options = useMemo(
    () =>
      Object.values(species)
        .filter((entry) => !bans.includes(entry.id))
        .map((entry) => ({ id: entry.id, name: entry.name, share: null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [species, bans],
  );
  const nameOf = (id: ID) => (Object.hasOwn(species, id) ? species[id].name : id);

  return (
    <section className="ban-list" aria-labelledby="ban-list-title">
      <h3 id="ban-list-title">Banned in this league</h3>
      <p className="note">A banned Pokémon cannot be drafted even if it has a price.</p>
      <OptionPicker
        label="Ban a Pokémon"
        options={options}
        value={undefined}
        valueName=""
        noneLabel="Ban a Pokémon…"
        onChange={(id) => {
          if (id !== undefined) onBans([...bans, id]);
        }}
      />
      {bans.length === 0 ? (
        <p>No extra bans.</p>
      ) : (
        <ul className="tags">
          {[...bans]
            .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
            .map((id) => (
              <li key={id}>
                {nameOf(id)}{' '}
                <button type="button" aria-label={`Unban ${nameOf(id)}`} onClick={() => onBans(bans.filter((b) => b !== id))}>
                  ×
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
import type { ID } from '../../domain/id';
import type { Snapshot } from '../../domain/types';
import { DEFAULT_SUGGESTION, suggestedPrices, suggestionSummary, type PriceSuggestion } from './suggest-prices';

interface Props {
  snapshot: Pick<Snapshot, 'species' | 'usage'>;
  /** Whether prices are set already (Apply then asks before replacing them). */
  hasPrices: boolean;
  confirm(message: string): boolean;
  onApply(prices: Record<ID, number>): void;
}

const whole = (text: string): number | null => (/^\s*\d+\s*$/.test(text) ? Number(text) : null);

/** A starting price list from ladder usage: editable tier sizes and points, a preview, then Apply. */
export function SuggestPrices({ snapshot, hasPrices, confirm, onApply }: Props) {
  const [rows, setRows] = useState(DEFAULT_SUGGESTION.tiers.map((tier) => ({ count: String(tier.count), points: String(tier.points) })));
  const [rest, setRest] = useState(String(DEFAULT_SUGGESTION.restPoints));
  const [leaveOut, setLeaveOut] = useState(false);

  if (snapshot.usage === null) {
    return (
      <section className="suggest-prices" aria-labelledby="suggest-title">
        <h3 id="suggest-title">Suggested prices</h3>
        <p>No ladder data to suggest from.</p>
      </section>
    );
  }

  const tiers = rows.map((row) => ({ count: whole(row.count), points: whole(row.points) }));
  const restPoints = leaveOut ? null : whole(rest);
  const valid = tiers.every((tier) => tier.count !== null && tier.points !== null) && (leaveOut || restPoints !== null);
  const suggestion: PriceSuggestion | null = valid
    ? { tiers: tiers.map((tier) => ({ count: tier.count!, points: tier.points! })), restPoints }
    : null;
  const summary = suggestion === null ? null : suggestionSummary(snapshot, suggestion);
  const update = (index: number, field: 'count' | 'points', value: string) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  return (
    <section className="suggest-prices" aria-labelledby="suggest-title">
      <h3 id="suggest-title">Suggested prices</h3>
      <p className="note">Prices from how often each Pokémon is used on the ladder: the most used cost the most.</p>
      {rows.map((row, index) => (
        <div className="row" key={index}>
          <label>
            Top <input type="number" min={0} aria-label={`Tier ${index + 1}: how many`} value={row.count} onChange={(event) => update(index, 'count', event.target.value)} />
          </label>
          <label>
            at <input type="number" min={0} aria-label={`Tier ${index + 1}: points`} value={row.points} onChange={(event) => update(index, 'points', event.target.value)} /> points
          </label>
        </div>
      ))}
      <div className="row">
        <label>
          Everyone else with ladder use at{' '}
          <input type="number" min={0} aria-label="Everyone else: points" value={rest} disabled={leaveOut} onChange={(event) => setRest(event.target.value)} /> points
        </label>
        <label>
          <input type="checkbox" checked={leaveOut} onChange={(event) => setLeaveOut(event.target.checked)} /> leave them out
        </label>
      </div>
      <p aria-live="polite">
        {summary === null
          ? 'Whole numbers only, 0 or more.'
          : `${summary.tiered} Pokémon in ${summary.tierCount} tiers` +
            (summary.rest > 0 ? `, ${summary.rest} more at ${restPoints} point${restPoints === 1 ? '' : 's'}` : '') +
            `; ${summary.left} ${leaveOut ? 'others' : 'without ladder use'} are left out.`}
      </p>
      <button
        type="button"
        disabled={suggestion === null}
        onClick={() => {
          if (suggestion === null) return;
          if (hasPrices && !confirm('Replace the current prices with the suggested ones?')) return;
          onApply(suggestedPrices(snapshot, suggestion));
        }}
      >
        Apply
      </button>
    </section>
  );
}
```

```tsx
export type PricePanel = 'paste' | 'suggest' | null;

interface Props {
  /** True before any price exists: the choices are shown large, with a heading. */
  first: boolean;
  panel: PricePanel;
  onPanel(panel: PricePanel): void;
  onBuild(): void;
}

/** The ways to set prices: paste a list, start from suggested prices, or build tiers by hand. */
export function PriceStart({ first, panel, onPanel, onBuild }: Props) {
  const toggle = (which: Exclude<PricePanel, null>) => onPanel(panel === which ? null : which);
  return (
    <section className={first ? 'price-start' : 'price-start compact'} aria-labelledby="price-start-title">
      <h3 id="price-start-title">{first ? 'How do you want to set prices?' : 'Prices: more ways to fill them'}</h3>
      {first && <p className="note">Pokémon without a price are not in this draft. You can mix these: start from one, then adjust.</p>}
      <div className="row">
        <button type="button" aria-pressed={panel === 'paste'} onClick={() => toggle('paste')}>
          Paste or upload a price list
        </button>
        <button type="button" aria-pressed={panel === 'suggest'} onClick={() => toggle('suggest')}>
          Start from suggested prices
        </button>
        {first && (
          <button type="button" onClick={onBuild}>
            Build tiers by hand
          </button>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Add the example and the template button to `src/app/setup/PriceImport.tsx`**

In `src/app/setup/PriceImport.tsx`, find:
```tsx
  onImport(prices: Record<ID, number>): void;
}
```
Replace with:
```tsx
  onImport(prices: Record<ID, number>): void;
  /** Offers the price-list template (every legal Pokémon with an empty points column) as a download. */
  onTemplate(): void;
}
```

In `src/app/setup/PriceImport.tsx`, find:
```tsx
export function PriceImport({ snapshot, onImport }: Props) {
```
Replace with:
```tsx
export function PriceImport({ snapshot, onImport, onTemplate }: Props) {
```

In `src/app/setup/PriceImport.tsx`, find:
```tsx
      <label htmlFor="price-csv">Paste "name,points" lines (a header line is fine)</label>
```
Replace with:
```tsx
      <label htmlFor="price-csv">Paste "name,points" lines (a header line is fine)</label>
      <p className="note">
        One Pokémon per line, for example <code>Garchomp,16</code>. Pokémon not on the list are not in this draft.
      </p>
```

In `src/app/setup/PriceImport.tsx`, find:
```tsx
        <FileButton
          label="Upload a file"
```
Replace with:
```tsx
        <button type="button" onClick={onTemplate}>
          Download a template
        </button>
        <FileButton
          label="Upload a file"
```

`SetupView` still renders `<PriceImport>` without `onTemplate` until Task 3, so the typecheck reports that one missing prop. Add it now as a stop-gap in `src/app/setup/SetupView.tsx`:

In `src/app/setup/SetupView.tsx`, find:
```tsx
      <PriceImport snapshot={data.snapshot} onImport={(imported) => setPrices((current) => ({ ...current, ...imported }))} />
```
Replace with:
```tsx
      <PriceImport snapshot={data.snapshot} onImport={(imported) => setPrices((current) => ({ ...current, ...imported }))} onTemplate={() => {}} />
```

- [ ] **Step 3: Typecheck and run the suite**

Run: `npm run typecheck` then `npm test`
Expected: typecheck clean; the whole suite then has 760 tests (the components are wired in and tested in Task 3).

- [ ] **Step 4: Commit**

```bash
git add src/app/setup/TierBoard.tsx src/app/setup/BanList.tsx src/app/setup/SuggestPrices.tsx src/app/setup/PriceStart.tsx src/app/setup/PriceImport.tsx src/app/setup/SetupView.tsx
git commit -m "feat(app): the tier board, the bans list, suggested prices and the starting choices" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The new prices area in setup, with the flow tests

**Files:**
- Modify: `src/app/setup/SetupView.tsx` (replace the whole file), `src/app/Workspace.tsx`, `src/app/setup.flow.test.tsx` (replace the whole file), `src/app/room.flow.test.tsx`, `src/app/team.flow.test.tsx`, `e2e/app.e2e.ts`
- Create: `src/app/prices.flow.test.tsx`
- Delete: `src/app/setup/PriceTable.tsx`

**Interfaces:**
- Consumes: Tasks 1-2; `BrowserActions` (`src/app/browser.ts`); `deriveDraft` (`src/domain/derive.ts`).
- Produces: `SetupView` takes `actions: BrowserActions`.

- [ ] **Step 1: Write the flow tests: create `src/app/prices.flow.test.tsx`, and replace `src/app/setup.flow.test.tsx`**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { parseDraftFile, serializeDraftFile, type DraftFile } from '../domain/file';
import { App } from './App';
import { DEFAULT_SUGGESTION, suggestedPrices, suggestionSummary } from './setup/suggest-prices';
import { templateCsv } from './setup/tiers';
import { STORAGE_KEY } from './state/storage';
import { fakeActions, fakeStorage, realData } from './test-support';

afterEach(cleanup);

const data = realData();
const load = async () => data;

async function freshSetup(actions = fakeActions().actions) {
  const user = userEvent.setup();
  const { storage, data: stored } = fakeStorage();
  render(<App load={load} storage={storage} actions={actions} />);
  await screen.findByRole('heading', { name: 'Set up your league' });
  return { user, stored };
}

async function fillLeague(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('League name'), 'Tiers');
  await user.type(screen.getByLabelText(/Drafters/), 'Ana{Enter}Ben');
  await user.clear(screen.getByLabelText('Rounds (roster size)'));
  await user.type(screen.getByLabelText('Rounds (roster size)'), '2');
}

const savedLeague = (stored: Map<string, string>) => {
  const parsed = parseDraftFile(stored.get(STORAGE_KEY) ?? '', data.snapshot);
  if (!parsed.ok) throw new Error('nothing saved');
  return parsed.file.league;
};

async function pasteList(user: ReturnType<typeof userEvent.setup>, lines: string[]) {
  await user.click(screen.getByRole('button', { name: 'Paste or upload a price list' }));
  await user.click(screen.getByLabelText(/Paste "name,points" lines/));
  await user.paste(lines.join('\n'));
  await user.click(screen.getByRole('button', { name: 'Import' }));
}

describe('starting points', () => {
  it('offers three ways to start, and suggested prices fill the tiers', async () => {
    const { user, stored } = await freshSetup();
    expect(screen.getByRole('heading', { name: 'How do you want to set prices?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Build tiers by hand' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Start from suggested prices' }));
    const summary = suggestionSummary(data.snapshot, DEFAULT_SUGGESTION);
    expect(
      screen.getByText(`120 Pokémon in 4 tiers, ${summary.rest} more at 1 point; ${summary.left} without ladder use are left out.`),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('group', { name: '20-point tier, 10 Pokémon' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'How do you want to set prices?' })).toBeNull();

    await fillLeague(user);
    await user.click(screen.getByRole('button', { name: 'Start draft' }));
    await screen.findByText(/on the clock/);
    expect(savedLeague(stored).prices).toEqual(suggestedPrices(data.snapshot, DEFAULT_SUGGESTION));
  });

  it('asks before suggested prices replace existing ones, and edits the tiers before applying', async () => {
    const { actions, questions } = fakeActions([false, true]);
    const { user } = await freshSetup(actions);
    await pasteList(user, ['Garchomp,16']);
    await user.click(screen.getByRole('button', { name: 'Start from suggested prices' }));
    await user.clear(screen.getByLabelText('Tier 1: how many'));
    await user.type(screen.getByLabelText('Tier 1: how many'), '3');
    await user.click(screen.getByLabelText('leave them out'));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('group', { name: '16-point tier, 1 Pokémon' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(questions).toEqual(['Replace the current prices with the suggested ones?', 'Replace the current prices with the suggested ones?']);
    expect(screen.getByRole('group', { name: '20-point tier, 3 Pokémon' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: /^1-point tier/ })).toBeNull();
  });

  it('downloads a template of every legal Pokémon', async () => {
    const { actions, downloads } = fakeActions();
    const { user } = await freshSetup(actions);
    await user.click(screen.getByRole('button', { name: 'Paste or upload a price list' }));
    await user.click(screen.getByRole('button', { name: 'Download a template' }));
    expect(downloads).toEqual([{ filename: 'draftlab-prices-template.csv', text: templateCsv(data.snapshot.species) }]);
  });
});

describe('the tier board', () => {
  it('builds tiers by hand, moves and removes Pokémon, merges tiers, and removes a tier after asking', async () => {
    const { actions, questions } = fakeActions([true]);
    const { user, stored } = await freshSetup(actions);
    await user.click(screen.getByRole('button', { name: 'Build tiers by hand' }));
    await user.type(screen.getByRole('combobox', { name: 'Add a Pokémon to the 10-point tier' }), 'Garchomp{Enter}');
    await user.type(screen.getByRole('combobox', { name: 'Add a Pokémon to the 10-point tier' }), 'Kingambit{Enter}');
    await user.click(screen.getByRole('button', { name: 'Add tier' }));
    await user.type(screen.getByRole('combobox', { name: 'Add a Pokémon to the 5-point tier' }), 'Garchomp{Enter}');
    expect(screen.getByText('Garchomp moved from 10 to 5 points.')).toBeTruthy();
    expect(screen.getByRole('group', { name: '10-point tier, 1 Pokémon' })).toBeTruthy();

    // 5 → 10 merges into the 10-point tier.
    const five = within(screen.getByRole('group', { name: '5-point tier, 1 Pokémon' })).getByLabelText('Points for this tier');
    await user.clear(five);
    await user.type(five, '10{Enter}');
    expect(screen.getByText('Merged into the 10-point tier.')).toBeTruthy();
    expect(screen.getByRole('group', { name: '10-point tier, 2 Pokémon' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Remove Kingambit from the 10-point tier' }));
    expect(screen.getByRole('group', { name: '10-point tier, 1 Pokémon' })).toBeTruthy();

    // Not in this draft: add Torkoal to the 10-point tier.
    await user.click(screen.getByText(/^Not in this draft \(/));
    await user.type(screen.getByLabelText('Search Pokémon not in this draft'), 'Torkoal');
    await user.selectOptions(screen.getByLabelText('Add Torkoal to a tier'), '10');

    await fillLeague(user);
    await user.click(screen.getByRole('button', { name: 'Start draft' }));
    await screen.findByText(/on the clock/);
    expect(savedLeague(stored).prices).toEqual({ garchomp: 10, torkoal: 10 });
    expect(questions).toEqual([]);
  });

  it('removes a tier and its Pokémon after asking', async () => {
    const { actions, questions } = fakeActions([false, true]);
    const { user } = await freshSetup(actions);
    await pasteList(user, ['Garchomp,16', 'Kingambit,16', 'Torkoal,4']);
    const tier = screen.getByRole('group', { name: '16-point tier, 2 Pokémon' });
    await user.click(within(tier).getByRole('button', { name: 'Remove tier' }));
    expect(screen.getByRole('group', { name: '16-point tier, 2 Pokémon' })).toBeTruthy();
    await user.click(within(tier).getByRole('button', { name: 'Remove tier' }));
    expect(questions).toEqual([
      'Remove the 16-point tier? Its 2 Pokémon will not be in this draft.',
      'Remove the 16-point tier? Its 2 Pokémon will not be in this draft.',
    ]);
    expect(screen.queryByRole('group', { name: /^16-point tier/ })).toBeNull();
    expect(screen.getByRole('group', { name: '4-point tier, 1 Pokémon' })).toBeTruthy();
  });

  it('refuses a tier points value that is not a whole number', async () => {
    const { user } = await freshSetup();
    await user.click(screen.getByRole('button', { name: 'Build tiers by hand' }));
    const points = screen.getByLabelText('Points for this tier');
    await user.clear(points);
    await user.type(points, '-3');
    expect(screen.getByText('Whole points, 0 or more')).toBeTruthy();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('group', { name: '10-point tier, 0 Pokémon' })).toBeTruthy();
  });
});

describe('bans', () => {
  it('bans and unbans with the search box', async () => {
    const { user, stored } = await freshSetup();
    expect(screen.getByText('No extra bans.')).toBeTruthy();
    await user.type(screen.getByRole('combobox', { name: 'Ban a Pokémon' }), 'Garchomp{Enter}');
    await user.type(screen.getByRole('combobox', { name: 'Ban a Pokémon' }), 'Torkoal{Enter}');
    await user.click(screen.getByRole('button', { name: 'Unban Torkoal' }));
    await pasteList(user, ['Kingambit,16']);
    await fillLeague(user);
    await user.click(screen.getByRole('button', { name: 'Start draft' }));
    await screen.findByText(/on the clock/);
    expect(savedLeague(stored).extraBans).toEqual(['garchomp']);
  });
});

describe('mid-draft', () => {
  it("refuses removing a drafted Pokémon's price, and marks it as drafted", async () => {
    const user = userEvent.setup();
    const file: DraftFile = {
      schemaVersion: 2,
      league: { name: 'Mid', formatId: data.snapshot.formatId, drafters: ['Ana', 'Ben'], order: 'snake', rounds: 2, me: 1, budget: 50, prices: { garchomp: 16, torkoal: 4 }, extraBans: [] },
      picks: ['garchomp'],
      sets: {},
      teams: [],
    };
    const { storage, data: stored } = fakeStorage({ [STORAGE_KEY]: serializeDraftFile(file) });
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    await user.click(await screen.findByRole('button', { name: 'Setup' }));
    expect(screen.getByText(/drafted by Ana/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Remove Garchomp from the 16-point tier' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText(/^this would break pick 1:/)).toBeTruthy();
    expect(stored.get(STORAGE_KEY)).toBe(serializeDraftFile(file));
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

const CSV = ['Pokemon,Points', 'Incineroar,20', 'Kingambit,18', 'Garchomp,16', 'Torkoal,4', 'Missingno,5', 'Venusaur,four'].join('\n');

describe('setting up a league', () => {
  it('imports prices from a pasted CSV, moves one into a new tier, and starts the draft', async () => {
    const user = userEvent.setup();
    const { storage, data: stored } = fakeStorage();
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);

    expect(await screen.findByRole('heading', { name: 'Set up your league' })).toBeTruthy();
    expect(screen.getByText('Format: Champions VGC 2026 Reg M-B')).toBeTruthy();

    // CSV import: 4 matched, Missingno unmatched, Venusaur's points are not a number.
    expect(screen.getByRole('heading', { name: 'How do you want to set prices?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Paste or upload a price list' }));
    await user.click(screen.getByLabelText(/Paste "name,points" lines/));
    await user.paste(CSV);
    await user.click(screen.getByRole('button', { name: 'Import' }));
    const result = screen.getByRole('status');
    expect(within(result).getByText('4 prices imported.')).toBeTruthy();
    expect(within(result).getByText(/Missingno/)).toBeTruthy();
    expect(within(result).getByText('line 7: "four" is not a whole number of points')).toBeTruthy();

    // The board shows four tiers; a new tier (2 points: half the lowest) becomes 7, and Torkoal moves into it.
    expect(screen.getByRole('group', { name: '4-point tier, 1 Pokémon' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Add tier' }));
    const newTier = screen.getByRole('group', { name: '2-point tier, 0 Pokémon' });
    const points = within(newTier).getByLabelText('Points for this tier');
    await user.clear(points);
    await user.type(points, '7{Enter}');
    await user.type(screen.getByRole('combobox', { name: 'Add a Pokémon to the 7-point tier' }), 'Torkoal{Enter}');
    expect(screen.getByText('Torkoal moved from 4 to 7 points.')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /^4-point tier/ })).toBeNull();

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

  it('does not submit the league form when Enter is pressed in the prices area', async () => {
    const user = userEvent.setup();
    const { storage, data: stored } = fakeStorage();
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    await screen.findByRole('heading', { name: 'Set up your league' });

    await user.type(screen.getByLabelText('League name'), 'Test League');
    await user.type(screen.getByLabelText(/Drafters/), 'Ana{Enter}Ben');

    await user.click(screen.getByRole('button', { name: 'Build tiers by hand' }));
    await user.type(screen.getByLabelText('Search Pokémon not in this draft'), 'Torkoal{Enter}');
    await user.type(screen.getByRole('combobox', { name: 'Ban a Pokémon' }), 'Zzz{Enter}');

    expect(screen.getByRole('heading', { name: 'Set up your league' })).toBeTruthy();
    expect(screen.queryByText(/on the clock/)).toBeNull();
    expect(stored.has(STORAGE_KEY)).toBe(false);
  });

  it('shows the import-error banner when the chosen file cannot be read', async () => {
    const user = userEvent.setup();
    render(<App load={load} storage={fakeStorage().storage} actions={fakeActions().actions} />);
    await screen.findByRole('heading', { name: 'Set up your league' });

    const bad = new File(['x'], 'x.json');
    bad.text = () => Promise.reject(new Error('gone'));
    await user.upload(screen.getByLabelText('Import a draft file'), bad);

    expect(await screen.findByText('That file could not be imported; nothing was changed.')).toBeTruthy();
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

- [ ] **Step 2: Update the ban steps in `src/app/room.flow.test.tsx` and `src/app/team.flow.test.tsx`**

In `src/app/room.flow.test.tsx`, find:
```tsx
    await user.type(screen.getByLabelText('Search'), 'Incineroar');
    await user.click(screen.getByLabelText('Ban Incineroar'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('this would break pick 1: "incineroar" is banned in this league')).toBeTruthy();
    expect(saved.get(STORAGE_KEY)).toBe(serializeDraftFile(leagueFile(['incineroar'])));

    await user.click(screen.getByLabelText('Ban Incineroar'));
```
Replace with:
```tsx
    expect(screen.getByText(/drafted by Ana/)).toBeTruthy();
    await user.type(screen.getByRole('combobox', { name: 'Ban a Pokémon' }), 'Incineroar{Enter}');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('this would break pick 1: "incineroar" is banned in this league')).toBeTruthy();
    expect(saved.get(STORAGE_KEY)).toBe(serializeDraftFile(leagueFile(['incineroar'])));

    await user.click(screen.getByRole('button', { name: 'Unban Incineroar' }));
```

In `src/app/room.flow.test.tsx`, find:
```tsx
    await user.type(screen.getByLabelText('Search'), 'Incineroar');
    await user.click(screen.getByLabelText('Ban Incineroar'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('this would break pick 1: "incineroar" is banned in this league')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Back to the draft' }));
```
Replace with:
```tsx
    await user.type(screen.getByRole('combobox', { name: 'Ban a Pokémon' }), 'Incineroar{Enter}');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('this would break pick 1: "incineroar" is banned in this league')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Back to the draft' }));
```

In `src/app/team.flow.test.tsx`, find:
```tsx
    await user.type(screen.getByLabelText('Search'), 'Garchomp');
    await user.click(screen.getByLabelText('Ban Garchomp'));
```
Replace with:
```tsx
    await user.type(screen.getByRole('combobox', { name: 'Ban a Pokémon' }), 'Garchomp{Enter}');
```

In `e2e/app.e2e.ts`, find:
```ts
  await expect(page.getByRole('heading', { name: 'Set up your league' })).toBeVisible();
  await page.getByLabel(/Paste "name,points" lines/).fill(
```
Replace with:
```ts
  await expect(page.getByRole('heading', { name: 'Set up your league' })).toBeVisible();
  await page.getByRole('button', { name: 'Paste or upload a price list' }).click();
  await page.getByLabel(/Paste "name,points" lines/).fill(
```

- [ ] **Step 3: Run the flow tests to see them fail**

Run: `npx vitest run src/app/prices.flow.test.tsx src/app/setup.flow.test.tsx`
Expected: FAIL (setup still shows the table; there is no "How do you want to set prices?").

- [ ] **Step 4: Replace `src/app/setup/SetupView.tsx`, pass `actions` from `src/app/Workspace.tsx`, and delete the table**

```tsx
import { useId, useMemo, useState, type ReactNode } from 'react';
import { deriveDraft } from '../../domain/derive';
import type { DraftFile } from '../../domain/file';
import type { ID } from '../../domain/id';
import { validateLeague, type DraftOrder, type LeagueConfig } from '../../domain/league';
import type { Problem } from '../../domain/problem';
import type { BrowserActions } from '../browser';
import type { AppData } from '../data/snapshot';
import { FileButton } from '../FileButton';
import { BanList } from './BanList';
import { PriceImport } from './PriceImport';
import { PriceStart, type PricePanel } from './PriceStart';
import { SuggestPrices } from './SuggestPrices';
import { TierBoard } from './TierBoard';
import { templateCsv } from './tiers';

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
  /** Import a saved draft file's text, or null when it could not be read (only when there is no draft yet). */
  onImport?(text: string | null): void;
  /** Questions and downloads (the price template). */
  actions: BrowserActions;
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
export function SetupView({ data, file, errors, onSave, onCancel, onNewLeague, onImport, actions }: Props) {
  const formId = useId();
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
  const [panel, setPanel] = useState<PricePanel>(null);
  const [emptyTiers, setEmptyTiers] = useState<number[]>([]);
  const draftedBy = useMemo(() => {
    const out: Record<ID, string> = {};
    if (file === null) return out;
    for (const drafter of deriveDraft(file.league, file.picks, data.snapshot).drafters) {
      for (const id of drafter.roster) out[id] = drafter.name;
    }
    return out;
  }, [file, data.snapshot]);
  const hasPrices = Object.keys(prices).length > 0;
  const showBoard = hasPrices || emptyTiers.length > 0;

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
          <FileButton label="Import a draft file" accept=".json,application/json" onText={(text) => onImport(text)} />
        </section>
      )}

      <form
        id={formId}
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
              onChange={(event) => {
                setDraftersText(event.target.value);
                if (me >= lines(event.target.value).length) setMe(0);
              }}
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
      </form>

      <PriceStart first={!showBoard} panel={panel} onPanel={setPanel} onBuild={() => setEmptyTiers([10])} />
      {panel === 'paste' && (
        <PriceImport
          snapshot={data.snapshot}
          onImport={(imported) => setPrices((current) => ({ ...current, ...imported }))}
          onTemplate={() => actions.download('draftlab-prices-template.csv', templateCsv(data.snapshot.species))}
        />
      )}
      {panel === 'suggest' && (
        <SuggestPrices
          snapshot={data.snapshot}
          hasPrices={hasPrices}
          confirm={actions.confirm}
          onApply={(suggested) => {
            setPrices(suggested);
            setEmptyTiers([]);
            setPanel(null);
          }}
        />
      )}
      {showBoard && (
        <TierBoard
          species={data.snapshot.species}
          prices={prices}
          bans={bans}
          draftedBy={draftedBy}
          emptyTiers={emptyTiers}
          onEmptyTiers={setEmptyTiers}
          onPrices={setPrices}
          confirm={actions.confirm}
        />
      )}
      <BanList species={data.snapshot.species} bans={bans} onBans={setBans} />

      <ul className="problems" aria-live="polite">
        {other.map((p) => (
          <li key={`${p.path}:${p.message}`}>{p.message}</li>
        ))}
      </ul>
      <div className="row actions">
        <button type="submit" form={formId}>
          {existing ? 'Save' : 'Start draft'}
        </button>
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
    </main>
  );
}
```

In `src/app/Workspace.tsx`, find:
```tsx
          onImport={file === null ? importFile : undefined}
        />
```
Replace with:
```tsx
          onImport={file === null ? importFile : undefined}
          actions={actions}
        />
```

Run: `git rm src/app/setup/PriceTable.tsx`

- [ ] **Step 5: Run the tests, the typecheck and the browser tests**

Run: `npx vitest run src/app/prices.flow.test.tsx src/app/setup.flow.test.tsx src/app/room.flow.test.tsx src/app/team.flow.test.tsx` then `npm test` then `npm run typecheck`
Expected: PASS; the whole suite then has 768 tests; typecheck clean. The first jsdom run in a fresh shell can be slow; if a flow test times out once, run it again before reporting.

Run: `npm run e2e`
Expected: 4 passed. Delete `dist/`, `test-results/` and `playwright-report/` afterwards.

Mutation proof (do it, then undo it): in `TierBoard.tsx`, in the `add` function, delete the line that starts `if (before !== undefined && before !== tier.points)` (the "moved from" note); the test "builds tiers by hand, moves and removes Pokémon, merges tiers, and removes a tier after asking" must fail. Restore the line.

- [ ] **Step 6: Commit**

```bash
git add src/app/setup/SetupView.tsx src/app/Workspace.tsx src/app/prices.flow.test.tsx src/app/setup.flow.test.tsx src/app/room.flow.test.tsx src/app/team.flow.test.tsx e2e/app.e2e.ts
git commit -m "feat(app): setup prices as starting choices, a tier board and a bans list, instead of the 355-row table" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Styles and docs

**Files:**
- Modify: `src/app/app.css`, `docs/STATUS.md`, `README.md`

**Interfaces:** none.

- [ ] **Step 1: Add the styles to `src/app/app.css`**

In `src/app/app.css`, find:
```css
.data-footer ul {
  margin: 0.25rem 0 0;
}
```
Replace with:
```css
.data-footer ul {
  margin: 0.25rem 0 0;
}

/* Setup: starting choices, tiers and bans */
.price-start,
.tier-board,
.ban-list,
.suggest-prices {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: var(--space);
  margin-bottom: var(--space);
}
.price-start .row button {
  font-weight: 600;
}
.price-start.compact .row button {
  font-weight: normal;
}
.price-start button[aria-pressed='true'] {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.tier {
  border-top: 1px solid var(--line);
  padding: 0.5rem 0;
}
.tier-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space);
  align-items: center;
}
.tier-head h4 {
  margin: 0;
  min-width: 10rem;
}
.suggest-prices input[type='number'],
.tier-head input[type='number'] {
  width: 5rem;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  list-style: none;
  margin: 0.5rem 0;
  padding: 0;
}
.tags li {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1rem 0.25rem 0.1rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--bg);
}
.tags li button {
  padding: 0 0.4rem;
  border: none;
  background: transparent;
}
.tag-note {
  color: var(--muted);
  font-size: 0.85em;
}
.unpriced ul {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  max-height: 24rem;
  overflow-y: auto;
}
.unpriced li {
  padding: 0.15rem 0;
}
```

- [ ] **Step 2: Update `docs/STATUS.md` and `README.md`**

In `docs/STATUS.md`, find:
```text
Last updated 2026-10-04.
```
Replace with:
```text
Last updated 2026-10-05.
```

In `docs/STATUS.md`, find:
```text
Work so far happened between 2026-09-20 and 2026-10-04.
```
Replace with:
```text
Work so far happened between 2026-09-20 and 2026-10-05.
```

In `docs/STATUS.md`, find:
```text
| 10 | App shell, increment 3: hosting and data refresh (GitHub Pages, a weekly data sync, the data's age in the UI, browser tests) | `specs/2026-10-04-app-hosting-design.md`, `plans/2026-10-04-app-hosting.md` | done: built and reviewed |
```
Replace with:
```text
| 10 | App shell, increment 3: hosting and data refresh (GitHub Pages, a weekly data sync, the data's age in the UI, browser tests) | `specs/2026-10-04-app-hosting-design.md`, `plans/2026-10-04-app-hosting.md` | done: built and reviewed |
| 11 | Setup: price tiers (suggested prices, a tier board instead of the 355-row table) and a bans list | `specs/2026-10-05-price-tiers-design.md`, `plans/2026-10-05-price-tiers.md` | done: built and reviewed |
```

In `docs/STATUS.md`, find:
```text
Tests, all passing: 748 unit tests
```
Replace with:
```text
Tests, all passing: 768 unit tests
```

In `README.md`, find:
```text
league setup with a CSV price import
```
Replace with:
```text
league setup with suggested prices, a CSV price import and a tier board
```

- [ ] **Step 3: Typecheck, test and build**

Run: `npm run typecheck` then `npm test` then `npm run build`
Expected: typecheck clean; the whole suite then has 768 tests; the build succeeds. Delete `dist/` afterwards.

- [ ] **Step 4: Commit**

```bash
git add src/app/app.css docs/STATUS.md README.md
git commit -m "style(app): tier board, tags and starting choices; docs for price tiers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-Review (spec coverage)

- Starting choices, example line and template download: Tasks 2-3.
- Tier board (cards, points with merge, remove tier with a question, tags with remove, add with the move note, "Add tier", "Not in this draft", drafted and banned marks, notes in a live region): Task 2; flows in Task 3.
- Suggested prices (ranking, defaults, editable rows, leave out, preview, replace question, no usage data): Tasks 1-2; flows in Task 3.
- Bans list: Task 2; flows in Task 3 (and the rewritten mid-draft ban tests).
- Mid-draft refusals unchanged (removing a drafted Pokémon's price; banning it): Task 3.
- The tests that used the table, and the browser test: Task 3. Styles and docs: Task 4.
