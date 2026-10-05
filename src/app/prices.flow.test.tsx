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

describe('importing a template', () => {
  it('imports a partly filled template without a problem for every blank row', async () => {
    const { user } = await freshSetup();
    const filled = templateCsv(data.snapshot.species)
      .split('\n')
      .map((line) => (line === 'Garchomp,' ? 'Garchomp,16' : line === 'Torkoal,' ? 'Torkoal,4' : line));
    await pasteList(user, filled);
    expect(screen.getByText('2 prices imported.')).toBeTruthy();
    expect(screen.queryByText(/is not a whole number of points/)).toBeNull();
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

  it('merging an empty tier into another empty tier keeps one tier and the board', async () => {
    const { user } = await freshSetup();
    await user.click(screen.getByRole('button', { name: 'Build tiers by hand' }));
    await user.click(screen.getByRole('button', { name: 'Add tier' }));
    const five = within(screen.getByRole('group', { name: '5-point tier, 0 Pokémon' })).getByLabelText('Points for this tier');
    await user.clear(five);
    await user.type(five, '10{Enter}');
    expect(screen.getByRole('group', { name: '10-point tier, 0 Pokémon' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'How do you want to set prices?' })).toBeNull();
  });

  it('keeps focus in the points box after a points edit', async () => {
    const { user } = await freshSetup();
    await user.click(screen.getByRole('button', { name: 'Build tiers by hand' }));
    const points = screen.getByLabelText('Points for this tier');
    await user.clear(points);
    await user.type(points, '12{Enter}');
    expect(document.activeElement).toBe(within(screen.getByRole('group', { name: /^12-point tier/ })).getByLabelText('Points for this tier'));
  });

  it('does not pull focus back to the points box after Tab', async () => {
    const { user } = await freshSetup();
    await user.click(screen.getByRole('button', { name: 'Build tiers by hand' }));
    const points = screen.getByLabelText('Points for this tier');
    await user.clear(points);
    await user.type(points, '12');
    await user.tab();
    const tier = screen.getByRole('group', { name: /^12-point tier/ });
    expect(document.activeElement).not.toBe(within(tier).getByLabelText('Points for this tier'));
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
