import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, Injector, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ExamDialogComponent } from '../exam-dialog/exam-dialog.component';
import { CLASS_RANK_ORDER, ClassRank, GrowthRates, Mount, STAT_KEYS, STAT_LABELS, StatKey, sumGrowth, toGrowth, Unit, UnitClass, ZERO_GROWTH } from '../models/growth.models';
import { estimateRoll, RollBounds, rollBounds, RollEstimate, RollObservation } from '../models/seed-roll';
import { CURRENT_SAVE_VERSION, migrateSave, newSaveId, SeedSave } from '../models/seed-save';
import { SearchableSelectComponent, SelectItemGroup } from '../searchable-select/searchable-select.component';
import { RngSection, SeedRngDialogComponent } from '../seed-rng-dialog/seed-rng-dialog.component';
import { GrowthDataService } from '../services/growth-data.service';
import { SeedSaveStorageService } from '../services/seed-save-storage.service';
import { SeedSerializerService } from '../services/seed-serializer.service';
import { SpoilerService } from '../services/spoiler.service';
import { availableClassIds, effectiveClassId, ExamDraft, MAX_LEVEL, MIN_LEVEL, SeedComparator, SeedMapperStateService, SeedRow, SeedSection } from '../services/seed-mapper-state.service';

interface PendingAction {
  kind: 'load' | 'upload' | 'overwrite' | 'delete' | 'reset';
  save?: SeedSave;
  file?: File;
  message?: string;
}

interface RowPosition {
  slot: number;
  level: number;
}

export interface SectionView {
  section: SeedSection;
  title: string;
  classId: number | null;
  mount: Mount | null;
  growth: GrowthRates;
  parentTitle: string | null;
  exam: { slot: number; level: number } | null;
  firstSlot: number;
  firstLevel: number;
}

export interface EffectiveRow {
  marks: GrowthRates;
  auto: Record<StatKey, boolean>;
}

interface TaggedObservation extends RollObservation {
  examOf: number | null;
}

export interface StatTotal {
  value: number | null;
  gained: number;
  /** Class stat bonus relative to the seed's class, whose bonus is already in the entered stats. */
  classBonus: number;
  /** Name of the seed's class when `classBonus` is non-zero, for the tooltip. */
  versus: string | null;
}

interface ExamDialogState {
  title: string;
  context: string;
  classGroups: SelectItemGroup[];
  initial: { classId: number | null; chance: number; passed: boolean } | null;
  strBounds: RollBounds;
  parentId: number;
  afterRowId: number | null;
  sectionId: number | null;
}

const STR_INDEX = STAT_KEYS.indexOf('str');
const NO_ROLLS: RollEstimate[] = STAT_KEYS.map(() => estimateRoll([]));

