import { describe, expect, it } from 'vitest';
import { speciesEntry } from '../domain/test-support';
import {
  attackingTypes,
  defensiveComponent,
  offensiveComponent,
  typeSignal,
  type TypedMember,
} from './type-signal';
import { typedMove, usageData, usageEntry } from './test-support';
import type { EngineSnapshot } from './types';

const member = (id: string, ...types: string[]): TypedMember => ({ id, types });
const snap = (species: Record<string, string[]>, usage: EngineSnapshot['usage'] = null, moves: EngineSnapshot['moves'] = {}): EngineSnapshot => ({
  species: Object.fromEntries(Object.entries(species).map(([id, types]) => [id, speciesEntry(id, id, { types })])),
  moves,
  usage,
});

describe('defensiveComponent', () => {
  it('rewards a candidate that resists the roster\'s shared weaknesses (Steel over Dragon)', () => {
    // Mono-Dragon takes x2 from Dragon, Ice, Fairy (severity +1 each), so exposure X is 1 for those three and 0 elsewhere.
    // Mono-Steel resists all three (severity -1): relief min(1, 1) = 1 each, total 3.
    // Steel is weak to Fighting, Fire, Ground (+1 each) where the roster is not exposed: harm 0.25 each, total 0.75.
    // raw = 3 - 0.75 = 2.25, score = 0.5 + 2.25 / 12 = 0.6875.
    const result = defensiveComponent([member('d1', 'Dragon')], ['Steel']);
    expect(result.raw).toBe(2.25);
    expect(result.score).toBe(0.6875);
    expect(result.reasons).toEqual([
      { kind: 'covers-weakness', type: 'Dragon', by: 'resists', weakMembers: ['d1'] },
      { kind: 'covers-weakness', type: 'Fairy', by: 'resists', weakMembers: ['d1'] },
      { kind: 'covers-weakness', type: 'Ice', by: 'resists', weakMembers: ['d1'] },
    ]);
  });

  it('lists the weak members in roster order, and gives the same raw score for two Dragons (relief capped by the candidate)', () => {
    // Exposure is 2 for Dragon, Ice, Fairy but Steel only resists (-1): relief min(2, 1) = 1 each. Same raw as one Dragon.
    const result = defensiveComponent([member('d2', 'Dragon'), member('d1', 'Dragon')], ['Steel']);
    expect(result.raw).toBe(2.25);
    expect(result.reasons[0]).toEqual({ kind: 'covers-weakness', type: 'Dragon', by: 'resists', weakMembers: ['d2', 'd1'] });
  });

  it('penalizes a candidate that adds a weakness the roster is already exposed to (Ground under Dragon)', () => {
    // Ground is weak to Water, Grass, Ice (+1 each). The roster is exposed to Ice (X = 1): harm 1. Water and Grass are not
    // exposed: harm 0.25 each. Ground resists Poison and Rock and is immune to Electric, but the roster has no exposure there:
    // relief 0. raw = -(1 + 0.25 + 0.25) = -1.5, score = 0.5 - 1.5 / 12 = 0.375.
    const result = defensiveComponent([member('d1', 'Dragon')], ['Ground']);
    expect(result.raw).toBe(-1.5);
    expect(result.score).toBe(0.375);
    expect(result.reasons).toEqual([{ kind: 'adds-weakness', type: 'Ice', weakMembers: ['d1'] }]);
  });

  it('charges a quarter of a point for a weakness the roster is not exposed to (Normal under Dragon)', () => {
    // Normal is weak to Fighting (+1), roster exposure 0: harm 0.25. Immune to Ghost, but no exposure: relief 0.
    // raw = -0.25, score = 0.5 - 0.25 / 12.
    const result = defensiveComponent([member('d1', 'Dragon')], ['Normal']);
    expect(result.raw).toBe(-0.25);
    expect(result.score).toBeCloseTo(0.4791667, 7);
    expect(result.reasons).toEqual([]);
  });

  it('reports an immunity as immune, a resistance as resists, and an added weakness, in that order', () => {
    // Flying roster: weak to Electric, Ice, Rock (X = 1 each). Ground candidate: immune to Electric (-2 -> relief min(1, 2) = 1),
    // resists Rock (relief 1), weak to Ice (harm 1, exposed), weak to Water and Grass (roster not exposed: Flying is neutral to Water
    // and resists Grass) harm 0.25 each. raw = 2 - 1 - 0.25 - 0.25 = 0.5, score = 0.5 + 0.5 / 12.
    const result = defensiveComponent([member('fly', 'Flying')], ['Ground']);
    expect(result.raw).toBe(0.5);
    expect(result.score).toBeCloseTo(0.5416667, 7);
    expect(result.reasons).toEqual([
      { kind: 'covers-weakness', type: 'Electric', by: 'immune', weakMembers: ['fly'] },
      { kind: 'covers-weakness', type: 'Rock', by: 'resists', weakMembers: ['fly'] },
      { kind: 'adds-weakness', type: 'Ice', weakMembers: ['fly'] },
    ]);
  });

  it('lists at most 3 covered weaknesses but counts all of them in the score', () => {
    // Grass roster is weak to Bug, Fire, Flying, Ice, Poison (X = 1 each). Steel: resists Bug, Flying, Ice (relief 1 each), immune to
    // Poison (relief min(1, 2) = 1) = 4; weak to Fire (exposed, harm 1), Fighting and Ground (harm 0.25 each) = 1.5.
    // raw = 4 - 1.5 = 2.5, score = 0.5 + 2.5 / 12. Reasons cover Bug, Flying, Ice (name order); Poison is cut off; Fire is the added weakness.
    const result = defensiveComponent([member('g1', 'Grass')], ['Steel']);
    expect(result.raw).toBe(2.5);
    expect(result.score).toBeCloseTo(0.7083333, 7);
    expect(result.reasons).toEqual([
      { kind: 'covers-weakness', type: 'Bug', by: 'resists', weakMembers: ['g1'] },
      { kind: 'covers-weakness', type: 'Flying', by: 'resists', weakMembers: ['g1'] },
      { kind: 'covers-weakness', type: 'Ice', by: 'resists', weakMembers: ['g1'] },
      { kind: 'adds-weakness', type: 'Fire', weakMembers: ['g1'] },
    ]);
  });

  it('lets a resisting member cancel a weak member before deciding whether the roster is exposed', () => {
    // Dragon is weak to Ice but Fire resists it, and Fire is weak to Water but Dragon resists it, so the summed exposure is 0
    // for both and Ground's weaknesses to Water, Grass and Ice cost 0.25 each. Rock is the only exposed type (Fire alone is weak
    // to it, exposure 1) and Ground resists it: relief 1. raw = 1 - 0.75 = 0.25, score = 0.5 + 0.25 / 12.
    const result = defensiveComponent([member('d1', 'Dragon'), member('f1', 'Fire')], ['Ground']);
    expect(result.raw).toBe(0.25);
    expect(result.score).toBeCloseTo(0.5208333, 7);
    expect(result.reasons).toEqual([{ kind: 'covers-weakness', type: 'Rock', by: 'resists', weakMembers: ['f1'] }]);
  });

  it('stacks exposure across members, lets an immunity relieve more than a resistance, and orders covered weaknesses by relief', () => {
    // Two Grass members are weak to Bug, Fire, Flying, Ice, Poison: exposure 2 each. Steel is immune to Poison (relief min(2, 2) = 2)
    // and resists Bug, Flying, Ice (relief min(2, 1) = 1 each): relief total 2 + 1 + 1 + 1 = 5. Poison sorts before Bug despite the
    // name order because its relief is bigger; Ice is the fourth covered type and is cut by the cap of 3. Harm: Fire 1 (exposed)
    // + Fighting 0.25 + Ground 0.25 = 1.5. raw = 5 - 1.5 = 3.5, score = 0.5 + 3.5 / 12.
    const result = defensiveComponent([member('g1', 'Grass'), member('g2', 'Grass')], ['Steel']);
    expect(result.raw).toBe(3.5);
    expect(result.score).toBeCloseTo(0.7916667, 7);
    expect(result.reasons).toEqual([
      { kind: 'covers-weakness', type: 'Poison', by: 'immune', weakMembers: ['g1', 'g2'] },
      { kind: 'covers-weakness', type: 'Bug', by: 'resists', weakMembers: ['g1', 'g2'] },
      { kind: 'covers-weakness', type: 'Flying', by: 'resists', weakMembers: ['g1', 'g2'] },
      { kind: 'adds-weakness', type: 'Fire', weakMembers: ['g1', 'g2'] },
    ]);
  });

  it('clamps to 1 when the raw score is far above 6', () => {
    // Two Dragon/Grass members are exposed (summed severity) to Bug, Dragon, Fairy, Flying, Ice, Poison. Fire/Steel resists or is
    // immune to all six, and the relief is capped by its own severity: Bug 2, Dragon 1, Fairy 2, Flying 1, Ice 2, Poison 2 = 10.
    // Its weaknesses (Fighting, Ground, Water) are all unexposed, so they cost 0.25 per severity point: 0.25 + 0.5 + 0.25 = 1.
    // raw = 10 - 1 = 9, score = 0.5 + 9 / 12 = 1.25 unclamped, so exactly 1.
    const result = defensiveComponent([member('g1', 'Dragon', 'Grass'), member('g2', 'Dragon', 'Grass')], ['Fire', 'Steel']);
    expect(result.raw).toBe(9);
    expect(result.score).toBe(1);
  });

  it('clamps to 0 when the raw score is far below -6, and lists at most 2 added weaknesses, the biggest first', () => {
    // Two Grass members are exposed to Bug, Fire, Flying, Ice, Poison. A Bug/Grass candidate is x4 weak to Fire and Flying (harm 2
    // each) and x2 weak to Bug, Ice, Poison (harm 1 each), and also weak to Rock, which the roster is not exposed to (0.25).
    // Harm Fire 2 + Flying 2 + Bug 1 + Ice 1 + Poison 1 = 7, plus 0.25 = 7.25. Nothing is covered: raw = -7.25,
    // score = 0.5 - 7.25 / 12 = -0.104 unclamped, so exactly 0. Fire and Flying tie on harm and are ordered by type name;
    // Bug, Ice and Poison are cut by the cap of 2.
    const result = defensiveComponent([member('g1', 'Grass'), member('g2', 'Grass')], ['Bug', 'Grass']);
    expect(result.raw).toBe(-7.25);
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([
      { kind: 'adds-weakness', type: 'Fire', weakMembers: ['g1', 'g2'] },
      { kind: 'adds-weakness', type: 'Flying', weakMembers: ['g1', 'g2'] },
    ]);
  });

  it('never throws on odd input', () => {
    expect(defensiveComponent([], ['Steel']).raw).toBe(-0.75); // no roster: nothing to relieve, all harm at 0.25
    expect(defensiveComponent([member('x', 'Stellar')], ['Stellar']).raw).toBe(0);
  });
});

