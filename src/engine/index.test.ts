import { describe, expect, it } from 'vitest';
import {
  CAN_LEARN_FACTOR,
  COMBOS,
  DEFAULT_LIMIT,
  DEFAULT_WEIGHTS,
  SPREAD_MIN_BASE_POWER,
  TRICK_ROOM_MAX_BASE_SPEED,
  EXPECTED_ABILITY_MIN_SHARE,
  IMMUNITY_ABILITIES,
  MISSING_WEIGHT_FACTOR,
  ROLES,
  RUN_MIN_SHARE,
  SIGNAL_NAMES,
  contextFor,
  suggest,
} from './index';

describe('the engine index', () => {
  it('exports the public functions and constants', () => {
    expect(typeof contextFor).toBe('function');
    expect(DEFAULT_LIMIT).toBe(20);
    expect([...SIGNAL_NAMES]).toEqual(['usageLift', 'typeSynergy', 'roleFit', 'comboFit']);
    expect(DEFAULT_WEIGHTS).toEqual({ usageLift: 0.35, typeSynergy: 0.3, roleFit: 0.25, comboFit: 0.1 });
    expect(COMBOS.map((combo) => combo.id)).toHaveLength(8);
    expect(TRICK_ROOM_MAX_BASE_SPEED).toBe(50);
    expect(SPREAD_MIN_BASE_POWER).toBe(70);
    expect(MISSING_WEIGHT_FACTOR).toBe(0.5);
    expect(ROLES.map((role) => role.id)).toHaveLength(10);
    expect(RUN_MIN_SHARE).toBe(0.1);
    expect(CAN_LEARN_FACTOR).toBe(0.5);
    expect(EXPECTED_ABILITY_MIN_SHARE).toBe(0.5);
    expect(IMMUNITY_ABILITIES.Levitate).toBe('Ground');
  });

  it('exports a working suggest', () => {
    const result = suggest({ roster: [], pool: [], prices: {}, remaining: 0, openSlots: 0 }, { species: {}, moves: {}, usage: null });
    expect(result).toEqual({ suggestions: [], considered: 0, notes: [{ kind: 'roster-full' }] });
  });
});
