export type RollState =
  | 'none'
  | 'below'
  | 'above'
  | 'range'
  | 'exact'
  | 'conflict';

export interface RollEstimate {
  state: RollState;
  text: string;
}

export interface RollObservation {
  growth: number;
  hit: boolean;
}

export function estimateRoll(
  observations: readonly RollObservation[],
): RollEstimate {
  let upper: number | null = null;
  let lower: number | null = null;

  for (const { growth, hit } of observations) {
    if (hit) {
      upper = upper === null ? growth : Math.min(upper, growth);
    } else {
      lower = lower === null ? growth : Math.max(lower, growth);
    }
  }

  if (upper === null) {
    return lower === null
      ? { state: 'none', text: '—' }
      : { state: 'above', text: `>${lower}%` };
  }

  if (lower === null) {
    return { state: 'below', text: `≤${upper}%` };
  }

  if (lower >= upper) {
    return { state: 'conflict', text: 'x' };
  }

  return lower + 1 === upper
    ? { state: 'exact', text: `${upper}%` }
    : { state: 'range', text: `${lower + 1}-${upper}%` };
}
