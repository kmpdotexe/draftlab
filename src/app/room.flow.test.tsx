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

/** 3 drafters (Ana, Ben = you, Cy), snake, 2 rounds, 50 points; ten priced Pokémon. Pick order: Ana, Ben, Cy, Cy, Ben, Ana. */
const leagueFile = (picks: string[] = []): DraftFile => ({
  schemaVersion: 2,
  league: {
    name: 'Test League',
    formatId: data.snapshot.formatId,
    drafters: ['Ana', 'Ben', 'Cy'],
    order: 'snake',
    rounds: 2,
    me: 1,
    budget: 50,
    prices: {
      incineroar: 20,
      kingambit: 18,
      garchomp: 16,
      sneasler: 12,
      whimsicott: 10,
      rotomwash: 9,
      pelipper: 8,
      swampertmega: 6,
      torkoal: 4,
      venusaur: 4,
    },
    extraBans: [],
  },
  picks,
  sets: {},
  teams: [],
});
const stored = (file: DraftFile) => ({ [STORAGE_KEY]: serializeDraftFile(file) });

/** Types into the pick box and presses Enter on the first option. */
async function recordPick(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByRole('combobox', { name: /^Pick for / }), text);
  await user.keyboard('{Enter}');
}

const picksIn = (storage: Map<string, string>): string[] => {
  const parsed = parseDraftFile(storage.get(STORAGE_KEY) ?? '', data.snapshot);
  return parsed.ok ? parsed.file.picks : ['<unreadable>'];
};

describe('recording picks', () => {
  it('records picks for whoever is on the clock, shows them in the log and the rosters, and saves each one', async () => {
    const user = userEvent.setup();
    const { storage, data: saved } = fakeStorage(stored(leagueFile()));
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    expect(await screen.findByText('Pick 1 of 6 · Round 1 · Ana is on the clock')).toBeTruthy();

    await recordPick(user, 'Incin');
    expect(screen.getByText('Pick 2 of 6 · Round 1 · You are on the clock')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Picks' })).getByText(/Ana — Incineroar \(20\)/)).toBeTruthy();
    expect(within(screen.getByRole('article', { name: "Ana's roster" })).getByText('30 of 50 points left · 1 open slot')).toBeTruthy();
    expect(picksIn(saved)).toEqual(['incineroar']);

    await recordPick(user, 'Kinga');
    await recordPick(user, 'Garch');
    expect(picksIn(saved)).toEqual(['incineroar', 'kingambit', 'garchomp']);
    expect(screen.getByText('Pick 4 of 6 · Round 2 · Cy is on the clock')).toBeTruthy();
  });

  it('greys out and refuses a Pokémon the on-the-clock drafter cannot afford', async () => {
    const user = userEvent.setup();
    // A 1-round league with a 10-point budget: Ana cannot afford Incineroar (20).
    const file = leagueFile();
    file.league = { ...file.league, rounds: 1, budget: 10 };
    const { storage, data: saved } = fakeStorage(stored(file));
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    await screen.findByText('Pick 1 of 3 · Round 1 · Ana is on the clock');
    await recordPick(user, 'Incin');
    const option = within(screen.getByRole('listbox')).getByRole('option');
    expect(option.getAttribute('aria-disabled')).toBe('true');
    expect(option.textContent).toBe('Incineroar — 20 pts (costs 20, has 10)');
    expect(screen.getByText('Pick 1 of 3 · Round 1 · Ana is on the clock')).toBeTruthy();
    expect(saved.get(STORAGE_KEY)).toBe(serializeDraftFile(file));
  });

  it('is keyboard-operable: arrows move through the options, Enter picks the highlighted one, Escape clears the query', async () => {
    const user = userEvent.setup();
    const { storage, data: saved } = fakeStorage(stored(leagueFile()));
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    await screen.findByText('Pick 1 of 6 · Round 1 · Ana is on the clock');

    const input = screen.getByRole('combobox', { name: /^Pick for / });
    // "a" matches at least Incineroar, Garchomp, Whimsicott, Rotom-Wash, Swampert-Mega and Venusaur.
    await user.type(input, 'a');
    const optionTexts = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent ?? '');
    expect(optionTexts.length).toBeGreaterThanOrEqual(2);
    const secondName = optionTexts[1].split(' — ')[0];

    await user.keyboard('{ArrowDown}{Enter}');
    expect(picksIn(saved)).toHaveLength(1);
    expect(data.snapshot.species[picksIn(saved)[0]].name).toBe(secondName);

    await user.type(input, 'a');
    expect(input).toHaveProperty('value', 'a');
    await user.keyboard('{Escape}');
    expect(input).toHaveProperty('value', '');
  });

  it('undoes the last pick', async () => {
    const user = userEvent.setup();
    const { storage, data: saved } = fakeStorage(stored(leagueFile(['incineroar', 'kingambit'])));
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    await screen.findByText('Pick 3 of 6 · Round 1 · Cy is on the clock');
    await user.click(screen.getByRole('button', { name: 'Undo last pick' }));
    expect(screen.getByText('Pick 2 of 6 · Round 1 · You are on the clock')).toBeTruthy();
    expect(picksIn(saved)).toEqual(['incineroar']);
  });

  it('restores the draft from storage when the app is opened again', async () => {
    const { storage } = fakeStorage(stored(leagueFile()));
    const first = render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    await screen.findByText('Pick 1 of 6 · Round 1 · Ana is on the clock');
    await recordPick(userEvent.setup(), 'Incin');
    await screen.findByText('Pick 2 of 6 · Round 1 · You are on the clock');
    first.unmount();
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    expect(await screen.findByText('Pick 2 of 6 · Round 1 · You are on the clock')).toBeTruthy();
  });
});

