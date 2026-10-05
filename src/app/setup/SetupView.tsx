import { useId, useMemo, useState, type ReactNode } from 'react';
import { deriveDraft } from '../../domain/derive';
import type { DraftFile } from '../../domain/file';
import type { ID } from '../../domain/id';
import { validateLeague, type DraftOrder, type LeagueConfig } from '../../domain/league';
import type { Problem } from '../../domain/problem';
import type { BrowserActions } from '../browser';
import type { AppData } from '../data/snapshot';
import { FileButton } from '../FileButton';
import { BanList } from './BanList';
import { PriceImport } from './PriceImport';
import { PriceStart, type PricePanel } from './PriceStart';
import { SuggestPrices } from './SuggestPrices';
import { TierBoard } from './TierBoard';
import { templateCsv, tiersOf } from './tiers';

interface Props {
  data: AppData;
  file: DraftFile | null;
  /** The store's refusal of the last save, if any. */
  errors: Problem[];
  onSave(league: LeagueConfig): void;
  /** Back to the draft room without saving (only when a draft exists). */
  onCancel?(): void;
  /** Start over with a new league (only when a draft exists). */
  onNewLeague?(): void;
  /** Import a saved draft file's text, or null when it could not be read (only when there is no draft yet). */
  onImport?(text: string | null): void;
  /** Questions and downloads (the price template). */
  actions: BrowserActions;
}

const lines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

/** Problems whose path is `league.<field>` or below it. */
const problemsFor = (problems: readonly Problem[], field: string): Problem[] =>
  problems.filter((p) => p.path === `league.${field}` || p.path.startsWith(`league.${field}[`) || p.path.startsWith(`league.${field}.`));

function Field({ label, htmlFor, problems, children }: { label: string; htmlFor: string; problems: Problem[]; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {problems.map((p) => (
        <p key={`${p.path}:${p.message}`} className="field-error">
          {p.message}
        </p>
      ))}
    </div>
  );
}

/**
 * League setup: the league fields, then the prices and bans: the price starting choices (build by hand, paste or
 * upload a list, suggested prices), the tier board that edits the prices as tiers, and the bans list.
 */
