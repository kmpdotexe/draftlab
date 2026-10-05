# App Shell, Increment 3: Hosting and Data Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Draft Lab to GitHub Pages from one GitHub Actions workflow that also refreshes the Pokémon data weekly, show the data's age and notes in the app, and test the built site in a real browser before every deploy.

**Architecture:** Pure helpers (`text/data-age.ts`) phrase the data line and the fallback/stale banners from `meta.json`; `Workspace` shows them under and above every view. The Vite build gets the `/draftlab/` base path for Pages; Playwright tests (outside `src/`) run against `vite preview` of the build. `.github/workflows/site.yml` chains sync → build → e2e → deploy → smoke.

**Tech Stack:** React 19 + Vite 8 + TypeScript (strict, ESM); Vitest 5 + jsdom for unit and flow tests; Playwright 1.63.0 (Chromium) for browser tests; GitHub Actions and GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-04-app-hosting-design.md` (parents: the increment 1 and 2 specs and `2026-09-20-draft-lab-design.md`). Read the spec first; it is the binding authority for this plan.

## Global Constraints

- Scope: increment 3 only. Out of scope: a custom domain, analytics, other hosts, Reg M-C, changes to what the sync fetches, notifications other than GitHub's failed-run email, browsers other than Chromium, and any change to `src/domain/`, `src/engine/`, `sync/` or the draft file.
- The rollout (history rewrite, force-push, making the repo public, enabling Pages, the first workflow run) is not part of these tasks: it happens after the merge, with the user (see "After the merge").
- New dependency, pinned exactly: `@playwright/test` 1.63.0 (devDependency). No other new dependencies.
- The site is served at `https://kmpdotexe.github.io/draftlab/`: `vite build` and `vite preview` use the base `/draftlab/`; the dev server stays at `/`.
- Texts are exactly the spec's: the data line "Data: {label} · Smogon ladder usage for {month}[ from {statsFormatId}] ({cutoff}+ rating, {battles} battles) · updated {day}", "… · no ladder usage data · …", "updated (unknown date)", "Data notes (N)", the fallback banner and the stale banner; `STALE_AFTER_DAYS = 45`.
- The workflow: one file, triggers push to `main`, `workflow_dispatch` (input `sync`, default true) and Mondays 06:00 UTC; jobs sync → build → e2e → deploy → smoke; `contents: write` only for sync, `pages: write` + `id-token: write` only for deploy; one run at a time.
- Browser tests live in `e2e/` and are not run by `npm test`.
- Commits end with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (copy it verbatim; never substitute another model name). The workflow's own data commits use the `github-actions[bot]` trailer given in the workflow.

