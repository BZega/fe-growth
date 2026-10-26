import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

import { ClassAbility, FEMALE_ONLY_CLASS_NAMES, Mount, MountType, Unit, UnitClass } from '../models/growth.models';
import classAbilityData from '../data/class-abilities.json';
import classMountTypes from '../data/class-mount-types.json';
import mountData from '../data/mounts.json';
import unitClassData from '../data/unit-classes.json';
import unitData from '../data/units.json';


@Injectable({ providedIn: 'root' })
export class GrowthDataService {
  private readonly units: Unit[] = (unitData as Unit[])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  private readonly classes = unitClassData as UnitClass[];

  private readonly classAbilities = classAbilityData as ClassAbility[];

  private readonly allMounts = mountData as Mount[];

  private readonly mounts = this.allMounts.filter(
    (mount) => mount.type !== 'None',
  );

  private readonly mountTypesByClassName = classMountTypes as Record<
    string,
    MountType
  >;

  getUnits(): Observable<Unit[]> {
    return of(this.units);
  }

  getClasses(): Observable<UnitClass[]> {
    return of(this.classes);
  }

  getClassAbilities(): Observable<ClassAbility[]> {
    return of(this.classAbilities);
  }

  getMounts(): Observable<Mount[]> {
    return of(this.mounts);
  }

  getMountsForClass(classId: number): Observable<Mount[]> {
    return of(this.mountsForClass(classId));
  }

  mountTypeOfClass(className: string): MountType {
    return this.mountTypesByClassName[className] ?? 'None';
  }

  /** Whether `unit` may take `unitClass`; every class is allowed when no unit is chosen. */
  canUseClass(unit: Unit | null | undefined, unitClass: UnitClass): boolean {
    if (!unit) {
      return true;
    }

    if (unit.gender !== 'Female' && FEMALE_ONLY_CLASS_NAMES.has(unitClass.name)) {
      return false;
    }

    return unit.canUseMounts || this.mountTypeOfClass(unitClass.name) === 'None';
  }

  classesForUnit(unit: Unit | null | undefined): UnitClass[] {
    return this.classes.filter((unitClass) => this.canUseClass(unit, unitClass));
  }

  unitById(unitId: number | null): Unit | null {
    return this.units.find((unit) => unit.id === unitId) ?? null;
  }

  private mountsForClass(classId: number): Mount[] {
    const unitClass = this.classes.find((c) => c.id === classId);

    if (!unitClass) {
      return [];
    }

    const type = this.mountTypeOfClass(unitClass.name);

    return type === 'None'
      ? []
      : this.mounts.filter((mount) => mount.type === type);
  }
}