export function SetupView({ data, file, errors, onSave, onCancel, onNewLeague, onImport, actions }: Props) {
  const formId = useId();
  const existing = file?.league;
  const locked = (file?.picks.length ?? 0) > 0;
  const [name, setName] = useState(existing?.name ?? '');
  const [draftersText, setDraftersText] = useState(existing?.drafters.join('\n') ?? '');
  const [order, setOrder] = useState<DraftOrder>(existing?.order ?? 'snake');
  const [rounds, setRounds] = useState(String(existing?.rounds ?? 8));
  const [me, setMe] = useState(existing?.me ?? 0);
  const [budget, setBudget] = useState(String(existing?.budget ?? 100));
  const [prices, setPrices] = useState<Record<ID, number>>({ ...(existing?.prices ?? {}) });
  const [bans, setBans] = useState<ID[]>([...(existing?.extraBans ?? [])]);
  const [attempted, setAttempted] = useState(false);
  const [panel, setPanel] = useState<PricePanel>(null);
  const [emptyTiers, setEmptyTiers] = useState<number[]>([]);
  const draftedBy = useMemo(() => {
    const out: Record<ID, string> = {};
    if (file === null) return out;
    for (const drafter of deriveDraft(file.league, file.picks, data.snapshot).drafters) {
      for (const id of drafter.roster) out[id] = drafter.name;
    }
    return out;
  }, [file, data.snapshot]);
  const hasPrices = tiersOf(prices, data.snapshot.species).length > 0;
  const showBoard = hasPrices || emptyTiers.length > 0;

  const drafters = lines(draftersText);
  const league: LeagueConfig = {
    name: name.trim(),
    formatId: data.snapshot.formatId,
    drafters,
    order,
    rounds: rounds.trim() === '' ? Number.NaN : Number(rounds),
    me: me < drafters.length ? me : 0,
    budget: budget.trim() === '' ? Number.NaN : Number(budget),
    prices,
    extraBans: bans,
  };
  const shown = attempted ? [...validateLeague(league, 'league'), ...errors] : errors;
  const other = shown.filter((p) => !['name', 'drafters', 'order', 'rounds', 'me', 'budget'].some((f) => problemsFor([p], f).length > 0));

  return (
    <main className="setup">
      <header className="setup-header">
        <h1>{existing ? 'League setup' : 'Set up your league'}</h1>
        <p>Format: {data.meta.label}</p>
      </header>

      {onImport && (
        <section aria-labelledby="import-title">
          <h2 id="import-title">Have a saved draft?</h2>
          <FileButton label="Import a draft file" accept=".json,application/json" onText={(text) => onImport(text)} />
        </section>
      )}

      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          setAttempted(true);
          if (validateLeague(league, 'league').length === 0) onSave(league);
        }}
      >
        <section aria-labelledby="league-title">
          <h2 id="league-title">League</h2>
          {locked && <p className="note">Drafters, order, rounds and your slot are locked once picks are recorded.</p>}
          <Field label="League name" htmlFor="league-name" problems={problemsFor(shown, 'name')}>
            <input id="league-name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Drafters (one per line, in first-round order)" htmlFor="league-drafters" problems={problemsFor(shown, 'drafters')}>
            <textarea
              id="league-drafters"
              rows={6}
              value={draftersText}
              disabled={locked}
              onChange={(event) => {
                setDraftersText(event.target.value);
                if (me >= lines(event.target.value).length) setMe(0);
              }}
            />
          </Field>
          <Field label="Draft order" htmlFor="league-order" problems={problemsFor(shown, 'order')}>
            <select id="league-order" value={order} disabled={locked} onChange={(event) => setOrder(event.target.value as DraftOrder)}>
              <option value="snake">Snake</option>
              <option value="linear">Linear</option>
            </select>
          </Field>
          <Field label="Rounds (roster size)" htmlFor="league-rounds" problems={problemsFor(shown, 'rounds')}>
            <input id="league-rounds" type="number" min={1} max={30} value={rounds} disabled={locked} onChange={(event) => setRounds(event.target.value)} />
          </Field>
          <Field label="Your slot" htmlFor="league-me" problems={problemsFor(shown, 'me')}>
            <select id="league-me" value={league.me} disabled={locked || drafters.length === 0} onChange={(event) => setMe(Number(event.target.value))}>
              {drafters.map((drafter, i) => (
                <option key={`${i}:${drafter}`} value={i}>
                  {drafter}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Budget (points per roster)" htmlFor="league-budget" problems={problemsFor(shown, 'budget')}>
            <input id="league-budget" type="number" min={1} value={budget} onChange={(event) => setBudget(event.target.value)} />
          </Field>
        </section>
      </form>

      <section aria-labelledby={`${formId}-prices`}>
        <h2 id={`${formId}-prices`}>Prices and bans</h2>
        <PriceStart first={!showBoard} panel={panel} onPanel={setPanel} onBuild={() => setEmptyTiers([10])} canSuggest={data.snapshot.usage !== null} />
      {panel === 'paste' && (
        <PriceImport
          snapshot={data.snapshot}
          onImport={(imported) => setPrices((current) => ({ ...current, ...imported }))}
          onTemplate={() => actions.download('draftlab-prices-template.csv', templateCsv(data.snapshot.species))}
        />
      )}
      {panel === 'suggest' && (
        <SuggestPrices
          snapshot={data.snapshot}
          hasPrices={hasPrices}
          confirm={actions.confirm}
          onApply={(suggested) => {
            setPrices(suggested);
            setEmptyTiers([]);
            setPanel(null);
          }}
        />
      )}
      {showBoard && (
        <TierBoard
          species={data.snapshot.species}
          prices={prices}
          bans={bans}
          draftedBy={draftedBy}
          emptyTiers={emptyTiers}
          onEmptyTiers={setEmptyTiers}
          onPrices={setPrices}
          confirm={actions.confirm}
        />
      )}
        <BanList species={data.snapshot.species} bans={bans} onBans={setBans} />
      </section>

      <ul className="problems" aria-live="polite">
        {other.map((p) => (
          <li key={`${p.path}:${p.message}`}>{p.message}</li>
        ))}
      </ul>
      <div className="row actions">
        <button type="submit" form={formId}>
          {existing ? 'Save' : 'Start draft'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Back to the draft
          </button>
        )}
        {onNewLeague && (
          <button type="button" className="danger" onClick={onNewLeague}>
            New league
          </button>
        )}
      </div>
    </main>
  );
}
