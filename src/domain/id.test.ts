import { describe, expect, it } from 'vitest';
import { toID } from './id';

describe('toID', () => {
  it('lowercases and strips punctuation and spaces', () => {
    expect(toID('Raichu-Mega-Y')).toBe('raichumegay');
    expect(toID('Mr. Mime')).toBe('mrmime');
    expect(toID('Farfetch’d')).toBe('farfetchd');
  });

  it('returns an empty string for empty or non-string input', () => {
    expect(toID('')).toBe('');
    expect(toID(undefined)).toBe('');
    expect(toID(null)).toBe('');
  });

  it('accepts numbers', () => {
    expect(toID(25)).toBe('25');
  });
});