describe('suggestions', () => {
  it('asks for a first pick, then shows cards with reasons as sentences and picks from a card on your turn', async () => {
    const user = userEvent.setup();
    // Ana took Incineroar: Ben (you) is on the clock with an empty roster.
    const { storage, data: saved } = fakeStorage(stored(leagueFile(['incineroar'])));
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    const panel = await screen.findByRole('region', { name: 'Suggestions for you' });
    expect(within(panel).getByText('Suggestions start after your first pick.')).toBeTruthy();

    await recordPick(user, 'Kinga'); // Ben
    await recordPick(user, 'Garch'); // Cy
    await recordPick(user, 'Snea'); // Cy; now Ben (you) is on the clock again
    expect(screen.getByText('Pick 5 of 6 · Round 2 · You are on the clock')).toBeTruthy();

    const cards = within(panel).getAllByRole('listitem').filter((item) => item.classList.contains('card'));
    expect(cards.length).toBeGreaterThanOrEqual(3);
    // Every reason is an English sentence, and the roster note is there.
    for (const card of cards) {
      for (const reason of within(card).getAllByRole('listitem')) expect(reason.textContent).toMatch(/^[A-Z].*\.$/);
    }
    expect(within(panel).getByText(/^Your roster has no .* yet\.$/)).toBeTruthy();

    const firstName = within(cards[0]).getByRole('heading').textContent ?? '';
    await user.click(within(cards[0]).getByRole('button', { name: `Pick ${firstName}` }));
    expect(screen.getByText('Pick 6 of 6 · Round 2 · Ana is on the clock')).toBeTruthy();
    const picks = picksIn(saved);
    expect(picks).toHaveLength(5);
    expect(data.snapshot.species[picks[4]].name).toBe(firstName);
    // Not your turn: no Pick buttons.
    expect(within(panel).queryAllByRole('button', { name: /^Pick / })).toEqual([]);
  });

  it('filters by usage', async () => {
    const user = userEvent.setup();
    const { storage } = fakeStorage(stored(leagueFile(['incineroar', 'kingambit'])));
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    const panel = await screen.findByRole('region', { name: 'Suggestions for you' });
    const names = () => within(panel).queryAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    const all = names();
    await user.selectOptions(within(panel).getByLabelText(/Show/), 'staples');
    const staples = names();
    expect(staples.length).toBeGreaterThan(0);
    expect(staples.length).toBeLessThan(all.length);
    for (const name of staples) expect(all).toContain(name);
  });
});

