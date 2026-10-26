import { inject, Injectable, signal } from '@angular/core';

import { GrowthRates, StatKey, ZERO_GROWTH } from '../models/growth.models';
import { EMPTY_STATS, SeedMapSnapshot, StatValues } from '../models/seed-save';
import { GrowthDataService } from './growth-data.service';

export interface SeedRow {
  id: number;
  marks: GrowthRates;
}

export interface SeedComparator {
  id: number;
  classId: number | null;
  mountId: number | null;
  rows: SeedRow[];
}

export interface SeedExam {
  parentId: number;
  afterRowId: number | null;
  classId: number | null;
  chance: number;
  passed: boolean;
}

export interface SeedSection {
  id: number;
  exam: SeedExam | null;
  classId: number | null;
  mountId: number | null;
  rows: SeedRow[];
  comparators: SeedComparator[];
}

export interface SeedMap {
  unitId: number | null;
  statsLevel: number;
  startStats: StatValues;
  availableClassIds: number[];
  sections: SeedSection[];
}

export interface ExamDraft {
  classId: number;
  chance: number;
  passed: boolean;
}

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 99;
export const ALWAYS_AVAILABLE_CLASS = 'Noble/Commoner';

export function effectiveClassId(
  sections: readonly SeedSection[],
  section: SeedSection,
): number | null {
  let current: SeedSection | undefined = section;

  while (current?.exam && !current.exam.passed) {
    const parentId: number = current.exam.parentId;
    current = sections.find((candidate) => candidate.id === parentId);
  }

  if (!current) {
    return null;
  }

  return current.exam ? current.exam.classId : current.classId;
}

export function availableClassIds(
  map: SeedMap,
  section: SeedSection,
  always: readonly number[],
): Set<number> {
  const available = new Set<number>([...always, ...map.availableClassIds]);
  let current: SeedSection | undefined = section;

  while (current?.exam) {
    const exam: SeedExam = current.exam;

    if (exam.passed && exam.classId !== null) {
      available.add(exam.classId);
    }

    current = map.sections.find((candidate) => candidate.id === exam.parentId);
  }

  return available;
}

@Injectable({ providedIn: 'root' })
export class SeedMapperStateService {
  private nextSectionId = 1;
  private nextRowId = 1;
  private nextComparatorId = 1;

  private readonly api = inject(GrowthDataService);

  private alwaysAvailable: number[] = [];

  private readonly mapState = signal<SeedMap>(this.createMap());
  private readonly changes = signal(0);
  private readonly activeSave = signal<{ id: string; name: string } | null>(null);

  readonly seedMap = this.mapState.asReadonly();
  readonly changeCount = this.changes.asReadonly();
  readonly loadedSave = this.activeSave.asReadonly();

  constructor() {
    this.api
      .getClasses()
      .subscribe((classes) => {
        this.alwaysAvailable = classes
          .filter((unitClass) => unitClass.name === ALWAYS_AVAILABLE_CLASS)
          .map((unitClass) => unitClass.id);
        this.mapState.update((map) => fillDefaultClass(map, this.alwaysAvailable));
      });
  }

  get alwaysAvailableClassIds(): readonly number[] {
    return this.alwaysAvailable;
  }

  snapshot(): SeedMapSnapshot {
    const map = this.mapState();
    const indexOf = new Map(map.sections.map((section, index) => [section.id, index]));

    return {
      unitId: map.unitId,
      statsLevel: map.statsLevel,
      startStats: { ...map.startStats },
      availableClassIds: [...map.availableClassIds],
      sections: map.sections.map((section) => {
        const exam = section.exam;
        const parent = exam
          ? map.sections.find((candidate) => candidate.id === exam.parentId)
          : undefined;

        return {
          exam:
            exam && parent
              ? {
                  parentIndex: indexOf.get(parent.id) ?? 0,
                  afterRowIndex:
                    exam.afterRowId === null
                      ? null
                      : parent.rows.findIndex((row) => row.id === exam.afterRowId),
                  classId: exam.classId,
                  chance: exam.chance,
                  passed: exam.passed,
                }
              : null,
          classId: section.classId,
          mountId: section.mountId,
          rows: section.rows.map((row) => ({ ...row.marks })),
          comparators: section.comparators.map((comparator) => ({
            classId: comparator.classId,
            mountId: comparator.mountId,
            rows: comparator.rows.map((row) => ({ ...row.marks })),
          })),
        };
      }),
    };
  }

