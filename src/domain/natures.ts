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

const NEUTRAL: Nature = { plus: null, minus: null };

export const NATURES: Record<NatureName, Nature> = {
  Adamant: { plus: 'atk', minus: 'spa' },
  Bashful: NEUTRAL,
  Bold: { plus: 'def', minus: 'atk' },
  Brave: { plus: 'atk', minus: 'spe' },
  Calm: { plus: 'spd', minus: 'atk' },
  Careful: { plus: 'spd', minus: 'spa' },
  Docile: NEUTRAL,
  Gentle: { plus: 'spd', minus: 'def' },
  Hardy: NEUTRAL,
  Hasty: { plus: 'spe', minus: 'def' },
  Impish: { plus: 'def', minus: 'spa' },
  Jolly: { plus: 'spe', minus: 'spa' },
  Lax: { plus: 'def', minus: 'spd' },
  Lonely: { plus: 'atk', minus: 'def' },
  Mild: { plus: 'spa', minus: 'def' },
  Modest: { plus: 'spa', minus: 'atk' },
  Naive: { plus: 'spe', minus: 'spd' },
  Naughty: { plus: 'atk', minus: 'spd' },
  Quiet: { plus: 'spa', minus: 'spe' },
  Quirky: NEUTRAL,
  Rash: { plus: 'spa', minus: 'spd' },
  Relaxed: { plus: 'def', minus: 'spe' },
  Sassy: { plus: 'spd', minus: 'spe' },
  Serious: NEUTRAL,
  Timid: { plus: 'spe', minus: 'atk' },
};

export const NATURE_NAMES = Object.keys(NATURES) as NatureName[];

export function isNatureName(value: unknown): value is NatureName {
  return typeof value === 'string' && Object.hasOwn(NATURES, value);
}
