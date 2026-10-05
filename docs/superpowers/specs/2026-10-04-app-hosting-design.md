# App shell, increment 3: hosting and data refresh — Design

Date: 2026-10-04. Status: design approved in conversation; awaiting spec review.

Parents: `docs/superpowers/specs/2026-09-29-app-draft-room-design.md` (increment 1, "The app shell as three increments"), `docs/superpowers/specs/2026-10-03-app-teambuilder-design.md` (increment 2) and `docs/superpowers/specs/2026-09-20-draft-lab-design.md` (Architecture: a static site plus a scheduled job that runs the sync and rebuilds). The domain, the engine and the sync are used as they are.

## Purpose

Put Draft Lab on the web, keep its Pokémon data fresh without manual work, tell the user how old the data is, and test the real built site in a real browser before every deploy.

## Decisions (settled in brainstorming)

- **GitHub Pages, repo made public.** The site is served at `https://kmpdotexe.github.io/draftlab/`.
- **Before going public, the commit history is rewritten** so every commit's author and committer email is the user's GitHub noreply address instead of their Gmail address (see "Rollout").
- **A weekly scheduled job commits new data to `main` when every check passes**, and deploys it; on any failure nothing is committed or deployed and the run fails (GitHub emails the user).
- **Browser tests gate the deploy** (Playwright against the built site served locally in CI), and a short smoke test checks the live site after each deploy.
- **One workflow file** does sync, build, test, deploy and smoke, because a push made with the workflow's own token does not start another workflow run.

## Facts established (2026-10-04)

- The repo `kmpdotexe/draftlab` is private (the unauthenticated GitHub API returns 404). GitHub Pages serves private repos only on paid plans; a public repo is free.
- The `gh` CLI is not installed on the development machine: repo settings are changed by the user in the GitHub web UI.
- History scan (all 100 commits, all branches): no API keys, tokens, private keys, passwords, `.env`-style files or local machine paths in any file; the only email inside files is a package author's (`i@izs.me`). The user's Gmail address appears only as the author and committer email of all 100 commits. The largest blobs are the three versions of `snapshot.json` (about 1.3 MB each).
- `npm run sync` (`sync/index.ts`) syncs every format in `sync/formats.config.ts` (today only Reg M-B), takes the newest published Smogon month, validates before writing, keeps the previous snapshot when validation fails, and exits with code 1 on any failure. `meta.json` holds `label`, `generatedAt` (set on every run), `usage` (`statsFormatId`, `month`, `cutoff`, `battles`, `isFallback`, … or `null`) and `warnings` (4 today: Light Ball restricted entries and three Ogerpon tera masks).
- The app is a Vite build (`npm run build` = typecheck + `vite build` → `dist/`); the snapshot is a separate lazily loaded chunk.

## Out of scope

A custom domain, analytics, other hosts, syncing Reg M-C (needs a newer `pokemon-showdown` release), changing what the sync fetches, notifications other than GitHub's own failed-run email, browsers other than Chromium in the tests, and any change to `src/domain/`, `src/engine/` or the draft file.

## Architecture

```
.github/workflows/site.yml   the one workflow (below)
e2e/                         Playwright tests and config (outside src/, so Vitest does not collect them)
  playwright.config.ts       Chromium only; baseURL from DRAFTLAB_URL or the local preview
  app.e2e.ts                 the gate flows (served build)
  live.e2e.ts                the smoke test (live site)
vite.config.ts               base: '/draftlab/' for builds (dev server unchanged at '/')
src/app/text/data-age.ts     pure: dataSummary, dataBanners, formatDay
src/app/DataFooter.tsx       the data line and the data notes
src/app/Workspace.tsx        the data banners
package.json                 @playwright/test (pinned exactly); scripts e2e, e2e:live
```

### The workflow (`.github/workflows/site.yml`)

Triggers: `push` to `main`; `workflow_dispatch` (with a boolean input `sync`, default true); `schedule` weekly, Mondays 06:00 UTC. `concurrency: { group: site, cancel-in-progress: false }`, so one run at a time.

Jobs:
1. **`sync`** — only on `schedule`, or `workflow_dispatch` with `sync: true`. Permissions `contents: write`. Steps: checkout `main`; set up Node 24 with npm cache; `npm ci`; `npm run sync`; if `git status --porcelain data/` is empty, stop (nothing to commit); otherwise `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`; then commit `data/` as `github-actions[bot]` with the message `data: weekly sync (usage <month>)` (the month read from `meta.json`, or `no usage`) and the trailer `Co-Authored-By: github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>`, and push to `main`.
2. **`build`** — needs `sync` (and runs when `sync` was skipped, never when it failed: `if: ${{ !failure() && !cancelled() }}`). Permissions `contents: read`. Checkout the newest `main` (`ref: main`, so it includes the sync commit); `npm ci`; `npm run typecheck`; `npm test`; `npm run build`; upload `dist/` as a workflow artifact.
3. **`e2e`** — needs `build`. Download `dist/`; `npx playwright install --with-deps chromium`; `npm run e2e:ci` (serves `dist/` with `vite preview` and runs the gate tests). On failure, upload the Playwright report.
4. **`deploy`** — needs `e2e`; only on `main`. Permissions `pages: write`, `id-token: write`. Environment `github-pages`. `actions/upload-pages-artifact` from `dist/`, then `actions/deploy-pages`.
5. **`smoke`** — needs `deploy`. `npx playwright install --with-deps chromium`; `DRAFTLAB_URL=<deployed URL> npm run e2e:live`.

