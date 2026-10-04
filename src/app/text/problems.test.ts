import { describe, expect, it } from 'vitest';
import { validateSetAgainstSnapshot } from '../../domain/set-check';
import type { PokemonSet } from '../../domain/set';
import { validateTeam, type MatchTeam, type RosterSets } from '../../domain/team';
import { setSnapshot } from '../../domain/test-support';
import { setProblemText, teamProblemText } from './problems';

// The problems are produced by the domain's own checks, so a change in their wording breaks these tests.
const snapshot = setSnapshot();
const sentences = (set: PokemonSet) =>
  validateSetAgainstSnapshot(set, snapshot, `sets.${set.species}`).map((p) => setProblemText(p, set, snapshot));
const teamSentences = (team: MatchTeam, sets: RosterSets, roster: string[] = team.members) =>
  validateTeam(team, roster, sets, snapshot, 6, 'teams[0]').problems.map((p) => teamProblemText(p, team, sets, snapshot));

describe('setProblemText', () => {
  it('words a stat point out of range', () => {
    const points = { hp: 0, atk: 252, def: 0, spa: 0, spd: 0, spe: 0 };
    expect(sentences({ species: 'garchomp', points })).toEqual(['Atk points must be 0 to 32 (found 252).']);
  });

  it('names a wrong ability', () => {
    expect(sentences({ species: 'incineroar', ability: 'roughskin' })).toEqual(["Incineroar can't have the ability roughskin."]);
  });

  it('names a move the species cannot learn, by its display name', () => {
    expect(sentences({ species: 'garchomp', moves: ['earthquake', 'fakeout'] })).toEqual(["Garchomp can't learn Fake Out in this format."]);
  });

  it('explains the three item problems', () => {
    expect(sentences({ species: 'garchomp', item: 'lifeorb' })).toEqual(["lifeorb isn't a legal item in this format."]);
    expect(sentences({ species: 'garchomp', item: 'staraptite' })).toEqual(["Garchomp can't hold Staraptite."]);
    expect(sentences({ species: 'staraptormega', item: 'leftovers' })).toEqual(['Staraptor-Mega must hold Staraptite.']);
  });

  it('gives the stat point total', () => {
    const points = { hp: 32, atk: 32, def: 32, spa: 0, spd: 0, spe: 0 };
    expect(sentences({ species: 'garchomp', points })).toEqual(['Stat points add up to 96; the limit is 66.']);
  });

  it('keeps the domain message for anything else', () => {
    expect(setProblemText({ path: 'sets.x.nature', message: 'unknown nature "Brave-ish"' }, { species: 'x' }, snapshot)).toBe(
      'unknown nature "Brave-ish"',
    );
  });
});

describe('teamProblemText', () => {
  it('names both Pokémon for the Species Clause, earlier one first', () => {
    expect(teamSentences({ name: 'T', members: ['charizard', 'garchomp', 'charizardmegax'] }, { charizardmegax: { species: 'charizardmegax', item: 'charizarditex' } })).toEqual([
      'Species Clause: Charizard and Charizard-Mega-X are the same Pokémon.',
    ]);
  });

  it('names both Pokémon and the item for the Item Clause', () => {
    const sets: RosterSets = { garchomp: { species: 'garchomp', item: 'leftovers' }, kingambit: { species: 'kingambit', item: 'leftovers' } };
    expect(teamSentences({ name: 'T', members: ['garchomp', 'kingambit'] }, sets)).toEqual([
      'Item Clause: Garchomp and Kingambit both hold Leftovers.',
    ]);
  });

  it('says when a team is too big or holds someone not on your roster', () => {
    const seven = ['incineroar', 'staraptor', 'charizard', 'floetteeternal', 'kingambit', 'garchomp', 'sinistcha'];
    expect(teamSentences({ name: 'T', members: seven }, {})).toEqual(['A team has at most 6 Pokémon.']);
    expect(teamSentences({ name: 'T', members: ['garchomp'] }, {}, [])).toEqual(['Garchomp is not on your roster.']);
  });

  it("prefixes a member's set problem with its name", () => {
    const sets: RosterSets = { garchomp: { species: 'garchomp', moves: ['fakeout'] } };
    expect(teamSentences({ name: 'T', members: ['garchomp'] }, sets)).toEqual(["Garchomp: Garchomp can't learn Fake Out in this format."]);
  });

  it('keeps the domain message for anything else', () => {
    expect(teamProblemText({ path: 'teams[0]', message: 'team must have a list of members' }, { name: 'T', members: [] }, {}, snapshot)).toBe(
      'team must have a list of members',
    );
  });
});
