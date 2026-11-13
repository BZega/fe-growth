import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import unitClassData from '../data/unit-classes.json';
import unitData from '../data/units.json';
import { CLASS_LEVEL_CONFIGS, Mount, mountBonusAt, mountGrowthAt, scaleGrowth, STAT_KEYS, sumGrowth, toGrowth, Unit, UnitClass } from '../models/growth.models';
import { classAtLevel, classLevelGate, levelUpGrowth, projectStats, RecruitmentChapter } from '../models/recruitment.models';
import { GrowthDataService } from '../services/growth-data.service';
import { SpoilerService } from '../services/spoiler.service';
import { ClassPlanComponent } from '../class-plan/class-plan.component';
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

    return {
      fixture,
      dialog: fixture.componentInstance,
      plan: fixture.componentInstance.planEditor()!,
      host: fixture.nativeElement as HTMLElement,
      unit,
    };
  };
  const reclass = (plan: ClassPlanComponent, level: number, className: string) => {
    plan.addClass();
    const entry = plan.plan().at(-1)!;
    plan.setReclassLevel(entry.id, level);
    plan.setClass(entry.id, String(byName(className).id));
    return plan.plan().at(-1)!;
  };
  const names = (groups: { classes: UnitClass[] }[]) => groups.flatMap((group) => group.classes.map((unitClass) => unitClass.name));
  const gatedRanks = (groups: { rank: string; classes: UnitClass[] }[]) =>
    groups
      .filter((group) => group.rank !== 'Divine' && group.classes.some((unitClass) => unitClass.name !== 'Dancer'))
      .map((group) => group.rank);

  it('unlocks each rank 5 levels before its old gate', () => {
    const { plan } = open('Cai');
    const ranks = (level: number) => gatedRanks(plan.classGroups(level));

    expect(ranks(1)).toEqual(['Base', 'Beginner']);
    expect(ranks(14)).toEqual(['Base', 'Beginner']);
    expect(ranks(15)).toEqual(['Base', 'Beginner', 'Speciality']);
    expect(ranks(30)).toEqual(['Base', 'Beginner', 'Speciality', 'Advanced']);
    expect(ranks(40)).toEqual(['Base', 'Beginner', 'Speciality', 'Advanced', 'Master']);
  });

  it('offers every Divine class and Dancer from Lv 1', () => {
    const { plan } = open('Cai');
    const anyLevel = classes.filter((unitClass) => unitClass.rank === 'Divine' || unitClass.name === 'Dancer');
    const usable = names(plan.classGroups(99)).filter((name) => anyLevel.some((unitClass) => unitClass.name === name));

    expect(usable.length).toBeGreaterThan(0);
    expect(names(plan.classGroups(1))).toEqual(jasmine.arrayContaining(usable));
  });

  it('keeps Dancer on a reclass moved below Lv 30', () => {
    const { plan } = open('Cai');
    plan.addClass();
    const entry = plan.plan()[1];
    plan.setClass(entry.id, String(byName('Dancer').id));
    plan.setReclassLevel(entry.id, 5);

    expect(plan.plan()[1].classId).toBe(byName('Dancer').id);
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

  it("doesn't open the on-screen keyboard for the class pickers", () => {
    const { plan, fixture, host } = open('Cai');
    plan.addClass();
    fixture.detectChanges();

    for (const label of ['Starting class', 'Reclass to']) {
      expect(host.querySelector(`input[aria-label="${label}"]`)!.getAttribute('inputmode')).toBe('none');
    }
    expect(host.querySelector('input[aria-label="Reclass level"]')!.getAttribute('inputmode')).toBe('numeric');
  });

  it('moves the modal up by the height of the on-screen keyboard', () => {
    const { fixture } = open('Cai');
    const host = fixture.nativeElement as HTMLElement;
    const before = parseFloat(getComputedStyle(host).paddingBottom);

    host.style.setProperty('--keyboard-inset', '300px');

    expect(parseFloat(getComputedStyle(host).paddingBottom)).toBe(before + 300);
  });

  it("projects from the joining chapter's class until a reclass takes over", () => {
    const swordmaster = byName('Swordmaster');
    const { dialog, unit } = open('Cai', { ...chapter, chapter: 20, level: 40, className: swordmaster.name });
    dialog.setEndLevel('44');

    const expectedMag = 3 + (4 * (unit.mag + swordmaster.mag)) / 100 + swordmaster.bonusStats.mag;
    expect(dialog.projection().find((row) => row.stat === 'mag')!.total).toBeCloseTo(expectedMag, 10);
  });

  it('adds each reclass at the next usual gate (5/20/35/45), then one level after the last', () => {
    const { plan } = open('Cai');
    const levels: number[] = [];

    for (const name of ['Gladiator', 'Charioteer', 'Gladiator', 'Charioteer', 'Gladiator']) {
      plan.addClass();
      const entry = plan.plan().at(-1)!;
      plan.setClass(entry.id, String(byName(name).id));
      levels.push(plan.rowLevels().at(-1)!);
    }

    // Cai joins at Lv 4.
    expect(levels).toEqual([5, 20, 35, 45, 46]);
  });

  it('only offers ranks unlocked at the reclass level, and clears a class moved below its unlock', () => {
    const { plan } = open('Cai');
    const entry = reclass(plan, 15, 'Charioteer');
    const position = plan.plan().indexOf(entry);

    // Noble/Commoner, the only Base class, is the class being left, so Base isn't offered.
    expect(gatedRanks(plan.reclassGroups(position))).toEqual(['Beginner', 'Speciality']);

    plan.setReclassLevel(entry.id, 14);
    expect(plan.plan()[position].classId).toBeNull();
    expect(gatedRanks(plan.reclassGroups(position))).toEqual(['Beginner']);
  });

  it('opens the reclass list at the rank usually taken at that level', () => {
    const { plan } = open('Cai');
    plan.addClass();
    const entry = plan.plan()[1];
    const rankAt = (level: number) => {
      plan.setReclassLevel(entry.id, level);
      return plan.rowFocusRanks()[1];
    };

    expect([5, 19, 20, 34, 35, 44, 45, 80].map(rankAt)).toEqual([
      'Beginner', 'Beginner', 'Speciality', 'Speciality', 'Advanced', 'Advanced', 'Master', 'Master',
    ]);

    TestBed.inject(SpoilerService).setHidden('salvation', true);
    expect(rankAt(45)).toBe('Advanced');
  });

  it("doesn't offer the class the unit is already in when reclassing", () => {
    const { plan } = open('Cai');

    plan.addClass();
    expect(names(plan.reclassGroups(1))).not.toContain('Noble/Commoner');
    plan.setClass(plan.plan()[1].id, String(byName('Gladiator').id));

    plan.addClass();
    expect(names(plan.reclassGroups(2))).not.toContain('Gladiator');
    expect(names(plan.reclassGroups(2))).toContain('Noble/Commoner');

    // A reclass already set to that class keeps it listed.
    plan.setClass(plan.plan()[2].id, String(byName('Gladiator').id));
    expect(names(plan.reclassGroups(2))).toContain('Gladiator');
  });

  it('hides + Reclass until the new reclass has a class', () => {
    const { plan, fixture, host } = open('Cai');
    const addButton = () => host.querySelector<HTMLButtonElement>('.tier__add');

    expect(addButton()).not.toBeNull();

    addButton()!.click();
    fixture.detectChanges();
    expect(addButton()).toBeNull();

    plan.addClass();
    expect(plan.plan().length).toBe(2);

    plan.setClass(plan.plan()[1].id, String(byName('Gladiator').id));
    fixture.detectChanges();
    expect(addButton()).not.toBeNull();
  });

  it('gives every reclass its own level between its neighbours', () => {
    const { plan, fixture, host } = open('Cai');
    const levelBoxes = () => Array.from(host.querySelectorAll<HTMLInputElement>('.tier__level input'));
    const setLevel = (box: HTMLInputElement, value: string) => {
      box.value = value;
      box.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };

    reclass(plan, 10, 'Gladiator');
    reclass(plan, 20, 'Noble/Commoner');
    fixture.detectChanges();

    setLevel(levelBoxes()[0], '3');
    expect(levelBoxes()[0].value).toBe('5');
    setLevel(levelBoxes()[0], '25');
    expect(levelBoxes()[0].value).toBe('19');
    setLevel(levelBoxes()[1], '10');
    expect(levelBoxes()[1].value).toBe('20');

    // No reclass fits after Lv 98.
    setLevel(levelBoxes()[1], '98');
    expect(plan.canAddClass()).toBeFalse();
    plan.addClass();
    expect(plan.plan().length).toBe(3);
  });

  it('shows the projected final stats on a new page after Submit, to two decimals', () => {
    const { dialog, plan, fixture, host, unit } = open('Cai');
    const gladiator = byName('Gladiator');
    reclass(plan, 5, 'Gladiator');
    fixture.detectChanges();

    host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(host.querySelector('h2')!.textContent!.trim()).toBe('Projected Final Stats');
    expect(host.querySelector('form')!.hidden).toBeTrue();

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

    host.querySelector<HTMLButtonElement>('.results .dialog__footer .button:not(.button--primary)')!.click();
    fixture.detectChanges();
    expect(host.querySelector('form')!.hidden).toBeFalse();
  });

  it('selects the whole value when a level box gets focus, so typing replaces it', fakeAsync(() => {
    const { dialog, plan, fixture, host } = open('Cai');
    plan.addClass();
    fixture.detectChanges();

    const check = (label: string) => {
      const box = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      const select = spyOn(box, 'select').and.callThrough();

      box.focus();
      tick();

      expect(select).toHaveBeenCalled();
      box.blur();
    };

    document.body.appendChild(host);
    check('Reclass level');
    dialog.submit();
    fixture.detectChanges();
    check('End level');
    host.remove();
  }));

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

  it('carries the last mount of a mount type into later classes of that type, across other types in between', () => {
    const { plan } = open('Cai');
    const api = TestBed.inject(GrowthDataService);
    expect(api.mountTypeOfClass('Ornius Rider')).toBe(api.mountTypeOfClass('Armored Ornius Rider'));
    expect(api.mountTypeOfClass('Light Cavalry')).not.toBe(api.mountTypeOfClass('Ornius Rider'));

    const ornius = reclass(plan, 5, 'Ornius Rider');
    const orniusMounts = plan.mountsFor(ornius).filter((mount) => mount.bondLevels.length > 3);
    plan.setMount(ornius.id, String(orniusMounts[0].id));
    plan.addMountChange(plan.plan().indexOf(plan.plan().find((entry) => entry.id === ornius.id)!));
    const change = plan.mountChangesOf(plan.plan().find((entry) => entry.id === ornius.id)!)[0];
    plan.setChangeMount(ornius.id, change.id, String(orniusMounts[1].id));
    plan.setChangeBondLevel(ornius.id, change.id, '4');

    const cavalry = reclass(plan, 20, 'Light Cavalry');
    const horses = plan.mountsFor(cavalry).filter((mount) => mount.bondLevels.length > 1);
    plan.setMount(cavalry.id, String(horses[horses.length - 1].id));
    plan.setBondLevel(cavalry.id, '2');

    const armored = reclass(plan, 35, 'Armored Ornius Rider');
    expect(plan.mountOf(armored)!.id).toBe(orniusMounts[1].id);
    expect(plan.bondLevelOf(armored)).toBe(4);

    const backToHorse = reclass(plan, 45, 'Light Cavalry');
    expect(plan.mountOf(backToHorse)!.id).toBe(horses[horses.length - 1].id);
    expect(plan.bondLevelOf(backToHorse)).toBe(2);

    // Picking a mount yourself still wins.
    plan.setMount(armored.id, String(orniusMounts[0].id));
    expect(plan.mountOf(plan.plan().find((entry) => entry.id === armored.id)!)!.id).toBe(orniusMounts[0].id);
  });

  it('keeps the bond level when switching to another mount, even through one without bond levels', () => {
    const { plan } = open('Cai');
    const entry = reclass(plan, 5, 'Ornius Rider');
    const withBonds = plan.mountsFor(entry).filter((mount) => mount.bondLevels.length > 2);
    const plain = plan.mountsFor(entry).find((mount) => mount.bondLevels.length === 0);
    const current = () => plan.plan().find((candidate) => candidate.id === entry.id)!;

    plan.setMount(entry.id, String(withBonds[0].id));
    plan.setBondLevel(entry.id, '3');
    plan.setMount(entry.id, String(withBonds[1].id));
    expect(plan.bondLevelOf(current())).toBe(3);

    if (plain) {
      plan.setMount(entry.id, String(plain.id));
      expect(plan.bondLevelOf(current())).toBeNull();
      plan.setMount(entry.id, String(withBonds[0].id));
      expect(plan.bondLevelOf(current())).toBe(3);
    }
  });

  it('switches mount or bond level at later levels within a class, and drops changes a reclass moves past', () => {
    const { dialog, plan, fixture, host } = open('Cai');
    const entry = reclass(plan, 20, 'Charioteer');
    const position = plan.plan().indexOf(entry);
    const mount = plan.mountsFor(entry).find((option) => option.bondLevels.length > 1) ?? plan.mountsFor(entry)[0];
    plan.setMount(entry.id, String(mount.id));
    fixture.detectChanges();

    plan.addMountChange(position);
    fixture.detectChanges();
    const change = plan.mountChangesOf(plan.plan()[position])[0];
    expect(change.fromLevel).toBe(21);
    expect(change.mountId).toBe(mount.id);
    expect(host.querySelector('input[aria-label="Mount change level"]')).not.toBeNull();

    const topBond = mount.bondLevels.at(-1)?.level ?? null;
    if (topBond !== null) {
      plan.setChangeBondLevel(entry.id, change.id, String(topBond));
    }

    const steps = plan.steps();
    expect(steps.map((step) => [step.unitClass.name, step.fromLevel])).toEqual([
      ['Noble/Commoner', 4],
      ['Charioteer', 20],
      ['Charioteer', 21],
    ]);
    expect(steps[2].bondLevel).toBe(topBond);

    dialog.submit();
    expect(dialog.endMount()).toEqual({ name: mount.name, bondLevel: topBond });

    // A reclass moved before the change's level takes it out of the Charioteer's range.
    plan.addClass();
    const next = plan.plan().at(-1)!;
    plan.setClass(next.id, String(byName('Gladiator').id));
    plan.setReclassLevel(next.id, 21);
    expect(plan.mountChangesOf(plan.plan()[position])).toEqual([]);
  });

  it('offers a mount and bond level for mounted classes', () => {
    const { plan, fixture, host } = open('Cai');
    const entry = reclass(plan, 20, 'Charioteer');
    fixture.detectChanges();

    expect(plan.mountsFor(entry).length).toBeGreaterThan(0);
    expect(plan.mountOf(entry)).toBe(plan.mountsFor(entry)[0]);
    expect(host.querySelector('select[aria-label="Mount"]')).not.toBeNull();
  });

  it('projects a Charioteer through its class levels with doubled mount growth, plus the mount bonus at the end', () => {
    const { dialog, plan, unit } = open('Cai');
    const noble = byName('Noble/Commoner');
    const charioteer = byName('Charioteer');
    const entry = reclass(plan, 20, 'Charioteer');
    const mount = plan.mountsFor(entry).find((option) => option.bondLevels.length > 1) ?? plan.mountsFor(entry)[0];
    plan.setMount(entry.id, String(mount.id));
    const bond = mount.bondLevels.at(-1)?.level ?? null;
    if (bond !== null) {
      plan.setBondLevel(entry.id, String(bond));
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
