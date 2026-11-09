import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import unitClassData from '../data/unit-classes.json';
import unitData from '../data/units.json';
import { Unit, UnitClass } from '../models/growth.models';
import { SeedMapperStateService } from '../services/seed-mapper-state.service';
import { SeedSerializerService } from '../services/seed-serializer.service';
import { SeedMapperPageComponent } from '../seed-mapper-page/seed-mapper-page.component';
import { SeedTimelineComponent } from './seed-timeline.component';

const classes = unitClassData as UnitClass[];
const classId = (name: string) => classes.find((unitClass) => unitClass.name === name)!.id;
const unitId = (name: string) => (unitData as Pick<Unit, 'id' | 'name'>[]).find((unit) => unit.name === name)!.id;

describe('Seed timeline branches', () => {
  let page: SeedMapperPageComponent;
  let state: SeedMapperStateService;

  const seed = () => state.seedMap().sections[0];
  const view = (sectionId: number) => page.sectionViews().find((candidate) => candidate.section.id === sectionId)!;
  const seedView = () => page.sectionViews()[0];
  // Seed rows run Lv 2 to Lv 14; index 10 is Lv 12.
  const lv12 = () => seed().rows[10].id;
  const exam = (name: string, passed = true) =>
    state.addBranch(seed().id, lv12(), { classId: classId(name), chance: 40, passed })!;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [SeedMapperPageComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(SeedMapperPageComponent);
    page = fixture.componentInstance;
    state = TestBed.inject(SeedMapperStateService);
    state.reset();
    state.setUnit(unitId('Cai'));

    for (let index = 0; index < 12; index++) {
      state.addLevel(seed().id);
    }
  });

  it('lets several exams branch off at the same level, all using one roll and sharing the level ups after it', () => {
    const diviner = view(exam('Diviner'));
    const gladiator = view(exam('Gladiator'));
    const failed = view(exam('Diviner', false));

    for (const branch of [diviner, gladiator, failed]) {
      // The exam uses the roll the seed's Lv 13 would have used...
      expect(branch.exam!.slot).toBe(page.slotOf(seedView(), 11));
      // ...so each branch's Lv 13 shares the seed's Lv 14 roll.
      expect(page.slotOf(branch, 0)).toBe(page.slotOf(seedView(), 12));
      expect(page.levelOf(branch, 0)).toBe(13);
    }
  });

  it('makes a reclass a branch that uses no roll, so its first level up shares the roll of the level it replaces', () => {
    const reclass = view(
      state.addBranch(seed().id, lv12(), { classId: classId('Gladiator'), chance: 0, passed: true, reclass: true })!,
    );

    expect(reclass.title).toBe('Reclass 1');
    expect(reclass.exam).toBeNull();
    expect(reclass.classId).toBe(classId('Gladiator'));
    expect(page.levelOf(reclass, 0)).toBe(13);
    expect(page.slotOf(reclass, 0)).toBe(page.slotOf(seedView(), 11));
  });

  it('has a level up with the same roll and growth rates follow the one that holds the marks', () => {
    const failed = view(exam('Diviner', false));
    const owner = page.rowOwner(failed, 0);

    // A failed exam keeps the seed's class, so its Lv 13 rises like the seed's Lv 14.
    expect(owner.view.section.id).toBe(seed().id);
    expect(owner.rowIndex).toBe(12);

    page.setSharedMark(failed, 0, 'str', true);

    expect(seed().rows[12].marks.str).toBe(1);
    expect(view(failed.section.id).section.rows[0].marks.str).toBe(1);
    expect(page.rowOwner(view(exam('Gladiator')), 0).view.section.id).not.toBe(seed().id);
  });

  it('keeps reclass branches and same-level exams as branches through save and load', () => {
    const last = seed().rows.at(-1)!.id;
    state.addBranch(seed().id, last, { classId: classId('Diviner'), chance: 40, passed: true });
    state.addBranch(seed().id, last, { classId: classId('Gladiator'), chance: 60, passed: false });
    state.addBranch(seed().id, lv12(), { classId: classId('Gladiator'), chance: 0, passed: true, reclass: true });

    const serializer = TestBed.inject(SeedSerializerService);
    const loaded = serializer.fromDto(serializer.toDto(state.snapshot()));
    state.reset();
    state.restore(loaded, null);

    const branches = state.seedMap().sections.slice(1);
    expect(branches.length).toBe(3);
    expect(branches.map((section) => section.exam!.reclass === true)).toEqual([false, false, true]);
    expect(page.sectionViews().map((candidate) => candidate.title)).toEqual(['Seed', 'Exam 1', 'Exam 2', 'Reclass 1']);
  });

  it('can pass an exam but stay in the current class, unlocking the exam class without its base stats', () => {
    state.addAvailableClass(classId('Gladiator'));
    state.setClass(seed().id, classId('Gladiator'));
    const stayed = view(
      state.addBranch(seed().id, lv12(), { classId: classId('Ornius Rider'), chance: 40, passed: true, keepClass: true })!,
    );
    const switched = view(exam('Ornius Rider'));

    expect(stayed.classId).toBe(classId('Gladiator'));
    expect(switched.classId).toBe(classId('Ornius Rider'));
    expect(page.availableClasses(stayed).map((unitClass) => unitClass.name)).toContain('Ornius Rider');
    expect(Object.values(page.examBoostOf(stayed)).every((boost) => boost === 0)).toBeTrue();
    // Still a pass: the Str roll was at or below the chance.
    expect(page.rollsAt(stayed.exam!.slot)[1].text).toBe('≤40%');

    // An inline exam can stay too, and both survive save and load.
    state.addExamLevel(seed().id, { classId: classId('Diviner'), chance: 30, passed: true, keepClass: true });
    expect(page.rowClassId(seedView(), seed().rows.length - 1)).toBe(classId('Gladiator'));

    const serializer = TestBed.inject(SeedSerializerService);
    const loaded = serializer.fromDto(serializer.toDto(state.snapshot()));
    state.reset();
    state.restore(loaded, null);

    expect(state.seedMap().sections[1].exam!.keepClass).toBeTrue();
    expect(seed().rows.at(-1)!.exam!.keepClass).toBeTrue();
  });
});

