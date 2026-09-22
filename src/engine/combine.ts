/** A signal with no data for a candidate counts at this fraction of its weight, with a neutral rank of 0.5. */
export const MISSING_WEIGHT_FACTOR = 0.5;

/**
 * Mid-rank percentiles: `(below + (equal - 1) / 2) / (n - 1)`, where `below` counts values strictly smaller and `equal`
 * values equal to this one (itself included). The smallest value gets 0, the largest 1, ties share their average rank, and
 * a list of one value gets 0.5. The result has the input's order.
 */
export function percentileRanks(values: readonly number[]): number[] {
  const n = values.length;
  if (n <= 1) return values.map(() => 0.5);
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((value) => {
    let below = 0;
    while (below < n && sorted[below] < value) below += 1;
    let end = below;
    while (end < n && sorted[end] === value) end += 1;
    return (below + (end - below - 1) / 2) / (n - 1);
  });
}

/**
 * Turns each candidate's absolute signal scores into ranks among the candidates: for every signal, the percentile rank
 * over the candidates that have a score for it, and 0.5 for a candidate that has none.
 */
export function rankAll<N extends string>(
  names: readonly N[],
  scores: ReadonlyArray<Readonly<Record<N, number | null>>>,
): Array<Record<N, number>> {
  const ranks = scores.map(() => ({}) as Record<N, number>);
  for (const name of names) {
    const withData: number[] = [];
    scores.forEach((entry, index) => {
      if (entry[name] !== null) withData.push(index);
    });
    const values = withData.map((index) => scores[index][name] as number);
    const percentiles = percentileRanks(values);
    scores.forEach((_entry, index) => {
      ranks[index][name] = 0.5;
    });
    withData.forEach((index, position) => {
      ranks[index][name] = percentiles[position];
    });
  }
  return ranks;
}

export interface Combined<N extends string> {
  /** In [0, 1]: the weighted sum of the ranks. */
  score: number;
  /** The effective weight of each signal (they sum to 1). */
  weights: Record<N, number>;
}

/**
 * Combines one candidate's ranks. A signal with data keeps its weight; one without counts at `missingFactor` times its
 * weight. The candidate cannot be scored (null) when the weights of the signals that DO have data sum to 0, which covers
 * "no signal has data" and "only zero-weight signals have data". Otherwise the weights are re-normalized to sum to 1.
 */
export function combineSignals<N extends string>(
  names: readonly N[],
  scores: Readonly<Record<N, number | null>>,
  ranks: Readonly<Record<N, number>>,
  weights: Readonly<Record<N, number>>,
  missingFactor: number = MISSING_WEIGHT_FACTOR,
): Combined<N> | null {
  const dataWeight = names.reduce((sum, name) => sum + (scores[name] === null ? 0 : weights[name]), 0);
  if (dataWeight <= 0) return null;
  const raw = {} as Record<N, number>;
  let total = 0;
  for (const name of names) {
    raw[name] = scores[name] === null ? weights[name] * missingFactor : weights[name];
    total += raw[name];
  }
  const effective = {} as Record<N, number>;
  let score = 0;
  for (const name of names) {
    effective[name] = raw[name] / total;
    score += effective[name] * ranks[name];
  }
  return { score, weights: effective };
}