**Plan clarifications (rulings on gaps in the spec, made at plan time):**
1. **Dates are written with a fixed month table**, not `toLocaleDateString('en-GB')`: newer ICU data writes September as "Sept" for `en-GB`, so the text would differ between machines and Node versions. The day is still in the browser's time zone.
2. **`App` and `Workspace` take a `now: () => Date`** (App's defaults to the real clock), so tests can fix the time for the stale banner. The banners are computed once, when the workspace opens.
3. **The data banners have no ARIA role**: they are shown at load (nothing to announce), and a `role="status"` would make the increment 1 test that reads the import result with `getByRole('status')` find two elements once the committed data is 45 days old.
4. **Playwright projects `gate` and `live`** in one config: `npm run e2e`/`e2e:ci` run `--project=gate` (with `vite preview` started by Playwright), `npm run e2e:live` runs `--project=live`, and `live.e2e.ts` stops with "Set DRAFTLAB_URL …" when the variable is missing, so the smoke script never quietly runs the gate tests instead.
5. **`e2e/` is added to `tsconfig.json`'s `include`** so `npm run typecheck` covers the browser tests; `playwright-report/` and `test-results/` are git-ignored.
6. **Exact action versions** (latest releases on 2026-10-04): `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`, `actions/download-artifact@v8`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`; Node 24 in every job.
7. **The data footer is styled** (small, muted, a top border) in `app.css`, in the task that adds it.
8. **The data-line browser test also checks every script request** (the app chunk and the lazily loaded snapshot and meta chunks) is under `/draftlab/assets/`. Without it the base path is untested: `vite preview` serves the app and `/assets/…` from the root too, so the other gate tests pass even with `base: '/'`, while GitHub Pages would answer 404.

## Pre-verification results (measured 2026-10-04 with the prototype of this plan's code)

The plan's code was built and run in full before this plan was written, and the plan was then replayed task by task in a clean checkout of 7eb4b73 (each task's commands, edits and files applied exactly as written below): every task ends green and every prototype file is reproduced byte for byte.

Unit test counts after Tasks 1 to 4: 746, 748, 748, 748 (baseline 740). Typecheck is clean after every task, the build succeeds after Tasks 3 and 4, and the 4 browser tests pass after Task 3. The 21 integration tests are unchanged.

- **Playwright 1.63.0** installs on this machine (Windows, Node 24) with `npx playwright install chromium` (Chromium build 1243). The 4 gate tests pass against `vite preview` in about 16 s (about 30 s with the build); the smoke test passes against a second local preview standing in for Pages (about 4 s).
- **Base path:** with `base: '/draftlab/'`, `dist/index.html` loads `/draftlab/assets/index-….js`; the app and the lazily loaded snapshot and meta chunks load under `/draftlab/` in preview (the gate tests prove it); the dev server still serves `/`.
- **`npm test` ignores `e2e/`** (Vitest only collects `src/**/*.test.ts(x)` and `sync/**/*.test.ts`); `npm run typecheck` is clean with `e2e` included.
- **The workflow parses** (checked with the `yaml` package): five jobs chained sync → build → e2e → deploy → smoke, the cron `0 6 * * 1`. It cannot run until the repo is public with Pages enabled (rollout).
- **One flaky moment:** the first run of the new jsdom flow test file once failed with "Timeout waiting for worker to respond" (a cold worker start); the rerun passed, and so did every later run.

## Environment notes

- Windows + PowerShell. A fresh shell may not find `node`/`npm`. Start every PowerShell command with:
  `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User");`
- The repo path contains a space: quote it.
- Single test file: `npx vitest run <path>`. Whole unit suite: `npm test`. Types: `npm run typecheck`. Build: `npm run build`. The baseline before this plan is 740 unit tests and 21 integration tests, all passing.
- Work on branch `feat/app-hosting` (already created; the spec is committed at 7eb4b73).
- Every file block below is the complete file content: create the file, or replace the existing file entirely, with exactly that text. Edits to existing files are exact find/replace pairs (each find text occurs exactly once; the files may have CRLF line endings, so match the text). If a line fails typecheck, report the exact error and apply the smallest fix that keeps the test's intent; do not silently rewrite a test.

---

## File Structure

```
Create: src/app/text/data-age.ts, data-age.test.ts    STALE_AFTER_DAYS, formatDay, dataSummary, dataBanners
Create: src/app/DataFooter.tsx                         the data line and the data notes
Modify: src/app/Workspace.tsx, src/app/App.tsx         the banners, the footer, `now`
Create: src/app/data.flow.test.tsx                     the footer and banners in the app
Modify: src/app/app.css                                the footer's style
Modify: vite.config.ts                                 base '/draftlab/' for build and preview
Modify: package.json, package-lock.json                @playwright/test 1.63.0; scripts e2e, e2e:ci, e2e:live
Modify: tsconfig.json, .gitignore                      e2e/ typechecked; Playwright output ignored
Create: e2e/playwright.config.ts, e2e/app.e2e.ts, e2e/live.e2e.ts
Create: .github/workflows/site.yml                     sync → build → e2e → deploy → smoke
Modify: README.md, docs/STATUS.md
```

---

### Task 1: The data line and banners as text

**Files:**
- Create: `src/app/text/data-age.ts`, `src/app/text/data-age.test.ts`

**Interfaces:**
- Consumes: `SnapshotMeta` (`src/domain/types.ts`); `realData()` (`src/app/test-support.ts`).
- Produces: `STALE_AFTER_DAYS = 45`; `interface DataBanner { id: 'fallback' | 'stale'; text: string }`; `formatDay(iso: string): string | null` ("21 Sep 2026"); `dataSummary(meta: SnapshotMeta): string`; `dataBanners(meta: SnapshotMeta, now: Date): DataBanner[]` (fallback first, then stale).

- [ ] **Step 1: Write the tests: create `src/app/text/data-age.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { SnapshotMeta } from '../../domain/types';
import { realData } from '../test-support';
import { STALE_AFTER_DAYS, dataBanners, dataSummary, formatDay } from './data-age';

const real = realData().meta;
const metaOf = (overrides: Partial<SnapshotMeta>): SnapshotMeta => ({ ...real, ...overrides });
const usage = real.usage!;
// Noon UTC, so the day is the same in every time zone the tests might run in.
const generatedAt = '2026-09-21T12:00:00.000Z';
const daysAfter = (days: number) => new Date(Date.parse(generatedAt) + days * 24 * 60 * 60 * 1000);

describe('formatDay', () => {
  it('writes day, short month and year, and refuses what is not a date', () => {
    expect(formatDay(generatedAt)).toBe('21 Sep 2026');
    expect(formatDay('not a date')).toBeNull();
  });
});

describe('dataSummary', () => {
  it('names the label, the usage month, cutoff and battles, and the update day', () => {
    const meta = metaOf({ generatedAt, usage: { ...usage, month: '2026-08', cutoff: 1630, battles: 1269250, isFallback: false } });
    expect(dataSummary(meta)).toBe(
      'Data: Champions VGC 2026 Reg M-B · Smogon ladder usage for 2026-08 (1630+ rating, 1,269,250 battles) · updated 21 Sep 2026',
    );
  });

  it('names the source of fallback usage', () => {
    const meta = metaOf({ generatedAt, usage: { ...usage, statsFormatId: 'gen9championsvgc2026regmb', month: '2026-08', cutoff: 1630, battles: 5, isFallback: true } });
    expect(dataSummary(meta)).toBe(
      'Data: Champions VGC 2026 Reg M-B · Smogon ladder usage for 2026-08 from gen9championsvgc2026regmb (1630+ rating, 5 battles) · updated 21 Sep 2026',
    );
  });

  it('says when there is no usage data or no readable date', () => {
    expect(dataSummary(metaOf({ generatedAt: 'garbled', usage: null }))).toBe(
      'Data: Champions VGC 2026 Reg M-B · no ladder usage data · updated (unknown date)',
    );
  });
});

describe('dataBanners', () => {
  it(`adds the stale banner only after ${STALE_AFTER_DAYS} whole days`, () => {
    const meta = metaOf({ generatedAt, usage: { ...usage, isFallback: false } });
    expect(dataBanners(meta, daysAfter(STALE_AFTER_DAYS))).toEqual([]);
    expect(dataBanners(meta, daysAfter(STALE_AFTER_DAYS + 1))).toEqual([
      { id: 'stale', text: 'The Pokémon data is 46 days old; the weekly refresh may have stopped.' },
    ]);
  });

  it('adds the fallback banner for borrowed usage, and nothing for an unreadable date', () => {
    const meta = metaOf({ generatedAt: 'garbled', usage: { ...usage, statsFormatId: 'gen9championsvgc2026regmb', isFallback: true } });
    expect(dataBanners(meta, daysAfter(400))).toEqual([
      {
        id: 'fallback',
        text: 'Ladder usage comes from gen9championsvgc2026regmb because Champions VGC 2026 Reg M-B has no published stats yet; suggestions may be less accurate.',
      },
    ]);
    expect(dataBanners(metaOf({ generatedAt, usage: null }), daysAfter(1))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/app/text/data-age.test.ts`
Expected: FAIL (`data-age.ts` does not exist).

- [ ] **Step 3: Create `src/app/text/data-age.ts`**

```ts
import type { SnapshotMeta } from '../../domain/types';

/** Data older than this many days gets the "weekly refresh may have stopped" banner. */
export const STALE_AFTER_DAYS = 45;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A banner about the data, with a stable id so it can be dismissed for the session. */
export interface DataBanner {
  id: 'fallback' | 'stale';
  text: string;
}

/** Month names written out, so the text does not depend on the browser's locale data ("Sep" vs "Sept"). */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "21 Sep 2026" in the browser's time zone, or null for something that is not a date. */
export function formatDay(iso: string): string | null {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const date = new Date(time);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** The data line: label, ladder usage (month, rating cutoff, battles, and the source when it is a fallback), last update. */
export function dataSummary(meta: SnapshotMeta): string {
  const updated = formatDay(meta.generatedAt) ?? '(unknown date)';
  const usage = meta.usage;
  if (usage === null) return `Data: ${meta.label} · no ladder usage data · updated ${updated}`;
  const source = usage.isFallback ? ` from ${usage.statsFormatId}` : '';
  const battles = usage.battles.toLocaleString('en-US');
  return `Data: ${meta.label} · Smogon ladder usage for ${usage.month}${source} (${usage.cutoff}+ rating, ${battles} battles) · updated ${updated}`;
}

/** The fallback-usage and stale-data banners that apply at `now`. */
export function dataBanners(meta: SnapshotMeta, now: Date): DataBanner[] {
  const banners: DataBanner[] = [];
  if (meta.usage?.isFallback) {
    banners.push({
      id: 'fallback',
      text: `Ladder usage comes from ${meta.usage.statsFormatId} because ${meta.label} has no published stats yet; suggestions may be less accurate.`,
    });
  }
  const generated = Date.parse(meta.generatedAt);
  if (!Number.isNaN(generated)) {
    const days = Math.floor((now.getTime() - generated) / DAY_MS);
    if (days > STALE_AFTER_DAYS) {
      banners.push({ id: 'stale', text: `The Pokémon data is ${days} days old; the weekly refresh may have stopped.` });
    }
  }
  return banners;
}
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run src/app/text/data-age.test.ts` then `npm test` then `npm run typecheck`
Expected: PASS (6 tests); the whole suite then has 746 tests; typecheck clean.

Mutation proof (do it, then undo it): change `if (days > STALE_AFTER_DAYS) {` to `if (days >= STALE_AFTER_DAYS) {`; the test "adds the stale banner only after 45 whole days" must fail. Restore the line.

- [ ] **Step 5: Commit**

```bash
git add src/app/text/data-age.ts src/app/text/data-age.test.ts
git commit -m "feat(app): the data line and the fallback and stale-data banners as text" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The data line and banners in the app

**Files:**
- Create: `src/app/DataFooter.tsx`, `src/app/data.flow.test.tsx`
- Modify: `src/app/Workspace.tsx`, `src/app/App.tsx`, `src/app/app.css`

**Interfaces:**
- Consumes: `dataSummary`, `dataBanners`, `DataBanner` (Task 1).
- Produces: `DataFooter(props: { meta: SnapshotMeta })` (a `<footer>`, role `contentinfo`); `AppProps.now?: () => Date` (default the real clock); `Workspace` prop `now: () => Date`.

- [ ] **Step 1: Write the flow tests: create `src/app/data.flow.test.tsx`**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { serializeDraftFile, type DraftFile } from '../domain/file';
import type { SnapshotMeta } from '../domain/types';
import { App } from './App';
import { STORAGE_KEY } from './state/storage';
import { dataSummary } from './text/data-age';
import { fakeActions, fakeStorage, realData } from './test-support';

afterEach(cleanup);

const data = realData();
const generatedAt = '2026-09-21T12:00:00.000Z';
const fallbackMeta: SnapshotMeta = {
  ...data.meta,
  generatedAt,
  usage: { ...data.meta.usage!, statsFormatId: 'gen9championsvgc2026regmb', isFallback: true },
};
const file: DraftFile = {
  schemaVersion: 2,
  league: { name: 'Test League', formatId: data.snapshot.formatId, drafters: ['Ana', 'Ben'], order: 'snake', rounds: 2, me: 0, budget: 50, prices: { incineroar: 20 }, extraBans: [] },
  picks: ['incineroar'],
  sets: {},
  teams: [],
};

describe('the data line and banners', () => {
  it('shows the data line and its notes under every view', async () => {
    const user = userEvent.setup();
    const meta = { ...data.meta, generatedAt };
    render(
      <App load={async () => ({ ...data, meta })} storage={fakeStorage({ [STORAGE_KEY]: serializeDraftFile(file) }).storage} actions={fakeActions().actions} now={() => new Date(generatedAt)} />,
    );
    const footer = await screen.findByRole('contentinfo');
    expect(within(footer).getByText(dataSummary(meta))).toBeTruthy();
    expect(within(footer).getByText(`Data notes (${meta.warnings.length})`)).toBeTruthy();
    expect(meta.warnings.length).toBeGreaterThan(0);
    expect(screen.queryByText(/days old/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Teambuilder' }));
    expect(within(screen.getByRole('contentinfo')).getByText(dataSummary(meta))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Setup' }));
    expect(within(screen.getByRole('contentinfo')).getByText(dataSummary(meta))).toBeTruthy();
  });

  it('warns about borrowed usage and old data, and each warning can be dismissed', async () => {
    const user = userEvent.setup();
    const fiftyDaysLater = new Date(Date.parse(generatedAt) + 50 * 24 * 60 * 60 * 1000);
    render(<App load={async () => ({ ...data, meta: fallbackMeta })} storage={fakeStorage().storage} actions={fakeActions().actions} now={() => fiftyDaysLater} />);
    expect(await screen.findByText(/Ladder usage comes from gen9championsvgc2026regmb because/)).toBeTruthy();
    expect(screen.getByText('The Pokémon data is 50 days old; the weekly refresh may have stopped.')).toBeTruthy();
    const [first] = screen.getAllByRole('button', { name: 'Dismiss' });
    await user.click(first);
    expect(screen.queryByText(/Ladder usage comes from/)).toBeNull();
    expect(screen.getByText(/50 days old/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/app/data.flow.test.tsx`
Expected: FAIL (there is no footer; `App` has no `now` prop, which is also a type error). The first jsdom run in a fresh shell can take a minute; if it fails with "Timeout waiting for worker to respond", run it again.

- [ ] **Step 3: Create `src/app/DataFooter.tsx`**

```tsx
import type { SnapshotMeta } from '../domain/types';
import { dataSummary } from './text/data-age';

/** The data line (format, ladder usage, last update) and, when the sync left any, its notes. */
export function DataFooter({ meta }: { meta: SnapshotMeta }) {
  return (
    <footer className="data-footer">
      <p>{dataSummary(meta)}</p>
      {meta.warnings.length > 0 && (
        <details>
          <summary>Data notes ({meta.warnings.length})</summary>
          <ul>
            {meta.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
    </footer>
  );
}
```

- [ ] **Step 4: Wire it into `src/app/Workspace.tsx`**

In `src/app/Workspace.tsx`, find:
```tsx
import type { AppData } from './data/snapshot';
```
Replace with:
```tsx
import type { AppData } from './data/snapshot';
import { DataFooter } from './DataFooter';
```

In `src/app/Workspace.tsx`, find:
```tsx
import { makeNames } from './text/names';
```
Replace with:
```tsx
import { dataBanners, type DataBanner } from './text/data-age';
import { makeNames } from './text/names';
```

In `src/app/Workspace.tsx`, find:
```tsx
  actions: BrowserActions;
}

function ProblemList
```
Replace with:
```tsx
  actions: BrowserActions;
  /** The current time, for the stale-data banner. */
  now: () => Date;
}

function ProblemList
```

In `src/app/Workspace.tsx`, find:
```tsx
export function Workspace({ data, storage, actions }: Props) {
```
Replace with:
```tsx
export function Workspace({ data, storage, actions, now }: Props) {
```

In `src/app/Workspace.tsx`, find:
```tsx
  const [view, setView] = useState<View>(state.file === null ? 'setup' : 'room');
```
Replace with:
```tsx
  const [view, setView] = useState<View>(state.file === null ? 'setup' : 'room');
  const [banners, setBanners] = useState<DataBanner[]>(() => dataBanners(data.meta, now()));
```

In `src/app/Workspace.tsx`, find:
```tsx
          Changes aren't being saved in this browser — use Export.
        </div>
      )}
```
Replace with:
```tsx
          Changes aren't being saved in this browser — use Export.
        </div>
      )}
      {banners.map((banner) => (
        <div key={banner.id} className="banner warning">
          <p>{banner.text}</p>
          <button type="button" onClick={() => setBanners((shown) => shown.filter((b) => b.id !== banner.id))}>
            Dismiss
          </button>
        </div>
      ))}
```

In `src/app/Workspace.tsx`, find:
```tsx
          onImport={importFile}
        />
      )}
    </>
```
Replace with:
```tsx
          onImport={importFile}
        />
      )}
      <DataFooter meta={data.meta} />
    </>
```

- [ ] **Step 5: Pass the clock from `src/app/App.tsx`**

In `src/app/App.tsx`, find:
```tsx
  actions?: BrowserActions;
}
```
Replace with:
```tsx
  actions?: BrowserActions;
  /** The current time (tests pass a fixed one). */
  now?: () => Date;
}
```

In `src/app/App.tsx`, find:
```tsx
export function App({ load = loadAppData, storage, actions = browserActions }: AppProps) {
```
Replace with:
```tsx
export function App({ load = loadAppData, storage, actions = browserActions, now = () => new Date() }: AppProps) {
```

In `src/app/App.tsx`, find:
```tsx
      <Workspace data={phase.data} storage={store} actions={actions} />
```
Replace with:
```tsx
      <Workspace data={phase.data} storage={store} actions={actions} now={now} />
```

- [ ] **Step 6: Style the footer in `src/app/app.css`**

In `src/app/app.css`, find:
```css
.paste-panel h3 {
  margin-top: var(--space);
}
```
Replace with:
```css
.paste-panel h3 {
  margin-top: var(--space);
}

/* The data line under every view */
.data-footer {
  padding: var(--space) calc(var(--space) * 1.5);
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 0.9em;
}
.data-footer p {
  margin: 0;
}
.data-footer ul {
  margin: 0.25rem 0 0;
}
```

- [ ] **Step 7: Run the tests and the typecheck**

Run: `npx vitest run src/app/data.flow.test.tsx` then `npm test` then `npm run typecheck`
Expected: PASS (2 tests); the whole suite then has 748 tests; typecheck clean.

Mutation proof (do it, then undo it): in `Workspace.tsx`, change `setBanners((shown) => shown.filter((b) => b.id !== banner.id))` to `setBanners((shown) => shown)`; the test "warns about borrowed usage and old data, and each warning can be dismissed" must fail. Restore the line.

- [ ] **Step 8: Commit**

```bash
git add src/app/DataFooter.tsx src/app/data.flow.test.tsx src/app/Workspace.tsx src/app/App.tsx src/app/app.css
git commit -m "feat(app): show the data's age and notes, and warn about borrowed or old data" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The Pages base path and the browser tests

**Files:**
- Modify: `vite.config.ts` (replace the whole file), `package.json` and `package-lock.json` (by `npm install`, then an edit), `tsconfig.json`, `.gitignore`
- Create: `e2e/playwright.config.ts`, `e2e/app.e2e.ts`, `e2e/live.e2e.ts`

**Interfaces:**
- Consumes: the built app (the data footer from Task 2 is checked by the "shows the data line" test); `parseDraftFile`, `serializeDraftFile`, `DraftFile` (`src/domain/file.ts`); `STORAGE_KEY` (`src/app/state/storage.ts`).
- Produces: `PAGES_BASE = '/draftlab/'` (exported from `vite.config.ts`); scripts `e2e`, `e2e:ci`, `e2e:live` (used by the workflow in Task 4).

- [ ] **Step 1: Install Playwright and its browser**

Run: `npm install --save-exact --save-dev @playwright/test@1.63.0`
Run: `npx playwright install chromium`
Expected: `package.json` gains `"@playwright/test": "1.63.0"` under devDependencies and `package-lock.json` changes; Chromium is downloaded into the user's Playwright cache (outside the repo). Warnings about install scripts that were not run are harmless.

- [ ] **Step 2: Add the scripts to `package.json`, typecheck `e2e/`, and ignore Playwright's output**

In `package.json`, find:
```json
    "preview": "vite preview"
```
Replace with:
```json
    "preview": "vite preview",
    "e2e": "npm run build && playwright test -c e2e/playwright.config.ts --project=gate",
    "e2e:ci": "playwright test -c e2e/playwright.config.ts --project=gate",
    "e2e:live": "playwright test -c e2e/playwright.config.ts --project=live"
```

In `tsconfig.json`, find:
```json
  "include": ["src", "sync", "vitest.config.ts", "vitest.integration.config.ts", "vite.config.ts"]
```
Replace with:
```json
  "include": ["src", "sync", "e2e", "vitest.config.ts", "vitest.integration.config.ts", "vite.config.ts"]
```

In `.gitignore`, find:
```text
.superpowers/
```
Replace with:
```text
.superpowers/
playwright-report/
test-results/
```

- [ ] **Step 3: Serve the build under `/draftlab/`: replace `vite.config.ts`**

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** GitHub Pages serves the project site under https://kmpdotexe.github.io/draftlab/. */
export const PAGES_BASE = '/draftlab/';

// The app's dev server and production build. Tests use vitest.config.ts. The build and `vite preview` use the
// Pages base path; the dev server stays at '/'.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    // The snapshot is loaded as its own ~1.35 MB chunk on purpose (src/app/data/snapshot.ts); warn only above that.
    chunkSizeWarningLimit: 1500,
  },
}));
```

Run: `npm run build`
Expected: the build succeeds and `dist/index.html` loads `/draftlab/assets/index-….js`.

- [ ] **Step 4: Create the browser tests**

```ts
import { defineConfig, devices } from '@playwright/test';

// Browser tests (Chromium only). Run from the repo root:
//   npm run e2e       build, serve dist/ with `vite preview` and run the gate tests (project "gate", app.e2e.ts)
//   npm run e2e:ci    the same against an existing dist/ (CI builds it in an earlier job)
//   npm run e2e:live  the smoke test (project "live", live.e2e.ts) against DRAFTLAB_URL, e.g. the deployed site
const live = process.env.DRAFTLAB_URL;
const PREVIEW_PORT = 4173;
const previewUrl = `http://localhost:${PREVIEW_PORT}/draftlab/`;

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  outputDir: '../test-results',
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  projects: [
    { name: 'gate', testMatch: 'app.e2e.ts', use: { baseURL: previewUrl } },
    { name: 'live', testMatch: 'live.e2e.ts' },
  ],
  // The preview server is only needed for the gate tests; with DRAFTLAB_URL set only the live test runs.
  webServer: live
    ? undefined
    : {
        command: `npx vite preview --port ${PREVIEW_PORT} --strictPort`,
        url: previewUrl,
        cwd: '..',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
```

```ts
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDraftFile, serializeDraftFile, type DraftFile } from '../src/domain/file';
import type { Snapshot, SnapshotMeta } from '../src/domain/types';
import { STORAGE_KEY } from '../src/app/state/storage';

// The gate tests: the built site (served by `vite preview` under /draftlab/) in a real browser.
const read = (name: string) => JSON.parse(readFileSync(join(process.cwd(), 'data', 'gen9championsvgc2026regmb', name), 'utf8'));
const snapshot = read('snapshot.json') as Snapshot;
const meta = read('meta.json') as SnapshotMeta;

/** One pick for you (Ana, slot 0) in a two-drafter league. */
const savedDraft: DraftFile = {
  schemaVersion: 2,
  league: { name: 'E2E League', formatId: snapshot.formatId, drafters: ['Ana', 'Ben'], order: 'snake', rounds: 2, me: 0, budget: 60, prices: { garchomp: 16, incineroar: 20 }, extraBans: [] },
  picks: ['garchomp'],
  sets: {},
  teams: [],
};

/** Opens the site with `file` already saved in the browser, as if from an earlier visit. */
async function openWith(page: Page, file: DraftFile) {
  await page.goto('./');
  await page.evaluate(([key, text]) => localStorage.setItem(key, text), [STORAGE_KEY, serializeDraftFile(file)]);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Undo last pick' })).toBeVisible();
}

test('sets up a league from a CSV, records picks, and shows suggestions with reasons', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Set up your league' })).toBeVisible();
  await page.getByLabel(/Paste "name,points" lines/).fill(
    ['Pokemon,Points', 'Incineroar,20', 'Kingambit,18', 'Garchomp,16', 'Sneasler,12', 'Whimsicott,10', 'Torkoal,4'].join('\n'),
  );
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText('6 prices imported.')).toBeVisible();

  await page.getByLabel('League name').fill('E2E League');
  await page.getByLabel(/Drafters/).fill('Ana\nBen\nCy');
  await page.getByLabel('Rounds (roster size)').fill('2');
  await page.getByLabel('Budget (points per roster)').fill('60');
  await page.getByRole('button', { name: 'Start draft' }).click();
  await expect(page.getByText('Pick 1 of 6 · Round 1 · You are on the clock')).toBeVisible();

  for (const name of ['Incineroar', 'Kingambit', 'Garchomp']) {
    const box = page.getByRole('combobox', { name: /^Pick for / });
    await box.fill(name);
    await box.press('Enter');
  }
  await expect(page.getByText('Pick 4 of 6 · Round 2 · Cy is on the clock')).toBeVisible();
  const firstCard = page.locator('.cards .card').first();
  await expect(firstCard).toBeVisible();
  expect(await firstCard.locator('.reasons li').count()).toBeGreaterThan(0);
});

