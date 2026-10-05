import { useState } from 'react';
import type { ID } from '../../domain/id';
import type { LegalSpeciesSource } from '../../domain/league';
import { parsePriceCsv, type PriceImport as PriceImportResult } from '../../domain/prices';
import { FileButton } from '../FileButton';

interface Props {
  snapshot: LegalSpeciesSource;
  /** Receives the matched prices; the caller merges them into its table. */
  onImport(prices: Record<ID, number>): void;
  /** Offers the price-list template (every legal Pokémon with an empty points column) as a download. */
  onTemplate(): void;
}

/** Paste or upload a "name,points" list; shows what matched, what did not, and the problems by line. */
export function PriceImport({ snapshot, onImport, onTemplate }: Props) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<PriceImportResult | null>(null);
  const [readError, setReadError] = useState(false);

  const run = (input: string) => {
    const parsed = parsePriceCsv(input, snapshot);
    setResult(parsed);
    onImport(parsed.prices);
  };

  return (
    <section className="price-import" aria-labelledby="price-import-title">
      <h3 id="price-import-title">Import prices</h3>
      <label htmlFor="price-csv">Paste "name,points" lines (a header line is fine)</label>
      <p className="note">
        One Pokémon per line, for example <code>Garchomp,16</code>. Pokémon not on the list are not in this draft.
      </p>
      <textarea id="price-csv" rows={6} value={text} onChange={(event) => setText(event.target.value)} />
      <div className="row">
        <button type="button" onClick={() => run(text)} disabled={text.trim() === ''}>
          Import
        </button>
        <button type="button" onClick={onTemplate}>
          Download a template
        </button>
        <FileButton
          label="Upload a file"
          accept=".csv,.tsv,.txt"
          onText={(contents) => {
            if (contents === null) {
              setResult(null);
              setReadError(true);
              return;
            }
            setReadError(false);
            run(contents);
          }}
        />
      </div>
      {readError && (
        <div className="import-result" role="status">
          <p>That file could not be read.</p>
        </div>
      )}
      {result && (
        <div className="import-result" role="status">
          <p>{Object.keys(result.prices).length} prices imported.</p>
          {result.unmatched.length > 0 && (
            <p>
              Not a legal Pokémon in this format ({result.unmatched.length}): {result.unmatched.join(', ')}
            </p>
          )}
          {result.problems.length > 0 && (
            <ul className="problems">
              {result.problems.map((problem) => (
                <li key={`${problem.path}:${problem.message}`}>
                  {problem.path}: {problem.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
