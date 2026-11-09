import { inject, Injectable, signal } from '@angular/core';

import { DEFAULT_MOUNT_BOND_LEVEL, GrowthRates, MAX_EQUIPPED_ABILITIES, StatKey, WeaponKey, ZERO_GROWTH } from '../models/growth.models';
import { EMPTY_STATS, SeedMapSnapshot, StatValues } from '../models/seed-save';
import { GrowthDataService } from './growth-data.service';

export interface SeedRow {
  id: number;
  marks: GrowthRates;
  /** Reclass into this class before this level up; it applies from here to the section's end. */
  reclassTo?: number;
  /** An exam taken just before this level up; it uses a roll of its own. */
  exam?: InlineExam;
}

export interface InlineExam {
  classId: number | null;
  chance: number;
  passed: boolean;
  /** Passed but stayed in the current class; the exam class is only unlocked. */
  keepClass?: boolean;
}

export interface SeedComparator {
  id: number;
  classId: number | null;
  mountId: number | null;
  mountLevel: number;
  rows: SeedRow[];
}

export interface SeedExam {
  parentId: number;
  afterRowId: number | null;
  classId: number | null;
  chance: number;
  passed: boolean;
  /** A reclass branch: switches class without an exam, so it uses no roll of its own. */
  reclass?: boolean;
  /** Passed but stayed in the current class; the exam class is only unlocked. */
  keepClass?: boolean;
}

export interface SeedSection {
  id: number;
  exam: SeedExam | null;
  classId: number | null;
  mountId: number | null;
  mountLevel: number;
  /** Names of equipped stat-boosting abilities. */
  abilities: string[];
  /** Weapon type equipped, for abilities whose boost depends on it. */
  weapon: WeaponKey | null;
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
  /** Set by the dialog when it's a reclass rather than an exam. */
  reclass?: boolean;
  /** A pass that stays in the current class. */
  keepClass?: boolean;
}

/** Whether a passed exam moves the unit into the exam class (rather than only unlocking it). */
export function switchesClass(exam: { passed: boolean; keepClass?: boolean }): boolean {
  return exam.passed && !exam.keepClass;
}

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 99;
export const ALWAYS_AVAILABLE_CLASS = 'Noble/Commoner';

export function effectiveClassId(
  sections: readonly SeedSection[],
  section: SeedSection,
): number | null {
  const exam = section.exam;

  // A failed exam, or a pass that stays put, keeps whatever class the parent had at that level, reclasses included.
  if (exam && !switchesClass(exam)) {
    const parent = sections.find((candidate) => candidate.id === exam.parentId);

    return parent ? classAtRow(sections, parent, exam.afterRowId) : null;
  }

  return exam ? (section.classId ?? exam.classId) : section.classId;
}

/** The class a row switches to before its level up, if any: a reclass or a passed inline exam. */
export function rowSwitchesTo(row: SeedRow): number | null {
  if (row.exam) {
    return switchesClass(row.exam) ? row.exam.classId : null;
  }

  return row.reclassTo ?? null;
}

/** The section's class after the given level up, following any reclasses up to and including it. */
export function classAtRow(
  sections: readonly SeedSection[],
  section: SeedSection,
  rowId: number | null,
): number | null {
  let classId = effectiveClassId(sections, section);

  if (rowId === null) {
    return classId;
  }

  for (const row of section.rows) {
    classId = rowSwitchesTo(row) ?? classId;

    if (row.id === rowId) {
      break;
    }
  }

  return classId;
}

