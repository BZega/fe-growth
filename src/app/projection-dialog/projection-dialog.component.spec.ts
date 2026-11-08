import { TestBed } from '@angular/core/testing';
import unitClassData from '../data/unit-classes.json';
import unitData from '../data/units.json';
import { CLASS_LEVEL_CONFIGS, Mount, mountBonusAt, mountGrowthAt, scaleGrowth, STAT_KEYS, sumGrowth, toGrowth, Unit, UnitClass } from '../models/growth.models';
import { classAtLevel, classLevelGate, levelUpGrowth, projectStats, RecruitmentChapter } from '../models/recruitment.models';
import { GrowthDataService } from '../services/growth-data.service';
import { SpoilerService } from '../services/spoiler.service';
import { ProjectionDialogComponent } from './projection-dialog.component';

const classes = unitClassData as UnitClass[];
const byName = (name: string) => classes.find((unitClass) => unitClass.name === name)!;

describe('stat projection maths', () => {
  it('uses the latest class taken at or before each level', () => {
    const steps = [
      { fromLevel: 1, classId: 1 },
      { fromLevel: 5, classId: 2 },
      { fromLevel: 12, classId: 3 },
    ];

    expect([1, 4, 5, 11, 12, 50].map((level) => classAtLevel(steps, level))).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('adds each level up growth as a fraction', () => {
    const start = { ...toGrowth(null), mag: 10 };
    const result = projectStats(start, 1, 11, () => ({ ...toGrowth(null), mag: 40 }));

    expect(result.mag).toBeCloseTo(14, 10);
  });

  it('moves Charioteer and Elephant Rider through their class levels as the unit levels', () => {
    const charioteer = CLASS_LEVEL_CONFIGS['Charioteer'];
    const elephant = CLASS_LEVEL_CONFIGS['Elephant Rider'];

    expect([20, 34, 35, 44, 45, 99].map((level) => classLevelGate(charioteer, level))).toEqual([20, 20, 35, 35, 45, 45]);
    expect([35, 44, 45, 80].map((level) => classLevelGate(elephant, level))).toEqual([35, 35, 45, 45]);
  });

  it("uses the gate's bonus and the class's mount multiplier for each level up", () => {
    const unit = { ...toGrowth(null), name: 'Test' } as Unit;
    const charioteer = byName('Charioteer');
    const mount = { ...toGrowth(null), id: 1, name: 'Horse', type: 'Horse', bondLevels: [] } as unknown as Mount;
    mount.str = 10;
    const config = CLASS_LEVEL_CONFIGS['Charioteer'];

    const at20 = levelUpGrowth(unit, charioteer, 20, mount, null);
    const at40 = levelUpGrowth(unit, charioteer, 40, mount, null);

    expect(at20.str).toBe(charioteer.str + 2 * mountGrowthAt(mount, null).str);
    expect(at40).toEqual(sumGrowth(toGrowth(charioteer), toGrowth(config.bonuses[35]), scaleGrowth(mountGrowthAt(mount, null), 2)));
  });
});

describe('ProjectionDialogComponent', () => {
  let units: Unit[];

  beforeEach(() => TestBed.inject(SpoilerService).setAllHidden(false));

  afterEach(() => {
    TestBed.inject(SpoilerService).setAllHidden(true);
    TestBed.flushEffects();
  });

  const chapter: RecruitmentChapter = {
    chapter: 4,
    level: 4,
    className: 'Noble/Commoner',
    skillRanks: {},
    stats: { ...toGrowth(null), hp: 24, mag: 3 },
    inventory: [],
    equippedAbilities: [],
  };

  const open = (unitName: string) => {
    units = [];
    TestBed.inject(GrowthDataService).getUnits().subscribe((loaded) => (units = loaded));
    const unit = units.find((candidate) => candidate.name === unitName)!;
    const fixture = TestBed.createComponent(ProjectionDialogComponent);
    fixture.componentRef.setInput('unit', unit);
    fixture.componentRef.setInput('chapters', [chapter]);
    fixture.componentRef.setInput('initialChapter', 4);
    fixture.detectChanges();

    return { fixture, dialog: fixture.componentInstance, host: fixture.nativeElement as HTMLElement, unit };
  };

  it('offers only the ranks each tier allows, including the ranks below it', () => {
    const { dialog } = open('Cai');
    const ranks = (tier: number) => dialog.classGroups(tier).map((group) => group.rank);

    expect(ranks(0)).toEqual(['Base']);
    expect(ranks(1)).toEqual(['Base', 'Beginner']);
    expect(ranks(2)).toEqual(['Base', 'Beginner', 'Speciality']);
    expect(ranks(3)).toEqual(['Base', 'Beginner', 'Speciality', 'Advanced']);
    expect(ranks(4)).toEqual(jasmine.arrayContaining(['Advanced', 'Master', 'Divine']));
    expect(dialog.tiers.map((tier) => [tier.start, tier.end])).toEqual([[1, 5], [5, 20], [20, 35], [35, 45], [45, 99]]);
  });

  it('keeps the first tier on Noble/Commoner with no option to add classes', () => {
    const { dialog, host } = open('Cai');

    expect(host.querySelector('.tier__fixed')!.textContent!.trim()).toBe('Noble/Commoner');
    expect(dialog.canAddClass(0)).toBeFalse();
    expect(dialog.canAddClass(1)).toBeTrue();
  });

  it('adds extra classes inside the tier and keeps their switch level within it', () => {
    const { dialog, fixture, host } = open('Cai');

    dialog.addClass(1);
    fixture.detectChanges();
    const levelBox = host.querySelector<HTMLInputElement>('.tier__level input')!;
    levelBox.value = '40';
    levelBox.dispatchEvent(new Event('change'));

    expect(dialog.plan()[1][1].fromLevel).toBe(19);
    expect(levelBox.value).toBe('19');
  });

  it('shows the projected final stats on a new page after Submit, to two decimals', () => {
    const { dialog, fixture, host, unit } = open('Cai');
    const gladiator = byName('Gladiator');
    dialog.setClass(1, dialog.plan()[1][0].id, String(gladiator.id));
    fixture.detectChanges();

    host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(host.querySelector('h2')!.textContent!.trim()).toBe('Projected final stats');
    expect(host.querySelector('form')).toBeNull();

    // Lv 4 -> 5 as Noble/Commoner, then Lv 5 -> 99 as Gladiator (no later tier set, so it's kept).
    const noble = byName('Noble/Commoner');
    const expectedMag = 3 + (unit.mag + noble.mag) / 100 + (94 * (unit.mag + gladiator.mag)) / 100 + gladiator.bonusStats.mag;
    const mag = dialog.projection().find((row) => row.stat === 'mag')!;

    expect(mag.total).toBeCloseTo(expectedMag, 10);
    expect(Array.from(host.querySelectorAll('.results__value')).every((value) => /^-?\d+\.\d{2}$/.test(value.textContent!.trim()))).toBeTrue();
  });

  it('recalculates when the end level changes, and Back returns to the plan', () => {
    const { dialog, fixture, host } = open('Cai');
    dialog.submit();
    fixture.detectChanges();
    const at99 = dialog.projection().find((row) => row.stat === 'hp')!.total;

    dialog.setEndLevel('20');
    fixture.detectChanges();
    const at20 = dialog.projection().find((row) => row.stat === 'hp')!.total;

    expect(at20).toBeLessThan(at99);
    expect(host.querySelector('.results__summary')!.textContent).toContain('Lv 20');

    dialog.setEndLevel('1');
    expect(dialog.endLevel()).toBe(4);

    host.querySelector<HTMLButtonElement>('.dialog__footer .button:not(.button--primary)')!.click();
    fixture.detectChanges();
    expect(host.querySelector('form')).not.toBeNull();
  });

  it('every stat is included', () => {
    const { dialog } = open('Cai');

    expect(dialog.projection().map((row) => row.stat)).toEqual([...STAT_KEYS]);
  });

  it('offers a mount and bond level for mounted classes, and shows the class level gates', () => {
    const { dialog, fixture, host } = open('Cai');
    const charioteer = byName('Charioteer');
    dialog.setClass(2, dialog.plan()[2][0].id, String(charioteer.id));
    fixture.detectChanges();

    const entry = dialog.plan()[2][0];
    expect(dialog.mountsFor(entry).length).toBeGreaterThan(0);
    expect(dialog.mountOf(entry)).toBe(dialog.mountsFor(entry)[0]);
    expect(host.querySelector('select[aria-label="Mount"]')).not.toBeNull();
    expect(host.querySelector('.tier__gates')!.textContent).toContain('Lv 20 / 35 / 45');
    expect(host.querySelector('.tier__gates')!.textContent).toContain('mount growth ×2');
  });

  it('projects a Charioteer through its class levels with doubled mount growth, plus the mount bonus at the end', () => {
    const { dialog, unit } = open('Cai');
    const noble = byName('Noble/Commoner');
    const charioteer = byName('Charioteer');
    dialog.setClass(2, dialog.plan()[2][0].id, String(charioteer.id));
    const entry = dialog.plan()[2][0];
    const mount = dialog.mountsFor(entry).find((option) => option.bondLevels.length > 1) ?? dialog.mountsFor(entry)[0];
    dialog.setMount(2, entry.id, String(mount.id));
    const bond = mount.bondLevels.at(-1)?.level ?? null;
    if (bond !== null) {
      dialog.setBondLevel(2, entry.id, String(bond));
    }
    dialog.submit();

    let expected = 3;
    for (let level = 4; level < 99; level++) {
      const growth =
        level < 20
          ? sumGrowth(toGrowth(unit), toGrowth(noble))
          : levelUpGrowth(unit, charioteer, level, mount, bond);
      expected += growth.mag / 100;
    }
    expected += charioteer.bonusStats.mag + mountBonusAt(mount, bond).mag;

    expect(dialog.projection().find((row) => row.stat === 'mag')!.total).toBeCloseTo(expected, 10);
    expect(dialog.endMount()!.name).toBe(mount.name);
  });
});
