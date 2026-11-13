import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { bondLevelOf, CLASS_LEVEL_CONFIGS, ClassRank, CLASS_RANK_ORDER, DEFAULT_MOUNT_BOND_LEVEL, Mount, Unit, UnitClass } from '../models/growth.models';
import { SIGNATURE_MOUNTS } from '../models/recruitment.models';
import { SearchableSelectComponent, SelectItemGroup } from '../searchable-select/searchable-select.component';
import { GrowthDataService } from '../services/growth-data.service';
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

// Levels players usually reclass at; ranks become available earlier (RANK_UNLOCK_LEVELS).
const USUAL_RECLASS_LEVELS: readonly number[] = [5, 20, 35, 45];

// The rank a class list opens at for a level, highest first; falls back down when a rank has no classes.
const SNAP_RANKS: readonly { rank: ClassRank; from: number }[] = [
  { rank: 'Master', from: 45 },
  { rank: 'Advanced', from: 35 },
  { rank: 'Speciality', from: 20 },
  { rank: 'Beginner', from: 1 },
];

/** The rank group a class list opens at for a level, among the groups (labelled by rank) on offer. */
export function snapRank(level: number, groups: readonly { label: string }[]): ClassRank | null {
  return SNAP_RANKS.find(({ rank, from }) => level >= from && groups.some((group) => group.label === rank))?.rank ?? null;
}

export const MAX_PROJECTION_LEVEL = 99;

export interface PlanEntry {
  id: number;
  classId: number | null;
  fromLevel: number;
  mountId: number | null;
  bondLevel: number | null;
  /** Later switches of mount or bond level while staying in this class. */
  mountChanges?: readonly MountChange[];
}

export interface MountChange {
  id: number;
  fromLevel: number;
  mountId: number | null;
  bondLevel: number | null;
}

/** A class the unit levels in from `fromLevel` on, with the mount it rides. */
export interface PlanStep {
  fromLevel: number;
  unitClass: UnitClass;
  mount: Mount | null;
  bondLevel: number | null;
}

/**
 * The starting class and reclasses of a stat projection: each reclass has its own level, classes are
 * gated by rank unlock levels, and mounted classes pick a mount and bond level.
 */
