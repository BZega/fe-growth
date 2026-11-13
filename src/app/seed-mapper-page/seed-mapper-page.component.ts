import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, Injector, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { BranchMode, ExamDialogComponent } from '../exam-dialog/exam-dialog.component';
import { PickerDialogComponent, PickerGroup } from '../picker-dialog/picker-dialog.component';
import { classUnlockLevel, snapRank } from '../class-plan/class-plan.component';
import { ProjectionDialogComponent } from '../projection-dialog/projection-dialog.component';
import { RecruitmentChapter } from '../models/recruitment.models';
import { baseStatsOf, bondLevelOf, characterKey, ClassAbility, CLASS_RANK_ORDER, ClassRank, GrowthRates, MAX_EQUIPPED_ABILITIES, Mount, MountBondLevel, mountBonusAt, mountGrowthAt, SKILL_LABELS, STAT_KEYS, STAT_LABELS, StatBoostAbility, StatKey, sumGrowth, toGrowth, Unit, UnitClass, WEAPON_KEYS, ZERO_GROWTH } from '../models/growth.models';
import { estimateRoll, MAX_UNRELIABLE_GAINS, MIN_READINGS_TO_FILL, RollBounds, rollBounds, RollEstimate, RollObservation, UNKNOWN_ROLL } from '../models/seed-roll';
import { CURRENT_SAVE_VERSION, migrateSave, newSaveId, SeedSave } from '../models/seed-save';
import { SearchableSelectComponent, SelectItemGroup } from '../searchable-select/searchable-select.component';
import { HelpDialogComponent } from '../help-dialog/help-dialog.component';
import { SeedRngDialogComponent, RngSection } from '../seed-rng-dialog/seed-rng-dialog.component';
import { SeedTimelineComponent } from '../seed-timeline/seed-timeline.component';
import { GrowthDataService } from '../services/growth-data.service';
import { SeedSaveStorageService } from '../services/seed-save-storage.service';
import { SeedSerializerService } from '../services/seed-serializer.service';
import { SpoilerService } from '../services/spoiler.service';
import { ALWAYS_AVAILABLE_CLASS, availableClassIds, effectiveClassId, ExamDraft, InlineExam, MAX_LEVEL, MIN_LEVEL, rowSwitchesTo, SeedComparator, SeedMapperStateService, SeedRow, SeedSection, switchesClass } from '../services/seed-mapper-state.service';

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
  /** Pair bond level with `mount`; null when the mount has none. */
  mountLevel: number | null;
  growth: GrowthRates;
  parentTitle: string | null;
  exam: { slot: number; level: number } | null;
  /** Branched off by reclassing rather than an exam, so no roll was used. */
  reclass: boolean;
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
  classBonus: number;
  versus: string | null;
  mountBonus: number;
  mountSource: string | null;
  abilityBonus: number;
  abilitySources: string[];
  floorBoost: number;
}

interface SectionStart {
  gains: GrowthRates;
  floorBoosts: GrowthRates;
  examBoost: GrowthRates;
}

interface Progress {
  gains: GrowthRates;
  floorBoosts: GrowthRates;
}

interface SectionProgress {
  start: SectionStart;
  /** Totals after each level up. */
  after: Progress[];
  /** Class base-stat boost from the inline exam before each level up (zero when there's none). */
  boosts: GrowthRates[];
}

const NO_START: SectionStart = {
  gains: ZERO_GROWTH,
  floorBoosts: ZERO_GROWTH,
  examBoost: ZERO_GROWTH,
};

type PickerDialogState = { kind: 'classes' } | { kind: 'abilities'; sectionId: number };

interface PickerConfig {
  title: string;
  context: string;
  groups: PickerGroup[];
  selected: string[];
  max: number | null;
}

interface ExamDialogState {
  title: string;
  context: string;
  reclassContext: string;
  classGroups: SelectItemGroup[];
  reclassGroups: SelectItemGroup[];
  initial: { classId: number | null; chance: number; passed: boolean; keepClass?: boolean } | null;
  initialMode: BranchMode;
  canSwitchMode: boolean;
  strBounds: RollBounds;
  /** The level the exam or reclass class applies from. */
  level: number;
  parentId: number;
  afterRowId: number | null;
  sectionId: number | null;
  /** The level up a reclass starts on; null adds a new level after the last one. */
  reclassRowId: number | null;
  /** From Exam / Reclass: an exam is added inline at the end of the section instead of branching. */
  inline: boolean;
  /** From the timeline: exams and reclasses become branches beside any already at this level. */
  branch?: boolean;
}

const STR_INDEX = STAT_KEYS.indexOf('str');
const NO_ROLLS: RollEstimate[] = STAT_KEYS.map(() => estimateRoll([]));

