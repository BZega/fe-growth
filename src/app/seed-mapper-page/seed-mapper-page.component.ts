import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { CLASS_RANK_ORDER, ClassRank, GrowthRates, Mount, STAT_KEYS, STAT_LABELS, StatKey, sumGrowth, toGrowth, Unit, UnitClass } from '../models/growth.models';
import { estimateRoll, RollEstimate, RollObservation } from '../models/seed-roll';
import { newSaveId, migrateSave, SeedSave } from '../models/seed-save';
import { SearchableSelectComponent, SelectItemGroup } from '../searchable-select/searchable-select.component';
import { GrowthDataService } from '../services/growth-data.service';
import { SeedSaveStorageService } from '../services/seed-save-storage.service';
import { SeedSerializerService } from '../services/seed-serializer.service';
import { SpoilerService } from '../services/spoiler.service';
import { MAX_LEVEL, MIN_LEVEL, Seed, SeedComparator, SeedMapperStateService, SeedRow } from '../services/seed-mapper-state.service';

interface PendingAction {
  kind: 'load' | 'upload' | 'overwrite' | 'delete' | 'reset';
  save?: SeedSave;
  file?: File;
  message?: string;
}

@Component({
  selector: 'app-seed-mapper-page',
  imports: [DatePipe, SearchableSelectComponent],
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

  readonly seeds = this.state.seeds;
  readonly saves = this.storage.saves;
  readonly changeCount = this.state.changeCount;
  readonly loadedSave = this.state.loadedSave;
  readonly status = signal<string | null>(null);
  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;
  readonly minLevel = MIN_LEVEL;
  readonly maxLevel = MAX_LEVEL;

  readonly allUnits = toSignal(this.api.getUnits(), { initialValue: [] as Unit[] });
  private readonly classes = toSignal(this.api.getClasses(), {
    initialValue: [] as UnitClass[],
  });

  readonly units = computed(() => this.spoilers.filter(this.allUnits()));

  readonly classGroups = computed<SelectItemGroup[]>(() =>
    CLASS_RANK_ORDER.map((rank: ClassRank) => ({
      label: rank,
      items: this.classes().filter((unitClass) => unitClass.rank === rank),
    })).filter((group) => group.items.length > 0),
  );

  private readonly mountsByClass = signal<ReadonlyMap<number, Mount[]>>(new Map());
  private readonly requestedClasses = new Set<number>();

  constructor() {
    effect(() => {
      for (const seed of this.seeds()) {
        this.loadMounts(seed.classId);

        for (const comparator of seed.comparators) {
          this.loadMounts(comparator.classId);
        }
      }
    });
  }

  // --- base seed ---------------------------------------------------------

  mountsForClass(classId: number | null): Mount[] {
    return classId === null ? [] : (this.mountsByClass().get(classId) ?? []);
  }

  private resolveMount(classId: number | null, mountId: number | null): Mount | null {
    const options = this.mountsForClass(classId);

    return options.find((m) => m.id === mountId) ?? options.at(0) ?? null;
  }

  mountOf(seed: Seed): Mount | null {
    return this.resolveMount(seed.classId, seed.mountId);
  }

  growthOf(seed: Seed): GrowthRates {
    return this.combine(seed.unitId, seed.classId, this.mountOf(seed));
  }

  levelOf(seed: Seed, index: number): number {
    return (seed.startLevel ?? MIN_LEVEL) + index;
  }

  private isComplete(seed: Seed): boolean {
    return (
      seed.unitId !== null && seed.classId !== null && seed.startLevel !== null
    );
  }

  canAddSeed(): boolean {
    const last = this.seeds().at(-1);

    return last !== undefined && this.isComplete(last);
  }

  addSeed(): void {
    const last = this.seeds().at(-1);

    if (last) {
      this.state.duplicate(last.id);
    }
  }

  // --- comparators -------------------------------------------------------

  comparatorClasses(seed: Seed, comparator: SeedComparator): UnitClass[] {
    const base = this.classes().find((c) => c.id === seed.classId);

    if (!base) {
      return [];
    }

    const taken = new Set<number>();

    for (const other of seed.comparators) {
      if (other.id !== comparator.id && other.classId !== null) {
        taken.add(other.classId);
      }
    }

    return this.classes().filter(
      (c) => c.rank === base.rank && c.id !== base.id && !taken.has(c.id),
    );
  }

  canAddComparator(seed: Seed): boolean {
    const base = this.classes().find((c) => c.id === seed.classId);

    if (!base || !this.isComplete(seed)) {
      return false;
    }

    const inRank = this.classes().filter((c) => c.rank === base.rank).length;

    return seed.comparators.length < inRank - 1;
  }

  hasComparison(seed: Seed): boolean {
    return seed.comparators.some((comparator) => comparator.classId !== null);
  }

  comparatorMountOf(comparator: SeedComparator): Mount | null {
    return this.resolveMount(comparator.classId, comparator.mountId);
  }

  comparatorGrowth(seed: Seed, comparator: SeedComparator): GrowthRates {
    return this.combine(
      seed.unitId,
      comparator.classId,
      this.comparatorMountOf(comparator),
    );
  }

  // --- roll inference ----------------------------------------------------

  rollsFor(seed: Seed, rowIndex: number): RollEstimate[] {
    const blocks: { growth: GrowthRates; row: SeedRow }[] = [];
    const baseRow = seed.rows[rowIndex];

    if (seed.classId !== null && baseRow) {
      blocks.push({ growth: this.growthOf(seed), row: baseRow });
    }

    for (const comparator of seed.comparators) {
      const row = comparator.rows[rowIndex];

      if (comparator.classId !== null && row) {
        blocks.push({ growth: this.comparatorGrowth(seed, comparator), row });
      }
    }

    return this.statKeys.map((stat) =>
      estimateRoll(
        blocks.map<RollObservation>((block) => ({
          growth: block.growth[stat],
          hit: block.row.marks[stat] > 0,
        })),
      ),
    );
  }

  // --- events ------------------------------------------------------------

  onUnitChange(seed: Seed, id: number | null): void {
    this.state.setUnit(seed.id, id);
  }

  onClassChange(seed: Seed, classId: number | null): void {
    this.state.setClass(seed.id, classId);
    this.loadMounts(classId);
  }

  onMountChange(seed: Seed, id: number | null): void {
    this.state.setMount(seed.id, id);
  }

  onLevelChange(seed: Seed, event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    this.state.setStartLevel(seed.id, value === '' ? null : Number(value));
  }

  onComparatorClassChange(
    seed: Seed,
    comparator: SeedComparator,
    classId: number | null,
  ): void {
    this.state.setComparatorClass(seed.id, comparator.id, classId);
    this.loadMounts(classId);
  }

  onComparatorMountChange(
    seed: Seed,
    comparator: SeedComparator,
    id: number | null,
  ): void {
    this.state.setComparatorMount(seed.id, comparator.id, id);
  }

  toggleStat(seed: Seed, row: SeedRow, stat: StatKey): void {
    this.state.toggleStat(seed.id, row.id, stat);
  }

  toggleComparatorStat(
    seed: Seed,
    comparator: SeedComparator,
    row: SeedRow,
    stat: StatKey,
  ): void {
    this.state.toggleComparatorStat(seed.id, comparator.id, row.id, stat);
  }

  addLevel(seed: Seed): void {
    this.state.addLevel(seed.id);
  }

  removeLevel(seed: Seed, row: SeedRow): void {
    this.state.removeLevel(seed.id, row.id);
  }

  addComparator(seed: Seed): void {
    this.state.addComparator(seed.id);
  }

  removeComparator(seed: Seed, comparator: SeedComparator): void {
    this.state.removeComparator(seed.id, comparator.id);
  }

  remove(seed: Seed): void {
    this.state.remove(seed.id);
  }

  // --- saves -------------------------------------------------------------

  readonly saveName = signal('');
  readonly renamingId = signal<string | null>(null);
  readonly renameValue = signal('');
  readonly pending = signal<PendingAction | null>(null);

  /** Reasons the current board is not worth writing to a save. */
  readonly saveProblems = computed<string[]>(() => {
    const problems: string[] = [];

    this.seeds().forEach((seed, seedIndex) => {
      const label = `Seed ${seedIndex + 1}`;
      const missing: string[] = [];

      if (seed.unitId === null) {
        missing.push('a unit');
      }

      if (seed.classId === null) {
        missing.push('a class');
      }

      if (seed.startLevel === null) {
        missing.push('a starting level');
      }

      if (missing.length > 0) {
        problems.push(`${label} still needs ${listing(missing)}.`);
      }

      seed.comparators.forEach((comparator, comparatorIndex) => {
        if (comparator.classId === null) {
          problems.push(
            `${label}: comparator ${comparatorIndex + 1} has no class selected.`,
          );
        }
      });

      seed.rows.forEach((_, rowIndex) => {
        const clashing = this.rollsFor(seed, rowIndex)
          .map((roll, statIndex) =>
            roll.state === 'conflict' ? this.statLabels[this.statKeys[statIndex]] : null,
          )
          .filter((stat): stat is string => stat !== null);

        if (clashing.length > 0) {
          problems.push(
            `${label}: Lv ${this.levelOf(seed, rowIndex)} ${clashing.join(', ')} cannot be both a hit and a miss.`,
          );
        }
      });
    });

    return problems;
  });

  readonly canSave = computed(() => this.saveProblems().length === 0);

  private readonly attemptedSave = signal(false);

  readonly visibleProblems = computed(() =>
    this.attemptedSave() ? this.saveProblems() : [],
  );

  private readonly isPristine = computed(() => {
    const seeds = this.seeds();
    const only = seeds[0];

    return (
      seeds.length === 1 &&
      only !== undefined &&
      only.unitId === null &&
      only.classId === null &&
      only.startLevel === null &&
      only.comparators.length === 0 &&
      only.rows.length === 1 &&
      this.statKeys.every((stat) => only.rows[0].marks[stat] === 0)
    );
  });

  readonly canReset = computed(
    () => this.changeCount() > 0 || !this.isPristine(),
  );

  defaultSaveName(): string {
    const first = this.seeds()[0];
    const unit = this.units().find((u) => u.id === first?.unitId)?.name;

    return unit ? `${unit} seed map` : 'Seed map';
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
      version: 1,
      id: active?.id ?? newSaveId(),
      name: active?.name ?? `${this.defaultSaveName()} — ${stamp()}`,
      savedAt: new Date().toISOString(),
      seeds: this.currentDto(),
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

  /** Runs straight away when the board is clean, otherwise asks first. */
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
    const missing = this.serializer.missingNames(save.seeds);

    this.state.restore(this.serializer.fromDto(save.seeds), {
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
