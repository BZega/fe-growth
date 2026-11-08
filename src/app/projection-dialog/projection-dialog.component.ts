import { ChangeDetectionStrategy, Component, computed, HostListener, inject, input, OnInit, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { bondLevelOf, CLASS_LEVEL_CONFIGS, ClassRank, CLASS_RANK_ORDER, DEFAULT_MOUNT_BOND_LEVEL, Mount, mountBonusAt, STAT_KEYS, STAT_LABELS, Unit, UnitClass } from '../models/growth.models';
import { levelUpGrowth, projectStats, RecruitmentChapter, SIGNATURE_MOUNTS, stepAtLevel } from '../models/recruitment.models';
import { GrowthDataService } from '../services/growth-data.service';
import { SpoilerService } from '../services/spoiler.service';

interface Tier {
  label: string;
  /** Level the tier's class is taken at; extra classes can start from start + 1 to end - 1. */
  start: number;
  end: number;
  ranks: readonly ClassRank[];
}

// Each tier also allows every rank below it.
export const PROJECTION_TIERS: readonly Tier[] = [
  { label: 'Lv 1–5 · Base', start: 1, end: 5, ranks: ['Base'] },
  { label: 'Lv 5–20 · Beginner', start: 5, end: 20, ranks: ['Base', 'Beginner'] },
  { label: 'Lv 20–35 · Speciality', start: 20, end: 35, ranks: ['Base', 'Beginner', 'Speciality'] },
  { label: 'Lv 35–45 · Advanced', start: 35, end: 45, ranks: ['Base', 'Beginner', 'Speciality', 'Advanced'] },
  { label: 'Lv 45–99 · Master / Divine', start: 45, end: 99, ranks: CLASS_RANK_ORDER },
];

export const MAX_PROJECTION_LEVEL = 99;

interface PlanEntry {
  id: number;
  classId: number | null;
  fromLevel: number;
  /** Null picks the class's default mount. */
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
  templateUrl: './projection-dialog.component.html',
  styleUrls: ['../exam-dialog/exam-dialog.component.scss', './projection-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectionDialogComponent implements OnInit {
  private readonly api = inject(GrowthDataService);
  private readonly spoilers = inject(SpoilerService);

  /** The unit whose growths are used (for Mu, Mu*'s). */
  readonly unit = input.required<Unit>();
  readonly chapters = input.required<readonly RecruitmentChapter[]>();
  readonly initialChapter = input<number | null>(null);

  readonly closed = output<void>();

  readonly tiers = PROJECTION_TIERS;
  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;
  readonly maxLevel = MAX_PROJECTION_LEVEL;

  private readonly classes = toSignal(this.api.getClasses(), { initialValue: [] as UnitClass[] });
  private readonly mounts = toSignal(this.api.getMounts(), { initialValue: [] as Mount[] });

  private nextId = 1;

  readonly page = signal<'plan' | 'results'>('plan');
  readonly chapterNumber = signal<number | null>(null);
  /** One list per tier; the first entry is the tier's main class. */
  readonly plan = signal<PlanEntry[][]>([]);
  readonly endLevel = signal(MAX_PROJECTION_LEVEL);

  readonly chapter = computed<RecruitmentChapter | null>(
    () => this.chapters().find((candidate) => candidate.chapter === this.chapterNumber()) ?? this.chapters().at(0) ?? null,
  );

  private readonly usableClasses = computed(() =>
    this.spoilers.filter(this.api.classesForUnit(this.unit())),
  );

  private readonly noble = computed(() => this.classes().find((unitClass) => unitClass.rank === 'Base') ?? null);

  ngOnInit(): void {
    this.chapterNumber.set(this.initialChapter() ?? this.chapters()[0]?.chapter ?? null);
    this.plan.set(this.tiers.map((tier, index) => [
      this.newEntry(index === 0 ? (this.noble()?.id ?? null) : null, tier.start),
    ]));
  }

  private newEntry(classId: number | null, fromLevel: number): PlanEntry {
    return { id: this.nextId++, classId, fromLevel, mountId: null, bondLevel: null };
  }

  classGroups(tierIndex: number): { rank: ClassRank; classes: UnitClass[] }[] {
    const ranks = this.tiers[tierIndex].ranks;

    return ranks
      .map((rank) => ({ rank, classes: this.usableClasses().filter((unitClass) => unitClass.rank === rank) }))
      .filter((group) => group.classes.length > 0);
  }

  canAddClass(tierIndex: number): boolean {
    const tier = this.tiers[tierIndex];

    return tierIndex > 0 && (this.plan()[tierIndex]?.length ?? 0) < tier.end - tier.start;
  }

  // A new class starts the level after the tier's latest switch, so it stays in order.
  addClass(tierIndex: number): void {
    const tier = this.tiers[tierIndex];

    this.plan.update((plan) =>
      plan.map((entries, index) => {
        if (index !== tierIndex) {
          return entries;
        }

        const latest = Math.max(...entries.map((entry) => entry.fromLevel));

        return [...entries, this.newEntry(null, Math.min(latest + 1, tier.end - 1))];
      }),
    );
  }

  removeClass(tierIndex: number, id: number): void {
    this.plan.update((plan) =>
      plan.map((entries, index) => (index === tierIndex ? entries.filter((entry) => entry.id !== id) : entries)),
    );
  }

  setClass(tierIndex: number, id: number, value: string): void {
    this.patch(tierIndex, id, { classId: value === '' ? null : Number(value), mountId: null, bondLevel: null });
  }

  setMount(tierIndex: number, id: number, value: string): void {
    this.patch(tierIndex, id, { mountId: Number(value), bondLevel: null });
  }

  setBondLevel(tierIndex: number, id: number, value: string): void {
    this.patch(tierIndex, id, { bondLevel: Number(value) });
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

  // Defaults to the unit's own mount when it has one of this type, otherwise the first one.
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

  /** For classes with class levels, the unit levels where the next class level kicks in. */
  levelGates(entry: PlanEntry): { gates: readonly number[]; mountMultiplier: number } | null {
    const config = CLASS_LEVEL_CONFIGS[this.classOf(entry)?.name ?? ''];

    return config ? { gates: config.levels, mountMultiplier: config.mountMultiplier } : null;
  }

  // Extra classes can only switch in strictly after the tier starts and before the next tier.
  setFromLevel(tierIndex: number, id: number, event: Event): void {
    const field = event.target as HTMLInputElement;
    const tier = this.tiers[tierIndex];
    const level = Math.round(Number(field.value));

    if (field.value.trim() === '' || !Number.isFinite(level)) {
      field.value = String(this.plan()[tierIndex].find((entry) => entry.id === id)?.fromLevel ?? tier.start + 1);
      return;
    }

    const clamped = Math.min(tier.end - 1, Math.max(tier.start + 1, level));
    field.value = String(clamped);
    this.patch(tierIndex, id, { fromLevel: clamped });
  }

  private patch(tierIndex: number, id: number, change: Partial<PlanEntry>): void {
    this.plan.update((plan) =>
      plan.map((entries, index) =>
        index === tierIndex ? entries.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)) : entries,
      ),
    );
  }

  // Tiers left empty keep the class from before.
  private readonly steps = computed<ResolvedStep[]>(() =>
    this.plan()
      .flat()
      .flatMap((entry) => {
        const unitClass = this.classOf(entry);

        return unitClass
          ? [{ fromLevel: entry.fromLevel, unitClass, mount: this.mountOf(entry), bondLevel: this.bondLevelOf(entry) }]
          : [];
      }),
  );

  readonly startLevel = computed(() => this.chapter()?.level ?? 1);

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
