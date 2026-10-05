import type { SnapshotMeta } from '../../domain/types';

/** Data older than this many days gets the "weekly refresh may have stopped" banner. */
export const STALE_AFTER_DAYS = 45;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A banner about the data, with a stable id so it can be dismissed for the session. */
export interface DataBanner {
  id: 'fallback' | 'stale';
  text: string;
}

/** Month names written out, so the text does not depend on the browser's locale data ("Sep" vs "Sept"). */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "21 Sep 2026" in the browser's time zone, or null for something that is not a date. */
export function formatDay(iso: string): string | null {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const date = new Date(time);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** The data line: label, ladder usage (month, rating cutoff, battles, and the source when it is a fallback), last update. */
export function dataSummary(meta: SnapshotMeta): string {
  const updated = formatDay(meta.generatedAt) ?? '(unknown date)';
  const usage = meta.usage;
  if (usage === null) return `Data: ${meta.label} · no ladder usage data · updated ${updated}`;
  const source = usage.isFallback ? ` from ${usage.statsFormatId}` : '';
  const battles = usage.battles.toLocaleString('en-US');
  return `Data: ${meta.label} · Smogon ladder usage for ${usage.month}${source} (${usage.cutoff}+ rating, ${battles} battles) · updated ${updated}`;
}

/** The fallback-usage and stale-data banners that apply at `now`. */
export function dataBanners(meta: SnapshotMeta, now: Date): DataBanner[] {
  const banners: DataBanner[] = [];
  if (meta.usage?.isFallback) {
    banners.push({
      id: 'fallback',
      text: `Ladder usage comes from ${meta.usage.statsFormatId} because ${meta.label} has no published stats yet; suggestions may be less accurate.`,
    });
  }
  const generated = Date.parse(meta.generatedAt);
  if (!Number.isNaN(generated)) {
    const days = Math.floor((now.getTime() - generated) / DAY_MS);
    if (days > STALE_AFTER_DAYS) {
      banners.push({ id: 'stale', text: `The Pokémon data is ${days} days old; the weekly refresh may have stopped.` });
    }
  }
  return banners;
}
