import { describe, expect, it } from 'vitest';
import { speciesEntry } from '../domain/test-support';
import { comboSignal, openCombos } from './combo-signal';
import { typedMove, usageData, usageEntry } from './test-support';
import type { ComboId } from './types';
import type { EngineSnapshot } from './types';

const stats = (spe: number) => ({ hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe });

/**
 * Roster candidates for the tests. Base Speed is 80 unless given.
 *   tr, tr2:     run Trick Room (50%)                   -> trickRoom enabler
 *   rain:        Drizzle, its only ability              -> rain enabler
 *   sloth:       base Speed 30                          -> trickRoom beneficiary
 *   hub:         runs Trick Room, Follow Me, Helping Hand; Drizzle -> enabler of trickRoom, redirectSetup, rain, helpingHand
 *   plain:       nothing
 * Candidates:
 *   slowswim:    Swift Swim, base Speed 40              -> trickRoom and rain beneficiary
 *   swimmer:     Swift Swim                             -> rain beneficiary
 *   slow:        base Speed 50                          -> trickRoom beneficiary
 *   trsetter:    runs Trick Room                        -> trickRoom enabler
 *   trslow:      runs Trick Room, base Speed 40         -> trickRoom enabler and beneficiary
 *   allrounder:  Swift Swim, base Speed 40, runs Swords Dance and Rock Slide -> beneficiary of all four of hub's combos
 */
const snapshot = (): EngineSnapshot => ({
  species: {
    tr: speciesEntry('tr', 'Tr', { num: 1 }),
    tr2: speciesEntry('tr2', 'Tr2', { num: 2 }),
    rain: speciesEntry('rain', 'Rain', { num: 3, abilities: ['Drizzle'] }),
    sloth: speciesEntry('sloth', 'Sloth', { num: 4, baseStats: stats(30) }),
    hub: speciesEntry('hub', 'Hub', { num: 5, abilities: ['Drizzle'] }),
    plain: speciesEntry('plain', 'Plain', { num: 6 }),
    slowswim: speciesEntry('slowswim', 'SlowSwim', { num: 7, abilities: ['Swift Swim'], baseStats: stats(40) }),
    swimmer: speciesEntry('swimmer', 'Swimmer', { num: 8, abilities: ['Swift Swim'] }),
    slow: speciesEntry('slow', 'Slow', { num: 9, baseStats: stats(50) }),
    trsetter: speciesEntry('trsetter', 'TrSetter', { num: 10 }),
    trslow: speciesEntry('trslow', 'TrSlow', { num: 11, baseStats: stats(40) }),
    allrounder: speciesEntry('allrounder', 'AllRounder', { num: 12, abilities: ['Swift Swim'], baseStats: stats(40) }),
  },
  moves: {
    trickroom: typedMove('trickroom', 'Psychic', 'Status', 0),
    followme: typedMove('followme', 'Normal', 'Status', 0),
    helpinghand: typedMove('helpinghand', 'Normal', 'Status', 0),
    swordsdance: typedMove('swordsdance', 'Normal', 'Status', 0),
    rockslide: { ...typedMove('rockslide', 'Rock', 'Physical', 75), target: 'allAdjacentFoes' },
    protect: typedMove('protect', 'Normal', 'Status', 0),
  },
  usage: usageData([
    usageEntry('tr', { moves: [['trickroom', 0.5]] }),
    usageEntry('tr2', { moves: [['trickroom', 0.5]] }),
    usageEntry('hub', { moves: [['trickroom', 0.5], ['followme', 0.5], ['helpinghand', 0.5]] }),
    usageEntry('trsetter', { moves: [['trickroom', 0.5]] }),
    usageEntry('trslow', { moves: [['trickroom', 0.5]] }),
    usageEntry('allrounder', { moves: [['swordsdance', 0.5], ['rockslide', 0.5]] }),
  ]),
});
const signal = (roster: string[], candidate: string, s = snapshot(), sets?: Record<string, unknown>) =>
  comboSignal(roster, candidate, s, openCombos(roster, s, sets), sets);

describe('openCombos', () => {
  it('lists the combos a roster member is on either side of, in table order, whatever the roster order', () => {
    expect(openCombos(['tr', 'rain'], snapshot())).toEqual(['trickRoom', 'rain']);
    expect(openCombos(['rain', 'tr'], snapshot())).toEqual(['trickRoom', 'rain']);
    expect(openCombos(['sloth'], snapshot())).toEqual(['trickRoom']); // the beneficiary side opens it too
    expect(openCombos(['hub'], snapshot())).toEqual(['trickRoom', 'redirectSetup', 'rain', 'helpingHand']);
  });

  it('is empty for a roster with nothing open, and ignores ids that are not in the snapshot', () => {
    expect(openCombos(['plain'], snapshot())).toEqual([]);
    expect(openCombos([], snapshot())).toEqual([]);
    expect(openCombos(['ghost', 'constructor'], snapshot())).toEqual([]);
  });

  it('reads roster members through their sets', () => {
    // tr's set has no Trick Room, so nothing is open; plain's set has it, so trickRoom opens.
    expect(openCombos(['tr'], snapshot(), { tr: { moves: ['protect'] } })).toEqual([]);
    expect(openCombos(['plain'], snapshot(), { plain: { moves: ['trickroom'] } })).toEqual(['trickRoom']);
  });
});

