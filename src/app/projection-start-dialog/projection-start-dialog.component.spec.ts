import { TestBed } from '@angular/core/testing';
import unitData from '../data/units.json';
import { STAT_KEYS, Unit } from '../models/growth.models';
import { RecruitmentDataService } from '../services/recruitment-data.service';
import { SpoilerService } from '../services/spoiler.service';
import { ProjectionStart, ProjectionStartDialogComponent } from './projection-start-dialog.component';

const units = unitData as Pick<Unit, 'id' | 'name'>[];
const unitId = (name: string) => units.find((unit) => unit.name === name)!.id;

describe('ProjectionStartDialogComponent', () => {
  beforeEach(() => TestBed.inject(SpoilerService).setAllHidden(false));

  afterEach(() => {
    TestBed.inject(SpoilerService).setAllHidden(true);
    TestBed.flushEffects();
  });

  const open = (inputs: Record<string, unknown> = {}) => {
    const fixture = TestBed.createComponent(ProjectionStartDialogComponent);
    let confirmed: ProjectionStart | null = null;
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.componentInstance.confirmed.subscribe((start) => (confirmed = start));
    fixture.detectChanges();

    return { fixture, dialog: fixture.componentInstance, host: fixture.nativeElement as HTMLElement, confirmed: () => confirmed };
  };

  it('only lists characters with chapter stats for Recruitment, leaving out boosted variants like Mu*', () => {
    const { dialog } = open();
    const recruitment = TestBed.inject(RecruitmentDataService);
    const expected = units
      .filter((unit) => unit.name !== 'Mu*' && recruitment.routesWithChapters(unit.name).length > 0)
      .map((unit) => unit.name);

    expect(dialog.characters().map((unit) => unit.name)).toEqual(jasmine.arrayWithExactContents(expected));
    expect(expected).toContain('Cai');
  });

  it("doesn't open the on-screen keyboard for the dropdowns in either mode", () => {
    const { dialog, fixture, host } = open();
    const characterBox = () => host.querySelector('input[aria-label="Character"]')!;

    expect(characterBox().getAttribute('inputmode')).toBe('none');
    dialog.setSource('manual');
    fixture.detectChanges();
    expect(characterBox().getAttribute('inputmode')).toBe('none');
  });

  it("starts from a recruitment chapter, projecting Mu from Mu*'s growths", () => {
    const { dialog, fixture, host, confirmed } = open();
    const confirm = () => host.querySelector<HTMLButtonElement>('.button--primary')!;

    expect(confirm().disabled).toBeTrue();
    dialog.setSource('chapter');
    dialog.unitId.set(unitId('Mu'));
    fixture.detectChanges();
    confirm().click();

    const start = confirmed()!;
    expect(start.source).toBe('chapter');
    expect(start.name).toBe('Mu');
    expect(start.unit.name).toBe('Mu*');
    expect(start.chapters).toBe(dialog.route()!.chapters);
    expect(start.level).toBe(dialog.chapter()!.level);
  });

  it('switches to Manual with the character carried over and their Lv 1 base stats, until a level is typed in', () => {
    const { dialog, fixture, host, confirmed } = open();
    expect(dialog.source()).toBe('manual');
    dialog.setSource('chapter');
    dialog.unitId.set(unitId('Cai'));
    dialog.setSource('manual');
    fixture.detectChanges();

    expect(dialog.manualUnitId()).toBe(unitId('Cai'));
    expect(dialog.manualStats()).toEqual({ hp: 27, str: 10, mag: 7, spd: 8, dex: 8, def: 6, res: 5, lck: 6, cha: 5 });

    const level = host.querySelector<HTMLInputElement>('input[aria-label="Starting level"]')!;
    level.value = '12';
    level.dispatchEvent(new Event('change'));
    dialog.pickManualUnit(unitId('Peter'));
    expect(dialog.manualStats().str).toBe(10);

    dialog.useBaseStats();
    expect(dialog.manualLevel()).toBe(1);
    expect(dialog.manualStats().str).toBe(9);

    dialog.confirm();
    expect(confirmed()!).toEqual(jasmine.objectContaining({ source: 'manual', name: 'Peter', level: 1, baseStats: true }));
    expect(STAT_KEYS.every((stat) => confirmed()!.stats[stat] !== null)).toBeTrue();
  });

  it('fills an existing start back in when editing', () => {
    const first = open();
    first.dialog.setSource('chapter');
    first.dialog.unitId.set(unitId('Cai'));
    const chapters = first.dialog.route()!.chapters;
    first.dialog.chapterNumber.set(chapters.at(-1)!.chapter);
    first.fixture.detectChanges();
    first.dialog.confirm();

    const { dialog } = open({ initial: first.confirmed() });

    expect(dialog.source()).toBe('chapter');
    expect(dialog.unit()!.name).toBe('Cai');
    expect(dialog.chapterNumber()).toBe(chapters.at(-1)!.chapter);
  });
});
