import { useMemo, useRef, useState } from 'react';
import { parseDraftFile, serializeDraftFile, type DraftFile } from '../domain/file';
import type { LeagueConfig } from '../domain/league';
import type { Problem } from '../domain/problem';
import { exportFileName, type BrowserActions } from './browser';
import type { AppData } from './data/snapshot';
import { SetupView } from './setup/SetupView';
import { makeDraftReducer, type DraftAction, type DraftStoreState } from './state/draft-store';
import { loadDraft, saveDraft, type DraftStorage } from './state/storage';
import { DraftRoom } from './room/DraftRoom';
import { makeNames } from './text/names';

interface Props {
  data: AppData;
  storage: DraftStorage;
  actions: BrowserActions;
}

function ProblemList({ problems }: { problems: readonly Problem[] }) {
  return (
    <ul className="problems">
      {problems.map((p) => (
        <li key={`${p.path}:${p.message}`}>
          <code>{p.path}</code>: {p.message}
        </li>
      ))}
    </ul>
  );
}

/** Owns the one draft file: loads it, applies actions, saves after each change, and picks the view. */
export function Workspace({ data, storage, actions }: Props) {
  const reducer = useMemo(() => makeDraftReducer(data.snapshot), [data.snapshot]);
  const names = useMemo(() => makeNames(data.snapshot), [data.snapshot]);
  const [initial] = useState(() => loadDraft(storage, data.snapshot));
  const [state, setState] = useState<DraftStoreState>({ file: initial.kind === 'ok' ? initial.file : null, errors: [] });
  const stateRef = useRef(state);
  const [recovery, setRecovery] = useState(initial.kind === 'corrupt' ? initial : null);
  const [warnings, setWarnings] = useState<Problem[]>(initial.kind === 'ok' ? initial.warnings : []);
  const [saveFailed, setSaveFailed] = useState(initial.kind === 'unavailable');
  const [importErrors, setImportErrors] = useState<Problem[]>([]);
  const [view, setView] = useState<'setup' | 'room'>(state.file === null ? 'setup' : 'room');

  const apply = (action: DraftAction): DraftStoreState => {
    const next = reducer(stateRef.current, action);
    stateRef.current = next;
    setState(next);
    if (next.errors.length === 0) setSaveFailed(!saveDraft(storage, next.file));
    return next;
  };

  const offerDownload = (file: DraftFile) => {
    if (actions.confirm('Download a copy of the current draft first?')) {
      actions.download(exportFileName(file.league.name), serializeDraftFile(file));
    }
  };

  const importFile = (text: string | null) => {
    if (text === null) {
      setImportErrors([{ path: 'file', message: 'the file could not be read' }]);
      return;
    }
    const parsed = parseDraftFile(text, data.snapshot);
    if (!parsed.ok) {
      setImportErrors(parsed.errors);
      return;
    }
    const current = stateRef.current.file;
    if (current !== null) {
      if (!actions.confirm('Replace the current draft with the imported file?')) return;
      offerDownload(current);
    }
    setImportErrors([]);
    setWarnings(parsed.warnings);
    apply({ type: 'replace', file: parsed.file });
    setView('room');
  };

  if (recovery !== null) {
    return (
      <main className="recovery">
        <h1>The saved draft could not be read</h1>
        <ProblemList problems={recovery.errors} />
        <div className="row">
          <button type="button" onClick={() => actions.download('draftlab-recovered.json', recovery.raw)}>
            Download raw file
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (!actions.confirm('Delete the saved draft and start over?')) return;
              setRecovery(null);
              apply({ type: 'clear' });
              setView('setup');
            }}
          >
            Start over
          </button>
        </div>
      </main>
    );
  }

  const file = state.file;
  return (
    <>
      {saveFailed && (
        <div className="banner warning" role="alert">
          Changes aren't being saved in this browser — use Export.
        </div>
      )}
      {warnings.length > 0 && (
        <div className="banner" role="status">
          <ProblemList problems={warnings} />
          <button type="button" onClick={() => setWarnings([])}>
            Dismiss
          </button>
        </div>
      )}
      <div aria-live="polite">
        {importErrors.length > 0 && (
          <div className="banner warning">
            <p>That file could not be imported; nothing was changed.</p>
            <ProblemList problems={importErrors} />
            <button type="button" onClick={() => setImportErrors([])}>
              Dismiss
            </button>
          </div>
        )}
      </div>
      {view === 'setup' || file === null ? (
        <SetupView
          key={file === null ? 'new' : 'edit'}
          data={data}
          file={file}
          errors={state.errors}
          onSave={(league: LeagueConfig) => {
            if (apply({ type: 'set-league', league }).errors.length === 0) setView('room');
          }}
          onCancel={
            file === null
              ? undefined
              : () => {
                  stateRef.current = { ...stateRef.current, errors: [] };
                  setState(stateRef.current);
                  setView('room');
                }
          }
          onNewLeague={
            file === null
              ? undefined
              : () => {
                  if (!actions.confirm('Start a new league? The current draft will be deleted.')) return;
                  offerDownload(file);
                  apply({ type: 'clear' });
                }
          }
          onImport={file === null ? importFile : undefined}
        />
      ) : (
        <DraftRoom
          data={data}
          file={file}
          names={names}
          errors={state.errors}
          onPick={(species) => apply({ type: 'pick', species })}
          onUndo={() => apply({ type: 'undo' })}
          onExport={() => actions.download(exportFileName(file.league.name), serializeDraftFile(file))}
          onImport={importFile}
          onSetup={() => {
            stateRef.current = { ...stateRef.current, errors: [] };
            setState(stateRef.current);
            setView('setup');
          }}
        />
      )}
    </>
  );
}
