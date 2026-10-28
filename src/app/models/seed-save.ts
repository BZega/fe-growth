import { DEFAULT_MOUNT_BOND_LEVEL, GrowthRates, STAT_KEYS, StatKey, ZERO_GROWTH } from './growth.models';

export type StatValues = Record<StatKey, number | null>;

export const EMPTY_STATS: StatValues = {
  hp: null,
  str: null,
  mag: null,
  spd: null,
  dex: null,
  def: null,
  res: null,
  lck: null,
  cha: null,
};

export interface ComparatorSnapshot {
  classId: number | null;
  mountId: number | null;
  mountLevel: number;
  rows: GrowthRates[];
}

export interface ExamSnapshot {
  parentIndex: number;
  afterRowIndex: number | null;
  classId: number | null;
  chance: number;
  passed: boolean;
}

export interface SectionSnapshot {
  exam: ExamSnapshot | null;
  classId: number | null;
  mountId: number | null;
  mountLevel: number;
  rows: GrowthRates[];
  comparators: ComparatorSnapshot[];
}

export interface SeedMapSnapshot {
  unitId: number | null;
  statsLevel: number | null;
  startStats: StatValues;
  availableClassIds: number[];
  sections: SectionSnapshot[];
}

export interface ComparatorDto {
  unitClass: string | null;
  mount: string | null;
  mountLevel: number;
  rows: GrowthRates[];
}

export interface ExamDto {
  parent: number;
  afterRow: number | null;
  unitClass: string | null;
  chance: number;
  passed: boolean;
}

export interface SectionDto {
  exam: ExamDto | null;
  unitClass: string | null;
  mount: string | null;
  mountLevel: number;
  rows: GrowthRates[];
  comparators: ComparatorDto[];
}

export interface SeedMapDto {
  unit: string | null;
  statsLevel: number | null;
  startStats: StatValues;
  availableClasses: string[];
  sections: SectionDto[];
}

export interface SeedSaveV2 {
  version: 2;
  id: string;
  name: string;
  savedAt: string;
  seed: SeedMapDto;
}

export type SeedSave = SeedSaveV2;

export const CURRENT_SAVE_VERSION = 2;

export class IncompatibleSaveError extends Error {}

/** Units renamed since saves were written; old names load as the new unit. */
const RENAMED_UNITS: Readonly<Record<string, string>> = {
  Eshmel: 'Eshmel (M)',
};

function readUnitName(value: unknown): string | null {
  const name = readName(value);

  return name === null ? null : (RENAMED_UNITS[name] ?? name);
}

export function newSaveId(): string {
  return crypto.randomUUID();
}

export function migrateSave(raw: unknown): SeedSave {
  if (!isRecord(raw)) {
    return fail('the file is not a JSON object');
  }

  const header = {
    version: CURRENT_SAVE_VERSION,
    id: typeof raw['id'] === 'string' ? raw['id'] : newSaveId(),
    name: typeof raw['name'] === 'string' ? raw['name'] : 'Imported save',
    savedAt:
      typeof raw['savedAt'] === 'string'
        ? raw['savedAt']
        : new Date().toISOString(),
  } as const;

  if (raw['version'] === 1) {
    return { ...header, seed: fromVersion1(raw['seeds']) };
  }

  if (raw['version'] !== CURRENT_SAVE_VERSION) {
    return fail(`unsupported save version "${String(raw['version'])}"`);
  }

  return { ...header, seed: readSeedMap(raw['seed']) };
}

function fromVersion1(seeds: unknown): SeedMapDto {
  if (!Array.isArray(seeds) || seeds.length === 0) {
    return fail('it contains no seeds');
  }

  if (seeds.length > 1) {
    throw new IncompatibleSaveError(
      'This save uses the old multi-seed format, which the Seed Mapper no longer supports.',
    );
  }

  const seed = isRecord(seeds[0]) ? seeds[0] : {};

  return {
    unit: readUnitName(seed['unit']),
    statsLevel: fromFirstRowLevel(seed['startLevel']),
    startStats: { ...EMPTY_STATS },
    availableClasses: [],
    sections: [
      {
        exam: null,
        unitClass: readName(seed['unitClass']),
        mount: readName(seed['mount']),
        mountLevel: readMountLevel(seed['mountLevel']),
        rows: readRows(seed['rows']),
        comparators: readComparators(seed['comparators']),
      },
    ],
  };
}