@Component({
  selector: 'app-seed-mapper-page',
  imports: [
    DatePipe,
    ExamDialogComponent,
    NgTemplateOutlet,
    SearchableSelectComponent,
    SeedRngDialogComponent,
  ],
  templateUrl: './seed-mapper-page.component.html',
  styleUrl: './seed-mapper-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeedMapperPageComponent {
  private readonly api = inject(GrowthDataService);
  private readonly state = inject(SeedMapperStateService);
  private readonly storage = inject(SeedSaveStorageService);
  private readonly serializer = inject(SeedSerializerService);
  private readonly spoilers = inject(SpoilerService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  readonly seedMap = this.state.seedMap;
  readonly saves = this.storage.saves;
  readonly changeCount = this.state.changeCount;
  readonly loadedSave = this.state.loadedSave;
  readonly status = signal<string | null>(null);
  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;
  readonly minLevel = MIN_LEVEL;
  readonly maxLevel = MAX_LEVEL;
  readonly autoHint = 'Filled in automatically: the same roll rose at an equal or lower growth elsewhere.';

  readonly allUnits = toSignal(this.api.getUnits(), { initialValue: [] as Unit[] });
  private readonly classes = toSignal(this.api.getClasses(), {
    initialValue: [] as UnitClass[],
  });

  readonly units = computed(() => this.spoilers.filter(this.allUnits()));

  readonly classGroups = computed<SelectItemGroup[]>(() => this.groupClasses(this.usableClasses()));

  /** Classes the chosen unit may take (gender and mount restrictions applied). */
  private readonly usableClasses = computed(() =>
    this.api.classesForUnit(this.api.unitById(this.seedMap().unitId)),
  );

  private readonly mountsByClass = signal<ReadonlyMap<number, Mount[]>>(new Map());
  private readonly requestedClasses = new Set<number>();

  readonly examDialog = signal<ExamDialogState | null>(null);
  readonly rngSectionId = signal<number | null>(null);

  readonly rngSections = computed<RngSection[]>(() =>
    this.sectionViews().map((view) => ({
      id: view.section.id,
      title: view.title,
      rows: [
        ...(view.exam
          ? [{ label: this.examLabel(view), exam: true, rolls: this.rollsAt(view.exam.slot) }]
          : []),
        ...view.section.rows.map((_, index) => ({
          label: `Lv ${this.levelOf(view, index)}`,
          exam: false,
          rolls: this.rollsAt(view.firstSlot + index),
        })),
      ],
    })),
  );

  openRng(): void {
    const seed = this.sectionViews()[0];

    if (seed && this.canOpenRng()) {
      this.rngSectionId.set(seed.section.id);
    }
  }

  closeRng(): void {
    this.rngSectionId.set(null);
  }

  constructor() {
    effect(() => {
      for (const section of this.seedMap().sections) {
        this.loadMounts(effectiveClassId(this.seedMap().sections, section));

        for (const comparator of section.comparators) {
          this.loadMounts(comparator.classId);
        }
      }
    });

    const dropped = this.storage.droppedOnLoad;

    if (dropped > 0) {
      this.status.set(
        `Deleted ${dropped} old ${dropped === 1 ? 'save' : 'saves'} that used the multi-seed format and can no longer be loaded.`,
      );
    }
  }

  // --- sections ----------------------------------------------------------

  readonly sectionViews = computed<SectionView[]>(() => {
    const map = this.seedMap();
    const views: SectionView[] = [];
    const byId = new Map<number, SectionView>();
    let examNumber = 0;

    for (const section of map.sections) {
      const classId = effectiveClassId(map.sections, section);
      const mount = this.resolveMount(classId, section.mountId);
      let view: SectionView;

      if (section.exam) {
        const parent = byId.get(section.exam.parentId);

        if (!parent) {
          continue;
        }

        const from = this.positionAfter(parent, section.exam.afterRowId);

        view = {
          section,
          title: `Exam ${++examNumber}`,
          classId,
          mount,
          growth: this.combine(map.unitId, classId, mount),
          parentTitle: parent.title,
          exam: { slot: from.slot + 1, level: from.level },
          firstSlot: from.slot + 2,
          firstLevel: from.level + 1,
        };
      } else {
        view = {
          section,
          title: 'Seed',
          classId,
          mount,
          growth: this.combine(map.unitId, classId, mount),
          parentTitle: null,
          exam: null,
          firstSlot: 0,
          firstLevel: map.statsLevel + 1,
        };
      }

      views.push(view);
      byId.set(section.id, view);
    }

    return views;
  });

  private readonly availableBySection = computed(() => {
    const map = this.seedMap();
    const always = this.state.alwaysAvailableClassIds;
    const result = new Map<number, UnitClass[]>();

    for (const section of map.sections) {
      const ids = availableClassIds(map, section, always);
      result.set(
        section.id,
        this.usableClasses().filter((unitClass) => ids.has(unitClass.id)),
      );
    }

    return result;
  });

  availableClasses(view: SectionView): UnitClass[] {
    return this.availableBySection().get(view.section.id) ?? [];
  }

  availableClassGroups(view: SectionView): SelectItemGroup[] {
    return this.groupClasses(this.availableClasses(view));
  }

  readonly addableClassGroups = computed(() => {
    const map = this.seedMap();
    const taken = new Set([...this.state.alwaysAvailableClassIds, ...map.availableClassIds]);

    return this.groupClasses(this.usableClasses().filter((unitClass) => !taken.has(unitClass.id)));
  });

  isAlwaysAvailable(unitClass: UnitClass): boolean {
    return this.state.alwaysAvailableClassIds.includes(unitClass.id);
  }

  isRemovableClass(view: SectionView, unitClass: UnitClass): boolean {
    return !view.section.exam && this.seedMap().availableClassIds.includes(unitClass.id);
  }

  onAddAvailableClass(classId: number | null): void {
    if (classId !== null) {
      this.state.addAvailableClass(classId);
      this.loadMounts(classId);
    }
  }

  removeAvailableClass(unitClass: UnitClass): void {
    this.state.removeAvailableClass(unitClass.id);
  }

  readonly latestView = computed(() => this.sectionViews().at(-1) ?? null);

  private readonly branchPoints = computed(
    () =>
      new Set(
        this.seedMap()
          .sections.filter((section) => section.exam)
          .map((section) => branchKey(section.exam!.parentId, section.exam!.afterRowId)),
      ),
  );

  mountsForClass(classId: number | null): Mount[] {
    return classId === null ? [] : (this.mountsByClass().get(classId) ?? []);
  }

  private resolveMount(classId: number | null, mountId: number | null): Mount | null {
    const options = this.mountsForClass(classId);

    return options.find((m) => m.id === mountId) ?? options.at(0) ?? null;
  }

  levelOf(view: SectionView, index: number): number {
    return view.firstLevel + index;
  }

  className(classId: number | null): string {
    return this.classes().find((c) => c.id === classId)?.name ?? 'Unknown class';
  }

  examLabel(view: SectionView): string {
    return view.section.exam?.passed ? 'Exam' : 'Skip';
  }

  private isComplete(view: SectionView): boolean {
    const map = this.seedMap();

    return map.unitId !== null && view.classId !== null;
  }

  canTakeExam(view: SectionView | null): boolean {
    return view !== null && this.isComplete(view);
  }

  canOpenRng(): boolean {
    const seed = this.sectionViews()[0];

    return seed !== undefined && this.isComplete(seed);
  }

  canTakeLatestExam(): boolean {
    const view = this.latestView();

    return (
      view !== null &&
      this.canTakeExamAt(view, this.endLevelOf(view)) &&
      !this.hasExamAfter(view, view.section.rows.at(-1) ?? null)
    );
  }

  latestExamHint(): string {
    const view = this.latestView();

    if (!view || !this.canTakeExam(view)) {
      return 'Pick a unit and class first';
    }

    const next = this.endLevelOf(view) + 1;

    if (next > MAX_LEVEL) {
      return `There is no level after Lv ${MAX_LEVEL}`;
    }

    return this.hasExamAfter(view, view.section.rows.at(-1) ?? null)
      ? `Lv ${next} in ${view.title} was already skipped by an exam`
      : `Take an exam in place of Lv ${next} in ${view.title}`;
  }

  hasExamAfter(view: SectionView, row: SeedRow | null): boolean {
    return this.branchPoints().has(branchKey(view.section.id, row?.id ?? null));
  }

  private rowBefore(view: SectionView, rowIndex: number): SeedRow | null {
    return rowIndex <= 0 ? null : (view.section.rows[rowIndex - 1] ?? null);
  }

  hasExamAt(view: SectionView, rowIndex: number): boolean {
    return this.hasExamAfter(view, this.rowBefore(view, rowIndex));
  }

  canTakeExamAtRow(view: SectionView, rowIndex: number): boolean {
    return this.canTakeExam(view) && !this.hasExamAt(view, rowIndex);
  }

  examSectionAt(view: SectionView, rowIndex: number): SectionView | null {
    const before = this.rowBefore(view, rowIndex)?.id ?? null;

    return (
      this.sectionViews().find(
        (candidate) =>
          candidate.section.exam?.parentId === view.section.id &&
          candidate.section.exam.afterRowId === before,
      ) ?? null
    );
  }

  isBranchRow(view: SectionView, rowIndex: number): boolean {
    return this.hasExamAt(view, rowIndex) || this.hasExamAt(view, rowIndex + 1);
  }

  canRemoveSection(view: SectionView): boolean {
    return (
      view.section.exam !== null &&
      !this.seedMap().sections.some((section) => section.exam?.parentId === view.section.id)
    );
  }

  // --- comparators -------------------------------------------------------

  comparatorClasses(view: SectionView, comparator: SeedComparator): UnitClass[] {
    const taken = new Set<number>();

    for (const other of view.section.comparators) {
      if (other.id !== comparator.id && other.classId !== null) {
        taken.add(other.classId);
      }
    }

    return this.availableClasses(view).filter(
      (c) => c.id !== view.classId && !taken.has(c.id),
    );
  }

  canAddComparator(view: SectionView): boolean {
    if (!this.isComplete(view)) {
      return false;
    }

    return view.section.comparators.length < this.availableClasses(view).length - 1;
  }

  hasComparison(view: SectionView): boolean {
    return view.section.comparators.some((comparator) => comparator.classId !== null);
  }

  comparatorMountOf(comparator: SeedComparator): Mount | null {
    return this.resolveMount(comparator.classId, comparator.mountId);
  }

  comparatorGrowth(comparator: SeedComparator): GrowthRates {
    return this.combine(
      this.seedMap().unitId,
      comparator.classId,
      this.comparatorMountOf(comparator),
    );
  }

  // --- roll inference ----------------------------------------------------

  private blocksOf(view: SectionView): { growth: GrowthRates; rows: SeedRow[] }[] {
    const blocks: { growth: GrowthRates; rows: SeedRow[] }[] = [];

    if (view.classId !== null) {
      blocks.push({ growth: view.growth, rows: view.section.rows });
    }

    for (const comparator of view.section.comparators) {
      if (comparator.classId !== null) {
        blocks.push({ growth: this.comparatorGrowth(comparator), rows: comparator.rows });
      }
    }

    return blocks;
  }

  private readonly hitCeilings = computed(() => {
    const ceilings = new Map<number, (number | null)[]>();

    const lower = (slot: number, statIndex: number, growth: number) => {
      let perStat = ceilings.get(slot);

      if (!perStat) {
        perStat = this.statKeys.map(() => null);
        ceilings.set(slot, perStat);
      }

      const current = perStat[statIndex];
      perStat[statIndex] = current === null ? growth : Math.min(current, growth);
    };

    for (const view of this.sectionViews()) {
      for (const block of this.blocksOf(view)) {
        block.rows.forEach((row, rowIndex) =>
          this.statKeys.forEach((stat, statIndex) => {
            if (row.marks[stat] > 0) {
              lower(view.firstSlot + rowIndex, statIndex, block.growth[stat]);
            }
          }),
        );
      }

      const exam = view.section.exam;

      if (exam?.passed && view.exam) {
        lower(view.exam.slot, STR_INDEX, exam.chance);
      }
    }

    return ceilings;
  });

  effectiveRow(growth: GrowthRates | null, row: SeedRow, slot: number): EffectiveRow {
    const ceilings = this.hitCeilings().get(slot);
    const marks = { ...row.marks };
    const auto = {} as Record<StatKey, boolean>;

    this.statKeys.forEach((stat, statIndex) => {
      const ceiling = ceilings?.[statIndex] ?? null;
      const known =
        growth !== null && row.marks[stat] === 0 && ceiling !== null && growth[stat] >= ceiling;

      auto[stat] = known;

      if (known) {
        marks[stat] = 1;
      }
    });

    return { marks, auto };
  }

  private readonly observationsBySlot = computed(() => {
    const observations = new Map<number, TaggedObservation[][]>();

    const add = (slot: number, statIndex: number, observation: TaggedObservation) => {
      let perStat = observations.get(slot);

      if (!perStat) {
        perStat = this.statKeys.map(() => []);
        observations.set(slot, perStat);
      }

      perStat[statIndex].push(observation);
    };

    for (const view of this.sectionViews()) {
      for (const block of this.blocksOf(view)) {
        block.rows.forEach((row, rowIndex) => {
          const slot = view.firstSlot + rowIndex;
          const { marks } = this.effectiveRow(block.growth, row, slot);

          this.statKeys.forEach((stat, statIndex) =>
            add(slot, statIndex, {
              growth: block.growth[stat],
              hit: marks[stat] > 0,
              examOf: null,
            }),
          );
        });
      }

      const exam = view.section.exam;

      if (exam && view.exam) {
        add(view.exam.slot, STR_INDEX, {
          growth: exam.chance,
          hit: exam.passed,
          examOf: view.section.id,
        });
      }
    }

    return observations;
  });

  private readonly rollsBySlot = computed(() => {
    const rolls = new Map<number, RollEstimate[]>();

    for (const [slot, perStat] of this.observationsBySlot()) {
      rolls.set(slot, perStat.map((list) => estimateRoll(list)));
    }

    return rolls;
  });

  rollsAt(slot: number): RollEstimate[] {
    return this.rollsBySlot().get(slot) ?? NO_ROLLS;
  }

  private strBoundsAt(slot: number, ignoreExamOf: number | null): RollBounds {
    const readings = this.observationsBySlot().get(slot)?.[STR_INDEX] ?? [];

    return rollBounds(
      readings.filter((reading) => ignoreExamOf === null || reading.examOf !== ignoreExamOf),
    );
  }

  // --- stats -------------------------------------------------------------

  private gainsOf(view: SectionView, growth: GrowthRates | null, rows: SeedRow[], until: number): GrowthRates {
    const gains = { ...ZERO_GROWTH };

    for (let index = 0; index <= until && index < rows.length; index++) {
      const { marks } = this.effectiveRow(growth, rows[index], view.firstSlot + index);

      for (const stat of this.statKeys) {
        gains[stat] += marks[stat];
      }
    }

    return gains;
  }

  private readonly startGains = computed(() => {
    const starts = new Map<number, GrowthRates>();
    const views = this.sectionViews();

    for (const view of views) {
      const exam = view.section.exam;

      if (!exam) {
        starts.set(view.section.id, { ...ZERO_GROWTH });
        continue;
      }

      const parent = views.find((candidate) => candidate.section.id === exam.parentId);
      const parentStart = starts.get(exam.parentId) ?? { ...ZERO_GROWTH };

      if (!parent || exam.afterRowId === null) {
        starts.set(view.section.id, parentStart);
        continue;
      }

      const until = parent.section.rows.findIndex((row) => row.id === exam.afterRowId);
      const growth = parent.classId === null ? null : parent.growth;

      starts.set(
        view.section.id,
        sumGrowth(parentStart, this.gainsOf(parent, growth, parent.section.rows, until)),
      );
    }

    return starts;
  });

  startStatsOf(view: SectionView): StatTotal[] {
    return this.totals(this.startGains().get(view.section.id) ?? ZERO_GROWTH, view.classId);
  }

  endStatsOf(view: SectionView, comparator: SeedComparator | null = null): StatTotal[] {
    const rows = comparator ? comparator.rows : view.section.rows;
    const growth = comparator
      ? comparator.classId === null
        ? null
        : this.comparatorGrowth(comparator)
      : view.classId === null
        ? null
        : view.growth;
    const gains = sumGrowth(
      this.startGains().get(view.section.id) ?? ZERO_GROWTH,
      this.gainsOf(view, growth, rows, rows.length - 1),
    );

    return this.totals(gains, comparator ? comparator.classId : view.classId);
  }

  startLevelOf(view: SectionView): number {
    return view.exam ? view.exam.level : view.firstLevel - 1;
  }

  endLevelOf(view: SectionView): number {
    return this.levelOf(view, view.section.rows.length - 1);
  }

  private totals(gains: GrowthRates, classId: number | null): StatTotal[] {
    const base = this.seedMap().startStats;
    const seedClassId = this.sectionViews()[0]?.classId ?? null;
    const seedClass = this.classes().find((c) => c.id === seedClassId) ?? null;
    const shownClass =
      classId === null ? seedClass : (this.classes().find((c) => c.id === classId) ?? null);

    return this.statKeys.map((stat) => {
      const start = base[stat];
      const classBonus =
        (shownClass?.bonusStats[stat] ?? 0) - (seedClass?.bonusStats[stat] ?? 0);

      return {
        value: start === null ? null : start + gains[stat] + classBonus,
        gained: gains[stat],
        classBonus,
        versus: classBonus === 0 ? null : (seedClass?.name ?? null),
      };
    });
  }

  statTotalTitle(total: StatTotal): string {
    const parts = [total.gained === 0 ? 'No gains yet' : `+${total.gained} from level ups`];

    if (total.classBonus !== 0) {
      const sign = total.classBonus > 0 ? '+' : '−';
      parts.push(
        `${sign}${Math.abs(total.classBonus)} class stat bonus` +
          (total.versus ? ` compared with ${total.versus}` : ''),
      );
    }

    return parts.join('; ');
  }

  onStartStatChange(stat: StatKey, event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();

    this.state.setStartStat(stat, value === '' ? null : Number(value));
  }

  focusNextStartField(event: Event): void {
    const field = event.target as HTMLInputElement;
    const fields = Array.from(
      field.closest('.start-stats')?.querySelectorAll<HTMLInputElement>('input') ?? [],
    );
    const next = fields[fields.indexOf(field) + 1];

    event.preventDefault();

    if (next) {
      next.focus();
      next.select();
    } else {
      field.blur();
    }
  }

  canAddLevel(view: SectionView): boolean {
    return this.endLevelOf(view) < MAX_LEVEL;
  }

  canTakeExamAt(view: SectionView, level: number): boolean {
    return this.canTakeExam(view) && level < MAX_LEVEL;
  }

  // --- events ------------------------------------------------------------

  onUnitChange(id: number | null): void {
    this.state.setUnit(id);
  }

  onClassChange(view: SectionView, classId: number | null): void {
    this.state.setClass(view.section.id, classId);
    this.loadMounts(classId);
  }

  onMountChange(view: SectionView, id: number | null): void {
    this.state.setMount(view.section.id, id);
  }

  onStatsLevelChange(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.state.setStatsLevel(input.value === '' ? null : Number(input.value));
    input.value = String(this.seedMap().statsLevel);
  }

  onComparatorClassChange(
    view: SectionView,
    comparator: SeedComparator,
    classId: number | null,
  ): void {
    this.state.setComparatorClass(view.section.id, comparator.id, classId);
    this.loadMounts(classId);
  }

  onComparatorMountChange(
    view: SectionView,
    comparator: SeedComparator,
    id: number | null,
  ): void {
    this.state.setComparatorMount(view.section.id, comparator.id, id);
  }

  toggleStat(view: SectionView, row: SeedRow, stat: StatKey): void {
    this.state.toggleStat(view.section.id, row.id, stat);
  }

  toggleComparatorStat(
    view: SectionView,
    comparator: SeedComparator,
    row: SeedRow,
    stat: StatKey,
  ): void {
    this.state.toggleComparatorStat(view.section.id, comparator.id, row.id, stat);
  }

  addLevel(view: SectionView): void {
    if (this.canAddLevel(view)) {
      this.state.addLevel(view.section.id);
    }
  }

  removeLevel(view: SectionView, row: SeedRow): void {
    this.state.removeLevel(view.section.id, row.id);
  }

  addComparator(view: SectionView): void {
    this.state.addComparator(view.section.id);
  }

  removeComparator(view: SectionView, comparator: SeedComparator): void {
    this.state.removeComparator(view.section.id, comparator.id);
  }

  removeSection(view: SectionView): void {
    this.state.removeSection(view.section.id);
  }

  // --- exams -------------------------------------------------------------

  openLatestExam(): void {
    const view = this.latestView();

    if (view && this.canTakeLatestExam()) {
      this.openExam(view, view.section.rows.at(-1) ?? null);
    }
  }

  openExamAt(view: SectionView, rowIndex: number): void {
    if (this.canTakeExamAtRow(view, rowIndex)) {
      this.openExam(view, this.rowBefore(view, rowIndex));
    }
  }

  private openExam(view: SectionView, row: SeedRow | null): void {
    const from = this.positionAfter(view, row?.id ?? null);

    this.examDialog.set({
      title: 'Exam taken',
      context: describeExam(view.title, from),
      classGroups: this.examClassGroups(view),
      initial: null,
      strBounds: this.strBoundsAt(from.slot + 1, null),
      parentId: view.section.id,
      afterRowId: row?.id ?? null,
      sectionId: null,
    });
  }

  editExam(view: SectionView): void {
    const exam = view.section.exam;
    const parent = this.sectionViews().find((candidate) => candidate.section.id === exam?.parentId);

    if (!exam || !parent || !view.exam) {
      return;
    }

    this.examDialog.set({
      title: `Edit ${view.title}`,
      context: describeExam(parent.title, view.exam),
      classGroups: this.examClassGroups(parent),
      initial: { classId: exam.classId, chance: exam.chance, passed: exam.passed },
      strBounds: this.strBoundsAt(view.exam.slot, view.section.id),
      parentId: parent.section.id,
      afterRowId: exam.afterRowId,
      sectionId: view.section.id,
    });
  }

  onExamConfirmed(draft: ExamDraft): void {
    const dialog = this.examDialog();

    if (!dialog) {
      return;
    }

    this.examDialog.set(null);
    this.loadMounts(draft.classId);

    if (dialog.sectionId !== null) {
      this.state.updateExam(dialog.sectionId, draft);
      return;
    }

    const id = this.state.addExam(dialog.parentId, dialog.afterRowId, draft);

    if (id !== null) {
      afterNextRender(
        () =>
          document
            .getElementById(sectionAnchor(id))
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        { injector: this.injector },
      );
    }
  }

  closeExam(): void {
    this.examDialog.set(null);
  }

  anchorOf(view: SectionView): string {
    return sectionAnchor(view.section.id);
  }

  private positionAfter(view: SectionView, rowId: number | null): RowPosition {
    const index = view.section.rows.findIndex((row) => row.id === rowId);

    if (rowId === null || index < 0) {
      return { slot: view.firstSlot - 1, level: view.firstLevel - 1 };
    }

    return { slot: view.firstSlot + index, level: view.firstLevel + index };
  }

  private examClassGroups(view: SectionView): SelectItemGroup[] {
    const owned = new Set(this.availableClasses(view).map((unitClass) => unitClass.id));

    return this.groupClasses(this.usableClasses().filter((c) => !owned.has(c.id)));
  }

  private groupClasses(classes: UnitClass[]): SelectItemGroup[] {
    return CLASS_RANK_ORDER.map((rank: ClassRank) => ({
      label: rank,
      items: classes.filter((unitClass) => unitClass.rank === rank),
    })).filter((group) => group.items.length > 0);
  }

  // --- saves -------------------------------------------------------------

  readonly saveName = signal('');
  readonly renamingId = signal<string | null>(null);
  readonly renameValue = signal('');
  readonly pending = signal<PendingAction | null>(null);

  readonly saveProblems = computed<string[]>(() => {
    const problems: string[] = [];
    const map = this.seedMap();
    const views = this.sectionViews();
    const missing: string[] = [];

    if (map.unitId === null) {
      missing.push('a unit');
    }

    if (views[0]?.classId === null) {
      missing.push('a class');
    }

    if (missing.length > 0) {
      problems.push(`The seed still needs ${listing(missing)}.`);
    }

    for (const view of views) {
      if (view.section.exam && view.section.exam.classId === null) {
        problems.push(`${view.title} has no exam class selected.`);
      }

      if (this.endLevelOf(view) > MAX_LEVEL) {
        problems.push(`${view.title} goes past Lv ${MAX_LEVEL}; remove the extra levels.`);
      }

      view.section.comparators.forEach((comparator, index) => {
        if (comparator.classId === null) {
          problems.push(`${view.title}: comparator ${index + 1} has no class selected.`);
        }
      });
    }

    const reported = new Set<number>();

    for (const view of views) {
      const entries: { slot: number; label: string }[] = [];

      if (view.exam) {
        entries.push({
          slot: view.exam.slot,
          label: `${this.examLabel(view)} (Lv ${view.exam.level + 1} roll)`,
        });
      }

      view.section.rows.forEach((_, index) =>
        entries.push({ slot: view.firstSlot + index, label: `Lv ${this.levelOf(view, index)}` }),
      );

      for (const entry of entries) {
        if (reported.has(entry.slot)) {
          continue;
        }

        const clashing = this.rollsAt(entry.slot)
          .map((roll, statIndex) =>
            roll.state === 'conflict' ? this.statLabels[this.statKeys[statIndex]] : null,
          )
          .filter((stat): stat is string => stat !== null);

        if (clashing.length > 0) {
          reported.add(entry.slot);
          problems.push(
            `${view.title}: ${entry.label} ${clashing.join(', ')} cannot be both a hit and a miss.`,
          );
        }
      }
    }

    return problems;
  });

  readonly canSave = computed(() => this.saveProblems().length === 0);

  private readonly attemptedSave = signal(false);

  readonly visibleProblems = computed(() =>
    this.attemptedSave() ? this.saveProblems() : [],
  );

  private readonly isPristine = computed(() => {
    const map = this.seedMap();
    const only = map.sections[0];

    return (
      map.sections.length === 1 &&
      only !== undefined &&
      map.unitId === null &&
      map.statsLevel === MIN_LEVEL &&
      map.availableClassIds.length === 0 &&
      this.statKeys.every((stat) => map.startStats[stat] === null) &&
      (only.classId === null || this.state.alwaysAvailableClassIds.includes(only.classId)) &&
      only.comparators.length === 0 &&
      only.rows.length === 1 &&
      this.statKeys.every((stat) => only.rows[0].marks[stat] === 0)
    );
  });

  readonly canReset = computed(
    () => this.changeCount() > 0 || !this.isPristine(),
  );

  defaultSaveName(): string {
    const unitId = this.seedMap().unitId;
    const unit = this.units().find((u) => u.id === unitId)?.name;

    return unit ? `${unit} seed map` : 'Seed map';
  }

  examCount(save: SeedSave): number {
    return save.seed.sections.length - 1;
  }

  saveToList(): void {
    if (!this.canSave()) {
      this.attemptedSave.set(true);
      return;
    }

    const typed = this.saveName().trim();
    const name = typed === '' ? `${this.defaultSaveName()} — ${stamp()}` : typed;
    const save = this.storage.create(name, this.currentDto());

    this.state.markSaved({ id: save.id, name: save.name });
    this.saveName.set('');
    this.pending.set(null);
    this.attemptedSave.set(false);
    this.status.set(`Saved “${save.name}”.`);
  }

  requestLoad(save: SeedSave): void {
    this.guard({ kind: 'load', save }, () => this.apply(save));
  }

  requestReset(): void {
    this.guard({ kind: 'reset' }, () => this.reset());
  }

  requestOverwrite(save: SeedSave): void {
    if (!this.canSave()) {
      this.attemptedSave.set(true);
      return;
    }

    this.pending.set({
      kind: 'overwrite',
      save,
      message: `Replace “${save.name}” with the board as it is now?`,
    });
  }

  requestDelete(save: SeedSave): void {
    this.pending.set({
      kind: 'delete',
      save,
      message: `Delete “${save.name}”? This cannot be undone.`,
    });
  }

  confirmPending(): void {
    const action = this.pending();

    if (!action) {
      return;
    }

    this.pending.set(null);

    switch (action.kind) {
      case 'load':
        if (action.save) {
          this.apply(action.save);
        }
        break;
      case 'upload':
        if (action.file) {
          void this.read(action.file);
        }
        break;
      case 'overwrite':
        this.overwrite(action.save);
        break;
      case 'reset':
        this.reset();
        break;
      case 'delete':
        if (action.save) {
          this.storage.remove(action.save.id);

          if (this.loadedSave()?.id === action.save.id) {
            this.state.forgetSave();
          }

          this.status.set(`Deleted “${action.save.name}”.`);
        }
        break;
    }
  }

  cancelPending(): void {
    this.pending.set(null);
  }

  startRename(save: SeedSave): void {
    this.renamingId.set(save.id);
    this.renameValue.set(save.name);
  }

  commitRename(): void {
    const id = this.renamingId();
    const name = this.renameValue().trim();

    if (id && name !== '') {
      this.storage.rename(id, name);
    }

    this.renamingId.set(null);
  }

  cancelRename(): void {
    this.renamingId.set(null);
  }

  download(): void {
    if (!this.canSave()) {
      this.attemptedSave.set(true);
      return;
    }

    const active = this.loadedSave();

    this.downloadSave({
      version: CURRENT_SAVE_VERSION,
      id: active?.id ?? newSaveId(),
      name: active?.name ?? `${this.defaultSaveName()} — ${stamp()}`,
      savedAt: new Date().toISOString(),
      seed: this.currentDto(),
    });
  }

  downloadSave(save: SeedSave): void {
    const blob = new Blob([JSON.stringify(save, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `${slugify(save.name)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url));
  }

  onUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';

    if (file) {
      this.guard({ kind: 'upload', file }, () => void this.read(file));
    }
  }

  private async read(file: File): Promise<void> {
    let parsed: unknown;

    try {
      parsed = JSON.parse(await file.text());
    } catch {
      this.status.set(`“${file.name}” is not a valid JSON file.`);
      return;
    }

    try {
      const save = migrateSave(parsed);
      this.storage.upsert(save);
      this.apply(save);
    } catch (error) {
      this.status.set(
        error instanceof Error ? error.message : 'That file could not be read.',
      );
    }
  }

  private overwrite(save: SeedSave | undefined): void {
    const updated = save && this.storage.overwrite(save.id, this.currentDto());

    if (updated) {
      this.state.markSaved({ id: updated.id, name: updated.name });
      this.attemptedSave.set(false);
      this.status.set(`Updated “${updated.name}”.`);
    }
  }

  private reset(): void {
    this.state.reset();
    this.saveName.set('');
    this.attemptedSave.set(false);
    this.status.set('Started a new seed map.');
  }

  private guard(action: PendingAction, run: () => void): void {
    const count = this.changeCount();

    if (count === 0) {
      run();
      return;
    }

    this.pending.set({
      ...action,
      message: `You have ${count} unsaved change${count === 1 ? '' : 's'}. Discard ${count === 1 ? 'it' : 'them'}?`,
    });
  }

  private apply(save: SeedSave): void {
    const missing = this.serializer.missingNames(save.seed);

    this.state.restore(this.serializer.fromDto(save.seed), {
      id: save.id,
      name: save.name,
    });

    this.attemptedSave.set(false);

    this.status.set(
      missing.length === 0
        ? `Loaded “${save.name}”.`
        : `Loaded “${save.name}”, but these are no longer in the data and were left blank: ${missing.join(', ')}.`,
    );
  }

  private currentDto() {
    return this.serializer.toDto(this.state.snapshot());
  }

  // --- internals ---------------------------------------------------------

  private combine(
    unitId: number | null,
    classId: number | null,
    mount: Mount | null,
  ): GrowthRates {
    const unit = this.units().find((u) => u.id === unitId) ?? null;
    const unitClass = this.classes().find((c) => c.id === classId) ?? null;

    return sumGrowth(toGrowth(unit), toGrowth(unitClass), toGrowth(mount));
  }

  private loadMounts(classId: number | null): void {
    if (classId === null || this.requestedClasses.has(classId)) {
      return;
    }

    this.requestedClasses.add(classId);
    this.api
      .getMountsForClass(classId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((mounts) =>
        this.mountsByClass.update((byClass) =>
          new Map(byClass).set(classId, mounts),
        ),
      );
  }
}

function branchKey(sectionId: number, rowId: number | null): string {
  return `${sectionId}:${rowId ?? 'exam'}`;
}

function sectionAnchor(sectionId: number): string {
  return `seed-section-${sectionId}`;
}

function describeExam(sectionTitle: string, from: RowPosition): string {
  const skipped = from.level + 1;

  return `Taken in ${sectionTitle} in place of the Lv ${skipped} level up, so it uses that roll. Lv ${skipped} then comes from the roll after it.`;
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug === '' ? 'seed-map' : slug;
}

function stamp(): string {
  const now = new Date();

  return `${now.toLocaleDateString()} ${now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function listing(parts: string[]): string {
  return parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
