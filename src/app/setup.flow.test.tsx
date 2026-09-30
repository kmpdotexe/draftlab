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
  it('imports prices from a pasted CSV, fixes one by hand, and starts the draft', async () => {
    const user = userEvent.setup();
    const { storage, data: stored } = fakeStorage();
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);

    expect(await screen.findByRole('heading', { name: 'Set up your league' })).toBeTruthy();
    expect(screen.getByText('Format: Champions VGC 2026 Reg M-B')).toBeTruthy();

    // CSV import: 4 matched, Missingno unmatched, Venusaur's points are not a number.
    await user.click(screen.getByLabelText(/Paste "name,points" lines/));
    await user.paste(CSV);
    await user.click(screen.getByRole('button', { name: 'Import' }));
    const result = screen.getByRole('status');
    expect(within(result).getByText('4 prices imported.')).toBeTruthy();
    expect(within(result).getByText(/Missingno/)).toBeTruthy();
    expect(within(result).getByText('line 7: "four" is not a whole number of points')).toBeTruthy();

    // Fix Torkoal's price in the table.
    await user.type(screen.getByLabelText('Search'), 'Torkoal');
    const torkoal = screen.getByLabelText('Points for Torkoal');
    expect((torkoal as HTMLInputElement).value).toBe('4');
    await user.clear(torkoal);
    await user.type(torkoal, '7');

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
