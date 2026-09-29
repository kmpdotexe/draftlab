import { describe, expect, it } from 'vitest';
import { speciesEntry } from '../domain/test-support';
import { COMBOS, SPREAD_MIN_BASE_POWER, TRICK_ROOM_MAX_BASE_SPEED, sideMatch, type ComboSide } from './combos';
import { profileOf } from './profile';
import { typedMove, usageData, usageEntry } from './test-support';
import type { EngineSnapshot } from './types';

const FLAT = { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 };
const withSpeed = (spe: number) => ({ ...FLAT, spe });

/**
 * `swim` has Swift Swim (its only ability) and runs Hurricane on 30% of ladder sets; `slow50` and `slow51` differ only
 * in base Speed; `spread` runs Rock Slide (75), `chip` runs Icy Wind (55), `wave` runs Heat Wave only as a Status copy.
 */
const snapshot = (): EngineSnapshot => ({
  species: {
    swim: speciesEntry('swim', 'Swim', { abilities: ['Swift Swim'], baseStats: withSpeed(40) }),
    slow50: speciesEntry('slow50', 'Slow50', { baseStats: withSpeed(50) }),
    slow51: speciesEntry('slow51', 'Slow51', { baseStats: withSpeed(51) }),
    spread: speciesEntry('spread', 'Spread'),
    chip: speciesEntry('chip', 'Chip'),
    statusSpread: speciesEntry('statusSpread', 'StatusSpread'),
    statusWave: speciesEntry('statusWave', 'StatusWave'),
    quake: speciesEntry('quake', 'Quake'),
    exact70: speciesEntry('exact70', 'Exact70'),
  },
  moves: {
    hurricane: typedMove('hurricane', 'Flying', 'Special', 110),
    rockslide: { ...typedMove('rockslide', 'Rock', 'Physical', 75), target: 'allAdjacentFoes' },
    icywind: { ...typedMove('icywind', 'Ice', 'Special', 55), target: 'allAdjacentFoes' },
    growl: { ...typedMove('growl', 'Normal', 'Status', 0), target: 'allAdjacentFoes' },
    trickroom: typedMove('trickroom', 'Psychic', 'Status', 0),
    statuswave: { ...typedMove('statuswave', 'Normal', 'Status', 80), target: 'allAdjacentFoes' },
    earthquake: { ...typedMove('earthquake', 'Ground', 'Physical', 100), target: 'allAdjacent' },
    burningjealousy: { ...typedMove('burningjealousy', 'Fire', 'Special', 70), target: 'allAdjacentFoes' },
  },
  usage: usageData([
    usageEntry('swim', { moves: [['hurricane', 0.3]] }),
    usageEntry('spread', { moves: [['rockslide', 0.5]] }),
    usageEntry('chip', { moves: [['icywind', 0.9]] }),
    usageEntry('statusSpread', { moves: [['growl', 0.9]] }),
    usageEntry('statusWave', { moves: [['statuswave', 0.5]] }),
    usageEntry('quake', { moves: [['earthquake', 0.5]] }),
    usageEntry('exact70', { moves: [['burningjealousy', 0.5]] }),
  ]),
});
const match = (side: ComboSide, id: string, s = snapshot(), set?: unknown) => sideMatch(side, id, profileOf(id, s, set), s);
const byId = Object.fromEntries(COMBOS.map((combo) => [combo.id, combo]));

describe('the combo table', () => {
  it('has the eight combos in order, with their importance', () => {
    expect(COMBOS.map((combo) => combo.id)).toEqual(['trickRoom', 'redirectSetup', 'rain', 'sun', 'sand', 'snow', 'electricTerrain', 'helpingHand']);
    expect(COMBOS.map((combo) => combo.importance)).toEqual([1, 0.75, 0.75, 0.75, 0.75, 0.75, 0.5, 0.5]);
    expect(TRICK_ROOM_MAX_BASE_SPEED).toBe(50);
    expect(SPREAD_MIN_BASE_POWER).toBe(70);
  });

  it('gives every side at least one check', () => {
    for (const combo of COMBOS) {
      for (const side of [combo.enabler, combo.beneficiary]) {
        const checks = side.abilities.length + side.moves.length + (side.maxBaseSpeed === undefined ? 0 : 1) + (side.spreadMove ? 1 : 0);
        expect(checks, combo.id).toBeGreaterThan(0);
      }
    }
    expect(byId.rain.enabler).toEqual({ abilities: ['Drizzle'], moves: ['raindance'] });
    expect(byId.rain.beneficiary).toEqual({ abilities: ['Swift Swim', 'Rain Dish'], moves: ['thunder', 'hurricane'] });
    expect(byId.trickRoom.beneficiary.maxBaseSpeed).toBe(50);
    expect(byId.helpingHand.beneficiary.spreadMove).toBe(true);
    expect(byId.redirectSetup.beneficiary.moves).toEqual(['swordsdance', 'nastyplot', 'dragondance', 'calmmind', 'bellydrum', 'shellsmash', 'quiverdance', 'bulkup']);
  });
});