@Component({
  selector: 'app-class-plan',
  imports: [SearchableSelectComponent],
  templateUrl: './class-plan.component.html',
  styleUrl: './class-plan.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassPlanComponent implements OnInit {
  private readonly api = inject(GrowthDataService);
  private readonly spoilers = inject(SpoilerService);

  // Not required: a parent may read `steps` (through viewChild) before the bindings first land.
  readonly unit = input<Unit | null>(null);
  readonly startLevel = input(1);
  /** The class the unit is in at the start; Noble/Commoner when unknown. */
  readonly joiningClassName = input<string | null>(null);
  /** A plan to edit again (e.g. reopening a build); a fresh one otherwise. */
  readonly initialPlan = input<readonly PlanEntry[] | null>(null);

  private readonly classes = toSignal(this.api.getClasses(), { initialValue: [] as UnitClass[] });
  private readonly mounts = toSignal(this.api.getMounts(), { initialValue: [] as Mount[] });

  private nextId = 1;

  readonly plan = signal<PlanEntry[]>([this.newEntry(null, 1)]);

  private readonly usableClasses = computed(() => this.spoilers.filter(this.api.classesForUnit(this.unit())));

  private readonly noble = computed(() => this.classes().find((unitClass) => unitClass.rank === 'Base') ?? null);

  private readonly joiningClassId = computed(() => {
    const name = this.joiningClassName();

    return (this.classes().find((candidate) => candidate.name === name) ?? this.noble())?.id ?? null;
  });

  readonly startClassId = computed(() => this.plan()[0]?.classId ?? this.joiningClassId());

  readonly startEntry = computed<PlanEntry | null>(() => {
    const first = this.plan()[0];

    return first ? { ...first, classId: this.startClassId() } : null;
  });

  // Each reclass sits after the one before it, even when a later start raises the starting level.
  readonly rowLevels = computed(() => {
    let previous = this.startLevel();

    return this.plan().map((entry, index) => {
      if (index > 0) {
        previous = Math.max(previous + 1, entry.fromLevel);
      }

      return previous;
    });
  });

  private newEntry(classId: number | null, fromLevel: number): PlanEntry {
    return { id: this.nextId++, classId, fromLevel, mountId: null, bondLevel: null };
  }

  ngOnInit(): void {
    const initial = this.initialPlan();

    if (initial && initial.length > 0) {
      this.plan.set(initial.map((entry) => ({ ...entry })));
      const ids = initial.flatMap((entry) => [entry.id, ...(entry.mountChanges ?? []).map((change) => change.id)]);
      this.nextId = Math.max(...ids) + 1;
    }
  }

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

  readonly rowClassItems = computed<SelectItemGroup[][]>(() =>
    this.plan().map((_, position) =>
      (position === 0 ? this.startClassGroups() : this.reclassGroups(position)).map((group) => ({
        label: group.rank,
        items: group.classes,
      })),
    ),
  );

  readonly rowFocusRanks = computed(() =>
    this.rowClassItems().map((groups, position) => snapRank(this.rowLevels()[position], groups)),
  );

  pickClass(id: number, classId: number | null): void {
    this.setClass(id, classId === null ? '' : String(classId));
  }

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

  addClass(): void {
    if (!this.canAddClass()) {
      return;
    }

    const last = this.rowLevels().at(-1)!;
    const next = USUAL_RECLASS_LEVELS.find((level) => level > last) ?? last + 1;

    this.plan.update((plan) => [...plan, this.newEntry(null, Math.min(next, MAX_PROJECTION_LEVEL - 1))]);
    this.pruneMountChanges();
  }

  removeClass(id: number): void {
    this.plan.update((plan) => plan.filter((entry, index) => index === 0 || entry.id !== id));
  }

  setClass(id: number, value: string): void {
    this.patch(id, { classId: value === '' ? null : Number(value), mountId: null, bondLevel: null, mountChanges: [] });
  }

  // The bond level carries over; a mount without that level (or none, like plain Ornius) falls back on its own.
  setMount(id: number, value: string): void {
    this.patch(id, { mountId: Number(value) });
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
    const signature = SIGNATURE_MOUNTS[this.unit()?.name ?? ''];
    const inherited = this.inheritedMount(entry);

    return (
      options.find((mount) => mount.id === entry.mountId) ??
      options.find((mount) => mount.id === inherited?.mount?.id) ??
      options.find((mount) => mount.name === signature?.mount) ??
      options[0] ??
      null
    );
  }

  bondLevelOf(entry: PlanEntry): number | null {
    const mount = this.mountOf(entry);
    const signature = SIGNATURE_MOUNTS[this.unit()?.name ?? ''];
    const inherited = this.inheritedMount(entry);
    const fallback =
      inherited && inherited.mount?.id === mount?.id
        ? inherited.bondLevel
        : mount && signature?.mount === mount.name
          ? signature.bondLevel
          : DEFAULT_MOUNT_BOND_LEVEL;

    return bondLevelOf(mount, entry.bondLevel ?? fallback)?.level ?? null;
  }

  /**
   * The mount (and bond level) last ridden of this class's mount type earlier in the plan, so a reclass
   * between classes of one mount type (or back to one after another type) keeps the mount it had.
   */
  private inheritedMount(entry: PlanEntry): { mount: Mount | null; bondLevel: number | null } | null {
    const plan = this.plan();
    const position = plan.findIndex((candidate) => candidate.id === entry.id);
    const type = this.mountTypeOf(entry);

    if (position <= 0 || type === 'None') {
      return null;
    }

    for (let index = position - 1; index >= 0; index--) {
      const earlier = index === 0 ? this.startEntry()! : plan[index];

      if (this.mountTypeOf(earlier) !== type) {
        continue;
      }

      const lastChange = this.mountChangesOf(plan[index]).at(-1);

      return lastChange
        ? { mount: this.changeMountOf(earlier, lastChange), bondLevel: this.changeBondLevelOf(earlier, lastChange) }
        : { mount: this.mountOf(earlier), bondLevel: this.bondLevelOf(earlier) };
    }

    return null;
  }

  private mountTypeOf(entry: PlanEntry): string {
    const unitClass = this.classOf(entry);

    return unitClass ? this.api.mountTypeOfClass(unitClass.name) : 'None';
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

    this.patch(id, locked ? { fromLevel: clamped, classId: null, mountId: null, bondLevel: null, mountChanges: [] } : { fromLevel: clamped });
    this.pruneMountChanges();
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

  // --- mount and bond level changes within a class ---------------------------------

  mountChangesOf(entry: PlanEntry): readonly MountChange[] {
    return entry.mountChanges ?? [];
  }

  /** Levels a mount change can be at: after the class's start (or the change before it) and before the next reclass. */
  mountChangeBounds(position: number, changeIndex: number): { min: number; max: number } {
    const changes = this.mountChangesOf(this.plan()[position]);
    const after = changeIndex > 0 ? changes[changeIndex - 1].fromLevel : this.rowLevels()[position];
    const before = changes[changeIndex + 1]?.fromLevel ?? this.rowLevels()[position + 1] ?? MAX_PROJECTION_LEVEL;

    return { min: after + 1, max: before - 1 };
  }

  canAddMountChange(position: number): boolean {
    const changes = this.mountChangesOf(this.plan()[position]);
    const last = changes.at(-1)?.fromLevel ?? this.rowLevels()[position];

    return last < (this.rowLevels()[position + 1] ?? MAX_PROJECTION_LEVEL) - 1;
  }

  // A new change starts a few levels on, on the same mount at the next bond level when there is one.
  addMountChange(position: number): void {
    if (!this.canAddMountChange(position)) {
      return;
    }

    const entry = position === 0 ? this.startEntry()! : this.plan()[position];
    const changes = this.mountChangesOf(this.plan()[position]);
    const last = changes.at(-1);
    const mount = last ? this.changeMountOf(entry, last) : this.mountOf(entry);
    const bond = last ? this.changeBondLevelOf(entry, last) : this.bondLevelOf(entry);
    const nextBond = mount?.bondLevels.find((option) => bond === null || option.level > bond)?.level ?? bond;
    const from = last?.fromLevel ?? this.rowLevels()[position];
    const max = (this.rowLevels()[position + 1] ?? MAX_PROJECTION_LEVEL) - 1;
    const change: MountChange = { id: this.nextId++, fromLevel: Math.min(from + 1, max), mountId: mount?.id ?? null, bondLevel: nextBond };

    this.patch(this.plan()[position].id, { mountChanges: [...changes, change] });
  }

  removeMountChange(entryId: number, changeId: number): void {
    this.patchMountChange(entryId, changeId, null);
  }

  setChangeMount(entryId: number, changeId: number, value: string): void {
    this.patchMountChange(entryId, changeId, { mountId: Number(value) });
  }

  setChangeBondLevel(entryId: number, changeId: number, value: string): void {
    this.patchMountChange(entryId, changeId, { bondLevel: Number(value) });
  }

  setChangeLevel(position: number, changeIndex: number, event: Event): void {
    const field = event.target as HTMLInputElement;
    const entry = this.plan()[position];
    const change = this.mountChangesOf(entry)[changeIndex];
    const level = Math.round(Number(field.value));
    const { min, max } = this.mountChangeBounds(position, changeIndex);

    if (field.value.trim() !== '' && Number.isFinite(level)) {
      this.patchMountChange(entry.id, change.id, { fromLevel: Math.min(max, Math.max(min, level)) });
    }

    field.value = String(this.mountChangesOf(this.plan()[position])[changeIndex]?.fromLevel ?? '');
  }

  changeMountOf(entry: PlanEntry, change: MountChange): Mount | null {
    return this.mountsFor(entry).find((mount) => mount.id === change.mountId) ?? this.mountOf(entry);
  }

  changeBondLevelOf(entry: PlanEntry, change: MountChange): number | null {
    const mount = this.changeMountOf(entry, change);

    return bondLevelOf(mount, change.bondLevel ?? DEFAULT_MOUNT_BOND_LEVEL)?.level ?? null;
  }

  private patchMountChange(entryId: number, changeId: number, change: Partial<MountChange> | null): void {
    this.plan.update((plan) =>
      plan.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              mountChanges: this.mountChangesOf(entry).flatMap((candidate) =>
                candidate.id !== changeId ? [candidate] : change ? [{ ...candidate, ...change }] : [],
              ),
            }
          : entry,
      ),
    );
  }

  // Mount changes that no longer fall within their class's levels (after a reclass moved) are dropped.
  private pruneMountChanges(): void {
    const levels = this.rowLevels();

    this.plan.update((plan) =>
      plan.map((entry, index) => {
        const changes = this.mountChangesOf(entry);
        const kept = changes.filter(
          (change) => change.fromLevel > levels[index] && change.fromLevel < (levels[index + 1] ?? MAX_PROJECTION_LEVEL + 1),
        );

        return kept.length === changes.length ? entry : { ...entry, mountChanges: kept };
      }),
    );
  }

  /** The plan's classes and mount changes in level order; reclasses still waiting for a class are skipped. */
  readonly steps = computed<PlanStep[]>(() => {
    const levels = this.rowLevels();

    return this.plan().flatMap((entry, index) => {
      const resolved = index === 0 ? this.startEntry()! : entry;
      const unitClass = this.classOf(resolved);

      if (!unitClass) {
        return [];
      }

      return [
        { fromLevel: levels[index], unitClass, mount: this.mountOf(resolved), bondLevel: this.bondLevelOf(resolved) },
        ...this.mountChangesOf(entry).map((change) => ({
          fromLevel: change.fromLevel,
          unitClass,
          mount: this.changeMountOf(resolved, change),
          bondLevel: this.changeBondLevelOf(resolved, change),
        })),
      ];
    });
  });

  // Deferred: mobile browsers place the caret after focus, which would undo an immediate select.
  selectValue(event: FocusEvent): void {
    const field = event.target as HTMLInputElement;

    setTimeout(() => {
      if (document.activeElement === field) {
        field.select();
      }
    });
  }
}
