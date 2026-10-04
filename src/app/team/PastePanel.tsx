import { useState } from 'react';
import type { DraftFile } from '../../domain/file';
import type { ID } from '../../domain/id';
import { exportSets } from '../../domain/paste-export';
import { parsePaste } from '../../domain/paste';
import type { PokemonSet } from '../../domain/set';
import type { Snapshot } from '../../domain/types';
import type { BrowserActions } from '../browser';
import { FileButton } from '../FileButton';
import type { DraftAction, DraftStoreState } from '../state/draft-store';
import { joinList, type Names } from '../text/names';
import { setProblemText } from '../text/problems';
import { copyWithMessage, useFlash } from './flash';

interface Props {
  file: DraftFile;
  roster: readonly ID[];
  snapshot: Snapshot;
  names: Names;
  teamSize: number;
  /** The league's name as a file name part, for downloads. */
  base: string;
  dispatch(action: DraftAction): DraftStoreState;
  actions: BrowserActions;
}

interface ImportResult {
  imported: number;
  /** One line per block that was skipped or has problems or notes. */
  lines: string[];
}

/** Imports a Showdown paste into your roster's sets (optionally as a team too), and exports your sets. */
export function PastePanel({ file, roster, snapshot, names, teamSize, base, dispatch, actions }: Props) {
  const [text, setText] = useState('');
  const [makeTeam, setMakeTeam] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [readError, setReadError] = useState(false);
  const [flash, setFlash] = useFlash();

  const importPaste = (input: string, teamName: string) => {
    const blocks = parsePaste(input, snapshot);
    const lines: string[] = [];
    const chosen: PokemonSet[] = [];
    blocks.forEach((block, index) => {
      const set = block.set;
      const label = `Block ${index + 1}${set ? ` (${names.species(set.species)})` : ''}`;
      if (set && !roster.includes(set.species)) {
        lines.push(`${names.species(set.species)} is not on your roster; skipped.`);
        return;
      }
      if (set && chosen.some((other) => other.species === set.species)) {
        lines.push(`${label}: ${names.species(set.species)} appears earlier in this paste; skipped.`);
        return;
      }
      for (const note of block.notes) lines.push(`${label}: ${note}`);
      for (const problem of block.problems) lines.push(`${label}: ${set ? setProblemText(problem, set, snapshot) : problem.message}`);
      if (set) chosen.push(set);
    });

    const existing = chosen.filter((set) => Object.hasOwn(file.sets, set.species));
    const replace =
      existing.length === 0 ||
      actions.confirm(`Replace the existing sets of ${joinList(existing.map((set) => names.species(set.species)))}?`);
    let imported = 0;
    for (const set of chosen) {
      if (!replace && Object.hasOwn(file.sets, set.species)) continue;
      const refused = dispatch({ type: 'set-set', species: set.species, set }).errors;
      if (refused.length === 0) imported++;
      else lines.push(`${names.species(set.species)} was not imported: ${refused.map((p) => setProblemText(p, set, snapshot)).join(' ')}`);
    }

    if (makeTeam && chosen.length > 0) {
      const added = dispatch({ type: 'add-team', name: teamName });
      const index = (added.file?.teams.length ?? 0) - 1;
      const members = chosen.slice(0, teamSize).map((set) => set.species);
      if (added.errors.length === 0 && dispatch({ type: 'set-team-members', index, members }).errors.length === 0) {
        lines.push(`Added the team "${teamName}".`);
      }
    }
    setReadError(false);
    setResult({ imported, lines });
  };

  const allSets = () => exportSets(roster.filter((id) => Object.hasOwn(file.sets, id)).map((id) => file.sets[id]), snapshot);

  return (
    <section className="paste-panel" aria-labelledby="paste-title">
      <h2 id="paste-title">Showdown paste</h2>
      <label htmlFor="paste-text">Paste sets from Showdown</label>
      <textarea id="paste-text" rows={10} value={text} onChange={(event) => setText(event.target.value)} />
      <label className="check">
        <input type="checkbox" checked={makeTeam} onChange={(event) => setMakeTeam(event.target.checked)} /> Also make a team from
        this paste
      </label>
      <div className="row">
        <button type="button" onClick={() => importPaste(text, 'Pasted team')} disabled={text.trim() === ''}>
          Import
        </button>
        <FileButton
          label="Import a paste file"
          accept=".txt,text/plain"
          onText={(contents, fileName) => {
            if (contents === null) {
              setResult(null);
              setReadError(true);
              return;
            }
            importPaste(contents, fileName.replace(/\.[^.]*$/, '') || 'Pasted team');
          }}
        />
      </div>
      <div className="import-result" aria-live="polite">
        {readError && <p>That file could not be read.</p>}
        {result && (
          <>
            <p>
              {result.imported} set{result.imported === 1 ? '' : 's'} imported.
            </p>
            {result.lines.length > 0 && (
              <ul className="problems">
                {result.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <h3>Export your sets</h3>
      <div className="row">
        <button type="button" onClick={() => copyWithMessage(actions.copy, allSets(), setFlash)}>
          Copy all sets
        </button>
        <button type="button" onClick={() => actions.download(`${base}.sets.txt`, allSets())}>
          Download all sets
        </button>
      </div>
      <p aria-live="polite" className="flash">
        {flash}
      </p>
    </section>
  );
}
