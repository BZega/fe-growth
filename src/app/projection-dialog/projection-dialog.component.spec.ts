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

  const open = (unitName: string, joining: RecruitmentChapter = chapter) => {
    units = [];
    TestBed.inject(GrowthDataService).getUnits().subscribe((loaded) => (units = loaded));
    const unit = units.find((candidate) => candidate.name === unitName)!;
    const fixture = TestBed.createComponent(ProjectionDialogComponent);
    fixture.componentRef.setInput('unit', unit);
    fixture.componentRef.setInput('chapters', [joining]);
    fixture.componentRef.setInput('initialChapter', joining.chapter);
    fixture.detectChanges();

    return { fixture, dialog: fixture.componentInstance, host: fixture.nativeElement as HTMLElement, unit };
  };
  const reclass = (dialog: ProjectionDialogComponent, level: number, className: string) => {
    dialog.addClass();
    const entry = dialog.plan().at(-1)!;
    dialog.setReclassLevel(entry.id, level);
    dialog.setClass(entry.id, String(byName(className).id));
    return dialog.plan().at(-1)!;
  };
  const names = (groups: { classes: UnitClass[] }[]) => groups.flatMap((group) => group.classes.map((unitClass) => unitClass.name));
  const gatedRanks = (groups: { rank: string; classes: UnitClass[] }[]) =>
    groups
      .filter((group) => group.rank !== 'Divine' && group.classes.some((unitClass) => unitClass.name !== 'Dancer'))
      .map((group) => group.rank);

  it('unlocks each rank 5 levels before its old gate', () => {
    const { dialog } = open('Cai');
    const ranks = (level: number) => gatedRanks(dialog.classGroups(level));

    expect(ranks(1)).toEqual(['Base', 'Beginner']);
    expect(ranks(14)).toEqual(['Base', 'Beginner']);
    expect(ranks(15)).toEqual(['Base', 'Beginner', 'Speciality']);
    expect(ranks(30)).toEqual(['Base', 'Beginner', 'Speciality', 'Advanced']);
    expect(ranks(40)).toEqual(['Base', 'Beginner', 'Speciality', 'Advanced', 'Master']);
  });

  it('offers every Divine class and Dancer from Lv 1', () => {
    const { dialog } = open('Cai');
    const anyLevel = classes.filter((unitClass) => unitClass.rank === 'Divine' || unitClass.name === 'Dancer');
    const usable = names(dialog.classGroups(99)).filter((name) => anyLevel.some((unitClass) => unitClass.name === name));

    expect(usable.length).toBeGreaterThan(0);
    expect(names(dialog.classGroups(1))).toEqual(jasmine.arrayContaining(usable));
  });

  it('keeps Dancer on a reclass moved below Lv 30', () => {
    const { dialog } = open('Cai');
    dialog.addClass();
    const entry = dialog.plan()[1];
    dialog.setClass(entry.id, String(byName('Dancer').id));
    dialog.setReclassLevel(entry.id, 5);

    expect(dialog.plan()[1].classId).toBe(byName('Dancer').id);
  });

  it("starts at the chapter's level and class, with no fixed level gate sections", () => {
    const { fixture, host } = open('Cai', { ...chapter, chapter: 20, level: 40, className: 'Swordmaster' });
    fixture.detectChanges();

    expect(host.querySelectorAll('fieldset.tier').length).toBe(1);
    expect(host.querySelector('.tier__from')!.textContent!.trim()).toBe('Lv 40');
    expect(host.querySelector('select[aria-label="Starting class"]')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Starting class"]')!.value).toBe('Swordmaster');
    expect(host.querySelector('input[aria-label="Reclass to"]')).toBeNull();
  });

  it("projects from the joining chapter's class until a reclass takes over", () => {
    const swordmaster = byName('Swordmaster');
    const { dialog, unit } = open('Cai', { ...chapter, chapter: 20, level: 40, className: swordmaster.name });
    dialog.setEndLevel('44');

    const expectedMag = 3 + (4 * (unit.mag + swordmaster.mag)) / 100 + swordmaster.bonusStats.mag;
    expect(dialog.projection().find((row) => row.stat === 'mag')!.total).toBeCloseTo(expectedMag, 10);
  });

  it('adds each reclass at the next rank unlock, then one level after the last', () => {
    const { dialog } = open('Cai');
    const levels: number[] = [];

    for (const name of ['Gladiator', 'Charioteer', 'Gladiator', 'Charioteer']) {
      dialog.addClass();
      const entry = dialog.plan().at(-1)!;
      dialog.setClass(entry.id, String(byName(name).id));
      levels.push(dialog.rowLevels().at(-1)!);
    }

    expect(levels).toEqual([15, 30, 40, 41]);
  });

  it('only offers ranks unlocked at the reclass level, and clears a class moved below its unlock', () => {
    const { dialog } = open('Cai');
    const entry = reclass(dialog, 15, 'Charioteer');
    const position = dialog.plan().indexOf(entry);

    // Noble/Commoner, the only Base class, is the class being left, so Base isn't offered.
    expect(gatedRanks(dialog.reclassGroups(position))).toEqual(['Beginner', 'Speciality']);

    dialog.setReclassLevel(entry.id, 14);
    expect(dialog.plan()[position].classId).toBeNull();
    expect(gatedRanks(dialog.reclassGroups(position))).toEqual(['Beginner']);
  });

  it("doesn't offer the class the unit is already in when reclassing", () => {
    const { dialog } = open('Cai');

    dialog.addClass();
    expect(names(dialog.reclassGroups(1))).not.toContain('Noble/Commoner');
    dialog.setClass(dialog.plan()[1].id, String(byName('Gladiator').id));

    dialog.addClass();
    expect(names(dialog.reclassGroups(2))).not.toContain('Gladiator');
    expect(names(dialog.reclassGroups(2))).toContain('Noble/Commoner');

    // A reclass already set to that class keeps it listed.
    dialog.setClass(dialog.plan()[2].id, String(byName('Gladiator').id));
    expect(names(dialog.reclassGroups(2))).toContain('Gladiator');
  });

  it('hides + Reclass until the new reclass has a class', () => {
    const { dialog, fixture, host } = open('Cai');
    const addButton = () => host.querySelector<HTMLButtonElement>('.tier__add');

    expect(addButton()).not.toBeNull();

    addButton()!.click();
    fixture.detectChanges();
    expect(addButton()).toBeNull();

    dialog.addClass();
    expect(dialog.plan().length).toBe(2);

    dialog.setClass(dialog.plan()[1].id, String(byName('Gladiator').id));
    fixture.detectChanges();
    expect(addButton()).not.toBeNull();
  });

  it('gives every reclass its own level between its neighbours', () => {
    const { dialog, fixture, host } = open('Cai');
    const levelBoxes = () => Array.from(host.querySelectorAll<HTMLInputElement>('.tier__level input'));
    const setLevel = (box: HTMLInputElement, value: string) => {
      box.value = value;
      box.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };

    reclass(dialog, 10, 'Gladiator');
    reclass(dialog, 20, 'Noble/Commoner');
    fixture.detectChanges();

    setLevel(levelBoxes()[0], '3');
    expect(levelBoxes()[0].value).toBe('5');
    setLevel(levelBoxes()[0], '25');
    expect(levelBoxes()[0].value).toBe('19');
    setLevel(levelBoxes()[1], '10');
    expect(levelBoxes()[1].value).toBe('20');

    // No reclass fits after Lv 98.
    setLevel(levelBoxes()[1], '98');
    expect(dialog.canAddClass()).toBeFalse();
    dialog.addClass();
    expect(dialog.plan().length).toBe(3);
  });

  it('shows the projected final stats on a new page after Submit, to two decimals', () => {
    const { dialog, fixture, host, unit } = open('Cai');
    const gladiator = byName('Gladiator');
    reclass(dialog, 5, 'Gladiator');
    fixture.detectChanges();

    host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(host.querySelector('h2')!.textContent!.trim()).toBe('Projected Final Stats');
    expect(host.querySelector('form')).toBeNull();

    // Lv 4 -> 5 as Noble/Commoner, then Lv 5 -> 99 as Gladiator.
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
    expect(host.querySelector<HTMLInputElement>('.results__level-input')!.value).toBe('20');

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

  it('lays out HP on top, then Str to Dex on the left and Def to Cha on the right', () => {
    const { dialog, fixture, host } = open('Cai');
    dialog.submit();
    fixture.detectChanges();

    const boxes = Array.from(host.querySelectorAll<HTMLElement>('.results__stat')).map((stat) => ({
      label: stat.querySelector('.results__label')!.textContent!.trim(),
      rect: stat.getBoundingClientRect(),
      value: stat.querySelector('.results__value')!.getBoundingClientRect(),
    }));
    const column = (labels: string[]) => boxes.filter((box) => labels.includes(box.label));
    const [hp] = column(['HP']);
    const left = column(['Str', 'Mag', 'Spd', 'Dex']);
    const right = column(['Def', 'Res', 'Lck', 'Cha']);

    expect(left.every((box) => box.rect.top > hp.rect.bottom - 1)).toBeTrue();
    expect(left.every((box) => box.rect.left === left[0].rect.left)).toBeTrue();
    expect(right.every((box) => box.rect.left === right[0].rect.left)).toBeTrue();
    expect(right[0].rect.left).toBeGreaterThan(left[0].rect.right - 1);
    expect(left.map((box) => box.rect.top)).toEqual(right.map((box) => box.rect.top));
    expect(hp.rect.left).toBe(left[0].rect.left);
    expect(hp.rect.width).toBe(left[0].rect.width);
    expect(hp.value.right).toBe(left[0].value.right);
  });

  it('offers a mount and bond level for mounted classes, and shows the class level gates', () => {
    const { dialog, fixture, host } = open('Cai');
    const entry = reclass(dialog, 20, 'Charioteer');
    fixture.detectChanges();

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
    const entry = reclass(dialog, 20, 'Charioteer');
    const mount = dialog.mountsFor(entry).find((option) => option.bondLevels.length > 1) ?? dialog.mountsFor(entry)[0];
    dialog.setMount(entry.id, String(mount.id));
    const bond = mount.bondLevels.at(-1)?.level ?? null;
    if (bond !== null) {
      dialog.setBondLevel(entry.id, String(bond));
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
