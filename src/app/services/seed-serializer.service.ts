import { inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { Mount, Unit, UnitClass } from '../models/growth.models';
import { SeedMapDto, SeedMapSnapshot } from '../models/seed-save';
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

  toDto(snapshot: SeedMapSnapshot): SeedMapDto {
    return {
      unit: this.nameOf(this.units(), snapshot.unitId),
      statsLevel: snapshot.statsLevel,
      startStats: { ...snapshot.startStats },
      availableClasses: snapshot.availableClassIds.flatMap((id) => {
        const name = this.nameOf(this.classes(), id);
        return name === null ? [] : [name];
      }),
      sections: snapshot.sections.map((section) => ({
        exam: section.exam && {
          parent: section.exam.parentIndex,
          afterRow: section.exam.afterRowIndex,
          unitClass: this.nameOf(this.classes(), section.exam.classId),
          chance: section.exam.chance,
          passed: section.exam.passed,
        },
        unitClass: this.nameOf(this.classes(), section.classId),
        mount: this.nameOf(this.mounts(), section.mountId),
        mountLevel: section.mountLevel,
        rows: section.rows,
        comparators: section.comparators.map((comparator) => ({
          unitClass: this.nameOf(this.classes(), comparator.classId),
          mount: this.nameOf(this.mounts(), comparator.mountId),
          mountLevel: comparator.mountLevel,
          rows: comparator.rows,
        })),
      })),
    };
  }

  fromDto(seed: SeedMapDto): SeedMapSnapshot {
    return {
      unitId: this.idOf(this.units(), seed.unit),
      statsLevel: seed.statsLevel,
      startStats: { ...seed.startStats },
      availableClassIds: seed.availableClasses.flatMap((name) => {
        const id = this.idOf(this.classes(), name);
        return id === null ? [] : [id];
      }),
      sections: seed.sections.map((section) => ({
        exam: section.exam && {
          parentIndex: section.exam.parent,
          afterRowIndex: section.exam.afterRow,
          classId: this.idOf(this.classes(), section.exam.unitClass),
          chance: section.exam.chance,
          passed: section.exam.passed,
        },
        classId: this.idOf(this.classes(), section.unitClass),
        mountId: this.idOf(this.mounts(), section.mount),
        mountLevel: section.mountLevel,
        rows: section.rows,
        comparators: section.comparators.map((comparator) => ({
          classId: this.idOf(this.classes(), comparator.unitClass),
          mountId: this.idOf(this.mounts(), comparator.mount),
          mountLevel: comparator.mountLevel,
          rows: comparator.rows,
        })),
      })),
    };
  }

  missingNames(seed: SeedMapDto): string[] {
    const missing = new Set<string>();

    const check = (
      list: readonly { id: number; name: string }[],
      name: string | null,
    ) => {
      if (name !== null && this.idOf(list, name) === null) {
        missing.add(name);
      }
    };

    check(this.units(), seed.unit);

    for (const name of seed.availableClasses) {
      check(this.classes(), name);
    }

    for (const section of seed.sections) {
      check(this.classes(), section.unitClass);
      check(this.mounts(), section.mount);

      if (section.exam) {
        check(this.classes(), section.exam.unitClass);
      }

      for (const comparator of section.comparators) {
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