test('keeps a set made in the teambuilder after the page is reloaded', async ({ page }) => {
  await openWith(page, savedDraft);
  await page.getByRole('button', { name: 'Teambuilder' }).click();
  await page.getByRole('button', { name: 'Start from the common set' }).click();
  await expect(page.getByRole('combobox', { name: 'Move 1' })).toHaveValue('Dragon Claw');

  await page.reload();
  await page.getByRole('button', { name: 'Teambuilder' }).click();
  await expect(page.getByRole('combobox', { name: 'Move 1' })).toHaveValue('Dragon Claw');
  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const parsed = parseDraftFile(stored ?? '', snapshot);
  expect(parsed.ok && parsed.file.sets.garchomp?.moves?.[0]).toBe('dragonclaw');
});

test('exports the draft as a file the app can read back', async ({ page }) => {
  await openWith(page, savedDraft);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export' }).click()]);
  expect(download.suggestedFilename()).toBe('e2e-league.draftlab.json');
  const text = readFileSync((await download.path())!, 'utf8');
  const parsed = parseDraftFile(text, snapshot);
  expect(parsed.ok && parsed.file.picks).toEqual(['garchomp']);
});

test('loads every script from under /draftlab/ and shows the data line', async ({ page }) => {
  // On GitHub Pages only /draftlab/… exists; `vite preview` would also answer /assets/…, so check the requests.
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname);
  });
  await page.goto('./');
  const footer = page.getByRole('contentinfo');
  await expect(footer).toContainText(`Smogon ladder usage for ${meta.usage!.month}`);
  await expect(footer).toContainText('updated');
  // The app chunk plus the lazily loaded snapshot and meta chunks.
  expect(scripts.length).toBeGreaterThanOrEqual(3);
  expect(scripts.filter((path) => !path.startsWith('/draftlab/assets/'))).toEqual([]);
});
```

```ts
import { expect, test } from '@playwright/test';

