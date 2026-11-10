import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import unitClassData from '../data/unit-classes.json';
import unitData from '../data/units.json';
import { STAT_KEYS, StatKey, Unit, UnitClass, ZERO_GROWTH } from '../models/growth.models';
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

  describe('bad level ups', () => {
    const str = STAT_KEYS.indexOf('str');
    const mark = (sectionId: number, rowIndex: number, ...stats: StatKey[]) => {
      const row = state.seedMap().sections.find((section) => section.id === sectionId)!.rows[rowIndex];
      stats.forEach((stat) => state.toggleStat(sectionId, row.id, stat));
    };
    // The seed's Lv 13 (row 11) uses the roll an exam at Lv 12 would take.
    const lv13Slot = () => page.slotOf(seedView(), 11);

    it("shows '?' for a roll only a 1–2 stat level up used, and doesn't force an exam on it", () => {
      // Str didn't rise, but only 2 stats did, so the guaranteed minimum may have picked them.
      mark(seed().id, 11, 'hp', 'def');

      expect(page.rollsAt(lv13Slot())[str].text).toBe('?');
      page.openBranchAt(seedView(), 11);
      expect(page.examDialog()!.strBounds).toEqual({ lower: null, upper: null });

      // A third stat makes it a reliable level up: Str stayed above its growth.
      mark(seed().id, 11, 'spd');
      const strGrowth = page.rowGrowth(seedView(), 11)!.str;

      expect(page.rollsAt(lv13Slot())[str].text).toBe(`>${strGrowth}%`);
      page.openBranchAt(seedView(), 11);
      expect(page.examDialog()!.strBounds).toEqual({ lower: strGrowth, upper: null });
    });

    it('fills the other level ups on a roll in once one reliable (3+ stat) level up used it', () => {
      const easyStr = { ...ZERO_GROWTH, str: 100 };
      const blank = { id: -1, marks: { ...ZERO_GROWTH } };
      const autoStr = () => page.effectiveRow(easyStr, blank, lv13Slot()).auto.str;

      // Only 2 stats: the guaranteed minimum may have picked them, so nothing is filled in.
      mark(seed().id, 11, 'str', 'def');
      expect(autoStr()).toBeFalse();

      // A Hunter branch on the same roll rising 3 stats is reliable, so it fills the others in.
      state.addAvailableClass(classId('Hunter'));
      const hunter = state.addBranch(seed().id, lv12(), { classId: classId('Hunter'), chance: 0, passed: true, reclass: true })!;
      mark(hunter, 0, 'str', 'dex', 'def');

      expect(page.slotOf(view(hunter), 0)).toBe(lv13Slot());
      expect(autoStr()).toBeTrue();
    });
  });

  it("doesn't offer a class another branch at the same level already took", () => {
    exam('Ornius Rider');
    page.openBranchAt(seedView(), 11);
    const names = page.examDialog()!.classGroups.flatMap((group) => group.items.map((item) => item.name));

    expect(names).not.toContain('Ornius Rider');
    expect(names).toContain('Diviner');
  });

  it('only offers exam classes unlocked by the level, and tells the dialog that level', () => {
    const ranks = () => page.examDialog()!.classGroups.map((group) => group.label);

    page.openBranchAt(seedView(), 11);
    expect(page.examDialog()!.level).toBe(13);
    expect(ranks()).not.toContain('Speciality');

    for (let index = 0; index < 4; index++) {
      state.addLevel(seed().id);
    }

    // Seed row 14 is Lv 16, past the Speciality unlock at Lv 15.
    page.openBranchAt(seedView(), 14);
    expect(page.examDialog()!.level).toBe(16);
    expect(ranks()).toContain('Speciality');
  });

  it('lets the section view + add another exam at a level that already branches', () => {
    exam('Diviner');

    expect(page.canTakeExamAtRow(seedView(), 11)).toBeTrue();
    page.openExamAt(seedView(), 11);
    page.onExamConfirmed({ classId: classId('Gladiator'), chance: 40, passed: true });

    const branches = state.seedMap().sections.filter((section) => section.exam?.afterRowId === lv12());
    expect(branches.map((section) => section.exam!.classId)).toEqual([classId('Diviner'), classId('Gladiator')]);
  });

  it('projects stats from the end of a branch, in the class it ends in', () => {
    STAT_KEYS.forEach((stat) => state.setStartStat(stat, 10));
    state.toggleStat(seed().id, seed().rows[0].id, 'str');
    const branch = view(exam('Gladiator'));

    expect(page.canProject(branch)).toBeTrue();
    page.openProjection(branch);

    const start = page.projection()!.start;
    expect(page.projection()!.unit.name).toBe('Cai');
    expect(start.level).toBe(page.endLevelOf(branch));
    expect(start.className).toBe('Gladiator');
    expect(start.stats.str).toBe(11 + page.examBoostOf(branch).str);
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
  const toggleButton = (host: HTMLElement, label: string) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>('.page-header button')).find((button) =>
      button.textContent!.includes(label),
    );

  it('opens in the timeline view, with a Section view toggle in the page header', () => {
    const { fixture, host } = render();

    expect(host.querySelector('app-seed-timeline')).not.toBeNull();
    expect(host.querySelector('.seed-group')).toBeNull();

    toggleButton(host, 'Section view')!.click();
    fixture.detectChanges();

    expect(host.querySelector('.seed-group')).not.toBeNull();
    expect(host.querySelector('app-seed-timeline')).toBeNull();
    expect(toggleButton(host, 'Timeline view')).toBeDefined();
  });

  it('shows one timeline with a switcher where exams branch off, locking rows the branch shares', () => {
    const { fixture, page, host } = render();
    // Branch in place of the seed's second level (Lv 3).
    const afterRow = seed().rows[0].id;
    state.addBranch(seed().id, afterRow, { classId: classId('Diviner'), chance: 40, passed: true });
    state.addBranch(seed().id, afterRow, { classId: classId('Gladiator'), chance: 40, passed: true });

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

  it('shows growth rates at the start and again where a branch changes class', () => {
    const { fixture, host } = render();
    state.addBranch(seed().id, seed().rows[0].id, { classId: classId('Gladiator'), chance: 40, passed: true });
    fixture.detectChanges();

    const timeline = fixture.debugElement.query(By.directive(SeedTimelineComponent)).componentInstance as SeedTimelineComponent;
    timeline.focusBranch(state.seedMap().sections[1].id);
    fixture.detectChanges();

    const labels = Array.from(host.querySelectorAll('.tgrid__label')).map((label) =>
      Array.from(label.children).map((part) => part.textContent!.trim()).join(' '),
    );
    expect(labels.filter((label) => label.startsWith('Growth'))).toEqual(['Growth Noble/Commoner', 'Growth Gladiator']);
    expect(host.querySelectorAll('.tgrid__growth').length).toBe(2 * STAT_KEYS.length);
  });
});