  restore(snapshot: SeedMapSnapshot, save: { id: string; name: string } | null): void {
    const sections: SeedSection[] = [];

    for (const entry of snapshot.sections) {
      const rows = entry.rows.map((marks) => ({
        id: this.nextRowId++,
        marks: { ...marks },
      }));
      const parent = entry.exam ? sections[entry.exam.parentIndex] : undefined;

      sections.push({
        id: this.nextSectionId++,
        exam:
          entry.exam && parent
            ? {
                parentId: parent.id,
                afterRowId:
                  entry.exam.afterRowIndex === null
                    ? null
                    : (parent.rows[entry.exam.afterRowIndex]?.id ?? null),
                classId: entry.exam.classId,
                chance: entry.exam.chance,
                passed: entry.exam.passed,
              }
            : null,
        classId: entry.classId,
        mountId: entry.mountId,
        rows,
        comparators: entry.comparators.map((comparator) => ({
          id: this.nextComparatorId++,
          classId: comparator.classId,
          mountId: comparator.mountId,
          rows: rows.map((row, index) => ({
            id: row.id,
            marks: { ...(comparator.rows[index] ?? ZERO_GROWTH) },
          })),
        })),
      });
    }

    const restored: SeedMap = {
      unitId: snapshot.unitId,
      statsLevel: snapshot.statsLevel ?? MIN_LEVEL,
      startStats: { ...snapshot.startStats },
      availableClassIds: [...snapshot.availableClassIds],
      sections,
    };

    this.mapState.set(
      sections.length > 0
        ? fillDefaultClass(this.includeUsedClasses(restored), this.alwaysAvailable)
        : this.createMap(),
    );
    this.activeSave.set(save);
    this.changes.set(0);
  }

  markSaved(save: { id: string; name: string }): void {
    this.activeSave.set(save);
    this.changes.set(0);
  }

  reset(): void {
    this.mapState.set(this.createMap());
    this.activeSave.set(null);
    this.changes.set(0);
  }

  forgetSave(): void {
    this.activeSave.set(null);
  }

  setUnit(unitId: number | null): void {
    const unit = this.api.unitById(unitId);
    const usable = new Set(this.api.classesForUnit(unit).map((unitClass) => unitClass.id));

    this.mutate((map) => ({
      ...map,
      unitId,
      availableClassIds: map.availableClassIds.filter((id) => usable.has(id)),
    }));
  }

  setStatsLevel(level: number | null): void {
    const clamped =
      level === null || Number.isNaN(level)
        ? MIN_LEVEL
        : Math.min(MAX_LEVEL - 1, Math.max(MIN_LEVEL, Math.round(level)));

    this.mutate((map) => ({ ...map, statsLevel: clamped }));
  }

  addAvailableClass(classId: number): void {
    if (
      this.alwaysAvailable.includes(classId) ||
      this.mapState().availableClassIds.includes(classId)
    ) {
      return;
    }

    this.mutate((map) => ({
      ...map,
      availableClassIds: [...map.availableClassIds, classId],
    }));
  }

  removeAvailableClass(classId: number): void {
    this.mutate((map) => ({
      ...map,
      availableClassIds: map.availableClassIds.filter((id) => id !== classId),
    }));
  }

  setStartStat(stat: StatKey, value: number | null): void {
    const cleaned =
      value === null || !Number.isFinite(value) ? null : Math.max(0, Math.round(value));

    this.mutate((map) => ({
      ...map,
      startStats: { ...map.startStats, [stat]: cleaned },
    }));
  }

  setClass(sectionId: number, classId: number | null): void {
    this.patch(sectionId, (section) => ({ ...section, classId }));
  }

  setMount(sectionId: number, mountId: number | null): void {
    this.patch(sectionId, (section) => ({ ...section, mountId }));
  }

  addLevel(sectionId: number): void {
    this.patch(sectionId, (section) => {
      const row = this.createRow();

      return {
        ...section,
        rows: [...section.rows, row],
        comparators: section.comparators.map((comparator) => ({
          ...comparator,
          rows: [...comparator.rows, { id: row.id, marks: { ...ZERO_GROWTH } }],
        })),
      };
    });
  }

