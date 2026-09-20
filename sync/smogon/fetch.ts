import { gunzipSync } from 'node:zlib';

export interface FetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export type Fetcher = (url: string) => Promise<FetchResponse>;

export interface ChaosSource {
  statsFormatId: string;
  cutoff: number;
  month: string;
  url: string;
  text: string;
}

const STATS_ROOT = 'https://www.smogon.com/stats';

export function parseIndex(html: string): string[] {
  return [...html.matchAll(/href="([^"?#]+)"/g)].map((match) => match[1]);
}

/** Months (YYYY-MM) listed on the stats index, oldest first. */
export function listMonths(html: string): string[] {
  return parseIndex(html)
    .filter((href) => /^\d{4}-\d{2}\/$/.test(href))
    .map((href) => href.slice(0, -1))
    .sort();
}

async function getTextIfPresent(fetcher: Fetcher, url: string): Promise<string | null> {
  const response = await fetcher(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Smogon stats: ${url} returned HTTP ${response.status}`);
  return response.text();
}

async function getText(fetcher: Fetcher, url: string): Promise<string> {
  const text = await getTextIfPresent(fetcher, url);
  if (text === null) throw new Error(`Smogon stats: ${url} returned HTTP 404`);
  return text;
}

/**
 * Finds the newest stats month that has `<statsFormatId>-<cutoff>.json.gz` under `chaos/`
 * and returns its decompressed text, or null if none of the last `maxMonthsBack` months has it.
 */
export async function fetchLatestChaos(
  statsFormatId: string,
  cutoff: number,
  fetcher: Fetcher = fetch as unknown as Fetcher,
  maxMonthsBack = 6,
): Promise<ChaosSource | null> {
  const indexUrl = `${STATS_ROOT}/`;
  const index = await getText(fetcher, indexUrl);
  const allMonths = listMonths(index);
  if (allMonths.length === 0) {
    // Not "no stats yet": the index always lists months, so an empty result means the page format changed.
    throw new Error(`Smogon stats: ${indexUrl} lists no YYYY-MM/ months; the page format may have changed`);
  }
  const months = allMonths.reverse().slice(0, maxMonthsBack);
  const file = `${statsFormatId}-${cutoff}.json.gz`;

  for (const month of months) {
    const listing = await getTextIfPresent(fetcher, `${STATS_ROOT}/${month}/chaos/`);
    if (listing === null || !parseIndex(listing).includes(file)) continue;

    const url = `${STATS_ROOT}/${month}/chaos/${file}`;
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`Smogon stats: ${url} returned HTTP ${response.status}`);
    const text = gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');
    return { statsFormatId, cutoff, month, url, text };
  }
  return null;
}
