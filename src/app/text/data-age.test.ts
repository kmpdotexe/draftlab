import { describe, expect, it } from 'vitest';
import type { SnapshotMeta } from '../../domain/types';
import { realData } from '../test-support';
import { STALE_AFTER_DAYS, dataBanners, dataSummary, formatDay } from './data-age';

const real = realData().meta;
const metaOf = (overrides: Partial<SnapshotMeta>): SnapshotMeta => ({ ...real, ...overrides });
const usage = real.usage!;
// Noon UTC, so the day is the same in every time zone the tests might run in.
const generatedAt = '2026-09-21T12:00:00.000Z';
const daysAfter = (days: number) => new Date(Date.parse(generatedAt) + days * 24 * 60 * 60 * 1000);

describe('formatDay', () => {
  it('writes day, short month and year, and refuses what is not a date', () => {
    expect(formatDay(generatedAt)).toBe('21 Sep 2026');
    expect(formatDay('not a date')).toBeNull();
  });
});

describe('dataSummary', () => {
  it('names the label, the usage month, cutoff and battles, and the update day', () => {
    const meta = metaOf({ generatedAt, usage: { ...usage, month: '2026-08', cutoff: 1630, battles: 1269250, isFallback: false } });
    expect(dataSummary(meta)).toBe(
      'Data: Champions VGC 2026 Reg M-B · Smogon ladder usage for 2026-08 (1630+ rating, 1,269,250 battles) · updated 21 Sep 2026',
    );
  });

  it('names the source of fallback usage', () => {
    const meta = metaOf({ generatedAt, usage: { ...usage, statsFormatId: 'gen9championsvgc2026regmb', month: '2026-08', cutoff: 1630, battles: 5, isFallback: true } });
    expect(dataSummary(meta)).toBe(
      'Data: Champions VGC 2026 Reg M-B · Smogon ladder usage for 2026-08 from gen9championsvgc2026regmb (1630+ rating, 5 battles) · updated 21 Sep 2026',
    );
  });

  it('says when there is no usage data or no readable date', () => {
    expect(dataSummary(metaOf({ generatedAt: 'garbled', usage: null }))).toBe(
      'Data: Champions VGC 2026 Reg M-B · no ladder usage data · updated (unknown date)',
    );
  });
});

describe('dataBanners', () => {
  it(`adds the stale banner only after ${STALE_AFTER_DAYS} whole days`, () => {
    const meta = metaOf({ generatedAt, usage: { ...usage, isFallback: false } });
    expect(dataBanners(meta, daysAfter(STALE_AFTER_DAYS))).toEqual([]);
    expect(dataBanners(meta, daysAfter(STALE_AFTER_DAYS + 1))).toEqual([
      { id: 'stale', text: 'The Pokémon data is 46 days old; the weekly refresh may have stopped.' },
    ]);
  });

  it('adds the fallback banner for borrowed usage, and nothing for an unreadable date', () => {
    const meta = metaOf({ generatedAt: 'garbled', usage: { ...usage, statsFormatId: 'gen9championsvgc2026regmb', isFallback: true } });
    expect(dataBanners(meta, daysAfter(400))).toEqual([
      {
        id: 'fallback',
        text: 'Ladder usage comes from gen9championsvgc2026regmb because Champions VGC 2026 Reg M-B has no published stats yet; suggestions may be less accurate.',
      },
    ]);
    expect(dataBanners(metaOf({ generatedAt, usage: null }), daysAfter(1))).toEqual([]);
  });
});