  removeLevel(sectionId: number, rowId: number): void {
    if (this.isBranchRow(sectionId, rowId)) {
      return;
    }

    this.patch(sectionId, (section) =>
      section.rows.length <= 1
        ? section
        : {
            ...section,
            rows: section.rows.filter((row) => row.id !== rowId),
            comparators: section.comparators.map((comparator) => ({
              ...comparator,
              rows: comparator.rows.filter((row) => row.id !== rowId),
            })),
          },
    );
  }

  toggleStat(sectionId: number, rowId: number, stat: StatKey): void {
    this.patch(sectionId, (section) => ({
      ...section,
      rows: toggle(section.rows, rowId, stat),
    }));
  }

  addComparator(sectionId: number): void {
    this.patch(sectionId, (section) => ({
      ...section,
      comparators: [
        ...section.comparators,
        {
          id: this.nextComparatorId++,
          classId: null,
          mountId: null,
          rows: section.rows.map((row) => ({
            id: row.id,
            marks: { ...ZERO_GROWTH },
          })),
        },
      ],
    }));
  }

  removeComparator(sectionId: number, comparatorId: number): void {
    this.patch(sectionId, (section) => ({
      ...section,
      comparators: section.comparators.filter((c) => c.id !== comparatorId),
    }));
  }

  setComparatorClass(
    sectionId: number,
    comparatorId: number,
    classId: number | null,
  ): void {
    this.patchComparator(sectionId, comparatorId, (comparator) => ({
      ...comparator,
      classId,
      mountId: null,
    }));
  }

  setComparatorMount(
    sectionId: number,
    comparatorId: number,
    mountId: number | null,
  ): void {
    this.patchComparator(sectionId, comparatorId, (comparator) => ({
      ...comparator,
      mountId,
    }));
  }

  toggleComparatorStat(
    sectionId: number,
    comparatorId: number,
    rowId: number,
    stat: StatKey,
  ): void {
    this.patchComparator(sectionId, comparatorId, (comparator) => ({
      ...comparator,
      rows: toggle(comparator.rows, rowId, stat),
    }));
  }

  addExam(parentId: number, afterRowId: number | null, draft: ExamDraft): number | null {
    const parent = this.mapState().sections.find((section) => section.id === parentId);

    if (!parent || this.hasExamAfter(parentId, afterRowId)) {
      return null;
    }

    const section: SeedSection = {
      id: this.nextSectionId++,
      exam: { parentId, afterRowId, ...draft },
      classId: null,
      mountId: draft.passed ? null : parent.mountId,
      rows: [this.createRow()],
      comparators: [],
    };

    this.mutate((map) => ({ ...map, sections: [...map.sections, section] }));

    return section.id;
  }

  updateExam(sectionId: number, draft: ExamDraft): void {
    this.patch(sectionId, (section) =>
      section.exam ? { ...section, exam: { ...section.exam, ...draft } } : section,
    );
  }

  canRemoveSection(sectionId: number): boolean {
    const sections = this.mapState().sections;

    return (
      sections.find((section) => section.id === sectionId)?.exam != null &&
      !sections.some((section) => section.exam?.parentId === sectionId)
    );
  }

  hasExamAfter(sectionId: number, rowId: number | null): boolean {
    return this.mapState().sections.some(
      (section) =>
        section.exam?.parentId === sectionId && section.exam.afterRowId === rowId,
    );
  }

  isBranchRow(sectionId: number, rowId: number): boolean {
    const rows = this.mapState().sections.find((section) => section.id === sectionId)?.rows ?? [];
    const index = rows.findIndex((row) => row.id === rowId);
    const before = index <= 0 ? null : rows[index - 1].id;

    return this.hasExamAfter(sectionId, rowId) || this.hasExamAfter(sectionId, before);
  }

  removeSection(sectionId: number): void {
    if (!this.canRemoveSection(sectionId)) {
      return;
    }

    this.mutate((map) => ({
      ...map,
      sections: map.sections.filter((section) => section.id !== sectionId),
    }));
  }