describe('sideMatch', () => {
  it('matches by ability, by a move the profile runs, and by base Speed, naming the source', () => {
    expect(match(byId.rain.beneficiary, 'swim')).toBe('ladder'); // Swift Swim, the only ability
    expect(match(byId.trickRoom.beneficiary, 'swim')).toBe('species'); // base Speed 40
    expect(match(byId.trickRoom.enabler, 'swim')).toBeNull();
  });

  it('checks the ability before the moves and the moves before base Speed', () => {
    // swim matches rain's beneficiary side by Swift Swim and by Hurricane; the ability wins. With a set ability the source is the set.
    const side: ComboSide = { abilities: ['Swift Swim'], moves: ['hurricane'], maxBaseSpeed: 50 };
    expect(match(side, 'swim', snapshot(), { moves: ['hurricane'] })).toBe('ladder'); // ability from the ladder, before the set move
    expect(match({ abilities: [], moves: ['hurricane'], maxBaseSpeed: 50 }, 'swim', snapshot(), { moves: ['hurricane'] })).toBe('set');
    expect(match({ abilities: [], moves: [], maxBaseSpeed: 50 }, 'swim', snapshot(), { moves: ['hurricane'] })).toBe('species');
  });

  it('counts a move only at the run threshold of 10%', () => {
    const s = snapshot();
    s.usage!.species.swim = usageEntry('swim', { moves: [['hurricane', 0.1]] });
    expect(match({ abilities: [], moves: ['hurricane'] }, 'swim', s)).toBe('ladder');
    s.usage!.species.swim = usageEntry('swim', { moves: [['hurricane', 0.09]] });
    expect(match({ abilities: [], moves: ['hurricane'] }, 'swim', s)).toBeNull();
  });

  it('matches base Speed at exactly 50 and not at 51', () => {
    expect(match(byId.trickRoom.beneficiary, 'slow50')).toBe('species');
    expect(match(byId.trickRoom.beneficiary, 'slow51')).toBeNull();
  });

  it('counts a spread attack at 70 base power or more, not a utility spread move or a Status one', () => {
    expect(match(byId.helpingHand.beneficiary, 'spread')).toBe('ladder'); // Rock Slide, 75
    expect(match(byId.helpingHand.beneficiary, 'chip')).toBeNull(); // Icy Wind, 55
    expect(match(byId.helpingHand.beneficiary, 'statusSpread')).toBeNull(); // Growl
    // A set with Rock Slide makes chip a spread attacker.
    expect(match(byId.helpingHand.beneficiary, 'chip', snapshot(), { moves: ['rockslide'] })).toBe('set');
  });

  it('does not match when a move\'s target or a species\' base stats are missing or malformed', () => {
    const s = snapshot();
    (s.moves.rockslide as unknown as Record<string, unknown>).target = undefined;
    expect(match(byId.helpingHand.beneficiary, 'spread', s)).toBeNull();
    (s.species.slow50 as unknown as Record<string, unknown>).baseStats = null;
    expect(match(byId.trickRoom.beneficiary, 'slow50', s)).toBeNull();
    (s.species.slow50 as unknown as Record<string, unknown>).baseStats = { spe: '40' };
    expect(match(byId.trickRoom.beneficiary, 'slow50', s)).toBeNull();
  });

  it('matches nothing for a species that is not in the snapshot', () => {
    const s = snapshot();
    for (const id of ['ghost', 'constructor']) expect(sideMatch(byId.trickRoom.beneficiary, id, profileOf('swim', s), s), id).toBeNull();
  });

  it('counts a spread attack by category, on both spread targets, and at exactly 70 base power', () => {
    expect(match(byId.helpingHand.beneficiary, 'statusWave')).toBeNull(); // Status, even at 80 base power
    expect(match(byId.helpingHand.beneficiary, 'quake')).toBe('ladder'); // allAdjacent, 100
    expect(match(byId.helpingHand.beneficiary, 'exact70')).toBe('ladder'); // allAdjacentFoes, exactly 70
  });
});
