export type StatKey =
  | 'hp'
  | 'str'
  | 'mag'
  | 'spd'
  | 'dex'
  | 'def'
  | 'res'
  | 'lck'
  | 'cha';

export const STAT_KEYS = [
  'hp',
  'str',
  'mag',
  'spd',
  'dex',
  'def',
  'res',
  'lck',
  'cha',
] as const satisfies readonly StatKey[];

export const STAT_LABELS: Record<StatKey, string> = {
  hp: 'HP',
  str: 'Str',
  mag: 'Mag',
  spd: 'Spd',
  dex: 'Dex',
  def: 'Def',
  res: 'Res',
  lck: 'Lck',
  cha: 'Cha',
};

export type GrowthRates = Record<StatKey, number>;

export type ClassRank =
  | 'Base'
  | 'Beginner'
  | 'Speciality'
  | 'Advanced'
  | 'Master'
  | 'Divine';

export const CLASS_RANK_ORDER: readonly ClassRank[] = [
  'Base',
  'Beginner',
  'Speciality',
  'Advanced',
  'Master',
  'Divine',
];

export type MountType =
  | 'None'
  | 'Ornius'
  | 'Horse'
  | 'Pegasus'
  | 'Bau'
  | 'Elephant';

export const MOUNT_TYPE_ORDER: readonly MountType[] = [
  'Ornius',
  'Horse',
  'Pegasus',
  'Bau',
  'Elephant',
];

export interface Unit extends GrowthRates {
  id: number;
  name: string;
  total: number;
}

export interface UnitClass extends GrowthRates {
  id: number;
  name: string;
  rank: ClassRank;
  total: number;
}

export interface Mount extends GrowthRates {
  id: number;
  name: string;
  type: MountType;
  total: number;
}

/** A unit + class + mount selection and the growth rows it produces. */
export interface GrowthBuild {
  unit: Unit | null;
  unitClass: UnitClass | null;
  mount: Mount | null;
  mountType: MountType;
  unitGrowth: GrowthRates;
  classGrowth: GrowthRates;
  mountGrowth: GrowthRates;
  total: GrowthRates;
}

export const ZERO_GROWTH: GrowthRates = {
  hp: 0,
  str: 0,
  mag: 0,
  spd: 0,
  dex: 0,
  def: 0,
  res: 0,
  lck: 0,
  cha: 0,
};

export function toGrowth(source: GrowthRates | null | undefined): GrowthRates {
  if (!source) {
    return { ...ZERO_GROWTH };
  }

  const result = { ...ZERO_GROWTH };
  for (const key of STAT_KEYS) {
    result[key] = source[key] ?? 0;
  }

  return result;
}

export function sumGrowth(...parts: readonly GrowthRates[]): GrowthRates {
  const result = { ...ZERO_GROWTH };
  for (const part of parts) {
    for (const key of STAT_KEYS) {
      result[key] += part[key];
    }
  }

  return result;
}

export function diffGrowth(left: GrowthRates, right: GrowthRates): GrowthRates {
  const result = { ...ZERO_GROWTH };
  for (const key of STAT_KEYS) {
    result[key] = left[key] - right[key];
  }

  return result;
}

export function growthTotal(growth: GrowthRates): number {
  return STAT_KEYS.reduce((sum, key) => sum + growth[key], 0);
}
