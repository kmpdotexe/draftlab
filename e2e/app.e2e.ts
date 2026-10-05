import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDraftFile, serializeDraftFile, type DraftFile } from '../src/domain/file';
import type { Snapshot, SnapshotMeta } from '../src/domain/types';
import { dataSummary } from '../src/app/text/data-age';
import { STORAGE_KEY } from '../src/app/state/storage';
import { commonSet } from '../src/app/team/options';

// The gate tests: the built site (served by `vite preview` under /draftlab/) in a real browser.
const read = (name: string) => JSON.parse(readFileSync(join(process.cwd(), 'data', 'gen9championsvgc2026regmb', name), 'utf8'));
const snapshot = read('snapshot.json') as Snapshot;
const meta = read('meta.json') as SnapshotMeta;

/** Garchomp's ladder-common first move, from the same data the site is built with (it can change with each data refresh). */
const commonFirstMove = commonSet('garchomp', snapshot)?.moves?.[0] ?? '';
const commonFirstMoveName = snapshot.moves[commonFirstMove]?.name ?? '';

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
  await expect(firstCard.locator('.reasons li').first()).toBeVisible();
});

test('keeps a set made in the teambuilder after the page is reloaded', async ({ page }) => {
  expect(commonFirstMoveName).not.toBe('');
  await openWith(page, savedDraft);
  await page.getByRole('button', { name: 'Teambuilder' }).click();
  await page.getByRole('button', { name: 'Start from the common set' }).click();
  await expect(page.getByRole('combobox', { name: 'Move 1' })).toHaveValue(commonFirstMoveName);

  await page.reload();
  await page.getByRole('button', { name: 'Teambuilder' }).click();
  await expect(page.getByRole('combobox', { name: 'Move 1' })).toHaveValue(commonFirstMoveName);
  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const parsed = parseDraftFile(stored ?? '', snapshot);
  expect(parsed.ok && parsed.file.sets.garchomp?.moves?.[0]).toBe(commonFirstMove);
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
  await expect(footer).toContainText(dataSummary(meta));
  // The app chunk plus the lazily loaded snapshot and meta chunks.
  expect(scripts.length).toBeGreaterThanOrEqual(3);
  expect(scripts.filter((path) => !path.startsWith('/draftlab/assets/'))).toEqual([]);
});
