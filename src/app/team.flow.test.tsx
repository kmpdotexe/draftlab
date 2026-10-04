// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { parseDraftFile, serializeDraftFile, type DraftFile } from '../domain/file';
import { exportSet, exportSets, exportTeam } from '../domain/paste-export';
import type { RosterSets } from '../domain/team';
import { computeSetStats } from '../domain/stats';
import { App } from './App';
import { STORAGE_KEY } from './state/storage';
import { commonSet } from './team/options';
import { fakeActions, fakeStorage, realData } from './test-support';

afterEach(cleanup);

const data = realData();
const load = async () => data;

/** You and Rival alternate (linear, 7 rounds); your picks are the even ones. Every legal species costs 5. */
const MINE = ['garchomp', 'whimsicott', 'incineroar', 'kingambit', 'charizardmegax', 'charizardmegay', 'charizard'];
const RIVAL = ['rotomwash', 'pelipper', 'torkoal', 'venusaur', 'swampertmega', 'tyranitar'];
const ALL_PICKS = MINE.flatMap((id, i) => (i < RIVAL.length ? [id, RIVAL[i]] : [id]));
const prices = Object.fromEntries(Object.keys(data.snapshot.species).map((id) => [id, 5]));

const leagueFile = (pickCount = ALL_PICKS.length, extra: Partial<DraftFile> = {}): DraftFile => ({
  schemaVersion: 2,
  league: { name: 'Test League', formatId: data.snapshot.formatId, drafters: ['You', 'Rival'], order: 'linear', rounds: 7, me: 0, budget: 200, prices, extraBans: [] },
  picks: ALL_PICKS.slice(0, pickCount),
  sets: {},
  teams: [],
  ...extra,
});
const stored = (file: DraftFile) => ({ [STORAGE_KEY]: serializeDraftFile(file) });
const savedFile = (storage: Map<string, string>): DraftFile => {
  const parsed = parseDraftFile(storage.get(STORAGE_KEY) ?? '', data.snapshot);
  if (!parsed.ok) throw new Error('the saved file could not be read');
  return parsed.file;
};

async function openTeambuilder(file: DraftFile, actions = fakeActions().actions) {
  const user = userEvent.setup();
  const { storage, data: saved } = fakeStorage(stored(file));
  render(<App load={load} storage={storage} actions={actions} />);
  await user.click(await screen.findByRole('button', { name: 'Teambuilder' }));
  return { user, saved };
}

/** Types into a combobox and presses Enter on the first match. */
async function choose(user: ReturnType<typeof userEvent.setup>, label: string, text: string) {
  await user.type(screen.getByRole('combobox', { name: label }), text);
  await user.keyboard('{Enter}');
}

async function setPoints(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  await user.type(input, value);
}

