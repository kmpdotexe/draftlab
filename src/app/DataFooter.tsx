import type { SnapshotMeta } from '../domain/types';
import { dataSummary } from './text/data-age';

/** The data line (format, ladder usage, last update) and, when the sync left any, its notes. */
export function DataFooter({ meta }: { meta: SnapshotMeta }) {
  return (
    <footer className="data-footer">
      <p>{dataSummary(meta)}</p>
      {meta.warnings.length > 0 && (
        <details>
          <summary>Data notes ({meta.warnings.length})</summary>
          <ul>
            {meta.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
    </footer>
  );
}