describe('export, import and recovery', () => {
  it('exports the draft file and imports it back into a fresh browser', async () => {
    const user = userEvent.setup();
    const { actions, downloads } = fakeActions();
    render(<App load={load} storage={fakeStorage(stored(leagueFile(['incineroar', 'kingambit']))).storage} actions={actions} />);
    await screen.findByText('Pick 3 of 6 · Round 1 · Cy is on the clock');
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toBe('test-league.draftlab.json');
    cleanup();

    const fresh = fakeStorage();
    render(<App load={load} storage={fresh.storage} actions={fakeActions().actions} />);
    await screen.findByRole('heading', { name: 'Set up your league' });
    await user.upload(screen.getByLabelText('Import a draft file'), new File([downloads[0].text], 'x.json'));
    expect(await screen.findByText('Pick 3 of 6 · Round 1 · Cy is on the clock')).toBeTruthy();
    expect(picksIn(fresh.data)).toEqual(['incineroar', 'kingambit']);
  });

  it('refuses a broken import and changes nothing', async () => {
    const user = userEvent.setup();
    const { storage, data: saved } = fakeStorage(stored(leagueFile(['incineroar'])));
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    await screen.findByText('Pick 2 of 6 · Round 1 · You are on the clock');
    await user.upload(screen.getByLabelText('Import'), new File(['{"schemaVersion": 7}'], 'bad.json'));
    expect(await screen.findByText('That file could not be imported; nothing was changed.')).toBeTruthy();
    expect(picksIn(saved)).toEqual(['incineroar']);
  });

  it('asks before an import replaces the current draft, and offers a download of it first', async () => {
    const user = userEvent.setup();
    const { actions, questions, downloads } = fakeActions([true, true]);
    const { storage, data: saved } = fakeStorage(stored(leagueFile(['incineroar'])));
    render(<App load={load} storage={storage} actions={actions} />);
    await screen.findByText('Pick 2 of 6 · Round 1 · You are on the clock');
    await user.upload(screen.getByLabelText('Import'), new File([serializeDraftFile(leagueFile(['incineroar', 'kingambit']))], 'x.json'));
    expect(await screen.findByText('Pick 3 of 6 · Round 1 · Cy is on the clock')).toBeTruthy();
    expect(questions).toEqual(['Replace the current draft with the imported file?', 'Download a copy of the current draft first?']);
    expect(downloads.map((d) => d.text)).toEqual([serializeDraftFile(leagueFile(['incineroar']))]);
    expect(picksIn(saved)).toEqual(['incineroar', 'kingambit']);
  });

  it('shows the recovery screen for a stored file that cannot be read, with download and start over', async () => {
    const user = userEvent.setup();
    const { actions, downloads } = fakeActions([true]);
    const { storage, data: saved } = fakeStorage({ [STORAGE_KEY]: '{broken' });
    render(<App load={load} storage={storage} actions={actions} />);
    expect(await screen.findByRole('heading', { name: 'The saved draft could not be read' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Download raw file' }));
    expect(downloads).toEqual([{ filename: 'draftlab-recovered.json', text: '{broken' }]);
    await user.click(screen.getByRole('button', { name: 'Start over' }));
    expect(await screen.findByRole('heading', { name: 'Set up your league' })).toBeTruthy();
    expect(saved.has(STORAGE_KEY)).toBe(false);
  });

  it('shows the warnings of an imported file until dismissed', async () => {
    const user = userEvent.setup();
    const file = leagueFile(['incineroar']);
    const withUnknownBan: DraftFile = { ...file, league: { ...file.league, extraBans: ['zz'] } };
    render(<App load={load} storage={fakeStorage().storage} actions={fakeActions().actions} />);
    await screen.findByRole('heading', { name: 'Set up your league' });
    await user.upload(screen.getByLabelText('Import a draft file'), new File([serializeDraftFile(withUnknownBan)], 'w.json'));
    expect(await screen.findByText('Pick 2 of 6 · Round 1 · You are on the clock')).toBeTruthy();
    expect(screen.getByText('league.extraBans[0]')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('league.extraBans[0]')).toBeNull();
  });
});

describe('editing the league mid-draft', () => {
  it('refuses to ban a Pokémon that was already drafted, and saves an allowed change', async () => {
    const user = userEvent.setup();
    const { storage, data: saved } = fakeStorage(stored(leagueFile(['incineroar'])));
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    await screen.findByText('Pick 2 of 6 · Round 1 · You are on the clock');
    await user.click(screen.getByRole('button', { name: 'Setup' }));
    expect((screen.getByLabelText(/Drafters/) as HTMLTextAreaElement).disabled).toBe(true);

    await user.type(screen.getByLabelText('Search'), 'Incineroar');
    await user.click(screen.getByLabelText('Ban Incineroar'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('this would break pick 1: "incineroar" is banned in this league')).toBeTruthy();
    expect(saved.get(STORAGE_KEY)).toBe(serializeDraftFile(leagueFile(['incineroar'])));

    await user.click(screen.getByLabelText('Ban Incineroar'));
    await user.clear(screen.getByLabelText('League name'));
    await user.type(screen.getByLabelText('League name'), 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'Renamed' })).toBeTruthy();
  });

  it('clears a refusal when you go back to the draft without saving', async () => {
    const user = userEvent.setup();
    const { storage } = fakeStorage(stored(leagueFile(['incineroar'])));
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    await screen.findByText('Pick 2 of 6 · Round 1 · You are on the clock');
    await user.click(screen.getByRole('button', { name: 'Setup' }));
    await user.type(screen.getByLabelText('Search'), 'Incineroar');
    await user.click(screen.getByLabelText('Ban Incineroar'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('this would break pick 1: "incineroar" is banned in this league')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Back to the draft' }));
    expect(await screen.findByText('Pick 2 of 6 · Round 1 · You are on the clock')).toBeTruthy();
    expect(screen.queryByText(/this would break pick 1/)).toBeNull();
  });

  it('asks before starting a new league, offers a download, then clears the draft', async () => {
    const user = userEvent.setup();
    const { actions, questions, downloads } = fakeActions([false, true, true]);
    const { storage, data: saved } = fakeStorage(stored(leagueFile(['incineroar'])));
    render(<App load={load} storage={storage} actions={actions} />);
    await screen.findByText('Pick 2 of 6 · Round 1 · You are on the clock');
    await user.click(screen.getByRole('button', { name: 'Setup' }));

    await user.click(screen.getByRole('button', { name: 'New league' }));
    expect(picksIn(saved)).toEqual(['incineroar']);
    expect(downloads).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'New league' }));
    expect(questions).toEqual([
      'Start a new league? The current draft will be deleted.',
      'Start a new league? The current draft will be deleted.',
      'Download a copy of the current draft first?',
    ]);
    expect(downloads).toEqual([{ filename: 'test-league.draftlab.json', text: serializeDraftFile(leagueFile(['incineroar'])) }]);
    expect(await screen.findByRole('button', { name: 'Start draft' })).toBeTruthy();
    expect(saved.has(STORAGE_KEY)).toBe(false);
  });
});

describe('when the browser gets in the way', () => {
  it('warns when changes cannot be saved, and keeps working', async () => {
    const user = userEvent.setup();
    const { storage } = fakeStorage(stored(leagueFile()), { failWrite: true });
    render(<App load={load} storage={storage} actions={fakeActions().actions} />);
    await screen.findByText('Pick 1 of 6 · Round 1 · Ana is on the clock');
    expect(screen.queryByText(/aren't being saved/)).toBeNull();
    await recordPick(user, 'Incin');
    expect(screen.getByText("Changes aren't being saved in this browser — use Export.")).toBeTruthy();
    expect(screen.getByText('Pick 2 of 6 · Round 1 · You are on the clock')).toBeTruthy();
  });

  it('shows the warning from the start when storage cannot be read', async () => {
    render(<App load={load} storage={fakeStorage({}, { failRead: true, failWrite: true }).storage} actions={fakeActions().actions} />);
    expect(await screen.findByText("Changes aren't being saved in this browser — use Export.")).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Set up your league' })).toBeTruthy();
  });

  it('offers a retry when the data fails to load', async () => {
    const user = userEvent.setup();
    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls === 1) throw new Error('network down');
      return data;
    };
    render(<App load={flaky} storage={fakeStorage().storage} actions={fakeActions().actions} />);
    expect(await screen.findByText('network down')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Set up your league' })).toBeTruthy();
  });
});