describe('the set editor', () => {
  it('builds a full set with the form, shows level-50 stats, and saves every change', async () => {
    const { user, saved } = await openTeambuilder(leagueFile());
    expect(screen.getByRole('heading', { name: 'Garchomp' })).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /^Garchomp/ })).getByText('No set')).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Garchomp's ability"), 'roughskin');
    await choose(user, "Garchomp's item", 'Life Orb');
    await choose(user, 'Move 1', 'Earthquake');
    await choose(user, 'Move 2', 'Dragon Claw');
    await choose(user, 'Move 3', 'Protect');
    await choose(user, 'Move 4', 'Rock Slide');
    await user.selectOptions(screen.getByLabelText('Nature'), 'Jolly');
    await setPoints(user, 'HP points', '2');
    await setPoints(user, 'Atk points', '32');
    await setPoints(user, 'Spe points', '32');

    const expected = {
      species: 'garchomp',
      ability: 'roughskin',
      item: 'lifeorb',
      moves: ['earthquake', 'dragonclaw', 'protect', 'rockslide'],
      nature: 'Jolly' as const,
      points: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
    };
    expect(savedFile(saved).sets.garchomp).toEqual(expected);
    expect(screen.getByText('0 of 66 points left')).toBeTruthy();
    const stats = computeSetStats(expected, data.snapshot)!;
    expect(screen.getByText(`${stats.spe} ↑`)).toBeTruthy();
    expect(screen.getByText(`${stats.spa} ↓`)).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /^Garchomp/ })).getByText('Set ready')).toBeTruthy();
  });

  it('keeps the chosen move when the typed text matches nothing, and opens the list with a click', async () => {
    const { user, saved } = await openTeambuilder(leagueFile(undefined, { sets: { garchomp: { species: 'garchomp', moves: ['earthquake'] } } }));
    const move1 = screen.getByRole('combobox', { name: 'Move 1' });
    await user.clear(move1);
    await user.type(move1, 'zzzz');
    expect(screen.getByText('No match for "zzzz".')).toBeTruthy();
    await user.keyboard('{Enter}');
    expect(savedFile(saved).sets.garchomp?.moves).toEqual(['earthquake']);
    await user.keyboard('{Escape}');
    expect((move1 as HTMLInputElement).value).toBe('Earthquake');

    await user.click(screen.getByRole('combobox', { name: 'Move 2' }));
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.length).toBeGreaterThan(1);
    expect(options[options.length - 1].textContent).toBe('No move');
  });

  it('starts from the common set, and does not save points over 32 or past the 66 total', async () => {
    const { user, saved } = await openTeambuilder(leagueFile());
    await user.click(screen.getByRole('button', { name: /^Incineroar/ }));
    await user.click(screen.getByRole('button', { name: 'Start from the common set' }));
    const common = commonSet('incineroar', data.snapshot)!;
    expect(savedFile(saved).sets.incineroar).toEqual(common);
    expect((screen.getByRole('combobox', { name: 'Move 1' }) as HTMLInputElement).value).toBe('Fake Out');
    expect(screen.queryByRole('button', { name: 'Start from the common set' })).toBeNull();

    // The common spread uses all 66 points (Atk 0, Spe 3), so Atk can take nothing more.
    await setPoints(user, 'Atk points', '5');
    expect(screen.getByText('0 to 0')).toBeTruthy();
    expect(savedFile(saved).sets.incineroar?.points).toEqual(common.points);

    await setPoints(user, 'Spe points', '0');
    expect(screen.getByText('3 of 66 points left')).toBeTruthy();
    await setPoints(user, 'Atk points', '3');
    expect(savedFile(saved).sets.incineroar?.points).toEqual({ ...common.points, spe: 0, atk: 3 });
    await setPoints(user, 'HP points', '40');
    expect(screen.getByText('0 to 32')).toBeTruthy();
  });

  it('shows problems in plain words, says when there is no ladder data, and clears a set after asking', async () => {
    const sets: RosterSets = {
      garchomp: { species: 'garchomp', moves: ['trickroom'] },
      charizardmegax: { species: 'charizardmegax', item: 'charizarditex' },
    };
    const { actions, questions } = fakeActions([false, true]);
    const { user, saved } = await openTeambuilder(leagueFile(undefined, { sets }), actions);
    expect(screen.getByText("Garchomp can't learn Trick Room in this format.")).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /^Garchomp/ })).getByText('1 problem')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^Charizard Fire/ }));
    expect(screen.getByText('No ladder data for this Pokémon.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start from the common set' })).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Charizard-Mega-X/ }));
    expect(screen.getByText('(Charizard-Mega-X must hold Charizardite X)')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear set' }));
    expect(savedFile(saved).sets.charizardmegax).toEqual(sets.charizardmegax);
    await user.click(screen.getByRole('button', { name: 'Clear set' }));
    expect(questions).toEqual(["Clear Charizard-Mega-X's set?", "Clear Charizard-Mega-X's set?"]);
    expect(savedFile(saved).sets).toEqual({ garchomp: sets.garchomp });
  });
});

