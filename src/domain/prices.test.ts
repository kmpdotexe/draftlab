import { describe, expect, it } from 'vitest';
import { parsePriceCsv } from './prices';
import { snapshotOf } from './test-support';

const snapshot = snapshotOf(['incineroar', 'kingambit', 'sinistcha', 'charizardmegax']);

describe('parsePriceCsv', () => {
  it('reads name,points lines and skips a header', () => {
    const result = parsePriceCsv('Pokemon,Points\nIncineroar,20\nKingambit,15', snapshot);
    expect(result).toEqual({ prices: { incineroar: 20, kingambit: 15 }, unmatched: [], problems: [] });
  });

  it('works without a header', () => {
    expect(parsePriceCsv('Incineroar,20\nKingambit,15', snapshot).prices).toEqual({ incineroar: 20, kingambit: 15 });
  });

  it('reads tab-separated lines, as pasted from a spreadsheet', () => {
    const result = parsePriceCsv('Incineroar\t20\nKingambit\t15', snapshot);
    expect(result.prices).toEqual({ incineroar: 20, kingambit: 15 });
    expect(result.problems).toEqual([]);
  });

  it('handles quoted names, spaces around fields and CRLF line endings', () => {
    const result = parsePriceCsv('"Incineroar",20\r\n"Kingambit", 15 \r\n', snapshot);
    expect(result.prices).toEqual({ incineroar: 20, kingambit: 15 });
    expect(result.problems).toEqual([]);
  });

  it('matches names by normalized id, so form names work', () => {
    expect(parsePriceCsv('Charizard-Mega-X,25', snapshot).prices).toEqual({ charizardmegax: 25 });
  });

  it('splits on the last comma, so a name may contain a comma', () => {
    const result = parsePriceCsv('"Weird, Name",5', snapshot);
    expect(result.unmatched).toEqual(['Weird, Name']);
    expect(result.problems).toEqual([]);
  });

  it('splits at the last tab even when the name contains a comma', () => {
    const result = parsePriceCsv('Weird, Name\t5', snapshotOf(['weirdname']));
    expect(result.prices).toEqual({ weirdname: 5 });
    expect(result.problems).toEqual([]);
  });

  it('lists names that match no species without treating them as problems', () => {
    const result = parsePriceCsv('Incineroar,20\nMissingno,5', snapshot);
    expect(result.prices).toEqual({ incineroar: 20 });
    expect(result.unmatched).toEqual(['Missingno']);
    expect(result.problems).toEqual([]);
  });

  it('accepts a price of 0', () => {
    expect(parsePriceCsv('Incineroar,0', snapshot).prices).toEqual({ incineroar: 0 });
  });

  it('reports a species listed twice, keeps the first price', () => {
    const result = parsePriceCsv('Incineroar,20\nKingambit,15\nincineroar,99', snapshot);
    expect(result.prices.incineroar).toBe(20);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].path).toBe('line 3');
    expect(result.problems[0].message).toContain('listed twice');
    expect(result.problems[0].message).toContain('line 1');
  });

  it.each(['lots', '-5', '1.5', ''])('reports non-whole points %j after the first line', (points) => {
    const result = parsePriceCsv(`Incineroar,20\nKingambit,${points}`, snapshot);
    expect(result.prices).toEqual({ incineroar: 20 });
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].path).toBe('line 2');
    expect(result.problems[0].message).toContain(`"${points}"`);
    expect(result.problems[0].message).toContain('whole number');
  });

  it('treats a first line with non-numeric points as a header, not a problem', () => {
    const result = parsePriceCsv('Incineroar,lots\nKingambit,15', snapshot);
    expect(result.prices).toEqual({ kingambit: 15 });
    expect(result.problems).toEqual([]);
  });

  it('reports a line with no separator', () => {
    const result = parsePriceCsv('Incineroar,20\nKingambit', snapshot);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].path).toBe('line 2');
    expect(result.problems[0].message).toContain('name,points');
  });

  it('skips blank lines but counts them in line numbers', () => {
    const result = parsePriceCsv('\n\nIncineroar,20\nKingambit,x', snapshot);
    expect(result.problems.map((p) => p.path)).toEqual(['line 4']);
  });

  it('returns nothing for empty text', () => {
    expect(parsePriceCsv('', snapshot)).toEqual({ prices: {}, unmatched: [], problems: [] });
  });
});
