import { useEffect, useState } from 'react';
import { NATURES, type NatureName } from '../../domain/natures';
import { MAX_STAT_POINT, MAX_TOTAL_STAT_POINTS, STAT_NAMES, type StatPoints as Points } from '../../domain/set';
import type { Stats } from '../../domain/stats';
import type { StatName } from '../../domain/types';
import { STAT_LABELS } from './options';

interface Props {
  points: Points | undefined;
  nature: NatureName | undefined;
  /** Level-50 stats for the current set, or null when they cannot be computed. */
  stats: Stats | null;
  onChange(points: Points): void;
}

const ZERO: Points = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

/**
 * Six stat-point inputs with the points left and the resulting level-50 stats. A value that is not a whole
 * number, is over 32, or would take the total over 66 stays in its box with the allowed range as a hint and is
 * not saved: the draft file never holds a set over the limit.
 */
export function StatPoints({ points, nature, stats, onChange }: Props) {
  const [drafts, setDrafts] = useState<Partial<Record<StatName, string>>>({});
  // A rejected entry is only kept until the saved points change (another stat, the common set, a paste).
  useEffect(() => setDrafts({}), [points]);
  const current = points ?? ZERO;
  const total = STAT_NAMES.reduce((sum, stat) => sum + current[stat], 0);
  const left = Math.max(MAX_TOTAL_STAT_POINTS - total, 0);
  const effect = nature ? NATURES[nature] : null;

  return (
    <fieldset className="stat-points">
      <legend>Stat points</legend>
      <p className="points-left">
        {left} of {MAX_TOTAL_STAT_POINTS} points left
      </p>
      {STAT_NAMES.map((stat) => {
        const draft = drafts[stat];
        const max = Math.min(MAX_STAT_POINT, current[stat] + left);
        const arrow = effect?.plus === stat ? ' ↑' : effect?.minus === stat ? ' ↓' : '';
        return (
          <div className="stat-row" key={stat}>
            <label htmlFor={`points-${stat}`}>{STAT_LABELS[stat]} points</label>
            <input
              id={`points-${stat}`}
              type="number"
              min={0}
              max={max}
              step={1}
              value={draft ?? String(current[stat])}
              onChange={(event) => {
                const text = event.target.value;
                const value = Number(text);
                if (/^[0-9]+$/.test(text.trim()) && value <= max) {
                  setDrafts(({ [stat]: _dropped, ...rest }) => rest);
                  onChange({ ...current, [stat]: value });
                } else {
                  setDrafts((before) => ({ ...before, [stat]: text }));
                }
              }}
            />
            <span className="stat-value">{stats === null ? '' : `${stats[stat]}${arrow}`}</span>
            {draft !== undefined && <span className="field-error">
                0 to {max} (saved: {current[stat]})
              </span>}
          </div>
        );
      })}
    </fieldset>
  );
}