export function availableClassIds(
  map: SeedMap,
  section: SeedSection,
  always: readonly number[],
): Set<number> {
  const available = new Set<number>([...always, ...map.availableClassIds]);
  let current: SeedSection | undefined = section;
  let untilRowId: number | null | undefined;

  // Classes passed into along the way count: inline exams up to the branch point, and exam sections.
  while (current) {
    const rows = untilRowId === null ? [] : current.rows;

    for (const row of rows) {
      if (row.exam?.passed && row.exam.classId !== null) {
        available.add(row.exam.classId);
      }

      if (untilRowId !== undefined && row.id === untilRowId) {
        break;
      }
    }

    const exam: SeedExam | null = current.exam;

    if (!exam) {
      break;
    }

    if (exam.passed && exam.classId !== null) {
      available.add(exam.classId);
    }

    untilRowId = exam.afterRowId;
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
                  ...(exam.reclass ? { reclass: true } : {}),
                  ...(exam.keepClass ? { keepClass: true } : {}),
                }
              : null,
          classId: section.classId,
          mountId: section.mountId,
          mountLevel: section.mountLevel,
          abilities: [...section.abilities],
          weapon: section.weapon,
          rows: section.rows.map((row) => ({ ...row.marks })),
          reclasses: section.rows.flatMap((row, rowIndex) =>
            row.reclassTo === undefined ? [] : [{ rowIndex, classId: row.reclassTo }],
          ),
          exams: section.rows.flatMap((row, rowIndex) => (row.exam ? [{ rowIndex, ...row.exam }] : [])),
          comparators: section.comparators.map((comparator) => ({
            classId: comparator.classId,
            mountId: comparator.mountId,
            mountLevel: comparator.mountLevel,
            rows: comparator.rows.map((row) => ({ ...row.marks })),
          })),
        };
      }),
    };
  }

  restore(snapshot: SeedMapSnapshot, save: { id: string; name: string } | null): void {
    const sections: SeedSection[] = [];

    for (const entry of snapshot.sections) {
      const rows = entry.rows.map((marks, rowIndex) => {
        const exam = entry.exams.find((candidate) => candidate.rowIndex === rowIndex);

        return withExam(
          withReclass(
            { id: this.nextRowId++, marks: { ...marks } },
            entry.reclasses.find((reclass) => reclass.rowIndex === rowIndex)?.classId ?? null,
          ),
          exam
            ? {
                classId: exam.classId,
                chance: exam.chance,
                passed: exam.passed,
                ...(exam.keepClass ? { keepClass: true } : {}),
              }
            : null,
        );
      });
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
                ...(entry.exam.reclass ? { reclass: true } : {}),
                ...(entry.exam.keepClass ? { keepClass: true } : {}),
              }
            : null,
        classId: entry.classId,
        mountId: entry.mountId,
        mountLevel: entry.mountLevel,
        abilities: [...entry.abilities],
        weapon: entry.weapon,
        rows,
        comparators: entry.comparators.map((comparator) => ({
          id: this.nextComparatorId++,
          classId: comparator.classId,
          mountId: comparator.mountId,
          mountLevel: comparator.mountLevel,
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
      sections: foldEndExams(sections),
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
    this.patch(sectionId, (section) => {
      if (!section.exam) {
        return { ...section, classId };
      }

      return switchesClass(section.exam)
        ? { ...section, classId: passedExamClass(classId, section.exam.classId) }
        : section;
    });
  }

  setMount(sectionId: number, mountId: number | null): void {
    this.patch(sectionId, (section) => ({ ...section, mountId }));
  }

  setAbilities(sectionId: number, abilities: readonly string[]): void {
    this.patch(sectionId, (section) => ({
      ...section,
      abilities: [...new Set(abilities)].slice(0, MAX_EQUIPPED_ABILITIES),
    }));
  }

  setWeapon(sectionId: number, weapon: WeaponKey | null): void {
    this.patch(sectionId, (section) => ({ ...section, weapon }));
  }

  setMountLevel(sectionId: number, mountLevel: number): void {
    this.patch(sectionId, (section) => ({ ...section, mountLevel }));
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

  /** Sets one stat's mark on several level ups at once, e.g. ones that share a roll and growth rates. */
  setMarks(targets: readonly { sectionId: number; rowId: number }[], stat: StatKey, value: number): void {
    const bySection = new Map<number, Set<number>>();

    for (const { sectionId, rowId } of targets) {
      bySection.set(sectionId, (bySection.get(sectionId) ?? new Set()).add(rowId));
    }

    this.mutate((map) => ({
      ...map,
      sections: map.sections.map((section) => {
        const rowIds = bySection.get(section.id);

        return rowIds
          ? {
              ...section,
              rows: section.rows.map((row) =>
                rowIds.has(row.id) ? { ...row, marks: { ...row.marks, [stat]: value } } : row,
              ),
            }
          : section;
      }),
    }));
  }

  /** Reclass before the given level up; null removes the reclass. A row holds a reclass or an exam, not both. */
  setReclass(sectionId: number, rowId: number, classId: number | null): void {
    this.patch(sectionId, (section) => ({
      ...section,
      rows: section.rows.map((row) =>
        row.id === rowId ? withReclass(withExam(row, null), classId) : row,
      ),
    }));
  }

  /** Adds a level up that starts with a reclass. */
  addReclassLevel(sectionId: number, classId: number): void {
    this.addLevel(sectionId);

    const rowId = this.mapState().sections.find((section) => section.id === sectionId)?.rows.at(-1)?.id;

    if (rowId !== undefined) {
      this.setReclass(sectionId, rowId, classId);
    }
  }

  /** Takes (or changes) an exam just before the given level up; null removes it. */
  setInlineExam(sectionId: number, rowId: number, exam: InlineExam | null): void {
    this.patch(sectionId, (section) => ({
      ...section,
      rows: section.rows.map((row) =>
        row.id === rowId ? withExam(withReclass(row, null), exam) : row,
      ),
    }));
  }

  /** Adds a level up that starts with an exam. */
  addExamLevel(sectionId: number, exam: InlineExam): void {
    this.addLevel(sectionId);

    const rowId = this.mapState().sections.find((section) => section.id === sectionId)?.rows.at(-1)?.id;

    if (rowId !== undefined) {
      this.setInlineExam(sectionId, rowId, exam);
    }
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
          mountLevel: DEFAULT_MOUNT_BOND_LEVEL,
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
      mountLevel: DEFAULT_MOUNT_BOND_LEVEL,
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

  setComparatorMountLevel(sectionId: number, comparatorId: number, mountLevel: number): void {
    this.patchComparator(sectionId, comparatorId, (comparator) => ({
      ...comparator,
      mountLevel,
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

    const switches = switchesClass(draft);
    const section: SeedSection = {
      id: this.nextSectionId++,
      exam: {
        parentId,
        afterRowId,
        classId: draft.classId,
        chance: draft.chance,
        passed: draft.passed,
        ...(draft.passed && draft.keepClass ? { keepClass: true } : {}),
      },
      classId: null,
      mountId: switches ? null : parent.mountId,
      mountLevel: switches ? DEFAULT_MOUNT_BOND_LEVEL : parent.mountLevel,
      abilities: [...parent.abilities],
      weapon: parent.weapon,
      rows: [this.createRow()],
      comparators: [],
    };

    this.mutate((map) => ({ ...map, sections: [...map.sections, section] }));

    return section.id;
  }

  /**
   * Branches off after the given level up, alongside any branches already there: exams at the same
   * point all use the same roll and share the level ups after it. A reclass draft uses no roll.
   */
  addBranch(parentId: number, afterRowId: number | null, draft: ExamDraft): number | null {
    const parent = this.mapState().sections.find((section) => section.id === parentId);

    if (!parent) {
      return null;
    }

    const reclass = draft.reclass === true;
    const passed = reclass || draft.passed;
    const keepClass = !reclass && draft.passed && draft.keepClass === true;
    const switches = passed && !keepClass;
    const section: SeedSection = {
      id: this.nextSectionId++,
      exam: {
        parentId,
        afterRowId,
        classId: draft.classId,
        chance: reclass ? 0 : draft.chance,
        passed,
        ...(reclass ? { reclass: true } : {}),
        ...(keepClass ? { keepClass: true } : {}),
      },
      classId: null,
      mountId: switches ? null : parent.mountId,
      mountLevel: switches ? DEFAULT_MOUNT_BOND_LEVEL : parent.mountLevel,
      abilities: [...parent.abilities],
      weapon: parent.weapon,
      rows: [this.createRow()],
      comparators: [],
    };

    this.mutate((map) => ({ ...map, sections: [...map.sections, section] }));

    return section.id;
  }

  updateExam(sectionId: number, draft: ExamDraft): void {
    this.patch(sectionId, (section) =>
      section.exam
        ? {
            ...section,
            exam: {
              ...withoutKeepClass(section.exam),
              classId: draft.classId,
              chance: draft.chance,
              passed: draft.passed,
              ...(draft.passed && draft.keepClass ? { keepClass: true } : {}),
            },
            classId: switchesClass(draft) ? passedExamClass(section.classId, draft.classId) : null,
          }
        : section,
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
        section.classId,
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
            mountLevel: DEFAULT_MOUNT_BOND_LEVEL,
            abilities: [],
            weapon: null,
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
      mountLevel: DEFAULT_MOUNT_BOND_LEVEL,
      comparators: section.comparators.map((comparator) =>
        comparator.classId === classId
          ? { ...comparator, classId: null, mountId: null, mountLevel: DEFAULT_MOUNT_BOND_LEVEL }
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
    const baseClassValid = keep(section.classId);
    const comparatorsValid = section.comparators.every((comparator) => keep(comparator.classId));
    const reclassesValid = section.rows.every((row) => keep(row.reclassTo ?? null));

    if (baseClassValid && comparatorsValid && reclassesValid) {
      return section;
    }

    changed = true;

    return {
      ...section,
      classId: baseClassValid ? section.classId : null,
      mountId: baseClassValid ? section.mountId : null,
      mountLevel: baseClassValid ? section.mountLevel : DEFAULT_MOUNT_BOND_LEVEL,
      rows: section.rows.map((row) => (keep(row.reclassTo ?? null) ? row : withReclass(row, null))),
      comparators: section.comparators.map((comparator) =>
        keep(comparator.classId)
          ? comparator
          : { ...comparator, classId: null, mountId: null, mountLevel: DEFAULT_MOUNT_BOND_LEVEL },
      ),
    };
  });

  return changed ? { ...map, sections } : map;
}

function passedExamClass(chosen: number | null, examClassId: number | null): number | null {
  return chosen === examClassId ? null : chosen;
}

function withoutKeepClass<T extends { keepClass?: boolean }>(exam: T): T {
  const { keepClass: _, ...rest } = exam;

  return rest as T;
}

function withReclass(row: SeedRow, classId: number | null): SeedRow {
  const { reclassTo: _, ...rest } = row;

  return classId === null ? rest : { ...rest, reclassTo: classId };
}

function withExam(row: SeedRow, exam: InlineExam | null): SeedRow {
  const { exam: _, ...rest } = row;

  return exam === null ? rest : { ...rest, exam: { ...exam } };
}

/**
 * Older saves kept every exam as its own section. One that starts right after the last level of
 * the section it came from is just the seed carrying on, so it becomes an inline exam there —
 * unless that would lose something only the exam section had.
 */
function foldEndExams(sections: SeedSection[]): SeedSection[] {
  let result = sections;
  let folded = true;

  while (folded) {
    folded = false;

    for (const section of result) {
      const exam = section.exam;
      const parent = exam && result.find((candidate) => candidate.id === exam.parentId);
      const siblings = exam
        ? result.filter(
            (candidate) =>
              candidate.exam?.parentId === exam.parentId && candidate.exam.afterRowId === exam.afterRowId,
          ).length
        : 0;

      // Reclass branches and same-level alternatives stay separate branches.
      if (!exam || !parent || exam.reclass || siblings > 1 || !canFold(section, parent, exam)) {
        continue;
      }

      const [first, ...rest] = section.rows;
      const merged: SeedSection = {
        ...parent,
        rows: [
          ...parent.rows,
          withExam(withReclass(first, null), {
            classId: exam.classId,
            chance: exam.chance,
            passed: exam.passed,
            ...(exam.keepClass ? { keepClass: true } : {}),
          }),
          ...rest,
        ],
        comparators: [],
      };

      result = result
        .filter((candidate) => candidate.id !== section.id)
        .map((candidate) => {
          if (candidate.id === parent.id) {
            return merged;
          }

          return candidate.exam?.parentId === section.id
            ? { ...candidate, exam: { ...candidate.exam, parentId: parent.id } }
            : candidate;
        });
      folded = true;
      break;
    }
  }

  return result;
}

function canFold(section: SeedSection, parent: SeedSection, exam: SeedExam): boolean {
  const atEnd = parent.rows.length > 0 && exam.afterRowId === parent.rows.at(-1)!.id;
  const switches = switchesClass(exam);
  const sameMount = switches
    ? section.mountId === null || section.mountId === parent.mountId
    : section.mountId === parent.mountId && section.mountLevel === parent.mountLevel;
  const sameClass = !switches || section.classId === null || section.classId === exam.classId;
  const first = section.rows[0];

  return (
    atEnd &&
    sameMount &&
    sameClass &&
    first !== undefined &&
    first.reclassTo === undefined &&
    section.comparators.length === 0 &&
    parent.comparators.length === 0 &&
    section.weapon === parent.weapon &&
    section.abilities.join('\n') === parent.abilities.join('\n')
  );
}

function toggle(rows: SeedRow[], rowId: number, stat: StatKey): SeedRow[] {
  return rows.map((row) =>
    row.id === rowId
      ? { ...row, marks: { ...row.marks, [stat]: row.marks[stat] > 0 ? 0 : 1 } }
      : row,
  );
}