  private mutate(change: (map: SeedMap) => SeedMap): void {
    this.mapState.update((map) =>
      fillDefaultClass(
        clearUnavailableClasses(resetChangedClasses(map, change(map)), this.alwaysAvailable),
        this.alwaysAvailable,
      ),
    );
    this.changes.update((count) => count + 1);
  }

  private includeUsedClasses(map: SeedMap): SeedMap {
    const extra = new Set(map.availableClassIds);

    for (const section of map.sections) {
      const available = availableClassIds(map, section, this.alwaysAvailable);
      const used = [
        section.exam ? null : section.classId,
        ...section.comparators.map((comparator) => comparator.classId),
      ];

      for (const classId of used) {
        if (classId !== null && !available.has(classId)) {
          extra.add(classId);
        }
      }
    }

    return extra.size === map.availableClassIds.length
      ? map
      : { ...map, availableClassIds: [...extra] };
  }

  private patch(sectionId: number, change: (section: SeedSection) => SeedSection): void {
    this.mutate((map) => ({
      ...map,
      sections: map.sections.map((section) =>
        section.id === sectionId ? change(section) : section,
      ),
    }));
  }

  private patchComparator(
    sectionId: number,
    comparatorId: number,
    change: (comparator: SeedComparator) => SeedComparator,
  ): void {
    this.patch(sectionId, (section) => ({
      ...section,
      comparators: section.comparators.map((comparator) =>
        comparator.id === comparatorId ? change(comparator) : comparator,
      ),
    }));
  }

  private createMap(): SeedMap {
    return fillDefaultClass(
      {
        unitId: null,
        statsLevel: MIN_LEVEL,
        startStats: { ...EMPTY_STATS },
        availableClassIds: [],
        sections: [
          {
            id: this.nextSectionId++,
            exam: null,
            classId: null,
            mountId: null,
            rows: [this.createRow()],
            comparators: [],
          },
        ],
      },
      this.alwaysAvailable,
    );
  }

  private createRow(): SeedRow {
    return { id: this.nextRowId++, marks: { ...ZERO_GROWTH } };
  }
}

function resetChangedClasses(before: SeedMap, after: SeedMap): SeedMap {
  let changed = false;

  const sections = after.sections.map((section) => {
    const previous = before.sections.find((candidate) => candidate.id === section.id);
    const classId = effectiveClassId(after.sections, section);

    if (!previous || effectiveClassId(before.sections, previous) === classId) {
      return section;
    }

    changed = true;

    return {
      ...section,
      mountId: null,
      comparators: section.comparators.map((comparator) =>
        comparator.classId === classId
          ? { ...comparator, classId: null, mountId: null }
          : comparator,
      ),
    };
  });

  return changed ? { ...after, sections } : after;
}

function fillDefaultClass(map: SeedMap, always: readonly number[]): SeedMap {
  const base = map.sections.find((section) => !section.exam);
  const fallback = always[0];

  if (!base || base.classId !== null || fallback === undefined) {
    return map;
  }

  return {
    ...map,
    sections: map.sections.map((section) =>
      section === base ? { ...section, classId: fallback } : section,
    ),
  };
}

function clearUnavailableClasses(map: SeedMap, always: readonly number[]): SeedMap {
  let changed = false;

  const sections = map.sections.map((section) => {
    const available = availableClassIds(map, section, always);
    const keep = (classId: number | null) => classId === null || available.has(classId);
    const baseClassValid = section.exam !== null || keep(section.classId);
    const comparatorsValid = section.comparators.every((comparator) => keep(comparator.classId));

    if (baseClassValid && comparatorsValid) {
      return section;
    }

    changed = true;

    return {
      ...section,
      classId: baseClassValid ? section.classId : null,
      mountId: baseClassValid ? section.mountId : null,
      comparators: section.comparators.map((comparator) =>
        keep(comparator.classId) ? comparator : { ...comparator, classId: null, mountId: null },
      ),
    };
  });

  return changed ? { ...map, sections } : map;
}

function toggle(rows: SeedRow[], rowId: number, stat: StatKey): SeedRow[] {
  return rows.map((row) =>
    row.id === rowId
      ? { ...row, marks: { ...row.marks, [stat]: row.marks[stat] > 0 ? 0 : 1 } }
      : row,
  );
}
