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
