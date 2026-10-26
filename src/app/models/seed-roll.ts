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

export interface RollBounds {
  lower: number | null;
  upper: number | null;
}

export function rollBounds(observations: readonly RollObservation[]): RollBounds {
  let upper: number | null = null;
  let lower: number | null = null;

  for (const { growth, hit } of observations) {
    if (hit) {
      upper = upper === null ? growth : Math.min(upper, growth);
    } else {
      lower = lower === null ? growth : Math.max(lower, growth);
    }
  }

  return { lower, upper };
}

export function knownOutcome(bounds: RollBounds, chance: number): boolean | null {
  const { lower, upper } = bounds;

  if (lower !== null && upper !== null && lower >= upper) {
    return null;
  }

  if (upper !== null && upper <= chance) {
    return true;
  }

  if (lower !== null && lower >= chance) {
    return false;
  }

  return null;
}

export function describeBounds({ lower, upper }: RollBounds): string | null {
  if (upper === null) {
    return lower === null ? null : `above ${lower}%`;
  }

  if (lower === null) {
    return `${upper}% or lower`;
  }

  return lower + 1 === upper ? `exactly ${upper}%` : `${lower + 1}–${upper}%`;
}

export function estimateRoll(
  observations: readonly RollObservation[],
): RollEstimate {
  const { lower, upper } = rollBounds(observations);

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