describe('attackingTypes', () => {
  const moves = {
    surf: typedMove('surf', 'Water', 'Special', 90),
    thunderwave: typedMove('thunderwave', 'Electric', 'Status', 0),
    seismictoss: typedMove('seismictoss', 'Fighting', 'Physical', 0),
    icebeam: typedMove('icebeam', 'Ice', 'Special', 90),
    rockslide: typedMove('rockslide', 'Rock', 'Physical', 75),
  };
  const usage = usageData([
    usageEntry('norm', {
      moves: [['surf', 0.5], ['thunderwave', 0.9], ['seismictoss', 0.9], ['icebeam', 0.09], ['rockslide', 0.1], ['gonemove', 0.8]],
    }),
  ]);

  it('is the species\' own types plus the types of damaging moves it runs at 10% or more', () => {
    // surf (0.50, damaging) counts; thunderwave is Status; seismictoss has base power 0; icebeam is at 9%;
    // rockslide is exactly 10% (counts); gonemove is not in the move table.
    const s = snap({ norm: ['Normal'] }, usage, moves);
    expect([...attackingTypes('norm', s)].sort()).toEqual(['Normal', 'Rock', 'Water']);
  });

  it('is the own types alone without a usage entry or without usage data, and empty for an unknown species', () => {
    expect([...attackingTypes('norm', snap({ norm: ['Normal', 'Ghost'] }, null, moves))].sort()).toEqual(['Ghost', 'Normal']);
    expect([...attackingTypes('other', snap({ other: ['Fire'] }, usage, moves))]).toEqual(['Fire']);
    expect([...attackingTypes('ghost', snap({ norm: ['Normal'] }, usage, moves))]).toEqual([]);
    expect([...attackingTypes('constructor', snap({ norm: ['Normal'] }, usage, moves))]).toEqual([]);
  });
});