describe('Showdown paste', () => {
  it('imports roster sets, skips other Pokémon, asks before replacing, and can make a team', async () => {
    const garchomp = commonSet('garchomp', data.snapshot)!;
    const kingambit = commonSet('kingambit', data.snapshot)!;
    const tyranitar = commonSet('tyranitar', data.snapshot)!;
    const { actions, questions } = fakeActions([true]);
    const { user, saved } = await openTeambuilder(leagueFile(undefined, { sets: { garchomp: { species: 'garchomp' } } }), actions);
    await user.click(screen.getByRole('button', { name: 'Paste' }));
    await user.click(screen.getByLabelText('Paste sets from Showdown'));
    await user.paste(exportSets([garchomp, tyranitar, kingambit], data.snapshot));
    await user.click(screen.getByLabelText('Also make a team from this paste'));
    await user.click(screen.getByRole('button', { name: 'Import' }));

    expect(questions).toEqual(['Replace the existing sets of Garchomp?']);
    expect(screen.getByText('2 sets imported.')).toBeTruthy();
    expect(screen.getByText('Tyranitar is not on your roster; skipped.')).toBeTruthy();
    const file = savedFile(saved);
    expect(file.sets).toEqual({ garchomp, kingambit });
    expect(file.teams).toEqual([{ name: 'Pasted team', members: ['garchomp', 'kingambit'] }]);
    expect(screen.getByRole('article', { name: 'Pasted team' })).toBeTruthy();
  });

  it('keeps existing sets when you say no, and still adds the new ones', async () => {
    const { actions } = fakeActions([false]);
    const { user, saved } = await openTeambuilder(leagueFile(undefined, { sets: { garchomp: { species: 'garchomp' } } }), actions);
    await user.click(screen.getByRole('button', { name: 'Paste' }));
    await user.click(screen.getByLabelText('Paste sets from Showdown'));
    await user.paste(exportSets([commonSet('garchomp', data.snapshot)!, commonSet('kingambit', data.snapshot)!], data.snapshot));
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByText('1 set imported.')).toBeTruthy();
    expect(savedFile(saved).sets.garchomp).toEqual({ species: 'garchomp' });
    expect(savedFile(saved).sets.kingambit).toEqual(commonSet('kingambit', data.snapshot));
  });

  it('copies and downloads your sets, and says when copying fails', async () => {
    const sets: RosterSets = { garchomp: commonSet('garchomp', data.snapshot)!, incineroar: commonSet('incineroar', data.snapshot)! };
    const { actions, copies, downloads } = fakeActions();
    const { user } = await openTeambuilder(leagueFile(undefined, { sets }), actions);
    await user.click(screen.getByRole('button', { name: 'Copy set' }));
    expect(copies).toEqual([exportSet(sets.garchomp, data.snapshot)]);
    expect(await screen.findByText('Copied.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Paste' }));
    await user.click(screen.getByRole('button', { name: 'Copy all sets' }));
    await user.click(screen.getByRole('button', { name: 'Download all sets' }));
    const all = exportSets([sets.garchomp, sets.incineroar], data.snapshot);
    expect(copies[1]).toBe(all);
    expect(downloads).toEqual([{ filename: 'test-league.sets.txt', text: all }]);
    cleanup();

    const failing = fakeActions([], { copyFails: true });
    const second = await openTeambuilder(leagueFile(undefined, { sets }), failing.actions);
    await second.user.click(screen.getByRole('button', { name: 'Copy set' }));
    expect(await screen.findByText("Couldn't copy: use Download instead.")).toBeTruthy();
  });
});

