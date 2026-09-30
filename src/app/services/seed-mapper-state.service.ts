import { Injectable, signal } from '@angular/core';

import { GrowthRates, StatKey, ZERO_GROWTH } from '../models/growth.models';
import { SeedSnapshot } from '../models/seed-save';

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

export interface Seed {
  id: number;
  unitId: number | null;
  classId: number | null;
  mountId: number | null;
  startLevel: number | null;
  rows: SeedRow[];
  comparators: SeedComparator[];
}

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 99;

@Injectable({ providedIn: 'root' })
export class SeedMapperStateService {
  private nextSeedId = 1;
  private nextRowId = 1;
  private nextComparatorId = 1;

  private readonly seedList = signal<Seed[]>([this.createSeed()]);
  private readonly changes = signal(0);
  private readonly activeSave = signal<{ id: string; name: string } | null>(null);

  readonly seeds = this.seedList.asReadonly();
  readonly changeCount = this.changes.asReadonly();
  readonly loadedSave = this.activeSave.asReadonly();

  snapshot(): SeedSnapshot[] {
    return this.seedList().map((seed) => ({
      unitId: seed.unitId,
      classId: seed.classId,
      mountId: seed.mountId,
      startLevel: seed.startLevel,
      rows: seed.rows.map((row) => ({ ...row.marks })),
      comparators: seed.comparators.map((comparator) => ({
        classId: comparator.classId,
        mountId: comparator.mountId,
        rows: comparator.rows.map((row) => ({ ...row.marks })),
      })),
    }));
  }

  restore(snapshots: SeedSnapshot[], save: { id: string; name: string } | null): void {
    const seeds = snapshots.map((snapshot) => {
      const rows = snapshot.rows.map((marks) => ({
        id: this.nextRowId++,
        marks: { ...marks },
      }));

      return {
        id: this.nextSeedId++,
        unitId: snapshot.unitId,
        classId: snapshot.classId,
        mountId: snapshot.mountId,
        startLevel: snapshot.startLevel,
        rows,
        comparators: snapshot.comparators.map((comparator) => ({
          id: this.nextComparatorId++,
          classId: comparator.classId,
          mountId: comparator.mountId,
          // Comparator rows line up with the seed's rows by position.
          rows: rows.map((row, index) => ({
            id: row.id,
            marks: { ...(comparator.rows[index] ?? ZERO_GROWTH) },
          })),
        })),
      } satisfies Seed;
    });

    this.seedList.set(seeds.length > 0 ? seeds : [this.createSeed()]);
    this.activeSave.set(save);
    this.changes.set(0);
  }

  markSaved(save: { id: string; name: string }): void {
    this.activeSave.set(save);
    this.changes.set(0);
  }

  reset(): void {
    this.seedList.set([this.createSeed()]);
    this.activeSave.set(null);
    this.changes.set(0);
  }

  forgetSave(): void {
    this.activeSave.set(null);
  }

  setUnit(seedId: number, unitId: number | null): void {
    this.patch(seedId, (seed) => ({ ...seed, unitId }));
  }

  setClass(seedId: number, classId: number | null): void {
    this.patch(seedId, (seed) => ({
      ...seed,
      classId,
      mountId: null,
      comparators: seed.comparators.map((comparator) => ({
        ...comparator,
        classId: null,
        mountId: null,
      })),
    }));
  }

  setMount(seedId: number, mountId: number | null): void {
    this.patch(seedId, (seed) => ({ ...seed, mountId }));
  }

