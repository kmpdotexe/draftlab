export type PricePanel = 'paste' | 'suggest' | null;

interface Props {
  /** True before any price exists: the choices are shown large, with a heading. */
  first: boolean;
  panel: PricePanel;
  onPanel(panel: PricePanel): void;
  onBuild(): void;
  /** False when the snapshot has no ladder usage. */
  canSuggest: boolean;
}

/** The ways to set prices: paste a list, start from suggested prices, or build tiers by hand. */
export function PriceStart({ first, panel, onPanel, onBuild, canSuggest }: Props) {
  const toggle = (which: Exclude<PricePanel, null>) => onPanel(panel === which ? null : which);
  return (
    <section className={first ? 'price-start' : 'price-start compact'} aria-labelledby="price-start-title">
      <h3 id="price-start-title">{first ? 'How do you want to set prices?' : 'Prices: more ways to fill them'}</h3>
      {first && <p className="note">Pokémon without a price are not in this draft. You can mix these: start from one, then adjust.</p>}
      <div className="row">
        <button type="button" aria-pressed={panel === 'paste'} onClick={() => toggle('paste')}>
          Paste or upload a price list
        </button>
        <button type="button" aria-pressed={panel === 'suggest'} disabled={!canSuggest} onClick={() => toggle('suggest')}>
          Start from suggested prices
        </button>
        {first && (
          <button type="button" onClick={onBuild}>
            Build tiers by hand
          </button>
        )}
      </div>
      {!canSuggest && <p className="note">No ladder data to suggest from.</p>}
    </section>
  );
}