@Component({
  selector: 'app-seed-mapper-page',
  imports: [
    DatePipe,
    ExamDialogComponent,
    HelpDialogComponent,
    NgTemplateOutlet,
    PickerDialogComponent,
    ProjectionDialogComponent,
    SearchableSelectComponent,
    SeedRngDialogComponent,
    SeedTimelineComponent,
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

  readonly timelineView = signal(true);

  readonly seedMap = this.state.seedMap;
  readonly saves = this.storage.saves;
  readonly changeCount = this.state.changeCount;
  readonly loadedSave = this.state.loadedSave;
  readonly status = signal<string | null>(null);
  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;
  readonly minLevel = MIN_LEVEL;
  readonly maxLevel = MAX_LEVEL;
  readonly helpText = [
    'Enter the unit’s stats and change the starting level if it is not 1. Mark which stats rose on each level up.',
    'Starting stats exclude mount bonuses. Each block adds its mount’s bonus at the selected bond level.',
    'Use Classes to choose classes the unit already has available; Noble/Commoner is always available. Use Abilities to equip up to five stat-boosting abilities for each section.',
    'Comparators replay the same levels in another available class. A marked stat may fill automatically when the same roll raised another stat with an equal or lower growth rate, once a level up on that roll raised 3 or more stats.',
    'Press + beside a level to branch off with an exam in place of that level up, or choose Exam / Reclass to continue the seed with an exam row and a new level. Passing an exam raises stats below the new class floor; the added points appear on the exam line and the pass chance is available in Seed RNG.',
    'Choose Reclass in the same dialog to switch to a class the unit already has from that level on. The level stays, and the new class growth rates appear on a reclass row above it.',
  ];

  readonly allUnits = toSignal(this.api.getUnits(), { initialValue: [] as Unit[] });
  private readonly classes = toSignal(this.api.getClasses(), {
    initialValue: [] as UnitClass[],
  });

  // Starting stats are entered as the unit joins, in this class, so class bonuses are measured from it.
  private readonly startingClass = computed(
    () => this.classes().find((unitClass) => unitClass.name === ALWAYS_AVAILABLE_CLASS) ?? null,
  );

  readonly statBoostAbilities = toSignal(this.api.getStatBoostAbilities(), {
    initialValue: [] as StatBoostAbility[],
  });

  // Character-only abilities (e.g. Mu's Warrior's Blood) are offered just to that character.
  private readonly unitAbilities = computed(() => {
    const unit = this.api.unitById(this.seedMap().unitId);
    const key = unit ? characterKey(unit.name) : null;

    return this.statBoostAbilities().filter(
      (ability) => !ability.characters || (key !== null && ability.characters.includes(key)),
    );
  });

  readonly maxAbilities = MAX_EQUIPPED_ABILITIES;
  readonly weaponKeys = WEAPON_KEYS;
  readonly weaponLabels = SKILL_LABELS;

  private readonly classAbilities = toSignal(this.api.getClassAbilities(), {
    initialValue: [] as ClassAbility[],
  });

  /** Classes whose mastery teaches each ability, by ability name; abilities no class teaches are absent. */
  private readonly abilityClasses = computed(() => {
    const result = new Map<string, UnitClass[]>();

    for (const ability of this.classAbilities()) {
      const teachers = this.classes().filter((unitClass) => unitClass.masterAbilities.includes(ability.id));

      if (teachers.length > 0) {
        result.set(ability.name, teachers);
      }
    }

    return result;
  });

  // A class's mastery ability can only be equipped once that class is in the section's pool.
  private missingClassesFor(ability: StatBoostAbility, sectionId: number): UnitClass[] {
    const teachers = this.abilityClasses().get(ability.name);
    const pool = new Set((this.availableBySection().get(sectionId) ?? []).map((unitClass) => unitClass.id));

    return !teachers || teachers.some((unitClass) => pool.has(unitClass.id)) ? [] : teachers;
  }

  readonly units = computed(() => this.spoilers.filter(this.allUnits()));

  readonly classGroups = computed<SelectItemGroup[]>(() =>
    this.groupClasses(this.spoilers.filter(this.usableClasses())),
  );

  /** Classes the chosen unit may take (gender and mount restrictions applied). */
  private readonly usableClasses = computed(() =>
    this.api.classesForUnit(this.api.unitById(this.seedMap().unitId)),
  );

  private readonly mountsByClass = signal<ReadonlyMap<number, Mount[]>>(new Map());
  private readonly requestedClasses = new Set<number>();

  readonly examDialog = signal<ExamDialogState | null>(null);
  readonly rngSectionId = signal<number | null>(null);
  readonly pickerDialog = signal<PickerDialogState | null>(null);

  readonly pickerConfig = computed<PickerConfig | null>(() => {
    const dialog = this.pickerDialog();

    if (!dialog) {
      return null;
    }

    if (dialog.kind === 'classes') {
      const always = new Set(this.state.alwaysAvailableClassIds);

      return {
        title: 'Available classes',
        context: `Classes the unit can take without an exam. ${ALWAYS_AVAILABLE_CLASS} is always available.`,
        groups: this.groupClasses(this.spoilers.filter(this.usableClasses())).map((group) => ({
          label: group.label,
          items: group.items.map((unitClass) => ({
            id: String(unitClass.id),
            name: unitClass.name,
            fixed: always.has(unitClass.id),
          })),
        })),
        selected: this.seedMap().availableClassIds.map(String),
        max: null,
      };
    }

    const view = this.sectionViews().find((candidate) => candidate.section.id === dialog.sectionId);
    const toItem = (ability: StatBoostAbility) => {
      const missing = this.missingClassesFor(ability, dialog.sectionId);

      return {
        id: ability.name,
        name: ability.name,
        description: ability.description,
        family: familyOf(ability),
        locked: missing.length > 0 ? `Needs ${missing.map((unitClass) => unitClass.name).join(' or ')} in available classes` : undefined,
      };
    };
    const abilities = this.unitAbilities();

    return {
      title: `Stat abilities${view ? ` · ${view.title}` : ''}`,
      context: `Up to ${MAX_EQUIPPED_ABILITIES} can be equipped. A class's mastery ability needs that class in the available classes. Picking an upgrade replaces the ability it upgrades.`,
      groups: [
        { label: 'Class abilities', items: abilities.filter((ability) => !ability.characters).map(toItem) },
        { label: 'Character abilities', items: abilities.filter((ability) => ability.characters).map(toItem) },
      ].filter((group) => group.items.length > 0),
      selected: view ? this.equippedAbilities(view).map((ability) => ability.name) : [],
      max: MAX_EQUIPPED_ABILITIES,
    };
  });

  readonly rngSections = computed<RngSection[]>(() =>
    this.sectionViews().map((view) => ({
      id: view.section.id,
      title: view.title,
      rows: [
        ...(view.exam
          ? [
              {
                label: this.examLabel(view),
                exam: true,
                passChance: view.section.exam?.passed ? view.section.exam.chance : null,
                rolls: this.rollsAt(view.exam.slot),
              },
            ]
          : []),
        ...view.section.rows.flatMap((row, index) => [
          ...(row.exam
            ? [
                {
                  label: row.exam.passed ? 'Exam' : 'Skip',
                  exam: true,
                  passChance: row.exam.passed ? row.exam.chance : null,
                  rolls: this.rollsAt(this.slotOf(view, index) - 1),
                },
              ]
            : []),
          {
            label: `Lv ${this.levelOf(view, index)}`,
            exam: false,
            passChance: null,
            rolls: this.rollsAt(this.slotOf(view, index)),
          },
        ]),
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

        for (const row of section.rows) {
          this.loadMounts(rowSwitchesTo(row));
        }

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
    let reclassNumber = 0;

    for (const section of map.sections) {
      const classId = effectiveClassId(map.sections, section);
      const mount = this.resolveMount(classId, section.mountId);
      const mountLevel = bondLevelOf(mount, section.mountLevel)?.level ?? null;
      const growth = this.combine(map.unitId, classId, mount, mountLevel);
      let view: SectionView;

      if (section.exam) {
        const parent = byId.get(section.exam.parentId);

        if (!parent) {
          continue;
        }

        const from = this.positionAfter(parent, section.exam.afterRowId);
        const reclass = section.exam.reclass === true;

        // An exam uses the next roll itself; a reclass leaves it to the next level up.
        view = {
          section,
          title: reclass ? `Reclass ${++reclassNumber}` : `Exam ${++examNumber}`,
          classId,
          mount,
          mountLevel,
          growth,
          parentTitle: parent.title,
          exam: reclass ? null : { slot: from.slot + 1, level: from.level },
          reclass,
          firstSlot: from.slot + (reclass ? 1 : 2),
          firstLevel: from.level + 1,
        };
      } else {
        view = {
          section,
          title: 'Seed',
          classId,
          mount,
          mountLevel,
          growth,
          parentTitle: null,
          exam: null,
          reclass: false,
          firstSlot: 0,
          firstLevel: map.statsLevel + 1,
        };
      }

      views.push(view);
      byId.set(section.id, view);
    }

    return views;
  });

  // Each level up's class and growth, following reclasses within the section.
  private readonly rowClasses = computed(() => {
    const result = new Map<number, { classId: number | null; growth: GrowthRates }[]>();

    for (const view of this.sectionViews()) {
      let current = { classId: view.classId, growth: view.growth };

      result.set(
        view.section.id,
        view.section.rows.map((row) => {
          const switchesTo = rowSwitchesTo(row);

          if (switchesTo !== null && switchesTo !== current.classId) {
            const { mount, level } = this.mountFor(view, switchesTo);
            current = {
              classId: switchesTo,
              growth: this.combine(this.seedMap().unitId, switchesTo, mount, level),
            };
          }

          return current;
        }),
      );
    }

    return result;
  });

  /** The roll a level up uses: inline exams before it each use one roll of their own. */
  slotOf(view: SectionView, rowIndex: number): number {
    return levelSlot(view.firstSlot, view.section.rows, rowIndex);
  }

  /** The class used for a level up; `rowIndex` -1 means the section's starting class. */
  rowClassId(view: SectionView, rowIndex: number): number | null {
    return this.rowClasses().get(view.section.id)?.[rowIndex]?.classId ?? view.classId;
  }

  rowGrowth(view: SectionView, rowIndex: number): GrowthRates | null {
    return view.classId === null
      ? null
      : (this.rowClasses().get(view.section.id)?.[rowIndex]?.growth ?? view.growth);
  }

  // The section's mount carries over to a reclass when the new class can ride it.
  private mountFor(view: SectionView, classId: number | null): { mount: Mount | null; level: number | null } {
    if (classId === view.classId) {
      return { mount: view.mount, level: view.mountLevel };
    }

    const mount = this.resolveMount(classId, view.section.mountId);

    return { mount, level: bondLevelOf(mount, view.section.mountLevel)?.level ?? null };
  }

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

  openClassPicker(): void {
    this.pickerDialog.set({ kind: 'classes' });
  }

  openAbilityPicker(view: SectionView): void {
    this.pickerDialog.set({ kind: 'abilities', sectionId: view.section.id });
  }

  closePicker(): void {
    this.pickerDialog.set(null);
  }

  onPickerConfirmed(ids: string[]): void {
    const dialog = this.pickerDialog();

    if (dialog?.kind === 'classes') {
      const chosen = new Set(ids.map(Number));
      const current = this.seedMap().availableClassIds;

      current.filter((id) => !chosen.has(id)).forEach((id) => this.state.removeAvailableClass(id));
      [...chosen].filter((id) => !current.includes(id)).forEach((id) => {
        this.state.addAvailableClass(id);
        this.loadMounts(id);
      });
    } else if (dialog?.kind === 'abilities') {
      this.state.setAbilities(dialog.sectionId, ids);
    }

    this.closePicker();
  }

  pickerSummary(names: readonly string[]): string {
    return names.length > 0 ? names.join(', ') : 'None';
  }

  availableClassNames(view: SectionView): string[] {
    return this.availableClasses(view).map((unitClass) => unitClass.name);
  }

  equippedAbilityNames(view: SectionView): string[] {
    return this.equippedAbilities(view).map((ability) => ability.name);
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

  mountItems(classId: number | null, selectedId: number | null | undefined): Mount[] {
    return this.spoilers.filterKeeping(this.mountsForClass(classId), selectedId);
  }

  private resolveMount(classId: number | null, mountId: number | null): Mount | null {
    const options = this.mountsForClass(classId);

    return options.find((m) => m.id === mountId) ?? options.at(0) ?? null;
  }

  bondLevelsOf(mount: Mount | null): readonly MountBondLevel[] {
    return mount?.bondLevels ?? [];
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

    return view !== null && this.canTakeExamAt(view, this.endLevelOf(view));
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

    return `Add a Lv ${next} to ${view.title} that starts with an exam or a reclass`;
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
    return this.canTakeExam(view);
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

  comparatorMountLevel(comparator: SeedComparator): number | null {
    return bondLevelOf(this.comparatorMountOf(comparator), comparator.mountLevel)?.level ?? null;
  }

  comparatorGrowth(comparator: SeedComparator): GrowthRates {
    return this.combine(
      this.seedMap().unitId,
      comparator.classId,
      this.comparatorMountOf(comparator),
      comparator.mountLevel,
    );
  }

  // --- roll inference ----------------------------------------------------

  private blocksOf(view: SectionView): { growthOf: (rowIndex: number) => GrowthRates; rows: SeedRow[] }[] {
    const blocks: { growthOf: (rowIndex: number) => GrowthRates; rows: SeedRow[] }[] = [];

    if (view.classId !== null) {
      blocks.push({
        growthOf: (rowIndex) => this.rowGrowth(view, rowIndex) ?? view.growth,
        rows: view.section.rows,
      });
    }

    for (const comparator of view.section.comparators) {
      if (comparator.classId !== null) {
        const growth = this.comparatorGrowth(comparator);
        blocks.push({ growthOf: () => growth, rows: comparator.rows });
      }
    }

    return blocks;
  }

  private readonly hitCeilings = computed(() => {
    const ceilings = new Map<number, (number | null)[]>();
    const readings = new Map<number, number>();

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
        block.rows.forEach((row, rowIndex) => {
          if (!isReliable(row)) {
            return;
          }

          const slot = this.slotOf(view, rowIndex);
          readings.set(slot, (readings.get(slot) ?? 0) + 1);

          this.statKeys.forEach((stat, statIndex) => {
            if (row.marks[stat] > 0) {
              lower(slot, statIndex, block.growthOf(rowIndex)[stat]);
            }
          });
        });
      }

      view.section.rows.forEach((row, rowIndex) => {
        if (row.exam?.passed) {
          lower(this.slotOf(view, rowIndex) - 1, STR_INDEX, row.exam.chance);
        }
      });

      const exam = view.section.exam;

      if (exam?.passed && view.exam) {
        lower(view.exam.slot, STR_INDEX, exam.chance);
      }
    }

    return { ceilings, readings };
  });

  // Only fills in a stat once a reliable level up (more than 2 stats) on the same roll sets a ceiling.
  effectiveRow(growth: GrowthRates | null, row: SeedRow, slot: number): EffectiveRow {
    const { ceilings: bySlot, readings } = this.hitCeilings();
    const ceilings = (readings.get(slot) ?? 0) >= MIN_READINGS_TO_FILL ? bySlot.get(slot) : undefined;
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
    const uncertain = new Set<number>();

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
          const slot = this.slotOf(view, rowIndex);

          // A bad level up may have had stats added by the guaranteed minimum, so it says nothing about the roll.
          if (!isReliable(row)) {
            uncertain.add(slot);
            return;
          }

          const growth = block.growthOf(rowIndex);
          const { marks } = this.effectiveRow(growth, row, slot);

          this.statKeys.forEach((stat, statIndex) =>
            add(slot, statIndex, {
              growth: growth[stat],
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

      // Negative ids keep inline exams apart from exam sections.
      view.section.rows.forEach((row, rowIndex) => {
        if (row.exam) {
          add(this.slotOf(view, rowIndex) - 1, STR_INDEX, {
            growth: row.exam.chance,
            hit: row.exam.passed,
            examOf: -row.id,
          });
        }
      });
    }

    return { observations, uncertain };
  });

  private readonly rollsBySlot = computed(() => {
    const rolls = new Map<number, RollEstimate[]>();
    const { observations, uncertain } = this.observationsBySlot();

    for (const [slot, perStat] of observations) {
      rolls.set(
        slot,
        perStat.map((list) => (list.length === 0 && uncertain.has(slot) ? UNKNOWN_ROLL : estimateRoll(list))),
      );
    }

    for (const slot of uncertain) {
      if (!rolls.has(slot)) {
        rolls.set(slot, this.statKeys.map(() => UNKNOWN_ROLL));
      }
    }

    return rolls;
  });

  rollsAt(slot: number): RollEstimate[] {
    return this.rollsBySlot().get(slot) ?? NO_ROLLS;
  }

  private strBoundsAt(slot: number, ignoreExamOf: number | null): RollBounds {
    const readings = this.observationsBySlot().observations.get(slot)?.[STR_INDEX] ?? [];

    return rollBounds(
      readings.filter((reading) => ignoreExamOf === null || reading.examOf !== ignoreExamOf),
    );
  }

  // --- stats -------------------------------------------------------------

  private gainsOf(
    view: SectionView,
    growthOf: (rowIndex: number) => GrowthRates | null,
    rows: SeedRow[],
    until: number,
  ): GrowthRates {
    const gains = { ...ZERO_GROWTH };

    for (let index = 0; index <= until && index < rows.length; index++) {
      const { marks } = this.effectiveRow(growthOf(index), rows[index], this.slotOf(view, index));

      for (const stat of this.statKeys) {
        gains[stat] += marks[stat];
      }
    }

    return gains;
  }

  // Walks each section's level ups in order, so passed inline exams can raise stats to the class's
  // base stats from what the unit has at that point, and exam branches start from the right totals.
  private readonly progress = computed(() => {
    const result = new Map<number, SectionProgress>();
    const views = this.sectionViews();

    for (const view of views) {
      const exam = view.section.exam;
      let start: SectionStart = NO_START;

      if (exam) {
        const parent = result.get(exam.parentId);
        const parentView = views.find((candidate) => candidate.section.id === exam.parentId);
        const until = parentView?.section.rows.findIndex((row) => row.id === exam.afterRowId) ?? -1;
        const carried = (until >= 0 ? parent?.after[until] : undefined) ?? parent?.start ?? NO_START;
        const examBoost = switchesClass(exam) && !exam.reclass ? this.floorBoost(exam.classId, carried.gains) : ZERO_GROWTH;

        start = {
          gains: sumGrowth(carried.gains, examBoost),
          floorBoosts: sumGrowth(carried.floorBoosts, examBoost),
          examBoost,
        };
      }

      let gains = start.gains;
      let floorBoosts = start.floorBoosts;
      const after: Progress[] = [];
      const boosts: GrowthRates[] = [];

      view.section.rows.forEach((row, rowIndex) => {
        const boost = row.exam && switchesClass(row.exam) ? this.floorBoost(row.exam.classId, gains) : ZERO_GROWTH;
        const { marks } = this.effectiveRow(this.rowGrowth(view, rowIndex), row, this.slotOf(view, rowIndex));

        gains = sumGrowth(gains, boost, toGrowth(marks));
        floorBoosts = sumGrowth(floorBoosts, boost);
        boosts.push(boost);
        after.push({ gains, floorBoosts });
      });

      result.set(view.section.id, { start, after, boosts });
    }

    return result;
  });

  private floorBoost(classId: number | null, gains: GrowthRates): GrowthRates {
    const unitClass = this.classes().find((c) => c.id === classId);
    const boost = { ...ZERO_GROWTH };

    if (!unitClass) {
      return boost;
    }

    const base = this.seedMap().startStats;
    const startingClass = this.startingClass();

    for (const stat of this.statKeys) {
      const start = base[stat];

      if (start !== null) {
        const own = start - (startingClass?.bonusStats[stat] ?? 0) + gains[stat];
        boost[stat] = Math.max(0, unitClass.classFloorStats[stat] - own);
      }
    }

    return boost;
  }

  examBoostOf(view: SectionView): GrowthRates {
    return this.sectionStart(view).examBoost;
  }

  inlineBoostOf(view: SectionView, rowIndex: number): GrowthRates {
    return this.progress().get(view.section.id)?.boosts[rowIndex] ?? ZERO_GROWTH;
  }

  hasInlineBoost(view: SectionView, rowIndex: number): boolean {
    const boost = this.inlineBoostOf(view, rowIndex);

    return this.statKeys.some((stat) => boost[stat] > 0);
  }

  inlineBoostTitle(view: SectionView, row: SeedRow, rowIndex: number, stat: StatKey): string {
    const unitClass = this.classes().find((c) => c.id === row.exam?.classId);
    const floor = unitClass?.classFloorStats[stat] ?? 0;

    return `+${this.inlineBoostOf(view, rowIndex)[stat]} to reach ${unitClass?.name ?? 'the class'}'s base ${this.statLabels[stat]} of ${floor}`;
  }

  examBoostTitle(view: SectionView, stat: StatKey): string {
    const unitClass = this.classes().find((c) => c.id === view.section.exam?.classId);
    const floor = unitClass?.classFloorStats[stat] ?? 0;

    return `+${this.examBoostOf(view)[stat]} to reach ${unitClass?.name ?? 'the class'}'s base ${this.statLabels[stat]} of ${floor}`;
  }

  private sectionStart(view: SectionView): SectionStart {
    return this.progress().get(view.section.id)?.start ?? NO_START;
  }

  startStatsOf(view: SectionView): StatTotal[] {
    const start = this.sectionStart(view);

    return this.totals(
      start.gains,
      start.floorBoosts,
      view.classId,
      view.classId === null ? null : ridden(view.mount, view.mountLevel),
      view.section,
    );
  }

  endStatsOf(view: SectionView, comparator: SeedComparator | null = null): StatTotal[] {
    const rows = comparator ? comparator.rows : view.section.rows;
    const start = this.sectionStart(view);

    if (comparator) {
      const growth = comparator.classId === null ? null : this.comparatorGrowth(comparator);
      const mount =
        comparator.classId === null
          ? null
          : ridden(this.comparatorMountOf(comparator), this.comparatorMountLevel(comparator));
      const gains = sumGrowth(start.gains, this.gainsOf(view, () => growth, rows, rows.length - 1));

      return this.totals(gains, start.floorBoosts, comparator.classId, mount, view.section);
    }

    // After a reclass or inline exam, the end stats use the class (and its bonuses) the section ends in.
    const classId = this.rowClassId(view, rows.length - 1);
    const { mount, level } = this.mountFor(view, classId);
    const end = this.progress().get(view.section.id)?.after.at(-1) ?? start;

    return this.totals(end.gains, end.floorBoosts, classId, classId === null ? null : ridden(mount, level), view.section);
  }

  startLevelOf(view: SectionView): number {
    return view.exam ? view.exam.level : view.firstLevel - 1;
  }

  endLevelOf(view: SectionView): number {
    return this.levelOf(view, view.section.rows.length - 1);
  }

  private totals(
    gains: GrowthRates,
    floorBoosts: GrowthRates,
    classId: number | null,
    mount: RiddenMount | null,
    section: SeedSection,
  ): StatTotal[] {
    const base = this.seedMap().startStats;
    const seed = this.sectionViews()[0];
    const seedClassId = seed?.classId ?? null;
    const seedClass = this.classes().find((c) => c.id === seedClassId) ?? null;
    const startingClass = this.startingClass();
    const shownClass =
      classId === null ? seedClass : (this.classes().find((c) => c.id === classId) ?? null);
    const shownMount = mount ?? ridden(seed?.mount ?? null, seed?.mountLevel ?? null);
    const abilities = this.equippedAbilitiesOf(section.abilities, section.id);

    return this.statKeys.map((stat) => {
      const start = base[stat];
      const classBonus =
        (shownClass?.bonusStats[stat] ?? 0) - (startingClass?.bonusStats[stat] ?? 0);
      const mountBonus = shownMount.bonus[stat];
      const boostOf = (ability: StatBoostAbility) =>
        (ability.boosts[stat] ?? 0) +
        (section.weapon ? (ability.weaponBoosts?.[section.weapon]?.[stat] ?? 0) : 0);
      const boosting = abilities.filter((ability) => boostOf(ability) !== 0);
      const abilityBonus = boosting.reduce((sum, ability) => sum + boostOf(ability), 0);

      return {
        value: start === null ? null : start + gains[stat] + classBonus + mountBonus + abilityBonus,
        gained: gains[stat] - floorBoosts[stat],
        classBonus,
        versus: classBonus === 0 ? null : (startingClass?.name ?? null),
        mountBonus,
        mountSource: mountBonus === 0 ? null : shownMount.label,
        abilityBonus,
        abilitySources: boosting.map((ability) => ability.name),
        floorBoost: floorBoosts[stat],
      };
    });
  }

  statTotalTitle(total: StatTotal): string {
    const parts = [total.gained === 0 ? 'No gains yet' : `+${total.gained} from level ups`];

    if (total.floorBoost > 0) {
      parts.push(`+${total.floorBoost} from class base stats`);
    }

    if (total.classBonus !== 0) {
      const sign = total.classBonus > 0 ? '+' : '−';
      parts.push(
        `${sign}${Math.abs(total.classBonus)} class stat bonus` +
          (total.versus ? ` compared with ${total.versus}` : ''),
      );
    }

    if (total.mountBonus !== 0) {
      parts.push(
        `+${total.mountBonus} mount stat bonus` +
          (total.mountSource ? ` from ${total.mountSource}` : ''),
      );
    }

    if (total.abilityBonus !== 0) {
      parts.push(`+${total.abilityBonus} from ${total.abilitySources.join(', ')}`);
    }

    return parts.join('; ');
  }

  // Names in saves that are no longer in the data file, not this character's, or whose class
  // isn't available are skipped; of an ability and its upgrade, only the last one equipped counts.
  private equippedAbilitiesOf(names: readonly string[], sectionId: number): StatBoostAbility[] {
    const byFamily = new Map<string, StatBoostAbility>();

    for (const name of names) {
      const ability = this.unitAbilities().find((candidate) => candidate.name === name);

      if (ability && this.missingClassesFor(ability, sectionId).length === 0) {
        byFamily.delete(familyOf(ability));
        byFamily.set(familyOf(ability), ability);
      }
    }

    return [...byFamily.values()];
  }

  equippedAbilities(view: SectionView): StatBoostAbility[] {
    return this.equippedAbilitiesOf(view.section.abilities, view.section.id);
  }

  usesWeapon(view: SectionView): boolean {
    return this.equippedAbilities(view).some((ability) => ability.weaponBoosts);
  }

  onWeaponChange(view: SectionView, value: string): void {
    this.state.setWeapon(view.section.id, WEAPON_KEYS.find((weapon) => weapon === value) ?? null);
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

  // At Lv 1 a picked character starts from their base stats; from another level the stats are entered by hand.
  onUnitChange(id: number | null): void {
    this.state.setUnit(id);

    const unit = this.allUnits().find((candidate) => candidate.id === id);
    const base = unit ? baseStatsOf(unit.name) : null;

    if (base && this.seedMap().statsLevel === MIN_LEVEL) {
      this.state.setStartStats(base);
    }
  }

  onClassChange(view: SectionView, classId: number | null): void {
    this.state.setClass(view.section.id, classId);
    this.loadMounts(classId);
  }

  onMountChange(view: SectionView, id: number | null): void {
    this.state.setMount(view.section.id, id);
  }

  onMountLevelChange(view: SectionView, value: string): void {
    this.state.setMountLevel(view.section.id, Number(value));
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

  onComparatorMountLevelChange(
    view: SectionView,
    comparator: SeedComparator,
    value: string,
  ): void {
    this.state.setComparatorMountLevel(view.section.id, comparator.id, Number(value));
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
      this.openExam(view, view.section.rows.length, true);
    }
  }

  openExamAt(view: SectionView, rowIndex: number): void {
    if (!this.canTakeExamAtRow(view, rowIndex)) {
      return;
    }

    // A level that already branches gets another branch beside the existing ones.
    if (this.hasExamAt(view, rowIndex)) {
      this.openBranchAt(view, rowIndex);
    } else {
      this.openExam(view, rowIndex, false);
    }
  }

  /** The newest branch made from the timeline, so it can be brought into focus. */
  readonly createdBranchId = signal<number | null>(null);

  /** Opens the exam / reclass dialog to branch in place of (or, for a reclass, from) the level up at `rowIndex`. */
  openBranchAt(view: SectionView, rowIndex: number): void {
    if (!this.canTakeExam(view)) {
      return;
    }

    const row = this.rowBefore(view, rowIndex);
    const from = this.positionAfter(view, row?.id ?? null);
    const taken = this.branchClassIds(view, row?.id ?? null);

    this.examDialog.set({
      title: `Branch at Lv ${from.level + 1}`,
      context: describeExam(view.title, from),
      reclassContext: `Switches class from the Lv ${from.level + 1} level up on, as a branch of ${view.title}. No roll is used.`,
      classGroups: this.examClassGroups(view, from.level + 1, taken),
      reclassGroups: this.reclassOptions(view, rowIndex, taken),
      initial: null,
      initialMode: 'exam',
      canSwitchMode: true,
      strBounds: this.strBoundsAt(from.slot + 1, null),
      level: from.level + 1,
      parentId: view.section.id,
      afterRowId: row?.id ?? null,
      sectionId: null,
      reclassRowId: null,
      inline: false,
      branch: true,
    });
  }

  /** Classes already taken (by exam or reclass) by the branches at this point. */
  private branchClassIds(view: SectionView, afterRowId: number | null): Set<number> {
    return new Set(
      this.seedMap()
        .sections.filter(
          (section) => section.exam?.parentId === view.section.id && section.exam.afterRowId === afterRowId,
        )
        .map((section) => section.exam!.classId)
        .filter((classId) => classId !== null),
    );
  }

  // --- shared rolls --------------------------------------------------------

  private growthKey(view: SectionView, rowIndex: number): string {
    const growth = this.rowGrowth(view, rowIndex);

    return `${this.slotOf(view, rowIndex)}|${growth === null ? 'none' : this.statKeys.map((stat) => growth[stat]).join(',')}`;
  }

  // Level ups with the same roll and growth rates rise the same way: the first one (in section
  // order) holds the marks and the rest follow it.
  private readonly rowOwners = computed(() => {
    const owners = new Map<string, { view: SectionView; rowIndex: number }>();
    const sharers = new Map<string, { sectionId: number; rowId: number }[]>();

    for (const view of this.sectionViews()) {
      view.section.rows.forEach((row, rowIndex) => {
        const key = this.growthKey(view, rowIndex);

        if (!owners.has(key)) {
          owners.set(key, { view, rowIndex });
        }

        sharers.set(key, [...(sharers.get(key) ?? []), { sectionId: view.section.id, rowId: row.id }]);
      });
    }

    return { owners, sharers };
  });

  /** The level up whose marks this one follows; itself when it holds its own. */
  rowOwner(view: SectionView, rowIndex: number): { view: SectionView; rowIndex: number } {
    return this.rowOwners().owners.get(this.growthKey(view, rowIndex)) ?? { view, rowIndex };
  }

  /** Marks a stat on a level up and on every other level up with the same roll and growth rates. */
  setSharedMark(view: SectionView, rowIndex: number, stat: StatKey, risen: boolean): void {
    const targets = this.rowOwners().sharers.get(this.growthKey(view, rowIndex)) ?? [
      { sectionId: view.section.id, rowId: view.section.rows[rowIndex].id },
    ];

    this.state.setMarks(targets, stat, risen ? 1 : 0);
  }

  // From +, an exam branches off in place of the level up at `rowIndex`; from Exam / Reclass it's
  // added inline as a new level. A reclass always starts on that level, in the same section.
  private openExam(view: SectionView, rowIndex: number, inline: boolean): void {
    const row = this.rowBefore(view, rowIndex);
    const from = this.positionAfter(view, row?.id ?? null);

    this.examDialog.set({
      title: 'Exam or reclass',
      context: inline ? describeInlineExam(view.title, from.level + 1) : describeExam(view.title, from),
      reclassContext: describeReclass(view.title, from.level + 1),
      classGroups: this.examClassGroups(view, from.level + 1),
      reclassGroups: this.reclassOptions(view, rowIndex),
      initial: null,
      initialMode: 'exam',
      canSwitchMode: true,
      strBounds: this.strBoundsAt(from.slot + 1, null),
      level: from.level + 1,
      parentId: view.section.id,
      afterRowId: row?.id ?? null,
      sectionId: null,
      reclassRowId: view.section.rows[rowIndex]?.id ?? null,
      inline,
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
      reclassContext: '',
      classGroups: this.examClassGroups(parent, view.exam.level + 1, new Set(), exam.classId),
      reclassGroups: [],
      initial: { classId: exam.classId, chance: exam.chance, passed: exam.passed, keepClass: exam.keepClass },
      initialMode: 'exam',
      canSwitchMode: false,
      strBounds: this.strBoundsAt(view.exam.slot, view.section.id),
      level: view.exam.level + 1,
      parentId: parent.section.id,
      afterRowId: exam.afterRowId,
      sectionId: view.section.id,
      reclassRowId: null,
      inline: false,
    });
  }

  onExamConfirmed(draft: ExamDraft): void {
    const dialog = this.examDialog();

    if (!dialog) {
      return;
    }

    this.examDialog.set(null);
    this.loadMounts(draft.classId);

    if (dialog.branch) {
      const branchId = this.state.addBranch(dialog.parentId, dialog.afterRowId, draft);

      if (this.timelineView()) {
        this.createdBranchId.set(branchId);
      } else if (branchId !== null) {
        this.scrollToSection(branchId);
      }
      return;
    }

    if (draft.reclass) {
      if (dialog.reclassRowId === null) {
        this.state.addReclassLevel(dialog.parentId, draft.classId);
      } else {
        this.state.setReclass(dialog.parentId, dialog.reclassRowId, draft.classId);
      }
      return;
    }

    if (dialog.sectionId !== null) {
      this.state.updateExam(dialog.sectionId, draft);
      return;
    }

    if (dialog.inline) {
      this.state.addExamLevel(dialog.parentId, {
        classId: draft.classId,
        chance: draft.chance,
        passed: draft.passed,
        ...(draft.passed && draft.keepClass ? { keepClass: true } : {}),
      });
      return;
    }

    const id = this.state.addExam(dialog.parentId, dialog.afterRowId, draft);

    if (id !== null) {
      this.scrollToSection(id);
    }
  }

  private scrollToSection(id: number): void {
    afterNextRender(
      () =>
        document
          .getElementById(sectionAnchor(id))
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      { injector: this.injector },
    );
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

    return { slot: levelSlot(view.firstSlot, view.section.rows, index), level: view.firstLevel + index };
  }

  // Classes the unit doesn't have yet, unlocked by `level` (see RANK_UNLOCK_LEVELS); `keepId` stays listed.
  private examClassGroups(
    view: SectionView,
    level: number,
    taken: ReadonlySet<number> = new Set(),
    keepId: number | null = null,
  ): SelectItemGroup[] {
    const owned = new Set(this.availableClasses(view).map((unitClass) => unitClass.id));

    return this.groupClasses(
      this.spoilers
        .filter(this.usableClasses())
        .filter((c) => c.id === keepId || (!owned.has(c.id) && !taken.has(c.id) && classUnlockLevel(c) <= level)),
    );
  }

  // A reclass switches to another class the unit already has (and has unlocked by that level), other than the one it's leaving.
  reclassOptions(view: SectionView, rowIndex: number, taken: ReadonlySet<number> = new Set()): SelectItemGroup[] {
    const leaving = this.rowClassId(view, rowIndex - 1);
    const level = this.levelOf(view, rowIndex);
    const keepId = view.section.rows[rowIndex]?.reclassTo ?? null;

    return this.groupClasses(
      this.spoilers
        .filter(this.availableClasses(view))
        .filter((c) => c.id === keepId || (c.id !== leaving && !taken.has(c.id) && classUnlockLevel(c) <= level)),
    );
  }

  onReclassChange(view: SectionView, row: SeedRow, classId: number | null): void {
    if (classId !== null) {
      this.state.setReclass(view.section.id, row.id, classId);
      this.loadMounts(classId);
    }
  }

  removeReclass(view: SectionView, row: SeedRow): void {
    this.state.setReclass(view.section.id, row.id, null);
  }

  // Classes the unit doesn't have yet and has unlocked by that level, plus the one this exam is already for.
  inlineExamOptions(view: SectionView, row: SeedRow): SelectItemGroup[] {
    return this.examClassGroups(view, this.levelOf(view, view.section.rows.indexOf(row)), new Set(), row.exam?.classId ?? null);
  }

  /** The rank a class list opens at for the level a class applies from. */
  focusRank(groups: readonly SelectItemGroup[], level: number): string | null {
    return snapRank(level, groups);
  }

  private updateInlineExam(view: SectionView, row: SeedRow, change: Partial<InlineExam>): void {
    if (row.exam) {
      this.state.setInlineExam(view.section.id, row.id, { ...row.exam, ...change });
    }
  }

  onInlineExamClass(view: SectionView, row: SeedRow, classId: number | null): void {
    if (classId !== null) {
      this.updateInlineExam(view, row, { classId });
      this.loadMounts(classId);
    }
  }

  onInlineExamChance(view: SectionView, row: SeedRow, event: Event): void {
    const input = event.target as HTMLInputElement;
    const chance = Number(input.value);

    if (input.value.trim() !== '' && Number.isInteger(chance) && chance >= 0 && chance <= 100) {
      this.updateInlineExam(view, row, { chance });
    } else {
      input.value = String(row.exam?.chance ?? '');
    }
  }

  onInlineExamPassed(view: SectionView, row: SeedRow, passed: boolean): void {
    this.updateInlineExam(view, row, { passed, keepClass: passed ? row.exam?.keepClass : undefined });
  }

  onInlineExamSwitch(view: SectionView, row: SeedRow, switchClass: boolean): void {
    this.updateInlineExam(view, row, { keepClass: switchClass ? undefined : true });
  }

  removeInlineExam(view: SectionView, row: SeedRow): void {
    this.state.setInlineExam(view.section.id, row.id, null);
  }

  private groupClasses(classes: UnitClass[]): SelectItemGroup[] {
    return CLASS_RANK_ORDER.map((rank: ClassRank) => ({
      label: rank,
      items: classes.filter((unitClass) => unitClass.rank === rank),
    })).filter((group) => group.items.length > 0);
  }

  // --- projection ---------------------------------------------------------

  /** The unit and its stats at the end of a section, as the start of a stat projection. */
  readonly projection = signal<{ unit: Unit; start: RecruitmentChapter } | null>(null);

  canProject(view: SectionView): boolean {
    const stats = this.seedMap().startStats;

    return this.isComplete(view) && this.statKeys.every((stat) => stats[stat] !== null) && this.endLevelOf(view) < MAX_LEVEL;
  }

  projectionHint(view: SectionView): string {
    if (!this.isComplete(view)) {
      return 'Pick a unit and class first';
    }

    if (!this.canProject(view)) {
      return 'Enter every starting stat first';
    }

    return `Project ${view.title}'s stats from Lv ${this.endLevelOf(view)}, planning reclasses on the way`;
  }

  openProjection(view: SectionView): void {
    const unit = this.api.unitById(this.seedMap().unitId);
    const unitClass = this.classes().find((c) => c.id === this.rowClassId(view, view.section.rows.length - 1));

    if (!unit || !unitClass || !this.canProject(view)) {
      return;
    }

    const gains = (this.progress().get(view.section.id)?.after.at(-1) ?? this.sectionStart(view)).gains;
    const startingBonus = this.startingClass()?.bonusStats;
    const base = this.seedMap().startStats;
    const stats = { ...ZERO_GROWTH };

    // Without class, mount or ability bonuses: the projection adds the bonuses of the class it ends in.
    for (const stat of this.statKeys) {
      stats[stat] = (base[stat] ?? 0) - (startingBonus?.[stat] ?? 0) + gains[stat];
    }

    this.projection.set({
      unit,
      start: {
        chapter: 0,
        level: this.endLevelOf(view),
        className: unitClass.name,
        skillRanks: {},
        stats,
        inventory: [],
        equippedAbilities: [],
      },
    });
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

      view.section.rows.forEach((row, index) => {
        if (row.exam && row.exam.classId === null) {
          problems.push(`${view.title}: the exam before Lv ${this.levelOf(view, index)} has no class selected.`);
        }
      });

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

      view.section.rows.forEach((row, index) => {
        if (row.exam) {
          entries.push({
            slot: this.slotOf(view, index) - 1,
            label: `${row.exam.passed ? 'Exam' : 'Skip'} before Lv ${this.levelOf(view, index)}`,
          });
        }

        entries.push({ slot: this.slotOf(view, index), label: `Lv ${this.levelOf(view, index)}` });
      });

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
    mountLevel: number | null,
  ): GrowthRates {
    const unit = this.units().find((u) => u.id === unitId) ?? null;
    const unitClass = this.classes().find((c) => c.id === classId) ?? null;

    return sumGrowth(toGrowth(unit), toGrowth(unitClass), mountGrowthAt(mount, mountLevel));
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

/** A level up that raised more stats than the guaranteed minimum could have added. */
function isReliable(row: SeedRow): boolean {
  return STAT_KEYS.filter((stat) => row.marks[stat] > 0).length > MAX_UNRELIABLE_GAINS;
}

function levelSlot(firstSlot: number, rows: readonly SeedRow[], rowIndex: number): number {
  let exams = 0;

  for (let index = 0; index <= rowIndex && index < rows.length; index++) {
    exams += rows[index].exam ? 1 : 0;
  }

  return firstSlot + rowIndex + exams;
}

interface RiddenMount {
  bonus: GrowthRates;
  label: string | null;
}

function ridden(mount: Mount | null, level: number | null): RiddenMount {
  return {
    bonus: mountBonusAt(mount, level),
    label: mount && level !== null ? `${mount.name} (Bond Lv ${level})` : null,
  };
}

/** An ability and its upgrades share the name of the base ability. */
function familyOf(ability: StatBoostAbility): string {
  return ability.upgradeOf ?? ability.name;
}

function sectionAnchor(sectionId: number): string {
  return `seed-section-${sectionId}`;
}

function describeExam(sectionTitle: string, from: RowPosition): string {
  const skipped = from.level + 1;

  return `Taken in ${sectionTitle} in place of the Lv ${skipped} level up, so it uses that roll. Lv ${skipped} then comes from the roll after it.`;
}

function describeReclass(sectionTitle: string, level: number): string {
  return `Switches class in ${sectionTitle} from the Lv ${level} level up on. No roll is used and no level is skipped.`;
}

function describeInlineExam(sectionTitle: string, level: number): string {
  return `Taken in ${sectionTitle} just before a new Lv ${level}. It uses a roll of its own, and a pass switches class from Lv ${level} on.`;
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
