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

export type Gender = 'Male' | 'Female';

/** Classes only female units may take. */
export const FEMALE_ONLY_CLASS_NAMES: ReadonlySet<string> = new Set([
  'Winged Soldier',
  'Celestial Trooper',
]);

export interface Unit extends GrowthRates {
  id: number;
  name: string;
  gender: Gender;
  /** False for units that cannot take any mounted class. */
  canUseMounts: boolean;
  total: number;
}

export interface UnitClass extends GrowthRates {
  id: number;
  name: string;
  rank: ClassRank;
  description: string;
  bonusStats: StatBonuses;
  skills: Record<SkillKey, boolean>;
  skillExpBonus: Record<SkillKey, number>;
  classAbilities: number[];
  masterAbilities: number[];
  total: number;
}

export type BonusStatKey = StatKey | 'mov';

export type StatBonuses = Record<BonusStatKey, number>;

export const BONUS_STAT_KEYS = [...STAT_KEYS, 'mov'] as const satisfies readonly BonusStatKey[];

export const BONUS_STAT_LABELS: Record<BonusStatKey, string> = {
  ...STAT_LABELS,
  mov: 'Mov',
};

export type SkillKey =
  | 'sword'
  | 'spear'
  | 'axe'
  | 'bow'
  | 'gauntlet'
  | 'blackMagic'
  | 'whiteMagic'
  | 'authority'
  | 'infantry'
  | 'riding'
  | 'heavyArmor'
  | 'flying';

export const SKILL_KEYS = [
  'sword',
  'spear',
  'axe',
  'bow',
  'gauntlet',
  'blackMagic',
  'whiteMagic',
  'authority',
  'infantry',
  'riding',
  'heavyArmor',
  'flying',
] as const satisfies readonly SkillKey[];

export const SKILL_LABELS: Record<SkillKey, string> = {
  sword: 'Sword',
  spear: 'Spear',
  axe: 'Axe',
  bow: 'Bow',
  gauntlet: 'Gauntlet',
  blackMagic: 'Black Magic',
  whiteMagic: 'White Magic',
  authority: 'Authority',
  infantry: 'Infantry',
  riding: 'Riding',
  heavyArmor: 'Heavy Armor',
  flying: 'Flying',
};

export interface ClassAbility {
  id: number;
  name: string;
  description: string;
  isCombatArt: boolean;
}

export interface Mount extends GrowthRates {
  id: number;
  name: string;
  type: MountType;
  total: number;
}

export interface ClassLevelConfig {
  levels: readonly number[];
  defaultLevel: number;
  /** Bonuses added to base class growths per level; levels do not stack. */
  bonuses: Readonly<Record<number, Partial<GrowthRates>>>;
  mountMultiplier: number;
}

export const CLASS_LEVEL_CONFIGS: Readonly<Record<string, ClassLevelConfig>> = {
  'Elephant Rider': {
    levels: [35, 45],
    defaultLevel: 35,
    bonuses: { 
      45: {hp: 10, str: 10, dex: 10, def: 10, res: 10}
    },
    mountMultiplier: 1,
  },
  Charioteer: {
    levels: [20, 35, 45],
    defaultLevel: 20,
    bonuses: {
      35: { hp: 10, str: 5, mag: 5, spd: 5, dex: 5, def: 10, cha: 5 },
      45: { hp: 10, str: 15, mag: 5, spd: 5, dex: 10, def: 20, res: 5, lck: 5, cha: 10 },
    },
    mountMultiplier: 2,
  },
};

/** A unit + class + mount selection and the growth rows it produces. */
export interface GrowthBuild {
  unit: Unit | null;
  unitClass: UnitClass | null;
  classLevel: number | null;
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

export function toGrowth(source: Partial<GrowthRates> | null | undefined): GrowthRates {
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

export function scaleGrowth(growth: GrowthRates, factor: number): GrowthRates {
  const result = { ...ZERO_GROWTH };
  for (const key of STAT_KEYS) {
    result[key] = growth[key] * factor;
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
