import { describe, expect, it } from 'vitest';
import { moveEntry, speciesEntry } from '../domain/test-support';
import { sanitizeSnapshot } from './snapshot-check';
import { usageData, usageEntry } from './test-support';
import type { EngineSnapshot } from './types';

const valid = (): EngineSnapshot => ({
  species: {
    a: speciesEntry('a', 'a', { num: 1, types: ['Fire'] }),
    b: speciesEntry('b', 'b', { num: 2, types: ['Water'] }),
  },
  moves: { tackle: moveEntry('tackle', 'tackle') },
  usage: usageData([usageEntry('a', { teammates: [['b', 10]] }), usageEntry('b')]),
});

/** Runs the check on a snapshot built from `valid()` with some fields replaced by junk. */
const check = (overrides: Record<string, unknown>) => sanitizeSnapshot({ ...valid(), ...overrides });

describe('sanitizeSnapshot: the tables', () => {
  it('returns a new object with equal content for a valid snapshot, and copies usage', () => {
    const input = valid();
    const result = sanitizeSnapshot(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(result?.species).not.toBe(input.species);
    expect(result?.moves).not.toBe(input.moves);
    expect(result?.usage).not.toBe(input.usage);
    // Entries themselves are kept by reference.
    expect(result?.species.a).toBe(input.species.a);
  });

  it('returns null unless the snapshot and its species and moves tables are plain objects', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { species: {}, moves: 5 }, { species: {} }, { moves: {} }, { species: [], moves: {} }]) {
      expect(sanitizeSnapshot(bad), JSON.stringify(bad)).toBeNull();
    }
    expect(sanitizeSnapshot({ ...valid(), moves: undefined })).toBeNull();
    expect(sanitizeSnapshot({ ...valid(), moves: [] })).toBeNull();
    expect(sanitizeSnapshot({ ...valid(), species: null })).toBeNull();
  });

  it('keeps a table entry called __proto__ as an own property instead of changing the prototype', () => {
    const species = JSON.parse(`{"__proto__": ${JSON.stringify(speciesEntry('p', 'p'))}, "a": ${JSON.stringify(speciesEntry('a', 'a'))}}`);
    const result = sanitizeSnapshot({ species, moves: {}, usage: null });
    expect(Object.hasOwn(result?.species ?? {}, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(result?.species)).toBe(Object.prototype);
  });

  it('accepts empty tables', () => {
    expect(sanitizeSnapshot({ species: {}, moves: {}, usage: null })).toEqual({ species: {}, moves: {}, usage: null });
  });

  it('drops species entries that are not objects with a finite num and a types array, and keeps the others', () => {
    const result = check({
      species: {
        ok: speciesEntry('ok', 'ok', { num: 9 }),
        nul: null,
        text: 'x',
        list: [],
        noTypes: { ...speciesEntry('noTypes', 'noTypes'), types: undefined },
        typesString: { ...speciesEntry('typesString', 'typesString'), types: 'Fire' },
        noNum: { ...speciesEntry('noNum', 'noNum'), num: undefined },
        numString: { ...speciesEntry('numString', 'numString'), num: '5' },
        numNaN: { ...speciesEntry('numNaN', 'numNaN'), num: Number.NaN },
        numInfinite: { ...speciesEntry('numInfinite', 'numInfinite'), num: Number.POSITIVE_INFINITY },
      },
    });
    expect(result).not.toBeNull();
    expect(Object.keys(result?.species ?? {})).toEqual(['ok']);
  });

  it('drops move entries that are not objects with a string type, a string category and a finite basePower', () => {
    const result = check({
      moves: {
        ok: moveEntry('ok', 'ok'),
        nul: null,
        noType: { ...moveEntry('noType', 'noType'), type: undefined },
        typeNumber: { ...moveEntry('typeNumber', 'typeNumber'), type: 5 },
        noCategory: { ...moveEntry('noCategory', 'noCategory'), category: undefined },
        noPower: { ...moveEntry('noPower', 'noPower'), basePower: undefined },
        powerNaN: { ...moveEntry('powerNaN', 'powerNaN'), basePower: Number.NaN },
      },
    });
    expect(result).not.toBeNull();
    expect(Object.keys(result?.moves ?? {})).toEqual(['ok']);
  });
});

describe('sanitizeSnapshot: usage', () => {
  it('turns anything but an object with a species table into null', () => {
    for (const bad of [undefined, null, {}, { species: 5 }, { species: null }, { species: [] }, 'x', 5, []]) {
      expect(check({ usage: bad })?.usage, JSON.stringify(bad)).toBeNull();
    }
    // The rest of the snapshot survives.
    expect(Object.keys(check({ usage: 'x' })?.species ?? {})).toEqual(['a', 'b']);
  });

  it('keeps the other usage fields and drops malformed entries', () => {
    const good = usageEntry('good');
    const result = check({
      usage: {
        ...valid().usage,
        species: {
          good,
          text: 'x',
          nul: null,
          movesNotArray: { ...usageEntry('movesNotArray'), moves: 'x' },
          noTeammates: { ...usageEntry('noTeammates'), teammates: undefined },
          noWeight: { ...usageEntry('noWeight'), weight: undefined },
          usageString: { ...usageEntry('usageString'), usage: '0.1' },
          usageNaN: { ...usageEntry('usageNaN'), usage: Number.NaN },
        },
      },
    });
    expect(result?.usage).not.toBeNull();
    expect(Object.keys(result?.usage?.species ?? {})).toEqual(['good']);
    expect(result?.usage?.species.good).toBe(good);
    expect(result?.usage?.teams).toBe(1000);
    expect(result?.usage?.cutoff).toBe(1630);
    expect(result?.usage?.battles).toBe(1000);
  });
});

describe('sanitizeSnapshot: robustness', () => {
  it('does not modify its input', () => {
    const input = {
      species: { ok: speciesEntry('ok', 'ok'), bad: null },
      moves: { ok: moveEntry('ok', 'ok'), bad: 5 },
      usage: { ...usageData([usageEntry('ok'), usageEntry('bad')]), species: { ok: usageEntry('ok'), bad: 'x' } },
    };
    const before = JSON.stringify(input);
    sanitizeSnapshot(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.keys(input.species)).toEqual(['ok', 'bad']);
    expect(Object.keys(input.usage.species)).toEqual(['ok', 'bad']);
  });
});