function readSeedMap(raw: unknown): SeedMapDto {
  if (!isRecord(raw)) {
    return fail('it contains no seed');
  }

  const rawSections = raw['sections'];

  if (!Array.isArray(rawSections) || rawSections.length === 0) {
    return fail('the seed has no sections');
  }

  const sections: SectionDto[] = [];

  rawSections.forEach((entry, index) => {
    const section = isRecord(entry) ? entry : {};
    const exam = index === 0 ? null : readExam(section['exam'], sections);

    if (index > 0 && exam === null) {
      fail(`section ${index + 1} is missing its exam`);
    }

    sections.push({
      exam,
      unitClass: readName(section['unitClass']),
      mount: readName(section['mount']),
      mountLevel: readMountLevel(section['mountLevel']),
      rows: readRows(section['rows']),
      comparators: readComparators(section['comparators']),
    });
  });

  const availableClasses = raw['availableClasses'];

  return {
    unit: readUnitName(raw['unit']),
    statsLevel:
      'statsLevel' in raw
        ? readLevel(raw['statsLevel'])
        : fromFirstRowLevel(raw['startLevel']),
    startStats: readStats(raw['startStats']),
    availableClasses: Array.isArray(availableClasses)
      ? availableClasses.flatMap((name) => {
          const read = readName(name);
          return read === null ? [] : [read];
        })
      : [],
    sections,
  };
}

function fromFirstRowLevel(value: unknown): number | null {
  const level = readLevel(value);

  return level === null ? null : Math.max(1, level - 1);
}

function readStats(raw: unknown): StatValues {
  const stats = isRecord(raw) ? raw : {};
  const result = { ...EMPTY_STATS };

  for (const key of STAT_KEYS) {
    const value = stats[key];

    result[key] =
      typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
  }

  return result;
}

function readExam(raw: unknown, earlier: readonly SectionDto[]): ExamDto | null {
  if (!isRecord(raw)) {
    return null;
  }

  const parent = raw['parent'];
  const afterRow = raw['afterRow'];
  const chance = raw['chance'];
  const parentSection =
    typeof parent === 'number' && Number.isInteger(parent) ? earlier[parent] : undefined;

  if (!parentSection) {
    return fail('an exam points at a section that does not exist');
  }

  const validRow =
    afterRow === null ||
    (typeof afterRow === 'number' &&
      Number.isInteger(afterRow) &&
      afterRow >= 0 &&
      afterRow < parentSection.rows.length);

  if (!validRow) {
    return fail('an exam points at a level that does not exist');
  }

  if (typeof chance !== 'number' || !Number.isFinite(chance) || chance < 0 || chance > 100) {
    return fail('an exam has an invalid chance');
  }

  if (typeof raw['passed'] !== 'boolean') {
    return fail('an exam is missing its result');
  }

  return {
    parent: parent as number,
    afterRow: afterRow as number | null,
    unitClass: readName(raw['unitClass']),
    chance,
    passed: raw['passed'],
  };
}

function readComparators(raw: unknown): ComparatorDto[] {
  return Array.isArray(raw) ? raw.map(readComparator) : [];
}

function readComparator(raw: unknown): ComparatorDto {
  const comparator = isRecord(raw) ? raw : {};

  return {
    unitClass: readName(comparator['unitClass']),
    mount: readName(comparator['mount']),
    mountLevel: readMountLevel(comparator['mountLevel']),
    rows: readRows(comparator['rows']),
  };
}

function readMountLevel(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? value
    : DEFAULT_MOUNT_BOND_LEVEL;
}

function readRows(raw: unknown): GrowthRates[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ ...ZERO_GROWTH }];
  }

  return raw.map(readMarks);
}

function readMarks(raw: unknown): GrowthRates {
  const marks = isRecord(raw) ? raw : {};
  const result = { ...ZERO_GROWTH };

  for (const key of STAT_KEYS) {
    result[key] = marks[key] === 1 ? 1 : 0;
  }

  return result;
}

function readName(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readLevel(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function fail(reason: string): never {
  throw new Error(`This does not look like a Seed Mapper save — ${reason}.`);
}
