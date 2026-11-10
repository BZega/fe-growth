import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import unitData from '../data/units.json';
import { Unit } from '../models/growth.models';
import { ProjectionDialogComponent } from '../projection-dialog/projection-dialog.component';
import { RecruitmentDataService } from '../services/recruitment-data.service';
import { SpoilerService } from '../services/spoiler.service';
import { ProjectionPickerComponent } from './projection-picker.component';

const units = unitData as Pick<Unit, 'id' | 'name'>[];
const unitId = (name: string) => units.find((unit) => unit.name === name)!.id;

describe('ProjectionPickerComponent', () => {
  beforeEach(() => TestBed.inject(SpoilerService).setAllHidden(false));

  afterEach(() => {
    TestBed.inject(SpoilerService).setAllHidden(true);
    TestBed.flushEffects();
  });

  const open = () => {
    const fixture = TestBed.createComponent(ProjectionPickerComponent);
    fixture.detectChanges();

    return { fixture, picker: fixture.componentInstance, host: fixture.nativeElement as HTMLElement };
  };

  it('only lists characters with chapter stats, leaving out boosted variants like Mu*', () => {
    const { picker } = open();
    const recruitment = TestBed.inject(RecruitmentDataService);
    const expected = units
      .filter((unit) => unit.name !== 'Mu*' && recruitment.routesWithChapters(unit.name).length > 0)
      .map((unit) => unit.name);

    expect(picker.characters().map((unit) => unit.name)).toEqual(jasmine.arrayWithExactContents(expected));
    expect(expected).toContain('Cai');
    expect(expected).not.toContain('Mu*');
  });

  it('picks the route and chapter, then opens the projection for them', () => {
    const { fixture, picker, host } = open();
    const next = () => host.querySelector<HTMLButtonElement>('.button--primary')!;

    expect(next().disabled).toBeTrue();

    picker.unitId.set(unitId('Mu'));
    fixture.detectChanges();

    const routeSelect = host.querySelector<HTMLSelectElement>('select[aria-label="Route"]')!;
    expect(Array.from(routeSelect.options).map((option) => option.text)).toEqual(picker.routes().map((route) => route.label));
    expect(picker.route()!.chapters.length).toBeGreaterThan(0);
    expect(picker.growthUnit()!.name).toBe('Mu*');

    next().click();
    fixture.detectChanges();

    const projection = fixture.debugElement.query(By.directive(ProjectionDialogComponent))
      .componentInstance as ProjectionDialogComponent;
    expect(projection.unit().name).toBe('Mu*');
    expect(projection.chapters()).toBe(picker.route()!.chapters);
    expect(projection.chapter()!.chapter).toBe(picker.chapterNumber()!);
  });
});