describe('offensiveComponent', () => {
  const set = (...types: string[]) => new Set(types);

  it('is the fraction of the roster\'s uncovered defending types the candidate hits super effectively', () => {
    // Fire hits Bug, Grass, Ice, Steel: 4 covered, so 14 uncovered. Water hits Fire, Ground, Rock (all uncovered): 3 / 14.
    expect(offensiveComponent([set('Fire')], set('Water'))).toEqual({
      fraction: 3 / 14,
      newTypes: ['Fire', 'Ground', 'Rock'],
    });
    // Ground adds Electric, Poison (and Fire, Rock again; Steel is already covered): {Fire, Ground, Rock, Electric, Poison} = 5 / 14.
    expect(offensiveComponent([set('Fire')], set('Water', 'Ground')).newTypes).toEqual(['Electric', 'Fire', 'Ground', 'Poison', 'Rock']);
    expect(offensiveComponent([set('Fire')], set('Water', 'Ground')).fraction).toBeCloseTo(5 / 14, 12);
  });

  it('is 0, not null, when the candidate adds nothing', () => {
    // Dragon hits only Dragon: 17 uncovered. Normal hits nothing super effectively.
    expect(offensiveComponent([set('Dragon')], set('Normal'))).toEqual({ fraction: 0, newTypes: [] });
  });

  it('counts only types the roster does not already cover, pooled over every member', () => {
    // Roster attacking sets {Normal, Water, Rock}: Water hits Fire, Ground, Rock; Rock hits Bug, Fire, Flying, Ice: 6 covered, 12 not.
    // A Grass candidate hits Ground, Rock (covered) and Water (not): 1 / 12.
    expect(offensiveComponent([set('Normal', 'Water', 'Rock')], set('Grass'))).toEqual({ fraction: 1 / 12, newTypes: ['Water'] });
    // The same pool split over three members gives the same answer.
    expect(offensiveComponent([set('Normal'), set('Water'), set('Rock')], set('Grass')).fraction).toBe(1 / 12);
  });

  it('has no data when the roster already covers all 18 defending types', () => {
    // Fighting, Ground, Ice, Ghost, Poison, Grass and Flying together hit all 18 types super effectively.
    const roster = [set('Fighting', 'Ground'), set('Ice', 'Ghost'), set('Poison', 'Grass'), set('Flying')];
    expect(offensiveComponent(roster, set('Water'))).toEqual({ fraction: null, newTypes: [] });
  });
});

