import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { fetchLatestChaos, listMonths, parseIndex, type Fetcher } from './fetch';

const ROOT = 'https://www.smogon.com/stats';

function fakeFetcher(routes: Record<string, { status?: number; body?: string | Buffer }>): Fetcher {
  return async (url) => {
    const route = routes[url];
    const status = route ? (route.status ?? 200) : 404;
    const body = route?.body ?? '';
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => buffer.toString('utf8'),
      arrayBuffer: async () =>
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    };
  };
}

function indexHtml(entries: string[]): string {
  return `<html><body><a href="../">../</a>${entries.map((e) => `<a href="${e}">${e}</a>`).join('')}</body></html>`;
}

const FILE = 'gen9championsvgc2026regmb-1630.json.gz';
const PAYLOAD = JSON.stringify({ hello: 'chaos' });

describe('parseIndex / listMonths', () => {
  it('extracts hrefs and keeps only YYYY-MM/ directories, oldest first', () => {
    const html = indexHtml(['2026-08/', '2026-06/', 'readme.txt', '2026-07/']);
    expect(parseIndex(html)).toContain('readme.txt');
    expect(listMonths(html)).toEqual(['2026-06', '2026-07', '2026-08']);
  });
});

describe('fetchLatestChaos', () => {
  it('returns the newest month whose chaos listing contains the file', async () => {
    const fetcher = fakeFetcher({
      [`${ROOT}/`]: { body: indexHtml(['2026-06/', '2026-07/', '2026-08/']) },
      [`${ROOT}/2026-08/chaos/`]: { body: indexHtml(['gen9championsbssregmb-1630.json.gz']) },
      [`${ROOT}/2026-07/chaos/`]: { body: indexHtml([FILE]) },
      [`${ROOT}/2026-07/chaos/${FILE}`]: { body: gzipSync(PAYLOAD) },
    });
    const result = await fetchLatestChaos('gen9championsvgc2026regmb', 1630, fetcher);
    expect(result).toEqual({
      statsFormatId: 'gen9championsvgc2026regmb',
      cutoff: 1630,
      month: '2026-07',
      url: `${ROOT}/2026-07/chaos/${FILE}`,
      text: PAYLOAD,
    });
  });

  it('returns null when no recent month has the file', async () => {
    const fetcher = fakeFetcher({
      [`${ROOT}/`]: { body: indexHtml(['2026-08/']) },
      [`${ROOT}/2026-08/chaos/`]: { body: indexHtml(['other-1630.json.gz']) },
    });
    expect(await fetchLatestChaos('gen9championsvgc2026regmc', 1630, fetcher)).toBeNull();
  });

  it('treats a month with no chaos directory as "not there" and keeps looking', async () => {
    const fetcher = fakeFetcher({
      [`${ROOT}/`]: { body: indexHtml(['2026-07/', '2026-08/']) },
      // 2026-08/chaos/ is absent, so the fake returns 404
      [`${ROOT}/2026-07/chaos/`]: { body: indexHtml([FILE]) },
      [`${ROOT}/2026-07/chaos/${FILE}`]: { body: gzipSync(PAYLOAD) },
    });
    const result = await fetchLatestChaos('gen9championsvgc2026regmb', 1630, fetcher);
    expect(result?.month).toBe('2026-07');
  });

  it('only looks back maxMonthsBack months', async () => {
    const months = ['2026-01/', '2026-02/', '2026-03/', '2026-04/', '2026-05/', '2026-06/'];
    const routes: Record<string, { body: string | Buffer }> = {
      [`${ROOT}/`]: { body: indexHtml(months) },
      [`${ROOT}/2026-01/chaos/`]: { body: indexHtml([FILE]) },
      [`${ROOT}/2026-01/chaos/${FILE}`]: { body: gzipSync(PAYLOAD) },
    };
    const fetcher = fakeFetcher(routes);
    expect(await fetchLatestChaos('gen9championsvgc2026regmb', 1630, fetcher, 3)).toBeNull();
  });

  it('throws when the stats index itself fails', async () => {
    const fetcher = fakeFetcher({ [`${ROOT}/`]: { status: 500 } });
    await expect(fetchLatestChaos('x', 1630, fetcher)).rejects.toThrow(/HTTP 500/);
  });

  it('throws when the file download fails after it was listed', async () => {
    const fetcher = fakeFetcher({
      [`${ROOT}/`]: { body: indexHtml(['2026-08/']) },
      [`${ROOT}/2026-08/chaos/`]: { body: indexHtml([FILE]) },
      [`${ROOT}/2026-08/chaos/${FILE}`]: { status: 500 },
    });
    await expect(fetchLatestChaos('gen9championsvgc2026regmb', 1630, fetcher)).rejects.toThrow(/HTTP 500/);
  });
});
