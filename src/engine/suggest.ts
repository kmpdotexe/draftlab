import type { ID } from '../domain/id';
import { selectCandidates } from './candidates';
import { comboSignal, openCombos } from './combo-signal';
import { combineSignals, rankAll } from './combine';
import { liftSignal } from './lift-signal';
import { clamp, compareIds } from './math';
import { readSets } from './profile';
import { roleSignal } from './role-signal';
import { rosterLacks } from './roles';
import { sanitizeSnapshot } from './snapshot-check';
import { typeSignal } from './type-signal';
import {
  SIGNAL_NAMES,
  type EngineSnapshot,
  type Note,
  type Reason,
  type SignalName,
  type SignalOutput,
  type SignalScore,
  type SuggestContext,
  type SuggestOptions,
  type SuggestResult,
  type Suggestion,
} from './types';

export const DEFAULT_WEIGHTS: Record<SignalName, number> = { usageLift: 0.35, typeSynergy: 0.3, roleFit: 0.25, comboFit: 0.1 };
export const DEFAULT_LIMIT = 20;
/** Below this usage fraction a candidate gets an informational `low-usage` reason. */
export const LOW_USAGE = 0.03;

function isContext(value: unknown): value is SuggestContext {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    Array.isArray(c.roster) &&
    Array.isArray(c.pool) &&
    typeof c.prices === 'object' &&
    c.prices !== null &&
    typeof c.remaining === 'number' &&
    Number.isFinite(c.remaining) &&
    typeof c.openSlots === 'number' &&
    Number.isInteger(c.openSlots) &&
    c.openSlots >= 0
  );
}

function resolveWeights(options: SuggestOptions): Record<SignalName, number> {
  const weights = { ...DEFAULT_WEIGHTS };
  const given: unknown = options.weights;
  if (typeof given === 'object' && given !== null) {
    for (const name of SIGNAL_NAMES) {
      if (!Object.hasOwn(given, name)) continue;
      const value = (given as Record<string, unknown>)[name];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) weights[name] = value;
    }
  }
  return weights;
}

/** Informational only: `low-usage` below 3%, `no-ladder-usage` when the species has no usage entry. */
function usageReason(snapshot: EngineSnapshot, id: ID): Reason | null {
  const usage = snapshot.usage;
  if (usage === null) return null;
  if (!Object.hasOwn(usage.species, id)) return { kind: 'no-ladder-usage' };
  const share = usage.species[id].usage;
  return share < LOW_USAGE ? { kind: 'low-usage', usage: share } : null;
}

/**
 * Ranks the pool species that fit the budget by how well they pair with the roster, with typed reasons. Pure and
 * deterministic; never throws on a plain-data (JSON) context and snapshot (an object with a throwing getter or a
 * Proxy can still throw). See the stage 1, 2 and 3 specs for the candidate rules, the four signals, the rank-based
 * combining, the use of entered sets and the notes. `Suggestion.score` is fit compared with the rest of the candidate pool.
 */
export function suggest(ctx: SuggestContext, snapshot: EngineSnapshot, options: SuggestOptions = {}): SuggestResult {
  const early = (notes: Note[]): SuggestResult => ({ suggestions: [], considered: 0, notes });
  if (!isContext(ctx)) return early([{ kind: 'invalid-context' }]);
  const opts: SuggestOptions = typeof options === 'object' && options !== null ? options : {};
  const view = sanitizeSnapshot(snapshot);
  if (view === null) return early([{ kind: 'invalid-snapshot' }]);

  const roster: ID[] = [];
  for (const id of ctx.roster) {
    if (typeof id === 'string' && Object.hasOwn(view.species, id) && !roster.includes(id)) roster.push(id);
  }
  if (ctx.openSlots === 0) return early([{ kind: 'roster-full' }]);
  if (roster.length === 0) return early([{ kind: 'empty-roster' }]);

  const selection = selectCandidates(ctx, roster, view, opts);
  const weights = resolveWeights(opts);
  const limit = typeof opts.limit === 'number' && Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : DEFAULT_LIMIT;

  // The user's sets for roster members only; read defensively by the profile functions.
  const sets = readSets(ctx.sets, roster);
  // Shared by every candidate this call, so they are computed once rather than inside the per-candidate signals.
  const lacked = rosterLacks(roster, view, sets);
  const open = openCombos(roster, view, sets);

  // Every candidate's signals first: the percentile ranks are taken over the whole candidate pool.
  const outputs: Array<Record<SignalName, SignalOutput>> = selection.candidates.map(({ species }) => ({
    usageLift: liftSignal(roster, species, view.usage),
    typeSynergy: typeSignal(roster, species, view, sets),
    roleFit: roleSignal(roster, species, view, lacked),
    comboFit: comboSignal(roster, species, view, open, sets),
  }));
  const scoresOf = (output: Record<SignalName, SignalOutput>): Record<SignalName, number | null> => ({
    usageLift: output.usageLift.score,
    typeSynergy: output.typeSynergy.score,
    roleFit: output.roleFit.score,
    comboFit: output.comboFit.score,
  });
  const allScores = outputs.map(scoresOf);
  const ranks = rankAll(SIGNAL_NAMES, allScores);
  // A signal that no candidate has data for says nothing this call: it gets weight 0 instead of counting as neutral.
  for (const name of SIGNAL_NAMES) {
    if (allScores.every((scores) => scores[name] === null)) weights[name] = 0;
  }

  const scored: Suggestion[] = [];
  let unscored = 0;
  selection.candidates.forEach(({ species, price }, index) => {
    const output = outputs[index];
    const scores = allScores[index];
    const combined = combineSignals(SIGNAL_NAMES, scores, ranks[index], weights);
    if (combined === null) {
      unscored += 1;
      return;
    }
    const signals: SignalScore[] = SIGNAL_NAMES.map((signal) => ({
      signal,
      score: scores[signal],
      rank: ranks[index][signal],
      weight: combined.weights[signal],
      reasons: output[signal].reasons,
    }));
    const reasons = signals.flatMap((entry) => entry.reasons);
    const extra = usageReason(view, species);
    if (extra !== null) reasons.push(extra);
    scored.push({ species, price, score: clamp(combined.score, 0, 1), signals, reasons });
  });

  const notes: Note[] = [];
  if (selection.pricedPoolSize < ctx.openSlots) {
    notes.push({ kind: 'cannot-fill-roster', poolSize: selection.pricedPoolSize, openSlots: ctx.openSlots });
  }
  if (selection.candidates.length === 0 && selection.overBudget > 0) notes.push({ kind: 'no-affordable-candidates' });
  if (view.usage === null) notes.push({ kind: 'no-usage-data' });
  if (lacked.length > 0) notes.push({ kind: 'roster-lacks-roles', roles: lacked });
  if (unscored > 0) notes.push({ kind: 'unscored-candidates', count: unscored });

  scored.sort((a, b) => b.score - a.score || a.price - b.price || compareIds(a.species, b.species));
  return { suggestions: scored.slice(0, limit), considered: selection.candidates.length, notes };
}
