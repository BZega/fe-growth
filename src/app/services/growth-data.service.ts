import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

import { Mount, MountType, Unit, UnitClass } from '../models/growth.models';
import classMountTypes from '../data/class-mount-types.json';
import mountData from '../data/mounts.json';
import unitClassData from '../data/unit-classes.json';
import unitData from '../data/units.json';

/**
 * Serves the growth data bundled with the app. Mirrors the shape the API
 * version exposed, so components and the serializer are unchanged.
 */
@Injectable({ providedIn: 'root' })
export class GrowthDataService {
  private readonly units: Unit[] = (unitData as Unit[])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  private readonly classes = unitClassData as UnitClass[];

  private readonly allMounts = mountData as Mount[];

  /** The placeholder "None" mount is never offered as a choice. */
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

  getMounts(): Observable<Mount[]> {
    return of(this.mounts);
  }

  getMountsForClass(classId: number): Observable<Mount[]> {
    return of(this.mountsForClass(classId));
  }

  mountTypeOfClass(className: string): MountType {
    return this.mountTypesByClassName[className] ?? 'None';
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