// The smoke test: the deployed site loads its data in a fresh browser. Run with DRAFTLAB_URL set.
const url = process.env.DRAFTLAB_URL;
if (!url) throw new Error('Set DRAFTLAB_URL to the site to test, e.g. https://kmpdotexe.github.io/draftlab/');

test('the live site loads the app and its data without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Set up your league' })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toContainText('updated');
  expect(errors).toEqual([]);
});
```

- [ ] **Step 5: Run the browser tests, the unit suite and the typecheck**

Run: `npm run e2e`
Expected: 4 passed (about 30 s including the build, about 10 s for the tests).

Run: `npm run e2e:live`
Expected: it stops with `Error: Set DRAFTLAB_URL to the site to test, e.g. https://kmpdotexe.github.io/draftlab/` (no `DRAFTLAB_URL` set). Optional: with `npx vite preview --port 4174` running in another shell, `DRAFTLAB_URL=http://localhost:4174/draftlab/ npm run e2e:live` passes (1 test).

Run: `npm test` then `npm run typecheck`
Expected: the whole suite then has 748 tests (the browser tests are not collected by Vitest); typecheck clean (it now covers `e2e/`).

Mutation proof (do it, then undo it): in `vite.config.ts`, change `base: command === 'build' || isPreview ? PAGES_BASE : '/',` to `base: '/',` and run `npm run e2e`; the test "loads every script from under /draftlab/ and shows the data line" must fail (the other three still pass: `vite preview` also answers `/assets/…`, which GitHub Pages would not). Restore the file.

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts package.json package-lock.json tsconfig.json .gitignore e2e/playwright.config.ts e2e/app.e2e.ts e2e/live.e2e.ts
git commit -m "feat(app): serve the build under /draftlab/ and test it in a real browser" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The workflow and the docs