Pushes to other branches do not run the workflow (single-user repo; the feature branches are tested locally). Action versions are pinned to major tags of GitHub's own actions (`actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, `actions/download-artifact`, `actions/upload-pages-artifact`, `actions/deploy-pages`); the plan fixes the exact versions.

**Every week a data commit is made**, because `generatedAt` changes on every successful sync even when Smogon has nothing new. This is intended: the date the app shows is "last checked", and the stale-data banner measures exactly that.

### The base path

`vite.config.ts` sets `base: '/draftlab/'` for `vite build` and `vite preview` (Pages serves the project site under `/draftlab/`), and keeps `/` for `vite` (dev). The app has no router, so no 404 fallback page is needed; the lazily loaded data chunks resolve under the base.

## Showing the data's age (`text/data-age.ts`, `DataFooter.tsx`, banners)

**`dataSummary(meta)`** → the footer line:
"Data: {label} · Smogon ladder usage for {month} ({cutoff}+ rating, {battles} battles) · updated {day}"
- `battles` with thousands separators (`1,269,250`); `day` from `formatDay(generatedAt)`: "21 Sep 2026" (`en-GB` day month year, the browser's time zone).
- With `usage: null`: "Data: {label} · no ladder usage data · updated {day}".
- With fallback usage, the usage part names the source: "Smogon ladder usage for {month} from {statsFormatId} ({cutoff}+ rating, …)".

**`DataFooter`**: a `<footer>` under every Workspace view (setup, draft room, teambuilder; not the loading, load-error or recovery screens) with the line, and, when `meta.warnings` is non-empty, a `<details>` "Data notes (N)" listing each warning as written.

**`dataBanners(meta, now)`** → zero to two banners for `Workspace`, each dismissible for the session (not saved):
- Fallback: when `usage?.isFallback` — "Ladder usage comes from {usage.statsFormatId} because {label} has no published stats yet; suggestions may be less accurate."
- Stale: when `now - generatedAt` is more than `STALE_AFTER_DAYS = 45` days — "The Pokémon data is {n} days old; the weekly refresh may have stopped." (`n` whole days, rounded down).
An unreadable `generatedAt` gives no stale banner and shows "updated (unknown date)".

## Browser tests (`e2e/`)

Playwright, Chromium only, `@playwright/test` pinned exactly. Not run by `npm test`.

Gate tests (`app.e2e.ts`, against `vite preview` of `dist/` at `/draftlab/`):
1. **League and picks:** the setup screen loads; paste a CSV of prices, fill a three-drafter league, start the draft, record three picks through the pick box; the suggestions panel shows at least one card with a reason sentence.
2. **Teambuilder and reload:** with a draft whose user has a pick, open Teambuilder, press "Start from the common set", reload the page: the draft room and the set are still there (real `localStorage`).
3. **Export:** export the draft; the download's name is `<league>.draftlab.json` and its text is accepted by `parseDraftFile` (imported from `src/domain` in the test).
4. **Data line:** the footer shows the usage month and "updated".

Smoke test (`live.e2e.ts`, against `DRAFTLAB_URL`): open the URL; "Set up your league" and the data line appear; no console errors.

Scripts: `e2e` (build, then serve and test locally), `e2e:ci` (serve the existing `dist/` and test), `e2e:live` (test `DRAFTLAB_URL`).

## Errors and robustness

- A failed sync, check, build, browser test or deploy leaves the live site as it was (Pages switches only after a successful deploy) and fails the run, which GitHub emails to the user.
- A failed smoke test fails the run after the deploy; the site is live by then (that is what a smoke test is for).
- The app's own error handling is unchanged.

## Rollout (after the merge; each step needs the user)

1. The user gives their GitHub noreply address (GitHub → Settings → Emails, "Keep my email addresses private"; it looks like `ID+username@users.noreply.github.com`).
2. History rewrite on the local repo: every commit's author and committer email (and name, if wanted) becomes the noreply address; `git config user.email` for this repo is set to it. A backup bundle of the old history is saved outside the repo first. The rewrite is checked (no Gmail address left in `git log --all`, same tree at every branch tip).
3. With the user's explicit approval, force-push `main` (the only branch on GitHub). Other local branches are deleted or rewritten too.
4. The user makes the repo public (Settings → General → Danger Zone → Change visibility) and sets Pages to "GitHub Actions" (Settings → Pages → Source).
5. The user runs the workflow once from the Actions tab ("Run workflow"); we watch the first sync and deploy, and check the live URL.

## Testing

- **`data-age.test.ts`:** the summary with usage, without usage and with fallback usage; thousands separators; `formatDay`; the stale banner at exactly 45 days (none) and 46 days (one); an unreadable date; the fallback banner.
- **A jsdom flow test:** the footer and the notes appear on the draft room and the teambuilder; a fallback banner is shown for fallback meta and can be dismissed.
- **Browser tests** as above, run locally before the plan is committed and in CI before every deploy.
- **The workflow** is checked by parsing it and by its first real run (rollout step 5).

## Plan-time pre-verification

Install the pinned Playwright and Chromium on this machine and run a trivial test against `vite preview`; build with `base: '/draftlab/'` and confirm the app and the lazily loaded snapshot load under `/draftlab/` in preview; confirm `npm test` does not pick up `e2e/`; parse the workflow YAML; choose and record the exact action versions; measure the browser test times.

## Later

With hosting done, the app shell is complete. Candidates for later: Reg M-C when `pokemon-showdown` supports it, the deferred items in `docs/STATUS.md`.
