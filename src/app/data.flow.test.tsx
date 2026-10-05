// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { serializeDraftFile, type DraftFile } from '../domain/file';
import type { SnapshotMeta } from '../domain/types';
import { App } from './App';
import { STORAGE_KEY } from './state/storage';
import { dataSummary } from './text/data-age';
import { fakeActions, fakeStorage, realData } from './test-support';

afterEach(cleanup);

const data = realData();
const generatedAt = '2026-09-21T12:00:00.000Z';
const fallbackMeta: SnapshotMeta = {
  ...data.meta,
  generatedAt,
  usage: { ...data.meta.usage!, statsFormatId: 'gen9championsvgc2026regmb', isFallback: true },
};
const file: DraftFile = {
  schemaVersion: 2,
  league: { name: 'Test League', formatId: data.snapshot.formatId, drafters: ['Ana', 'Ben'], order: 'snake', rounds: 2, me: 0, budget: 50, prices: { incineroar: 20 }, extraBans: [] },
  picks: ['incineroar'],
  sets: {},
  teams: [],
};

describe('the data line and banners', () => {
  it('shows the data line and its notes under every view', async () => {
    const user = userEvent.setup();
    const meta = { ...data.meta, generatedAt };
    render(
      <App load={async () => ({ ...data, meta })} storage={fakeStorage({ [STORAGE_KEY]: serializeDraftFile(file) }).storage} actions={fakeActions().actions} now={() => new Date(generatedAt)} />,
    );
    const footer = await screen.findByRole('contentinfo');
    expect(within(footer).getByText(dataSummary(meta))).toBeTruthy();
    expect(within(footer).getByText(`Data notes (${meta.warnings.length})`)).toBeTruthy();
    expect(meta.warnings.length).toBeGreaterThan(0);
    expect(screen.queryByText(/days old/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Teambuilder' }));
    expect(within(screen.getByRole('contentinfo')).getByText(dataSummary(meta))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Setup' }));
    expect(within(screen.getByRole('contentinfo')).getByText(dataSummary(meta))).toBeTruthy();
  });

  it('warns about borrowed usage and old data, and each warning can be dismissed', async () => {
    const user = userEvent.setup();
    const fiftyDaysLater = new Date(Date.parse(generatedAt) + 50 * 24 * 60 * 60 * 1000);
    render(<App load={async () => ({ ...data, meta: fallbackMeta })} storage={fakeStorage().storage} actions={fakeActions().actions} now={() => fiftyDaysLater} />);
    expect(await screen.findByText(/Ladder usage comes from gen9championsvgc2026regmb because/)).toBeTruthy();
    expect(screen.getByText('The Pokémon data is 50 days old; the weekly refresh may have stopped.')).toBeTruthy();
    const [first] = screen.getAllByRole('button', { name: 'Dismiss' });
    await user.click(first);
    expect(screen.queryByText(/Ladder usage comes from/)).toBeNull();
    expect(screen.getByText(/50 days old/)).toBeTruthy();
  });
});
