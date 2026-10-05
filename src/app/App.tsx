import { Component, useCallback, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { browserActions, type BrowserActions } from './browser';
import { loadAppData, type AppData } from './data/snapshot';
import { STORAGE_KEY, browserStorage, type DraftStorage } from './state/storage';
import { Workspace } from './Workspace';

export interface AppProps {
  load?: () => Promise<AppData>;
  storage?: DraftStorage;
  actions?: BrowserActions;
  /** The current time (tests pass a fixed one). */
  now?: () => Date;
}

type Phase = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; data: AppData };

/** The last line of defence: a render error shows this instead of a blank page. */
class ErrorBoundary extends Component<{ storage: DraftStorage; actions: BrowserActions; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    let raw: string | null = null;
    try {
      raw = this.props.storage.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
    return (
      <main className="recovery">
        <h1>Something went wrong</h1>
        <p>Your last saved draft is still in this browser.</p>
        <div className="row">
          {raw !== null && (
            <button type="button" onClick={() => this.props.actions.download('draftlab-backup.json', raw)}>
              Download saved draft
            </button>
          )}
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </main>
    );
  }
}

/** Loads the data, then hands over to the workspace; loading and load errors get their own screens. */
export function App({ load = loadAppData, storage, actions = browserActions, now = () => new Date() }: AppProps) {
  const [store] = useState<DraftStorage>(() => storage ?? browserStorage());
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  const start = useCallback(() => {
    setPhase({ kind: 'loading' });
    load().then(
      (data) => setPhase({ kind: 'ready', data }),
      (error: unknown) => setPhase({ kind: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
  }, [load]);

  useEffect(start, [start]);

  if (phase.kind === 'loading') return <p className="loading">Loading data…</p>;
  if (phase.kind === 'error') {
    return (
      <main className="recovery">
        <h1>The Pokémon data could not be loaded</h1>
        <p>{phase.message}</p>
        <button type="button" onClick={start}>
          Retry
        </button>
      </main>
    );
  }
  return (
    <ErrorBoundary storage={store} actions={actions}>
      <Workspace data={phase.data} storage={store} actions={actions} now={now} />
    </ErrorBoundary>
  );
}