describe('SeedTimelineComponent', () => {
  let state: SeedMapperStateService;

  const seed = () => state.seedMap().sections[0];

  const render = () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [SeedMapperPageComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(SeedMapperPageComponent);
    state = TestBed.inject(SeedMapperStateService);
    state.reset();
    state.setUnit(unitId('Cai'));
    state.addLevel(seed().id);
    state.addLevel(seed().id);
    fixture.detectChanges();

    return { fixture, page: fixture.componentInstance, host: fixture.nativeElement as HTMLElement };
  };
  const toggleButton = (host: HTMLElement) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>('.page-header button')).find((button) =>
      button.textContent!.includes('Timeline view'),
    );

  it('has a Timeline view toggle in the page header that swaps it with the section view', () => {
    const { fixture, host } = render();

    expect(host.querySelector('.seed-group')).not.toBeNull();

    toggleButton(host)!.click();
    fixture.detectChanges();

    expect(host.querySelector('app-seed-timeline')).not.toBeNull();
    expect(host.querySelector('.seed-group')).toBeNull();
    expect(toggleButton(host)).toBeUndefined();
  });

  it('shows one timeline with a switcher where exams branch off, locking rows the branch shares', () => {
    const { fixture, page, host } = render();
    // Branch in place of the seed's second level (Lv 3).
    const afterRow = seed().rows[0].id;
    state.addBranch(seed().id, afterRow, { classId: classId('Diviner'), chance: 40, passed: true });
    state.addBranch(seed().id, afterRow, { classId: classId('Gladiator'), chance: 40, passed: true });

    toggleButton(host)!.click();
    fixture.detectChanges();

    expect(host.querySelector('app-seed-timeline')).not.toBeNull();
    expect(host.querySelector('.seed-group')).toBeNull();

    const chips = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.tgrid__fork .chip'));
    expect(chips().map((chip) => chip.textContent!.trim())).toEqual(['No branch', 'Diviner ✓', 'Gladiator ✓']);

    chips()[2].click();
    fixture.detectChanges();

    const timeline = fixture.debugElement.query(By.directive(SeedTimelineComponent)).componentInstance as SeedTimelineComponent;
    const levels = timeline.items().flatMap((item) => (item.kind === 'level' ? [item] : []));

    expect(timeline.focused()!.title).toBe('Exam 2');
    expect(levels.map((level) => [level.level, level.editable])).toEqual([
      [2, false],
      [3, true],
    ]);
    expect(host.querySelector('.tgrid__branch-label')!.textContent).toContain('Gladiator exam passed');

    const strCells = Array.from(host.querySelectorAll<HTMLButtonElement>('.tgrid .cell')).filter((cell) =>
      cell.getAttribute('aria-label')!.startsWith('Str'),
    );
    expect(strCells[0].disabled).toBeTrue();
    strCells[1].click();
    fixture.detectChanges();

    expect(page.sectionViews()[2].section.rows[0].marks.str).toBe(1);
  });
});
