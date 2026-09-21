import { describe, expect, it } from 'vitest';
import { clamp, compareIds } from './math';

describe('clamp', () => {
  it('leaves a value inside the range alone and pulls others to the ends', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(-3, 0, 1)).toBe(0);
    expect(clamp(7, 0, 1)).toBe(1);
    expect(clamp(0, 0, 1)).toBe(0);
    expect(clamp(1, 0, 1)).toBe(1);
  });
});

describe('compareIds', () => {
  it('orders by code point and returns 0 for equal ids', () => {
    expect(compareIds('a', 'b')).toBe(-1);
    expect(compareIds('b', 'a')).toBe(1);
    expect(compareIds('a', 'a')).toBe(0);
    expect(['stlc', 'stla', 'stlb'].sort(compareIds)).toEqual(['stla', 'stlb', 'stlc']);
  });
});