**Files:**
- Create: `.github/workflows/site.yml`
- Modify: `README.md`, `docs/STATUS.md`

**Interfaces:**
- Consumes: the scripts `typecheck`, `test`, `test:integration`, `build`, `sync`, `e2e:ci`, `e2e:live`.
- Produces: nothing for other code.

- [ ] **Step 1: Create `.github/workflows/site.yml`**

```yaml
# Draft Lab: refresh the data, test, build and deploy to GitHub Pages.
# - push to main: test, build, browser-test and deploy the pushed code.
# - schedule (Mondays 06:00 UTC) and "Run workflow": first sync the data and, when every check passes, commit it to
#   main; then test, build, browser-test and deploy. Any failure stops the run: nothing is committed or deployed,
#   and GitHub emails the repo owner about the failed run.
# One workflow does all of it because a push made with the workflow's own token does not start another run.
name: site

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      sync:
        description: Refresh the data before deploying
        type: boolean
        default: true
  schedule:
    - cron: '0 6 * * 1'

concurrency:
  group: site
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  sync:
    if: github.event_name == 'schedule' || (github.event_name == 'workflow_dispatch' && inputs.sync)
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v7
        with:
          ref: main
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run sync
      - name: Check for changed data
        id: changes
        run: |
          if [ -n "$(git status --porcelain data/)" ]; then echo "changed=true" >> "$GITHUB_OUTPUT"; else echo "changed=false" >> "$GITHUB_OUTPUT"; fi
      - if: steps.changes.outputs.changed == 'true'
        run: npm run typecheck
      - if: steps.changes.outputs.changed == 'true'
        run: npm test
      - if: steps.changes.outputs.changed == 'true'
        run: npm run test:integration
      - if: steps.changes.outputs.changed == 'true'
        run: npm run build
      - name: Commit the new data
        if: steps.changes.outputs.changed == 'true'
        run: |
          month=$(node -p "require('./data/gen9championsvgc2026regmb/meta.json').usage?.month ?? 'no usage'")
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git add data/
          git commit -m "data: weekly sync (usage ${month})" -m "Co-Authored-By: github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>"
          git push origin HEAD:main

  build:
    needs: sync
    if: ${{ !failure() && !cancelled() }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          ref: main
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - uses: actions/upload-artifact@v7
        with:
          name: dist
          path: dist/
          if-no-files-found: error

  e2e:
    needs: build
    if: ${{ !failure() && !cancelled() }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          ref: main
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - uses: actions/download-artifact@v8
        with:
          name: dist
          path: dist/
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e:ci
      - if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: playwright-report
          path: playwright-report/

  deploy:
    needs: e2e
    if: ${{ !failure() && !cancelled() && github.ref == 'refs/heads/main' }}
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    outputs:
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/download-artifact@v8
        with:
          name: dist
          path: dist/
      - uses: actions/upload-pages-artifact@v5
        with:
          path: dist/
      - id: deployment
        uses: actions/deploy-pages@v5

  smoke:
    needs: deploy
    if: ${{ !failure() && !cancelled() }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          ref: main
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e:live
        env:
          DRAFTLAB_URL: ${{ needs.deploy.outputs.url }}
```

