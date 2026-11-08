import {
  CLASS_LEVEL_CONFIGS,
  ClassLevelConfig,
  GrowthRates,
  Mount,
  mountGrowthAt,
  MountType,
  scaleGrowth,
  SkillKey,
  STAT_KEYS,
  sumGrowth,
  toGrowth,
  Unit,
  UnitClass,
} from './growth.models';

// --- how a unit's recruitment file looks (src/app/data/recruitment/*.json) -----

export interface RawAbility {
  Name: string;
  Description: string;
}

export interface RawRecruitment {
  UnitId: string;
  PersonalAbility: RawAbility | null;
  Bloodmark: RawAbility | null;
  LevelUpPersonalAbilities: (RawAbility & { LevelAcquired: number })[] | null;
  Paths: RawPath[];
}

export interface RawPath {
  Path: string;
  IsRecruitable: boolean;
  Requirement: { SupportLv: number; RenownLv: number; RecruitmentNegotiation: string } | null;
  Chapters: RawChapter[];
}

export interface RawChapter {
  Chapter: number;
  Level: number;
  ClassName: string;
  SkillRanks: Record<string, string> | null;
  Inventory: Record<string, Record<string, unknown>[] | null> | null;
  Stats: Record<string, number> | null;
  EquippedAbilities: RawAbility[] | null;
}

// --- what the character page works with ---------------------------------------

export interface Ability {
  name: string;
  description: string;
}

export interface LevelUpAbility extends Ability {
  level: number;
}

export interface RouteRequirement {
  supportLevel: number;
  renownLevel: number;
  negotiation: string;
}

export interface InventoryEntry {
  name: string;
  description: string;
  /** Column label to value; an empty string means the stat doesn't apply. */
  values: Readonly<Record<string, string>>;
}

export interface InventoryGroup {
  label: string;
  /** Only the columns at least one entry has a value for. */
  columns: readonly string[];
  entries: readonly InventoryEntry[];
}

export interface RecruitmentChapter {
  chapter: number;
  level: number;
  className: string;
  skillRanks: Readonly<Partial<Record<SkillKey, string>>>;
  /** Stats as listed in the file; Mov and Bld are worked out separately. */
  stats: GrowthRates;
  inventory: readonly InventoryGroup[];
  equippedAbilities: readonly Ability[];
}

export interface RecruitmentRoute {
  key: string;
  label: string;
  recruitable: boolean;
  requirement: RouteRequirement | null;
  chapters: readonly RecruitmentChapter[];
}

export interface UnitRecruitment {
  unitName: string;
  personalAbility: Ability | null;
  bloodmark: Ability | null;
  levelUpAbilities: readonly LevelUpAbility[];
  routes: readonly RecruitmentRoute[];
}

// --- rules for the numbers the files don't give directly -------------------------

export const BASE_MOVE = 4;

export function buildFromStrength(strength: number): number {
  return Math.max(1, Math.floor(strength / 5));
}

/** Units who always ride their own mount, at this bond level, when their class has that mount type. */
export const SIGNATURE_MOUNTS: Readonly<Record<string, { mount: string; bondLevel: number }>> = {
  Alexandra: { mount: 'Bucephalus', bondLevel: 3 },
  Io: { mount: 'Rocinan', bondLevel: 3 },
};

export interface ChapterGrowth {
  growth: GrowthRates;
  /** The signature mount counted in, if any. */
  mount: { name: string; bondLevel: number } | null;
}

export function chapterGrowth(
  unit: Unit,
  unitClass: UnitClass,
  classMountType: MountType,
  mounts: readonly Mount[],
): ChapterGrowth {
  const config = CLASS_LEVEL_CONFIGS[unitClass.name] ?? null;
  const levelBonus = toGrowth(config ? config.bonuses[config.defaultLevel] : null);
  const signature = SIGNATURE_MOUNTS[unit.name] ?? null;
  const mount = signature
    ? (mounts.find((candidate) => candidate.name === signature.mount && candidate.type === classMountType) ?? null)
    : null;
  const mountGrowth = mount && signature
    ? scaleGrowth(mountGrowthAt(mount, signature.bondLevel), config?.mountMultiplier ?? 1)
    : toGrowth(null);

  return {
    growth: sumGrowth(toGrowth(unit), toGrowth(unitClass), levelBonus, mountGrowth),
    mount: mount && signature ? { name: mount.name, bondLevel: signature.bondLevel } : null,
  };
}

export function routeLabel(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2');
}

// --- stat projection ------------------------------------------------------------

export interface ClassStep {
  fromLevel: number;
  classId: number;
}

export function classAtLevel(steps: readonly ClassStep[], level: number): number | null {
  return stepAtLevel(steps, level)?.classId ?? null;
}

export function stepAtLevel<T extends { fromLevel: number }>(steps: readonly T[], level: number): T | null {
  let found: T | null = null;

  for (const step of steps) {
    if (step.fromLevel <= level && (found === null || step.fromLevel >= found.fromLevel)) {
      found = step;
    }
  }

  return found;
}

export function classLevelGate(config: ClassLevelConfig, unitLevel: number): number {
  return [...config.levels].sort((a, b) => a - b).filter((gate) => gate <= unitLevel).at(-1) ?? config.levels[0];
}

export function levelUpGrowth(
  unit: Unit,
  unitClass: UnitClass,
  unitLevel: number,
  mount: Mount | null,
  bondLevel: number | null,
): GrowthRates {
  const config = CLASS_LEVEL_CONFIGS[unitClass.name] ?? null;
  const levelBonus = toGrowth(config ? config.bonuses[classLevelGate(config, unitLevel)] : null);
  const mountGrowth = mount
    ? scaleGrowth(mountGrowthAt(mount, bondLevel), config?.mountMultiplier ?? 1)
    : toGrowth(null);

  return sumGrowth(toGrowth(unit), toGrowth(unitClass), levelBonus, mountGrowth);
}

export function projectStats(
  start: GrowthRates,
  startLevel: number,
  endLevel: number,
  growthAt: (level: number) => GrowthRates | null,
): GrowthRates {
  const result = { ...start };

  for (let level = startLevel; level < endLevel; level++) {
    const growth = growthAt(level);

    if (growth) {
      for (const stat of STAT_KEYS) {
        result[stat] += growth[stat] / 100;
      }
    }
  }

  return result;
}
