import { GrowthRates, STAT_KEYS, ZERO_GROWTH } from './growth.models';

export interface ComparatorSnapshot {
  classId: number | null;
  mountId: number | null;
  rows: GrowthRates[];
}

export interface SeedSnapshot {
  unitId: number | null;
  classId: number | null;
  mountId: number | null;
  startLevel: number | null;
  rows: GrowthRates[];
  comparators: ComparatorSnapshot[];
}

export interface ComparatorDto {
  unitClass: string | null;
  mount: string | null;
  rows: GrowthRates[];
}

export interface SeedDto {
  unit: string | null;
  unitClass: string | null;
  mount: string | null;
  startLevel: number | null;
  rows: GrowthRates[];
  comparators: ComparatorDto[];
}

export interface SeedSaveV1 {
  version: 1;
  id: string;
  name: string;
  savedAt: string;
  seeds: SeedDto[];
}

export type SeedSave = SeedSaveV1;

export const CURRENT_SAVE_VERSION = 1;

export function newSaveId(): string {
  return crypto.randomUUID();
}

export function migrateSave(raw: unknown): SeedSave {
  if (!isRecord(raw)) {
    return fail('the file is not a JSON object');
  }

  if (raw['version'] !== CURRENT_SAVE_VERSION) {
    return fail(`unsupported save version "${String(raw['version'])}"`);
  }

  const seeds = raw['seeds'];

  if (!Array.isArray(seeds) || seeds.length === 0) {
    return fail('it contains no seeds');
  }

  return {
    version: CURRENT_SAVE_VERSION,
    id: typeof raw['id'] === 'string' ? raw['id'] : newSaveId(),
    name: typeof raw['name'] === 'string' ? raw['name'] : 'Imported save',
    savedAt:
      typeof raw['savedAt'] === 'string'
        ? raw['savedAt']
        : new Date().toISOString(),
    seeds: seeds.map(readSeed),
  };
}

function readSeed(raw: unknown): SeedDto {
  const seed = isRecord(raw) ? raw : {};
  const comparators = seed['comparators'];

  return {
    unit: readName(seed['unit']),
    unitClass: readName(seed['unitClass']),
    mount: readName(seed['mount']),
    startLevel: readLevel(seed['startLevel']),
    rows: readRows(seed['rows']),
    comparators: Array.isArray(comparators)
      ? comparators.map(readComparator)
      : [],
  };
}

function readComparator(raw: unknown): ComparatorDto {
  const comparator = isRecord(raw) ? raw : {};

  return {
    unitClass: readName(comparator['unitClass']),
    mount: readName(comparator['mount']),
    rows: readRows(comparator['rows']),
  };
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
