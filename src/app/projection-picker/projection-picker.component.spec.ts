import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import unitData from '../data/units.json';
import { Unit } from '../models/growth.models';
import { ProjectionDialogComponent } from '../projection-dialog/projection-dialog.component';
import { ProjectionStartDialogComponent } from '../projection-start-dialog/projection-start-dialog.component';
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
    const start = fixture.debugElement.query(By.directive(ProjectionStartDialogComponent)).componentInstance as ProjectionStartDialogComponent;
    const projection = () =>
      fixture.debugElement.query(By.directive(ProjectionDialogComponent))?.componentInstance as ProjectionDialogComponent | undefined;

    return { fixture, start, projection };
  };

  it('opens the projection from the chosen recruitment chapter, on its results, with Back returning to the modal', () => {
    const { fixture, start, projection } = open();
    start.setSource('chapter');
    start.unitId.set(unitId('Mu'));
    fixture.detectChanges();
    start.confirm();
    fixture.detectChanges();

    expect(projection()!.unit().name).toBe('Mu*');
    expect(projection()!.chapters()).toBe(start.route()!.chapters);
    expect(projection()!.chapter()!.chapter).toBe(start.chapterNumber()!);
    expect(projection()!.page()).toBe('results');
    expect(projection()!.projection().length).toBe(9);

    projection()!.goBack();
    fixture.detectChanges();
    const reopened = fixture.debugElement.query(By.directive(ProjectionStartDialogComponent)).componentInstance as ProjectionStartDialogComponent;
    expect(reopened.unit()!.name).toBe('Mu');
  });

  it('opens the projection from manual stats, without a chapter picker', () => {
    const { fixture, start, projection } = open();
    start.setSource('manual');
    start.pickManualUnit(unitId('Cai'));
    fixture.detectChanges();
    start.confirm();
    fixture.detectChanges();

    expect(projection()!.unit().name).toBe('Cai');
    expect(projection()!.chapterPicker()).toBeFalse();
    expect(projection()!.startLevel()).toBe(1);
    expect(projection()!.chapter()!.stats.str).toBe(10);
  });
});