describe('match teams', () => {
  it('builds a team, explains the Species and Item Clauses, and stops at six', async () => {
    const sets: RosterSets = {
      garchomp: { species: 'garchomp', item: 'leftovers' },
      kingambit: { species: 'kingambit', item: 'leftovers' },
    };
    const { user, saved } = await openTeambuilder(leagueFile(undefined, { sets }));
    await user.click(screen.getByRole('button', { name: 'New team' }));
    const team = screen.getByRole('article', { name: 'Team 1' });
    for (const name of ['Garchomp', 'Kingambit', 'Charizard-Mega-X', 'Charizard-Mega-Y']) await user.click(within(team).getByLabelText(name));

    expect(within(team).getByText('Item Clause: Garchomp and Kingambit both hold Leftovers.')).toBeTruthy();
    expect(within(team).getByText('Species Clause: Charizard-Mega-X and Charizard-Mega-Y are the same Pokémon.')).toBeTruthy();
    expect(within(team).getByText('4 of 6')).toBeTruthy();

    await user.click(within(team).getByLabelText('Whimsicott'));
    await user.click(within(team).getByLabelText('Incineroar'));
    expect((within(team).getByLabelText('Charizard') as HTMLInputElement).disabled).toBe(true);
    expect(savedFile(saved).teams[0].members).toEqual(['garchomp', 'kingambit', 'charizardmegax', 'charizardmegay', 'whimsicott', 'incineroar']);

    await user.clear(within(team).getByLabelText('Name of team 1'));
    expect(within(team).getByText('A team needs a name')).toBeTruthy();
    await user.type(within(team).getByLabelText('Name of team 1'), 'Rain');
    expect(savedFile(saved).teams[0].name).toBe('Rain');
  });

  it('exports a team and deletes it after asking', async () => {
    const file = leagueFile(undefined, { teams: [{ name: 'Main', members: ['garchomp', 'incineroar'] }] });
    const { actions, copies, downloads, questions } = fakeActions([true]);
    const { user, saved } = await openTeambuilder(file, actions);
    const team = screen.getByRole('article', { name: 'Main' });
    await user.click(within(team).getByRole('button', { name: 'Copy team' }));
    await user.click(within(team).getByRole('button', { name: 'Download team' }));
    const paste = exportTeam(file.teams[0], {}, data.snapshot);
    expect(copies).toEqual([paste]);
    expect(downloads).toEqual([{ filename: 'test-league.main.txt', text: paste }]);
    await user.click(within(team).getByRole('button', { name: 'Delete team' }));
    expect(questions).toEqual(['Delete Main?']);
    expect(savedFile(saved).teams).toEqual([]);
  });
});

describe('with the draft', () => {
  it('asks before undoing your Pokémon that has a set and is on a team, then removes both', async () => {
    const file = leagueFile(undefined, { sets: { charizard: { species: 'charizard' } }, teams: [{ name: 'Main', members: ['garchomp', 'charizard'] }] });
    const { actions, questions } = fakeActions([false, true]);
    const user = userEvent.setup();
    const { storage, data: saved } = fakeStorage(stored(file));
    render(<App load={load} storage={storage} actions={actions} />);
    await user.click(await screen.findByRole('button', { name: 'Undo last pick' }));
    expect(savedFile(saved).picks).toHaveLength(13);
    await user.click(screen.getByRole('button', { name: 'Undo last pick' }));
    expect(questions).toEqual([
      'Undo Charizard? Its set will be deleted and it will be removed from 1 team.',
      'Undo Charizard? Its set will be deleted and it will be removed from 1 team.',
    ]);
    const after = savedFile(saved);
    expect(after.picks).toHaveLength(12);
    expect(after.sets).toEqual({});
    expect(after.teams).toEqual([{ name: 'Main', members: ['garchomp'] }]);

    // Rival's pick is undone without a question.
    await user.click(screen.getByRole('button', { name: 'Undo last pick' }));
    expect(questions).toHaveLength(2);
  });

  it("uses your set in the suggestions: Whimsicott's Trick Room", async () => {
    const { user } = await openTeambuilder(leagueFile(4));
    await user.click(screen.getByRole('button', { name: /^Whimsicott/ }));
    expect(screen.getByRole('button', { name: 'Draft room' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: 'Teambuilder' }).getAttribute('aria-current')).toBe('page');
    await choose(user, 'Move 1', 'Trick Room');
    await user.click(screen.getByRole('button', { name: 'Draft room' }));
    expect((await screen.findAllByText("Completes Trick Room with Whimsicott (Whimsicott's half is from your set).")).length).toBeGreaterThan(0);
  });

  it('shows an empty roster before your first pick', async () => {
    await openTeambuilder(leagueFile(0));
    expect(screen.getByText('Your roster is empty: draft a Pokémon first.')).toBeTruthy();
  });
});
