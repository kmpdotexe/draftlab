import type { StatName } from './types';

export type NatureName =
  | 'Adamant' | 'Bashful' | 'Bold' | 'Brave' | 'Calm'
  | 'Careful' | 'Docile' | 'Gentle' | 'Hardy' | 'Hasty'
  | 'Impish' | 'Jolly' | 'Lax' | 'Lonely' | 'Mild'
  | 'Modest' | 'Naive' | 'Naughty' | 'Quiet' | 'Quirky'
  | 'Rash' | 'Relaxed' | 'Sassy' | 'Serious' | 'Timid';

type NonHpStat = Exclude<StatName, 'hp'>;

export interface Nature {
  plus: NonHpStat | null;
  minus: NonHpStat | null;
}

const n = (plus: NonHpStat | null, minus: NonHpStat | null): Nature => Object.freeze({ plus, minus });

const NEUTRAL: Nature = n(null, null);

export const NATURES: Record<NatureName, Nature> = Object.freeze({
  Adamant: n('atk', 'spa'),
  Bashful: NEUTRAL,
  Bold: n('def', 'atk'),
  Brave: n('atk', 'spe'),
  Calm: n('spd', 'atk'),
  Careful: n('spd', 'spa'),
  Docile: NEUTRAL,
  Gentle: n('spd', 'def'),
  Hardy: NEUTRAL,
  Hasty: n('spe', 'def'),
  Impish: n('def', 'spa'),
  Jolly: n('spe', 'spa'),
  Lax: n('def', 'spd'),
  Lonely: n('atk', 'def'),
  Mild: n('spa', 'def'),
  Modest: n('spa', 'atk'),
  Naive: n('spe', 'spd'),
  Naughty: n('atk', 'spd'),
  Quiet: n('spa', 'spe'),
  Quirky: NEUTRAL,
  Rash: n('spa', 'spd'),
  Relaxed: n('def', 'spe'),
  Sassy: n('spd', 'spe'),
  Serious: NEUTRAL,
  Timid: n('spe', 'atk'),
});

export const NATURE_NAMES = Object.keys(NATURES) as NatureName[];

export function isNatureName(value: unknown): value is NatureName {
  return typeof value === 'string' && Object.hasOwn(NATURES, value);
}
