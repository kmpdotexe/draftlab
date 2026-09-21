import type { ID } from '../domain/id';
import { selectCandidates } from './candidates';
import { liftSignal } from './lift-signal';
import { clamp, compareIds } from './math';
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

export const DEFAULT_WEIGHTS: Record<SignalName, number> = { usageLift: 0.35, typeSynergy: 0.3 };
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
 * Proxy can still throw). See the stage 1 spec for the candidate rules, the two signals and the notes.
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

  const scored: Suggestion[] = [];
  let unscored = 0;
  for (const { species, price } of selection.candidates) {
    const outputs: Record<SignalName, SignalOutput> = {
      usageLift: liftSignal(roster, species, view.usage),
      typeSynergy: typeSignal(roster, species, view),
    };
    const withData = SIGNAL_NAMES.filter((name) => outputs[name].score !== null);
    const total = withData.reduce((sum, name) => sum + weights[name], 0);
    if (withData.length === 0 || total <= 0) {
      unscored += 1;
      continue;
    }

    let score = 0;
    const signals: SignalScore[] = SIGNAL_NAMES.map((signal) => {
      const output = outputs[signal];
      if (output.score === null) return { signal, score: null, weight: 0, reasons: output.reasons };
      const weight = weights[signal] / total;
      score += weight * output.score;
      return { signal, score: output.score, weight, reasons: output.reasons };
    });
    const reasons = signals.flatMap((entry) => entry.reasons);
    const extra = usageReason(view, species);
    if (extra !== null) reasons.push(extra);
    scored.push({ species, price, score: clamp(score, 0, 1), signals, reasons });
  }

  const notes: Note[] = [];
  if (selection.pricedPoolSize < ctx.openSlots) {
    notes.push({ kind: 'cannot-fill-roster', poolSize: selection.pricedPoolSize, openSlots: ctx.openSlots });
  }
  if (selection.candidates.length === 0 && selection.overBudget > 0) notes.push({ kind: 'no-affordable-candidates' });
  if (view.usage === null) notes.push({ kind: 'no-usage-data' });
  if (unscored > 0) notes.push({ kind: 'unscored-candidates', count: unscored });

  scored.sort((a, b) => b.score - a.score || a.price - b.price || compareIds(a.species, b.species));
  return { suggestions: scored.slice(0, limit), considered: selection.candidates.length, notes };
}
