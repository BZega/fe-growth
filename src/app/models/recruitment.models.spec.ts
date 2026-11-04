import unitClassData from '../data/unit-classes.json';
import { Mount, sumGrowth, toGrowth, Unit, UnitClass } from './growth.models';
import { buildFromStrength, chapterGrowth, routeLabel } from './recruitment.models';
import { GrowthDataService } from '../services/growth-data.service';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

describe('recruitment rules', () => {
  const unit = (name: string) => units.find((candidate) => candidate.name === name)!;
  const unitClass = (name: string) => (unitClassData as UnitClass[]).find((candidate) => candidate.name === name)!;
  let api: GrowthDataService;
  let mounts: Mount[];
  let units: Unit[];

  beforeEach(async () => {
    api = TestBed.inject(GrowthDataService);
    mounts = await firstValueFrom(api.getMounts());
    units = await firstValueFrom(api.getUnits());
  });

  // Matches the recruitment data: Str 9 is Bld 1, 10 is 2, 15 is 3, 31 and 33 are 6.
  it('works out Bld as Str / 5 rounded down, never below 1', () => {
    expect([0, 1, 5, 9, 10, 14, 15, 31, 33, 35].map(buildFromStrength)).toEqual([1, 1, 1, 1, 2, 2, 3, 6, 6, 7]);
  });

  it('adds the unit and class growths, with no mount for most units', () => {
    const hongHua = unit('Hong Hua');
    const ovate = unitClass('Ovate');
    const result = chapterGrowth(hongHua, ovate, api.mountTypeOfClass(ovate.name), mounts);

    expect(result.growth).toEqual(sumGrowth(toGrowth(hongHua), toGrowth(ovate)));
    expect(result.mount).toBeNull();
  });

  it("counts Alexandra's Bucephalus and Io's Rocinan at Bond Lv 3 in classes with that mount type", () => {
    const pegasusClass = unitClass('Winged Soldier');
    const horseClass = unitClass('Light Cavalry');

    expect(chapterGrowth(unit('Alexandra'), pegasusClass, 'Pegasus', mounts).mount).toEqual({ name: 'Bucephalus', bondLevel: 3 });
    expect(chapterGrowth(unit('Io'), horseClass, 'Horse', mounts).mount).toEqual({ name: 'Rocinan', bondLevel: 3 });

    const withMount = chapterGrowth(unit('Io'), horseClass, 'Horse', mounts).growth;
    const withoutMount = sumGrowth(toGrowth(unit('Io')), toGrowth(horseClass));
    expect(withMount).not.toEqual(withoutMount);
  });

  it('leaves the signature mount out of a class with a different or no mount type', () => {
    expect(chapterGrowth(unit('Alexandra'), unitClass('Light Cavalry'), 'Horse', mounts).mount).toBeNull();
    expect(chapterGrowth(unit('Io'), unitClass('Ovate'), 'None', mounts).mount).toBeNull();
  });

  it('spaces out route names written as one word', () => {
    expect(['Prologue', 'Cai', 'WarArc', 'SalvationArc'].map(routeLabel)).toEqual([
      'Prologue',
      'Cai',
      'War Arc',
      'Salvation Arc',
    ]);
  });
});