describe('comboSignal: the score', () => {
  // Roster tr + rain: open trickRoom (importance 1) and rain (0.75), 1.75 in total.
  const roster = ['tr', 'rain'];

  it('is the importance of the completed combos over the importance of the open ones', () => {
    expect(signal(roster, 'slowswim').score).toBe(1); // both: 1.75 / 1.75
    expect(signal(roster, 'slow').score).toBeCloseTo(1 / 1.75, 12); // trickRoom only: 0.5714286
    expect(signal(roster, 'swimmer').score).toBeCloseTo(0.75 / 1.75, 12); // rain only: 0.4285714
  });

  it('gives 0, not no data, to a candidate that completes nothing', () => {
    expect(signal(roster, 'plain')).toEqual({ score: 0, reasons: [] });
    // trsetter is on trickRoom's enabler side, but no roster member is on the beneficiary side.
    expect(signal(roster, 'trsetter')).toEqual({ score: 0, reasons: [] });
  });

  it('counts the enabler direction: a Trick Room setter for a slow roster member', () => {
    expect(signal(['sloth'], 'trsetter')).toEqual({
      score: 1,
      reasons: [{ kind: 'completes-combo', combo: 'trickRoom', side: 'enabler', with: 'sloth', from: 'species' }],
    });
  });

  it('never pairs a species with itself', () => {
    // trslow is on both sides of trickRoom; as the only roster member it opens the combo, but cannot complete it for itself.
    expect(signal(['trslow'], 'trslow')).toEqual({ score: 0, reasons: [] });
  });
});

describe('comboSignal: reasons', () => {
  it('names the combo, the candidate\'s side, the partner and how the partner\'s half was known', () => {
    expect(signal(['tr', 'rain'], 'slowswim').reasons).toEqual([
      { kind: 'completes-combo', combo: 'trickRoom', side: 'beneficiary', with: 'tr', from: 'ladder' },
      { kind: 'completes-combo', combo: 'rain', side: 'beneficiary', with: 'rain', from: 'ladder' },
    ]);
  });

  it('prefers the beneficiary direction when both hold', () => {
    // trslow benefits from tr's Trick Room and also sets Trick Room for sloth: the reason is the beneficiary one.
    expect(signal(['sloth', 'tr'], 'trslow').reasons).toEqual([
      { kind: 'completes-combo', combo: 'trickRoom', side: 'beneficiary', with: 'tr', from: 'ladder' },
    ]);
  });

  it('names the first partner in roster order', () => {
    expect(signal(['tr2', 'tr'], 'slow').reasons[0]).toMatchObject({ with: 'tr2' });
    expect(signal(['tr', 'tr2'], 'slow').reasons[0]).toMatchObject({ with: 'tr' });
  });

  it('says a partner\'s half came from its set', () => {
    const sets = { plain: { moves: ['trickroom'] } };
    expect(signal(['plain'], 'slow', snapshot(), sets)).toEqual({
      score: 1,
      reasons: [{ kind: 'completes-combo', combo: 'trickRoom', side: 'beneficiary', with: 'plain', from: 'set' }],
    });
  });

  it('lists at most three, most important first and then by combo id', () => {
    // hub opens trickRoom 1, redirectSetup 0.75, rain 0.75, helpingHand 0.5 (3.0 in total); allrounder completes all four.
    // Order: trickRoom, then rain before redirectSetup by id; helpingHand is cut by the cap.
    const result = signal(['hub'], 'allrounder');
    expect(result.score).toBe(1);
    expect(result.reasons.map((r) => (r.kind === 'completes-combo' ? r.combo : r.kind))).toEqual(['trickRoom', 'rain', 'redirectSetup']);
  });
});

describe('comboSignal: no data and robustness', () => {
  it('has no data when nothing is open, the roster has no member in the snapshot, or the candidate is unknown', () => {
    expect(signal(['plain'], 'slow')).toEqual({ score: null, reasons: [] });
    expect(signal(['ghost'], 'slow')).toEqual({ score: null, reasons: [] });
    expect(comboSignal([], 'slow', snapshot(), ['trickRoom'])).toEqual({ score: null, reasons: [] });
    expect(signal(['tr'], 'ghost')).toEqual({ score: null, reasons: [] });
    expect(signal(['tr'], 'constructor')).toEqual({ score: null, reasons: [] });
  });

  it('turns a combo off when the roster member\'s set drops it', () => {
    // With a set without Trick Room, tr opens nothing, so the signal has no data at all.
    expect(signal(['tr'], 'slow', snapshot(), { tr: { moves: ['protect'] } })).toEqual({ score: null, reasons: [] });
  });

  it('does not modify its inputs and gives the same answer twice', () => {
    const s = snapshot();
    const roster = ['tr', 'rain'];
    const sets = { tr: { moves: ['trickroom'] } };
    const before = JSON.stringify({ s, roster, sets });
    const first = signal(roster, 'slowswim', s, sets);
    expect(signal(roster, 'slowswim', s, sets)).toEqual(first);
    expect(JSON.stringify({ s, roster, sets })).toBe(before);
  });

  it('has no data when the open list names no known combo', () => {
    expect(comboSignal(['tr'], 'slow', snapshot(), ['nope' as ComboId])).toEqual({ score: null, reasons: [] });
  });
});