- [ ] **Step 2: Check that it parses**

Run: `node -e "const t=require('fs').readFileSync('.github/workflows/site.yml','utf8'); if (/\t/.test(t)) throw new Error('tab in YAML'); console.log(t.split('\n').length, 'lines')"`
Expected: the line count, no error. (A full YAML parse was done at plan time with the `yaml` package; the workflow's first real run happens in the rollout.)

- [ ] **Step 3: Update `README.md`**

In `README.md`, find:
```text
`npm run dev` starts it at http://localhost:5173; `npm run build` writes a static site to `dist/`.
```
Replace with:
```text
`npm run dev` starts it at http://localhost:5173; `npm run build` writes a static site to `dist/`, which `.github/workflows/site.yml` deploys to GitHub Pages (https://kmpdotexe.github.io/draftlab/) after the browser tests pass. The same workflow re-syncs the data every Monday and commits it when every check passes.
```

In `README.md`, find:
```text
- `npm run typecheck` runs `tsc --noEmit`.
```
Replace with:
```text
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run e2e` builds the site and runs the browser tests (Playwright, Chromium) against it; the first time, run `npx playwright install chromium`. `npm run e2e:live` runs the smoke test against `DRAFTLAB_URL`.
```

- [ ] **Step 4: Update `docs/STATUS.md`**

In `docs/STATUS.md`, find:
```text
Last updated 2026-10-03.
```
Replace with:
```text
Last updated 2026-10-04.
```

In `docs/STATUS.md`, find:
```text
autosaved in the browser. Hosting comes next.
```
Replace with:
```text
autosaved in the browser. It is built and deployed to GitHub Pages by `.github/workflows/site.yml`, which also refreshes the data every week.
```

In `docs/STATUS.md`, find:
```text
Work so far happened between 2026-09-20 and 2026-10-03.
```
Replace with:
```text
Work so far happened between 2026-09-20 and 2026-10-04.
```

In `docs/STATUS.md`, find:
```text
| 10 | App shell, increment 3: hosting and data refresh | not started | |
```
Replace with:
```text
| 10 | App shell, increment 3: hosting and data refresh (GitHub Pages, a weekly data sync, the data's age in the UI, browser tests) | `specs/2026-10-04-app-hosting-design.md`, `plans/2026-10-04-app-hosting.md` | done: built and reviewed |
```

In `docs/STATUS.md`, find:
```text
Tests, all passing: 740 unit tests (including the UI flow tests, which run in jsdom) and 21 integration tests.
```
Replace with:
```text
Tests, all passing: 748 unit tests (including the UI flow tests, which run in jsdom), 21 integration tests and 4 browser tests (Playwright, `e2e/`).
```

- [ ] **Step 5: Run everything once more**

Run: `npm run typecheck` then `npm test` then `npm run build`
Expected: typecheck clean; the whole suite then has 748 tests; the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/site.yml README.md docs/STATUS.md
git commit -m "ci: one workflow to refresh the data, test, build and deploy to GitHub Pages; docs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the merge (the rollout; not tasks for an implementer)

Each step needs the user; the spec's "Rollout" section is the authority.
1. The user gives their GitHub noreply address.
2. Back up the old history (`git bundle create <outside the repo>/draftlab-before-rewrite.bundle --all`), rewrite every commit's author and committer email to the noreply address, set `git config user.email` for this repo, and check: no Gmail address in `git log --all --format='%ae %ce'`, and the same tree at every branch tip as before.
3. With the user's explicit approval, `git push --force origin main`.
4. The user makes the repo public and sets Settings → Pages → Source to "GitHub Actions".
5. The user starts the workflow from the Actions tab ("Run workflow", sync on); watch the run; open https://kmpdotexe.github.io/draftlab/.

## Self-Review (spec coverage)

- The data line (label, usage month and source, cutoff, battles, update day; no usage; unknown date), the notes, the two banners with the 45-day rule and dismissing: Tasks 1-2.
- The base path for build and preview, the dev server unchanged: Task 3.
- Browser tests: the four gate flows and the smoke test, Chromium only, outside `npm test`, the three scripts: Task 3.
- The workflow (triggers, the `sync` input, concurrency, jobs and permissions, data commit message and author, deploy only on main, smoke after deploy, Playwright report on failure): Task 4.
- Docs: Task 4. The rollout: after the merge, with the user.
