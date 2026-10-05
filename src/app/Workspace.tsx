import { useMemo, useRef, useState } from 'react';
import { deriveDraft } from '../domain/derive';
import { parseDraftFile, serializeDraftFile, type DraftFile } from '../domain/file';
import type { LeagueConfig } from '../domain/league';
import type { Problem } from '../domain/problem';
import { exportFileName, type BrowserActions } from './browser';
import type { AppData } from './data/snapshot';
import { DataFooter } from './DataFooter';
import { SetupView } from './setup/SetupView';
import { makeDraftReducer, type DraftAction, type DraftStoreState } from './state/draft-store';
import { loadDraft, saveDraft, type DraftStorage } from './state/storage';
import { DraftRoom } from './room/DraftRoom';
import { TeambuilderView } from './team/TeambuilderView';
import { dataBanners, type DataBanner } from './text/data-age';
import { makeNames } from './text/names';

type View = 'room' | 'team' | 'setup';

const VIEW_LABELS: ReadonlyArray<[View, string]> = [
  ['room', 'Draft room'],
  ['team', 'Teambuilder'],
  ['setup', 'Setup'],
];

interface Props {
  data: AppData;
  storage: DraftStorage;
  actions: BrowserActions;
  /** The current time, for the stale-data banner. */
  now: () => Date;
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
export function Workspace({ data, storage, actions, now }: Props) {
  const reducer = useMemo(() => makeDraftReducer(data.snapshot, data.meta.showdown.rules.minTeamSize), [data]);
  const names = useMemo(() => makeNames(data.snapshot), [data.snapshot]);
  const [initial] = useState(() => loadDraft(storage, data.snapshot));
  const [state, setState] = useState<DraftStoreState>({ file: initial.kind === 'ok' ? initial.file : null, errors: [] });
  const stateRef = useRef(state);
  const [recovery, setRecovery] = useState(initial.kind === 'corrupt' ? initial : null);
  const [warnings, setWarnings] = useState<Problem[]>(initial.kind === 'ok' ? initial.warnings : []);
  const [saveFailed, setSaveFailed] = useState(initial.kind === 'unavailable');
  const [importErrors, setImportErrors] = useState<Problem[]>([]);
  const [view, setView] = useState<View>(state.file === null ? 'setup' : 'room');
  const [banners, setBanners] = useState<DataBanner[]>(() => dataBanners(data.meta, now()));

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

  /** Switches view, dropping the last refusal so it does not show up on the next screen. */
  const go = (next: View) => {
    stateRef.current = { ...stateRef.current, errors: [] };
    setState(stateRef.current);
    setView(next);
  };

  /** Undoes the last pick; when it is one of yours with a set or on a team, asks first. */
  const undoLast = () => {
    const current = stateRef.current.file;
    if (current !== null && current.picks.length > 0) {
      const last = current.picks[current.picks.length - 1];
      const roster = deriveDraft(current.league, current.picks, data.snapshot).drafters[current.league.me]?.roster ?? [];
      const hasSet = Object.hasOwn(current.sets, last);
      const teams = current.teams.filter((team) => team.members.includes(last)).length;
      if (roster.includes(last) && (hasSet || teams > 0)) {
        const parts = [
          ...(hasSet ? ['its set will be deleted'] : []),
          ...(teams > 0 ? [`it will be removed from ${teams} team${teams === 1 ? '' : 's'}`] : []),
        ].join(' and ');
        const question = `Undo ${names.species(last)}? ${parts.charAt(0).toUpperCase()}${parts.slice(1)}.`;
        if (!actions.confirm(question)) return;
      }
    }
    apply({ type: 'undo' });
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
      {file !== null && (
        <nav className="view-nav" aria-label="Views">
          {VIEW_LABELS.map(([id, label]) => (
            <button key={id} type="button" aria-current={view === id ? 'page' : undefined} onClick={() => go(id)}>
              {label}
            </button>
          ))}
        </nav>
      )}
      {saveFailed && (
        <div className="banner warning" role="alert">
          Changes aren't being saved in this browser — use Export.
        </div>
      )}
      {banners.map((banner) => (
        <div key={banner.id} className="banner warning">
          <p id={`data-banner-${banner.id}`}>{banner.text}</p>
          <button type="button" aria-describedby={`data-banner-${banner.id}`} onClick={() => setBanners((shown) => shown.filter((b) => b.id !== banner.id))}>
            Dismiss
          </button>
        </div>
      ))}
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
          onCancel={file === null ? undefined : () => go('room')}
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
      ) : view === 'team' ? (
        <TeambuilderView data={data} file={file} names={names} errors={state.errors} dispatch={apply} actions={actions} />
      ) : (
        <DraftRoom
          data={data}
          file={file}
          names={names}
          errors={state.errors}
          onPick={(species) => apply({ type: 'pick', species })}
          onUndo={undoLast}
          onExport={() => actions.download(exportFileName(file.league.name), serializeDraftFile(file))}
          onImport={importFile}
        />
      )}
      <DataFooter meta={data.meta} />
    </>
  );
}