  setStartLevel(seedId: number, level: number | null): void {
    const clamped =
      level === null ? null : Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level));

    this.patch(seedId, (seed) => ({ ...seed, startLevel: clamped }));
  }

  addLevel(seedId: number): void {
    this.patch(seedId, (seed) => {
      const row = this.createRow();

      return {
        ...seed,
        rows: [...seed.rows, row],
        comparators: seed.comparators.map((comparator) => ({
          ...comparator,
          rows: [...comparator.rows, { id: row.id, marks: { ...ZERO_GROWTH } }],
        })),
      };
    });
  }

  removeLevel(seedId: number, rowId: number): void {
    this.patch(seedId, (seed) =>
      seed.rows.length <= 1
        ? seed
        : {
            ...seed,
            rows: seed.rows.filter((row) => row.id !== rowId),
            comparators: seed.comparators.map((comparator) => ({
              ...comparator,
              rows: comparator.rows.filter((row) => row.id !== rowId),
            })),
          },
    );
  }

  toggleStat(seedId: number, rowId: number, stat: StatKey): void {
    this.patch(seedId, (seed) => ({
      ...seed,
      rows: toggle(seed.rows, rowId, stat),
    }));
  }

  addComparator(seedId: number): void {
    this.patch(seedId, (seed) => ({
      ...seed,
      comparators: [
        ...seed.comparators,
        {
          id: this.nextComparatorId++,
          classId: null,
          mountId: null,
          rows: seed.rows.map((row) => ({
            id: row.id,
            marks: { ...ZERO_GROWTH },
          })),
        },
      ],
    }));
  }

  removeComparator(seedId: number, comparatorId: number): void {
    this.patch(seedId, (seed) => ({
      ...seed,
      comparators: seed.comparators.filter((c) => c.id !== comparatorId),
    }));
  }

  setComparatorClass(
    seedId: number,
    comparatorId: number,
    classId: number | null,
  ): void {
    this.patchComparator(seedId, comparatorId, (comparator) => ({
      ...comparator,
      classId,
      mountId: null,
    }));
  }

  setComparatorMount(
    seedId: number,
    comparatorId: number,
    mountId: number | null,
  ): void {
    this.patchComparator(seedId, comparatorId, (comparator) => ({
      ...comparator,
      mountId,
    }));
  }

  toggleComparatorStat(
    seedId: number,
    comparatorId: number,
    rowId: number,
    stat: StatKey,
  ): void {
    this.patchComparator(seedId, comparatorId, (comparator) => ({
      ...comparator,
      rows: toggle(comparator.rows, rowId, stat),
    }));
  }

  duplicate(seedId: number): void {
    const source = this.seedList().find((seed) => seed.id === seedId);

    if (!source) {
      return;
    }

    const copy: Seed = {
      ...this.createSeed(),
      unitId: source.unitId,
      classId: source.classId,
      mountId: source.mountId,
      startLevel: source.startLevel,
    };

    this.mutate((seeds) => {
      const index = seeds.findIndex((seed) => seed.id === seedId);
      const next = [...seeds];
      next.splice(index + 1, 0, copy);

      return next;
    });
  }

  remove(seedId: number): void {
    if (this.seedList().length <= 1) {
      return;
    }

    this.mutate((seeds) => seeds.filter((seed) => seed.id !== seedId));
  }

  private mutate(change: (seeds: Seed[]) => Seed[]): void {
    this.seedList.update(change);
    this.changes.update((count) => count + 1);
  }

  private patch(seedId: number, change: (seed: Seed) => Seed): void {
    this.mutate((seeds) =>
      seeds.map((seed) => (seed.id === seedId ? change(seed) : seed)),
    );
  }

  private patchComparator(
    seedId: number,
    comparatorId: number,
    change: (comparator: SeedComparator) => SeedComparator,
  ): void {
    this.patch(seedId, (seed) => ({
      ...seed,
      comparators: seed.comparators.map((comparator) =>
        comparator.id === comparatorId ? change(comparator) : comparator,
      ),
    }));
  }

  private createSeed(): Seed {
    return {
      id: this.nextSeedId++,
      unitId: null,
      classId: null,
      mountId: null,
      startLevel: null,
      rows: [this.createRow()],
      comparators: [],
    };
  }

  private createRow(): SeedRow {
    return { id: this.nextRowId++, marks: { ...ZERO_GROWTH } };
  }
}

function toggle(rows: SeedRow[], rowId: number, stat: StatKey): SeedRow[] {
  return rows.map((row) =>
    row.id === rowId
      ? { ...row, marks: { ...row.marks, [stat]: row.marks[stat] > 0 ? 0 : 1 } }
      : row,
  );
}
