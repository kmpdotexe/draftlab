import { useMemo, useState } from 'react';
import { deriveDraft } from '../../domain/derive';
import type { DraftFile } from '../../domain/file';
import type { ID } from '../../domain/id';
import { exportSet } from '../../domain/paste-export';
import type { Problem } from '../../domain/problem';
import { validateSetAgainstSnapshot } from '../../domain/set-check';
import { fileBase, type BrowserActions } from '../browser';
import type { AppData } from '../data/snapshot';
import type { DraftAction, DraftStoreState } from '../state/draft-store';
import type { Names } from '../text/names';
import { copyWithMessage, useFlash } from './flash';
import { MatchTeams } from './MatchTeams';
import { PastePanel } from './PastePanel';
import { RosterList } from './RosterList';
import { SetEditor } from './SetEditor';

interface Props {
  data: AppData;
  file: DraftFile;
  names: Names;
  /** The store's refusal of the last action, if any. */
  errors: Problem[];
  dispatch(action: DraftAction): DraftStoreState;
  actions: BrowserActions;
}

/** The teambuilder: your roster, the set editor (or the paste panel) and your match teams. */
export function TeambuilderView({ data, file, names, errors, dispatch, actions }: Props) {
  const { snapshot } = data;
  const teamSize = data.meta.showdown.rules.minTeamSize;
  const base = fileBase(file.league.name);
  const roster = useMemo(
    () => deriveDraft(file.league, file.picks, snapshot).drafters[file.league.me]?.roster ?? [],
    [file.league, file.picks, snapshot],
  );
  const problems = useMemo(() => {
    const out: Record<ID, Problem[]> = {};
    for (const id of roster) out[id] = Object.hasOwn(file.sets, id) ? validateSetAgainstSnapshot(file.sets[id], snapshot, `sets.${id}`) : [];
    return out;
  }, [roster, file.sets, snapshot]);
  const [chosen, setChosen] = useState<ID | null>(null);
  const [tab, setTab] = useState<'set' | 'paste'>('set');
  const [flash, setFlash] = useFlash();
  const selected = chosen !== null && roster.includes(chosen) ? chosen : (roster[0] ?? null);
  const set = selected !== null && Object.hasOwn(file.sets, selected) ? file.sets[selected] : undefined;

  return (
    <div className="teambuilder">
      <header className="room-header">
        <h1>{file.league.name}</h1>
        <p className="status">Teambuilder</p>
      </header>
      <div className={errors.length > 0 ? 'refusal' : undefined} aria-live="polite">
        {errors.map((p) => (
          <p key={`${p.path}:${p.message}`}>{p.message}</p>
        ))}
      </div>
      <div className="columns">
        <div className="column">
          <RosterList roster={roster} sets={file.sets} problems={problems} selected={selected} names={names} onSelect={setChosen} />
        </div>
        <div className="column">
          <div className="row tabs">
            <button type="button" aria-pressed={tab === 'set'} onClick={() => setTab('set')}>
              Set
            </button>
            <button type="button" aria-pressed={tab === 'paste'} onClick={() => setTab('paste')}>
              Paste
            </button>
          </div>
          {tab === 'paste' ? (
            <PastePanel
              file={file}
              roster={roster}
              snapshot={snapshot}
              names={names}
              teamSize={teamSize}
              base={base}
              dispatch={dispatch}
              actions={actions}
            />
          ) : selected === null ? null : (
            <>
              <SetEditor
                key={selected}
                species={selected}
                set={set}
                price={file.league.prices[selected]}
                snapshot={snapshot}
                names={names}
                problems={problems[selected] ?? []}
                onChange={(next) => dispatch({ type: 'set-set', species: selected, set: next })}
                onClear={() => {
                  if (actions.confirm(`Clear ${names.species(selected)}'s set?`)) dispatch({ type: 'clear-set', species: selected });
                }}
                onCopy={() => {
                  if (set !== undefined) void copyWithMessage(actions.copy, exportSet(set, snapshot), setFlash);
                }}
              />
              <p aria-live="polite" className="flash">
                {flash}
              </p>
            </>
          )}
        </div>
        <div className="column">
          <MatchTeams
            file={file}
            roster={roster}
            snapshot={snapshot}
            names={names}
            teamSize={teamSize}
            base={base}
            dispatch={dispatch}
            actions={actions}
          />
        </div>
      </div>
    </div>
  );
}
