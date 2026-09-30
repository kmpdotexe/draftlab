import { useMemo, useState } from 'react';
import { deriveDraft } from '../../domain/derive';
import type { DraftFile } from '../../domain/file';
import type { Problem } from '../../domain/problem';
import { contextFor, suggest } from '../../engine';
import type { AppData } from '../data/snapshot';
import type { Names } from '../text/names';
import { PickEntry } from './PickEntry';
import { PickLog } from './PickLog';
import { Rosters } from './Rosters';
import { Suggestions, filterOptions, type UsageFilter } from './Suggestions';

interface Props {
  data: AppData;
  file: DraftFile;
  names: Names;
  /** The store's refusal of the last action, if any. */
  errors: Problem[];
  onPick(species: string): void;
  onUndo(): void;
  onExport(): void;
  onImport(file: File): void;
  onSetup(): void;
}

/** The live draft: header, then record-a-pick and the log, suggestions for you, and every roster. */
export function DraftRoom({ data, file, names, errors, onPick, onUndo, onExport, onImport, onSetup }: Props) {
  const [filter, setFilter] = useState<UsageFilter>('all');
  const [limit, setLimit] = useState(20);
  const { league } = file;
  const draft = useMemo(() => deriveDraft(league, file.picks, data.snapshot), [league, file.picks, data.snapshot]);
  const result = useMemo(() => {
    const context = contextFor(league, draft, league.me, file.sets);
    return context === null
      ? { suggestions: [], considered: 0, notes: [{ kind: 'invalid-context' as const }] }
      : suggest(context, data.snapshot, { limit, ...filterOptions(filter) });
  }, [league, draft, file.sets, data.snapshot, limit, filter]);

  const total = league.drafters.length * league.rounds;
  const clock = draft.onTheClock;
  const myTurn = clock !== null && clock.drafter === league.me;

  return (
    <div className="room">
      <header className="room-header">
        <h1>{league.name}</h1>
        <p aria-live="polite" className="status">
          {clock === null
            ? 'Draft complete'
            : `Pick ${clock.number} of ${total} · Round ${clock.round} · ${myTurn ? 'You are' : `${league.drafters[clock.drafter]} is`} on the clock`}
        </p>
        <div className="row">
          <button type="button" onClick={onUndo} disabled={file.picks.length === 0}>
            Undo last pick
          </button>
          <button type="button" onClick={onExport}>
            Export
          </button>
          <label className="file-button">
            Import
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                if (chosen) onImport(chosen);
                event.target.value = '';
              }}
            />
          </label>
          <button type="button" onClick={onSetup}>
            Setup
          </button>
        </div>
      </header>
      <div className={errors.length > 0 ? 'refusal' : undefined} aria-live="polite">
        {errors.map((p) => (
          <p key={`${p.path}:${p.message}`}>{p.message}</p>
        ))}
      </div>
      <div className="columns">
        <div className="column">
          <PickEntry league={league} draft={draft} names={names} onPick={onPick} />
          <PickLog draft={draft} names={names} />
        </div>
        <div className="column">
          <Suggestions
            result={result}
            names={names}
            filter={filter}
            limit={limit}
            onFilter={setFilter}
            onLimit={setLimit}
            onPick={myTurn ? onPick : undefined}
          />
        </div>
        <div className="column">
          <Rosters league={league} draft={draft} names={names} />
        </div>
      </div>
    </div>
  );
}
