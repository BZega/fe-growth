import { ChangeDetectionStrategy, Component, computed, HostListener, inject, input, OnInit, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { bondLevelOf, CLASS_LEVEL_CONFIGS, ClassRank, CLASS_RANK_ORDER, DEFAULT_MOUNT_BOND_LEVEL, Mount, mountBonusAt, STAT_KEYS, STAT_LABELS, Unit, UnitClass } from '../models/growth.models';
import { levelUpGrowth, projectStats, RecruitmentChapter, SIGNATURE_MOUNTS, stepAtLevel } from '../models/recruitment.models';
import { GrowthDataService } from '../services/growth-data.service';
import { SearchableSelectComponent, SelectItemGroup } from '../searchable-select/searchable-select.component';
import { SpoilerService } from '../services/spoiler.service';

export const RANK_UNLOCK_LEVELS: Readonly<Record<ClassRank, number>> = {
  Base: 1,
  Beginner: 1,
  Speciality: 15,
  Advanced: 30,
  Master: 40,
  Divine: 1,
};

const ANY_LEVEL_CLASS_NAMES: ReadonlySet<string> = new Set(['Dancer']);

export function classUnlockLevel(unitClass: UnitClass): number {
  return ANY_LEVEL_CLASS_NAMES.has(unitClass.name) ? 1 : RANK_UNLOCK_LEVELS[unitClass.rank];
}

const RECLASS_GATES = [...new Set(Object.values(RANK_UNLOCK_LEVELS))].filter((level) => level > 1).sort((a, b) => a - b);

export const MAX_PROJECTION_LEVEL = 99;

interface PlanEntry {
  id: number;
  classId: number | null;
  fromLevel: number;
  mountId: number | null;
  bondLevel: number | null;
}

interface ResolvedStep {
  fromLevel: number;
  unitClass: UnitClass;
  mount: Mount | null;
  bondLevel: number | null;
}

@Component({
  selector: 'app-projection-dialog',
  imports: [SearchableSelectComponent],
  templateUrl: './projection-dialog.component.html',
  styleUrls: ['../exam-dialog/exam-dialog.component.scss', './projection-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectionDialogComponent implements OnInit {
  private readonly api = inject(GrowthDataService);
  private readonly spoilers = inject(SpoilerService);

  readonly unit = input.required<Unit>();
  readonly chapters = input.required<readonly RecruitmentChapter[]>();
  readonly initialChapter = input<number | null>(null);

  readonly closed = output<void>();

  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;
  readonly maxLevel = MAX_PROJECTION_LEVEL;

  private readonly classes = toSignal(this.api.getClasses(), { initialValue: [] as UnitClass[] });
  private readonly mounts = toSignal(this.api.getMounts(), { initialValue: [] as Mount[] });

  private nextId = 1;

  readonly page = signal<'plan' | 'results'>('plan');
  readonly chapterNumber = signal<number | null>(null);
  /** The starting class first (null follows the chapter's class), then each reclass in level order. */
  readonly plan = signal<PlanEntry[]>([]);
  readonly endLevel = signal(MAX_PROJECTION_LEVEL);

  readonly chapter = computed<RecruitmentChapter | null>(
    () => this.chapters().find((candidate) => candidate.chapter === this.chapterNumber()) ?? this.chapters().at(0) ?? null,
  );

  private readonly usableClasses = computed(() =>
    this.spoilers.filter(this.api.classesForUnit(this.unit())),
  );

  private readonly noble = computed(() => this.classes().find((unitClass) => unitClass.rank === 'Base') ?? null);

  readonly startLevel = computed(() => this.chapter()?.level ?? 1);

  private readonly joiningClassId = computed(() => {
    const name = this.chapter()?.className;

    return (this.classes().find((candidate) => candidate.name === name) ?? this.noble())?.id ?? null;
  });

  readonly startClassId = computed(() => this.plan()[0]?.classId ?? this.joiningClassId());

  /** The starting row with its class filled in, for mounts and class level gates. */
  readonly startEntry = computed<PlanEntry | null>(() => {
    const first = this.plan()[0];

    return first ? { ...first, classId: this.startClassId() } : null;
  });

  // Each reclass sits after the one before it, even when a later chapter raises the starting level.
  readonly rowLevels = computed(() => {
    let previous = this.startLevel();

    return this.plan().map((entry, index) => {
      if (index > 0) {
        previous = Math.max(previous + 1, entry.fromLevel);
      }

      return previous;
    });
  });

  ngOnInit(): void {
    this.chapterNumber.set(this.initialChapter() ?? this.chapters()[0]?.chapter ?? null);
    this.plan.set([this.newEntry(null, 1)]);
  }

  private newEntry(classId: number | null, fromLevel: number): PlanEntry {
    return { id: this.nextId++, classId, fromLevel, mountId: null, bondLevel: null };
  }

  /** Classes unlocked at a level, by rank; `keepId` stays listed so a current choice never vanishes. */
  classGroups(level: number, excludeId: number | null = null, keepId: number | null = null): { rank: ClassRank; classes: UnitClass[] }[] {
    const keep = this.classes().find((unitClass) => unitClass.id === keepId);
    const pool = keep && !this.usableClasses().includes(keep) ? [...this.usableClasses(), keep] : this.usableClasses();

    return CLASS_RANK_ORDER.map((rank) => ({
      rank,
      classes: pool.filter(
        (unitClass) =>
          unitClass.rank === rank &&
          (unitClass.id === keepId || (unitClass.id !== excludeId && classUnlockLevel(unitClass) <= level)),
      ),
    })).filter((group) => group.classes.length > 0);
  }

  startClassGroups(): { rank: ClassRank; classes: UnitClass[] }[] {
    return this.classGroups(this.startLevel(), null, this.startClassId());
  }

  // One list per row, kept as signals so the dropdowns only rebuild when their options change.
  readonly rowClassItems = computed<SelectItemGroup[][]>(() =>
    this.plan().map((_, position) =>
      (position === 0 ? this.startClassGroups() : this.reclassGroups(position)).map((group) => ({
        label: group.rank,
        items: group.classes,
      })),
    ),
  );

  pickClass(id: number, classId: number | null): void {
    this.setClass(id, classId === null ? '' : String(classId));
  }

  /** Everything unlocked at the reclass level except the class the unit is already in. */
  reclassGroups(position: number): { rank: ClassRank; classes: UnitClass[] }[] {
    const entry = this.plan()[position];
    const previous = this.classBefore(position);

    return this.classGroups(this.rowLevels()[position], previous === entry.classId ? null : previous, entry.classId);
  }

  private classBefore(position: number): number | null {
    let previous = this.startClassId();

    for (const entry of this.plan().slice(1, position)) {
      previous = entry.classId ?? previous;
    }

    return previous;
  }

  hasPendingReclass(): boolean {
    return this.plan().slice(1).some((entry) => entry.classId === null);
  }

  canAddClass(): boolean {
    return !this.hasPendingReclass() && (this.rowLevels().at(-1) ?? MAX_PROJECTION_LEVEL) < MAX_PROJECTION_LEVEL - 1;
  }

  // Starts at the next rank unlock after the last row, or the next level when every rank is open.
  addClass(): void {
    if (!this.canAddClass()) {
      return;
    }

    const last = this.rowLevels().at(-1)!;
    const next = RECLASS_GATES.find((gate) => gate > last) ?? last + 1;

    this.plan.update((plan) => [...plan, this.newEntry(null, Math.min(next, MAX_PROJECTION_LEVEL - 1))]);
  }

  removeClass(id: number): void {
    this.plan.update((plan) => plan.filter((entry, index) => index === 0 || entry.id !== id));
  }

  setClass(id: number, value: string): void {
    this.patch(id, { classId: value === '' ? null : Number(value), mountId: null, bondLevel: null });
  }

  setMount(id: number, value: string): void {
    this.patch(id, { mountId: Number(value), bondLevel: null });
  }

  setBondLevel(id: number, value: string): void {
    this.patch(id, { bondLevel: Number(value) });
  }

  classOf(entry: PlanEntry): UnitClass | null {
    return this.classes().find((unitClass) => unitClass.id === entry.classId) ?? null;
  }

  mountsFor(entry: PlanEntry): Mount[] {
    const unitClass = this.classOf(entry);
    const type = unitClass ? this.api.mountTypeOfClass(unitClass.name) : 'None';

    return type === 'None' ? [] : this.mounts().filter((mount) => mount.type === type);
  }

  mountChoices(entry: PlanEntry, selectedId: number | undefined): Mount[] {
    return this.spoilers.filterKeeping(this.mountsFor(entry), selectedId);
  }

  mountOf(entry: PlanEntry): Mount | null {
    const options = this.mountsFor(entry);
    const signature = SIGNATURE_MOUNTS[this.unit().name];

    return (
      options.find((mount) => mount.id === entry.mountId) ??
      options.find((mount) => mount.name === signature?.mount) ??
      options[0] ??
      null
    );
  }

  bondLevelOf(entry: PlanEntry): number | null {
    const mount = this.mountOf(entry);
    const signature = SIGNATURE_MOUNTS[this.unit().name];
    const fallback = mount && signature?.mount === mount.name ? signature.bondLevel : DEFAULT_MOUNT_BOND_LEVEL;

    return bondLevelOf(mount, entry.bondLevel ?? fallback)?.level ?? null;
  }

  levelGates(entry: PlanEntry): { gates: readonly number[]; mountMultiplier: number } | null {
    const config = CLASS_LEVEL_CONFIGS[this.classOf(entry)?.name ?? ''];

    return config ? { gates: config.levels, mountMultiplier: config.mountMultiplier } : null;
  }

  switchBounds(position: number): { min: number; max: number } {
    const levels = this.rowLevels();

    return { min: levels[position - 1] + 1, max: (levels[position + 1] ?? MAX_PROJECTION_LEVEL) - 1 };
  }

  /** Moves a reclass between its neighbours; a class not yet unlocked at the new level is cleared. */
  setReclassLevel(id: number, level: number): number {
    const position = this.plan().findIndex((entry) => entry.id === id);

    if (position < 1) {
      return this.startLevel();
    }

    const { min, max } = this.switchBounds(position);
    const clamped = Math.min(max, Math.max(min, Math.round(level)));
    const unitClass = this.classOf(this.plan()[position]);
    const locked = unitClass !== null && classUnlockLevel(unitClass) > clamped;

    this.patch(id, locked ? { fromLevel: clamped, classId: null, mountId: null, bondLevel: null } : { fromLevel: clamped });
    return clamped;
  }

  setFromLevel(id: number, event: Event): void {
    const field = event.target as HTMLInputElement;
    const level = Number(field.value);
    const position = this.plan().findIndex((entry) => entry.id === id);

    field.value = String(
      field.value.trim() === '' || !Number.isFinite(level) ? this.rowLevels()[position] : this.setReclassLevel(id, level),
    );
  }

  private patch(id: number, change: Partial<PlanEntry>): void {
    this.plan.update((plan) => plan.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)));
  }

  // Reclasses still waiting for a class are skipped, so the class before them carries on.
  private readonly steps = computed<ResolvedStep[]>(() => {
    const levels = this.rowLevels();

    return this.plan().flatMap((entry, index) => {
      const resolved = index === 0 ? this.startEntry()! : entry;
      const unitClass = this.classOf(resolved);

      return unitClass
        ? [{ fromLevel: levels[index], unitClass, mount: this.mountOf(resolved), bondLevel: this.bondLevelOf(resolved) }]
        : [];
    });
  });

  private readonly endStep = computed(() => stepAtLevel(this.steps(), this.endLevel()));

  readonly endClass = computed(() => this.endStep()?.unitClass ?? null);

  readonly endMount = computed(() => {
    const step = this.endStep();

    return step?.mount ? { name: step.mount.name, bondLevel: step.bondLevel } : null;
  });

  readonly projection = computed(() => {
    const chapter = this.chapter();

    if (!chapter) {
      return [];
    }

    const unit = this.unit();
    const steps = this.steps();
    const end = Math.max(this.startLevel(), this.endLevel());
    const projected = projectStats(chapter.stats, chapter.level, end, (level) => {
      const step = stepAtLevel(steps, level);

      return step ? levelUpGrowth(unit, step.unitClass, level, step.mount, step.bondLevel) : null;
    });
    const step = this.endStep();
    const classBonus = step?.unitClass.bonusStats;
    const mountBonus = mountBonusAt(step?.mount ?? null, step?.bondLevel ?? null);

    return this.statKeys.map((stat) => ({
      stat,
      label: this.statLabels[stat],
      base: projected[stat],
      bonus: classBonus?.[stat] ?? 0,
      mountBonus: mountBonus[stat],
      total: projected[stat] + (classBonus?.[stat] ?? 0) + mountBonus[stat],
    }));
  });

  submit(): void {
    this.endLevel.set(this.maxLevel);
    this.page.set('results');
  }

  setEndLevel(value: string): void {
    const level = Math.round(Number(value));

    if (Number.isFinite(level)) {
      this.endLevel.set(Math.min(this.maxLevel, Math.max(this.startLevel(), level)));
    }
  }

  fixed(value: number): string {
    return value.toFixed(2);
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }
}
