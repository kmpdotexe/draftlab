import { useState } from 'react';
import type { ID } from '../../domain/id';
import type { LegalSpeciesSource } from '../../domain/league';
import { parsePriceCsv, type PriceImport as PriceImportResult } from '../../domain/prices';

interface Props {
  snapshot: LegalSpeciesSource;
  /** Receives the matched prices; the caller merges them into its table. */
  onImport(prices: Record<ID, number>): void;
}

/** Paste or upload a "name,points" list; shows what matched, what did not, and the problems by line. */
export function PriceImport({ snapshot, onImport }: Props) {
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
      <textarea id="price-csv" rows={6} value={text} onChange={(event) => setText(event.target.value)} />
      <div className="row">
        <button type="button" onClick={() => run(text)} disabled={text.trim() === ''}>
          Import
        </button>
        <label className="file-button">
          Upload a file
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              let contents: string;
              try {
                contents = await file.text();
              } catch {
                setResult(null);
                setReadError(true);
                return;
              }
              setReadError(false);
              run(contents);
            }}
          />
        </label>
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
