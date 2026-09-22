import { describe, expect, it } from 'vitest';
import { roleSignal } from './role-signal';
import { rosterLacks } from './roles';
import { roleSnapshot } from './test-support';

/**
 * The roster member `dra1` runs Fake Out (60% of sets), so the roster covers only that role and lacks the other nine:
 * redirection 1, speed control 1, Intimidate 0.75, weather and terrain 0.75, pivot, screens, support, priority and
 * disruption 0.5 each = 6.0 in total. A candidate's score is what it earns of that 6.0.
 */
const s = roleSnapshot({
  dra1: { usage: { moves: [['fakeout', 0.6]] } },
  // Tailwind (speed control, 1) + Will-O-Wisp (disruption, 0.5) = 1.5 of 6; its Fake Out covers nothing new.
  c1: { usage: { moves: [['tailwind', 0.5], ['willowisp', 0.4], ['fakeout', 0.5]] } },
  // No usage entry, can learn Follow Me and Tailwind: half of (1 + 1) = 1 of 6.
  c2: { learnset: ['followme', 'tailwind'] },
  // Tailwind 1 + Rage Powder 1 + U-turn 0.5 + Sucker Punch 0.5 + Will-O-Wisp 0.5 = 3.5 of 6.
  c3: { usage: { moves: [['tailwind', 0.5], ['ragepowder', 0.4], ['uturn', 0.3], ['suckerpunch', 0.3], ['willowisp', 0.2]] } },
  // Only Fake Out, which the roster already has: 0 of 6.
  c4: { usage: { moves: [['fakeout', 0.7]] } },
  // Its only ability is Drizzle (weather and terrain, 0.75): 0.75 of 6.
  c5: { abilities: ['Drizzle'] },
});
const roster = ['dra1'];
/** The caller computes `rosterLacks` once per `suggest()` call and passes it to every candidate; the tests do the same. */
const lacked = rosterLacks(roster, s);

describe('roleSignal', () => {
  it('scores what the candidate earns of the importance the roster lacks', () => {
    expect(roleSignal(roster, 'c1', s, lacked).score).toBeCloseTo(1.5 / 6, 9);
    expect(roleSignal(roster, 'c3', s, lacked).score).toBeCloseTo(3.5 / 6, 9);
    expect(roleSignal(roster, 'c5', s, lacked).score).toBeCloseTo(0.75 / 6, 9);
  });

  it('counts a can-learn role at half its importance', () => {
    const result = roleSignal(roster, 'c2', s, lacked);
    expect(result.score).toBeCloseTo(1 / 6, 9);
    expect(result.reasons).toEqual([
      { kind: 'fills-role', role: 'redirection', source: 'can-learn', via: 'followme' },
      { kind: 'fills-role', role: 'speedControl', source: 'can-learn', via: 'tailwind' },
    ]);
  });

  it('gives 0, not no data, to a candidate that fills nothing the roster lacks, and no reasons', () => {
    expect(roleSignal(roster, 'c4', s, lacked)).toEqual({ score: 0, reasons: [] });
  });

  it('lists only the roles the roster lacks: c1\'s Fake Out is not a reason', () => {
    expect(roleSignal(roster, 'c1', s, lacked).reasons).toEqual([
      { kind: 'fills-role', role: 'speedControl', source: 'runs', via: 'tailwind' },
      { kind: 'fills-role', role: 'disruption', source: 'runs', via: 'willowisp' },
    ]);
  });

  it('lists at most three reasons, most important first and then by role id', () => {
    // c3 fills five roles. redirection and speed control (importance 1) come first, by id; then the importance-0.5 roles by id:
    // disruption, pivot, priority. Only disruption fits under the cap of 3.
    expect(roleSignal(roster, 'c3', s, lacked).reasons).toEqual([
      { kind: 'fills-role', role: 'redirection', source: 'runs', via: 'ragepowder' },
      { kind: 'fills-role', role: 'speedControl', source: 'runs', via: 'tailwind' },
      { kind: 'fills-role', role: 'disruption', source: 'runs', via: 'willowisp' },
    ]);
  });

  it('names the ability behind an ability tag', () => {
    expect(roleSignal(roster, 'c5', s, lacked).reasons).toEqual([{ kind: 'fills-role', role: 'weatherTerrain', source: 'ability', via: 'Drizzle' }]);
  });

  it('does not let a roster member\'s can-learn tag cover a role: the roster then lacks all ten roles (importance 7)', () => {
    const learnerRoster = roleSnapshot({
      learner: { learnset: ['fakeout'] },
      runner: { usage: { moves: [['fakeout', 0.5]] } },
    });
    const learnerLacked = rosterLacks(['learner'], learnerRoster);
    expect(learnerLacked).toHaveLength(10);
    // The roster lacks all ten roles (total 7); the runner earns Fake Out's 1: 1 / 7.
    expect(roleSignal(['learner'], 'runner', learnerRoster, learnerLacked).score).toBeCloseTo(1 / 7, 9);
  });

  it('has no data when the roster lacks nothing (an empty `lacked`), regardless of what rosterLacks itself would say', () => {
    const covered = roleSnapshot({
      movers: {
        usage: {
          moves: [['fakeout', 0.5], ['followme', 0.5], ['tailwind', 0.5], ['uturn', 0.5], ['reflect', 0.5], ['helpinghand', 0.5], ['suckerpunch', 0.5], ['encore', 0.5]],
        },
      },
      intimidator: { abilities: ['Intimidate'], usage: {} },
      setter: { abilities: ['Drought'], usage: {} },
      candidate: { usage: { moves: [['fakeout', 0.5]] } },
    });
    const fullRoster = ['movers', 'intimidator', 'setter'];
    expect(rosterLacks(fullRoster, covered)).toEqual([]);
    expect(roleSignal(fullRoster, 'candidate', covered, rosterLacks(fullRoster, covered))).toEqual({ score: null, reasons: [] });
    // Take the weather setter away and the signal comes back, so the null above is about `lacked` and nothing else.
    const partialRoster = ['movers', 'intimidator'];
    expect(roleSignal(partialRoster, 'candidate', covered, rosterLacks(partialRoster, covered)).score).toBe(0);
  });

  it('has no data for a roster with no member in the snapshot, or for an unknown candidate, whatever `lacked` says', () => {
    expect(roleSignal(['ghost'], 'c1', s, lacked)).toEqual({ score: null, reasons: [] });
    expect(roleSignal([], 'c1', s, lacked)).toEqual({ score: null, reasons: [] });
    expect(roleSignal(roster, 'ghost', s, lacked)).toEqual({ score: null, reasons: [] });
    expect(roleSignal(roster, 'constructor', s, lacked)).toEqual({ score: null, reasons: [] });
    expect(roleSignal(['ghost', 'dra1'], 'c1', s, lacked)).toEqual(roleSignal(roster, 'c1', s, lacked));
  });

  it('does not modify its inputs and gives the same answer twice', () => {
    const before = JSON.stringify({ s, roster, lacked });
    const first = roleSignal(roster, 'c3', s, lacked);
    expect(roleSignal(roster, 'c3', s, lacked)).toEqual(first);
    expect(JSON.stringify({ s, roster, lacked })).toBe(before);
  });
});