describe('typeSignal', () => {
  it('combines 0.6 defensive and 0.4 offensive, with the reasons of both', () => {
    // Fire roster, Water candidate. Defensive: Fire takes x2 from Ground, Rock, Water (X = 1 each); Water resists Water (relief 1);
    // Water is weak to Electric and Grass where the roster is not exposed (0.25 each): raw = 1 - 0.5 = 0.5, defensive = 0.5 + 0.5 / 12.
    // Offensive: 3 / 14. Score = 0.6 x 0.5416667 + 0.4 x 0.2142857 = 0.325 + 0.0857143.
    const s = snap({ fire: ['Fire'], water: ['Water'] });
    const result = typeSignal(['fire'], 'water', s);
    expect(result.score).toBeCloseTo(0.4107143, 7);
    expect(result.reasons).toEqual([
      { kind: 'covers-weakness', type: 'Water', by: 'resists', weakMembers: ['fire'] },
      { kind: 'adds-coverage', types: ['Fire', 'Ground', 'Rock'] },
    ]);
  });

  it('scores the Dragon-roster candidates from the worked examples', () => {
    const s = snap({ dra: ['Dragon'], stl: ['Steel'], grd: ['Ground'], nod: ['Normal'] });
    // Steel: defensive 0.6875, offensive 3 / 17 (Fairy, Ice, Rock): 0.6 x 0.6875 + 0.4 x 3 / 17 = 0.4125 + 0.0705882.
    expect(typeSignal(['dra'], 'stl', s).score).toBeCloseTo(0.4830882, 7);
    // Ground: defensive 0.375, offensive 5 / 17: 0.225 + 0.1176471.
    expect(typeSignal(['dra'], 'grd', s).score).toBeCloseTo(0.3426471, 7);
    // Normal: defensive 0.4791667, offensive 0 / 17: 0.6 x 0.4791667 = 0.2875.
    expect(typeSignal(['dra'], 'nod', s).score).toBeCloseTo(0.2875, 7);
    expect(typeSignal(['dra'], 'stl', s).reasons.at(-1)).toEqual({ kind: 'adds-coverage', types: ['Fairy', 'Ice', 'Rock'] });
    expect(typeSignal(['dra'], 'nod', s).reasons).toEqual([]);
  });

  it('drops the offensive component when the roster already covers every type: the score is the defensive score', () => {
    const s = snap({ f1: ['Fighting', 'Ground'], f2: ['Ice', 'Ghost'], f3: ['Poison', 'Grass'], f4: ['Flying'], water: ['Water'] });
    const roster = ['f1', 'f2', 'f3', 'f4'];
    const result = typeSignal(roster, 'water', s);
    const members = roster.map((id) => member(id, ...s.species[id].types));
    expect(result.score).toBe(defensiveComponent(members, ['Water']).score);
    expect(result.reasons.some((reason) => reason.kind === 'adds-coverage')).toBe(false);
  });

  it('uses the move types from usage data, not just the own types', () => {
    // Defensive is the same either way: the Fire roster is exposed to Ground, Rock, Water (1 each); Grass resists Ground and Water
    // (relief 1 + 1) and is weak to Bug, Fire, Flying, Ice, Poison, none of which the roster is exposed to (harm 5 x 0.25 = 1.25).
    // raw = 2 - 1.25 = 0.75, defensive = 0.5 + 0.75 / 12 = 0.5625.
    // With Surf in the usage data the Fire roster also hits Fire, Ground, Rock: offensive is 1 / 11 (Grass adds Water only), so
    // 0.6 x 0.5625 + 0.4 x 1 / 11 = 0.3738636. Without it, offensive is 3 / 14 (Grass hits Ground, Rock, Water):
    // 0.6 x 0.5625 + 0.4 x 3 / 14 = 0.4232143.
    const moves = { surf: typedMove('surf', 'Water', 'Special', 90) };
    const usage = usageData([usageEntry('fire', { moves: [['surf', 0.6]] })]);
    const withSurf = typeSignal(['fire'], 'grass', snap({ fire: ['Fire'], grass: ['Grass'] }, usage, moves));
    expect(withSurf.score).toBeCloseTo(0.3738636, 7);
    expect(withSurf.reasons).toEqual([
      { kind: 'covers-weakness', type: 'Ground', by: 'resists', weakMembers: ['fire'] },
      { kind: 'covers-weakness', type: 'Water', by: 'resists', weakMembers: ['fire'] },
      { kind: 'adds-coverage', types: ['Water'] },
    ]);
    const withoutSurf = typeSignal(['fire'], 'grass', snap({ fire: ['Fire'], grass: ['Grass'] }));
    expect(withoutSurf.score).toBeCloseTo(0.4232143, 7);
    expect(withoutSurf.reasons.at(-1)).toEqual({ kind: 'adds-coverage', types: ['Ground', 'Rock', 'Water'] });
  });

  it('feeds the attacking types of both species into the offensive component (components only, not typeSignal)', () => {
    const moves = { surf: typedMove('surf', 'Water', 'Special', 90) };
    const usage = usageData([usageEntry('fire', { moves: [['surf', 0.6]] })]);
    const s = snap({ fire: ['Fire'], grass: ['Grass'] }, usage, moves);
    // Fire roster that also runs Surf covers Bug, Grass, Ice, Steel, Fire, Ground, Rock (7): 11 uncovered.
    // Grass hits Ground, Rock (covered) and Water (uncovered): 1 / 11.
    expect(offensiveComponent([attackingTypes('fire', s)], attackingTypes('grass', s)).fraction).toBeCloseTo(1 / 11, 12);
  });

  it('has no data for an empty roster, a roster of unknown ids, or an unknown candidate', () => {
    const s = snap({ fire: ['Fire'], water: ['Water'] });
    expect(typeSignal([], 'water', s)).toEqual({ score: null, reasons: [] });
    expect(typeSignal(['ghost'], 'water', s)).toEqual({ score: null, reasons: [] });
    expect(typeSignal(['fire'], 'ghost', s)).toEqual({ score: null, reasons: [] });
    expect(typeSignal(['fire'], 'constructor', s)).toEqual({ score: null, reasons: [] });
  });

  it('ignores roster ids that are not in the snapshot', () => {
    const s = snap({ fire: ['Fire'], water: ['Water'] });
    expect(typeSignal(['ghost', 'fire'], 'water', s)).toEqual(typeSignal(['fire'], 'water', s));
  });

  it('does not modify its inputs', () => {
    const s = snap({ fire: ['Fire'], water: ['Water'] });
    const roster = ['fire'];
    const before = JSON.stringify({ s, roster });
    typeSignal(roster, 'water', s);
    expect(JSON.stringify({ s, roster })).toBe(before);
  });
});
