import { inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { Mount, Unit, UnitClass } from '../models/growth.models';
import { SeedDto, SeedSnapshot } from '../models/seed-save';
import { GrowthDataService } from './growth-data.service';

@Injectable({ providedIn: 'root' })
export class SeedSerializerService {
  private readonly api = inject(GrowthDataService);

  private readonly units = toSignal(this.api.getUnits(), {
    initialValue: [] as Unit[],
  });
  private readonly classes = toSignal(this.api.getClasses(), {
    initialValue: [] as UnitClass[],
  });
  private readonly mounts = toSignal(this.api.getMounts(), {
    initialValue: [] as Mount[],
  });

  toDto(snapshots: SeedSnapshot[]): SeedDto[] {
    return snapshots.map((snapshot) => ({
      unit: this.nameOf(this.units(), snapshot.unitId),
      unitClass: this.nameOf(this.classes(), snapshot.classId),
      mount: this.nameOf(this.mounts(), snapshot.mountId),
      startLevel: snapshot.startLevel,
      rows: snapshot.rows,
      comparators: snapshot.comparators.map((comparator) => ({
        unitClass: this.nameOf(this.classes(), comparator.classId),
        mount: this.nameOf(this.mounts(), comparator.mountId),
        rows: comparator.rows,
      })),
    }));
  }

  fromDto(seeds: SeedDto[]): SeedSnapshot[] {
    return seeds.map((seed) => ({
      unitId: this.idOf(this.units(), seed.unit),
      classId: this.idOf(this.classes(), seed.unitClass),
      mountId: this.idOf(this.mounts(), seed.mount),
      startLevel: seed.startLevel,
      rows: seed.rows,
      comparators: seed.comparators.map((comparator) => ({
        classId: this.idOf(this.classes(), comparator.unitClass),
        mountId: this.idOf(this.mounts(), comparator.mount),
        rows: comparator.rows,
      })),
    }));
  }

  missingNames(seeds: SeedDto[]): string[] {
    const missing = new Set<string>();

    const check = (
      list: readonly { id: number; name: string }[],
      name: string | null,
    ) => {
      if (name !== null && this.idOf(list, name) === null) {
        missing.add(name);
      }
    };

    for (const seed of seeds) {
      check(this.units(), seed.unit);
      check(this.classes(), seed.unitClass);
      check(this.mounts(), seed.mount);

      for (const comparator of seed.comparators) {
        check(this.classes(), comparator.unitClass);
        check(this.mounts(), comparator.mount);
      }
    }

    return [...missing];
  }

  private nameOf(
    list: readonly { id: number; name: string }[],
    id: number | null,
  ): string | null {
    return id === null ? null : (list.find((e) => e.id === id)?.name ?? null);
  }

  private idOf(
    list: readonly { id: number; name: string }[],
    name: string | null,
  ): number | null {
    return name === null ? null : (list.find((e) => e.name === name)?.id ?? null);
  }
}
