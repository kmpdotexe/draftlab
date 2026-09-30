import { describe, expect, it } from 'vitest';
import { moveEntry, speciesEntry } from '../../domain/test-support';
import type { Note, Reason } from '../../engine';
import { makeNames } from './names';
import { noteText, reasonText } from './reasons';

const names = makeNames({
  species: {
    incineroar: speciesEntry('incineroar', 'Incineroar'),
    kingambit: speciesEntry('kingambit', 'Kingambit'),
    pelipper: speciesEntry('pelipper', 'Pelipper'),
  },
  moves: { tailwind: moveEntry('tailwind', 'Tailwind'), fakeout: moveEntry('fakeout', 'Fake Out') },
});
const text = (reason: Reason) => reasonText(reason, names);

/**
 * One sample per reason kind and variant, with its exact sentence. Typed so that a new `Reason` kind is a compile error
 * here until it has a sample (the object must have every kind as a key).
 */
const REASONS: Record<Reason['kind'], Array<[Reason, string]>> = {
  'pairs-often-with': [[{ kind: 'pairs-often-with', with: 'incineroar', lift: 2.345 }, 'Paired with Incineroar 2.3× more often than expected on ladder.']],
  'pairs-rarely-with': [[{ kind: 'pairs-rarely-with', with: 'kingambit', lift: 0.44 }, 'Rarely paired with Kingambit (0.4× the expected rate).']],
  'lift-coverage': [[{ kind: 'lift-coverage', covered: 1, of: 2 }, 'Ladder pairing data covers 1 of your 2 Pokémon.']],
  'covers-weakness': [
    [{ kind: 'covers-weakness', type: 'Ground', by: 'resists', weakMembers: ['kingambit'] }, 'Resists Ground, which Kingambit is weak to.'],
    [
      { kind: 'covers-weakness', type: 'Ground', by: 'immune', weakMembers: ['incineroar', 'kingambit'] },
      'Immune to Ground by typing, which Incineroar and Kingambit are weak to.',
    ],
    [
      { kind: 'covers-weakness', type: 'Ground', by: 'ability', weakMembers: ['kingambit'], ability: 'Levitate' },
      'Immune to Ground through Levitate, which Kingambit is weak to.',
    ],
    [{ kind: 'covers-weakness', type: 'Water', by: 'resists', weakMembers: [] }, 'Resists Water.'],
  ],
  'adds-weakness': [
    [{ kind: 'adds-weakness', type: 'Ice', weakMembers: ['kingambit'] }, 'Also weak to Ice, like Kingambit.'],
    [{ kind: 'adds-weakness', type: 'Ice', weakMembers: [] }, 'Also weak to Ice.'],
  ],
  'adds-coverage': [[{ kind: 'adds-coverage', types: ['Fairy', 'Steel'] }, "Hits Fairy and Steel super effectively, which your roster can't yet."]],
  'fills-role': [
    [{ kind: 'fills-role', role: 'speedControl', source: 'runs', via: 'tailwind', from: 'ladder' }, 'Fills speed control: runs Tailwind.'],
    [{ kind: 'fills-role', role: 'speedControl', source: 'runs', via: 'tailwind', from: 'set' }, 'Fills speed control: runs Tailwind (from your set).'],
    [{ kind: 'fills-role', role: 'intimidate', source: 'ability', via: 'Intimidate', from: 'ladder' }, 'Fills Intimidate: its ability is Intimidate.'],
    [
      { kind: 'fills-role', role: 'fakeOut', source: 'can-learn', via: 'fakeout', from: 'ladder' },
      'Could fill Fake Out: it can learn Fake Out (no ladder data).',
    ],
  ],
  'completes-combo': [
    [{ kind: 'completes-combo', combo: 'rain', side: 'beneficiary', with: 'pelipper', from: 'ladder' }, 'Completes rain with Pelipper.'],
    [{ kind: 'completes-combo', combo: 'trickRoom', side: 'enabler', with: 'kingambit', from: 'species' }, 'Sets up Trick Room for Kingambit.'],
    [
      { kind: 'completes-combo', combo: 'rain', side: 'beneficiary', with: 'pelipper', from: 'set' },
      "Completes rain with Pelipper (Pelipper's half is from your set).",
    ],
  ],
  'low-usage': [[{ kind: 'low-usage', usage: 0.0123 }, 'Rarely used on ladder (1.2% of teams).']],
  'no-ladder-usage': [[{ kind: 'no-ladder-usage' }, 'No ladder usage data.']],
};

const NOTES: Record<Note['kind'], Array<[Note, string]>> = {
  'invalid-context': [[{ kind: 'invalid-context' }, 'Suggestions are unavailable (the draft data could not be read).']],
  'invalid-snapshot': [[{ kind: 'invalid-snapshot' }, 'Suggestions are unavailable (the draft data could not be read).']],
  'roster-full': [[{ kind: 'roster-full' }, 'Your roster is full.']],
  'empty-roster': [[{ kind: 'empty-roster' }, 'Suggestions start after your first pick.']],
  'cannot-fill-roster': [[{ kind: 'cannot-fill-roster', poolSize: 2, openSlots: 3 }, 'Only 2 Pokémon are left for your 3 open slots.']],
  'no-affordable-candidates': [[{ kind: 'no-affordable-candidates' }, 'Nothing left fits your remaining points.']],
  'no-usage-data': [[{ kind: 'no-usage-data' }, 'No ladder usage data is loaded, so pairing data is not used.']],
  'roster-lacks-roles': [
    [{ kind: 'roster-lacks-roles', roles: ['fakeOut', 'speedControl', 'redirection'] }, 'Your roster has no Fake Out, speed control or redirection yet.'],
    [{ kind: 'roster-lacks-roles', roles: ['screens'] }, 'Your roster has no screens yet.'],
  ],
  'unscored-candidates': [[{ kind: 'unscored-candidates', count: 4 }, '4 Pokémon could not be scored with the current settings.']],
};

describe('reasonText', () => {
  for (const [kind, samples] of Object.entries(REASONS)) {
    it(`writes a sentence for ${kind}`, () => {
      for (const [reason, sentence] of samples) expect(text(reason)).toBe(sentence);
    });
  }

  it('uses the id when a name is unknown', () => {
    expect(text({ kind: 'pairs-often-with', with: 'missingno', lift: 1.5 })).toBe('Paired with missingno 1.5× more often than expected on ladder.');
  });
});

describe('noteText', () => {
  for (const [kind, samples] of Object.entries(NOTES)) {
    it(`writes a sentence for ${kind}`, () => {
      for (const [note, sentence] of samples) expect(noteText(note)).toBe(sentence);
    });
  }
});
