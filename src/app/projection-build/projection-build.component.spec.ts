import { TestBed } from '@angular/core/testing';
import { PlanStep } from '../class-plan/class-plan.component';
import unitClassData from '../data/unit-classes.json';
import { GrowthRates, STAT_KEYS, Unit, UnitClass } from '../models/growth.models';
import { levelUpGrowth, projectStats } from '../models/recruitment.models';
import { ProjectionOptions, ProjectionStart } from '../projection-start-dialog/projection-start-dialog.component';
import { GrowthDataService } from '../services/growth-data.service';
import { RecruitmentDataService } from '../services/recruitment-data.service';
import { SpoilerService } from '../services/spoiler.service';
import { BuildResult, ProjectionBuildComponent } from './projection-build.component';

const classes = unitClassData as UnitClass[];
const byName = (name: string) => classes.find((unitClass) => unitClass.name === name)!;
const options: ProjectionOptions = { level: 30, minimum: false, partOneEndLevel: 1, wideRange: false };
const stepsFrom = (level: number, ...reclasses: [number, string][]): PlanStep[] => [
  { fromLevel: level, unitClass: byName('Noble/Commoner'), mount: null, bondLevel: null },
  ...reclasses.map(([fromLevel, name]) => ({ fromLevel, unitClass: byName(name), mount: null, bondLevel: null })),
];

describe('ProjectionBuildComponent', () => {
  let units: Unit[];

  beforeEach(() => {
    TestBed.inject(SpoilerService).setAllHidden(false);
    TestBed.inject(GrowthDataService).getUnits().subscribe((loaded) => (units = loaded));
  });

  afterEach(() => {
    TestBed.inject(SpoilerService).setAllHidden(true);
    TestBed.flushEffects();
  });

  const chapterStart = (name: string): ProjectionStart => {
    const route = TestBed.inject(RecruitmentDataService).routesWithChapters(name)[0];
    const chapter = route.chapters[0];

    return {
      source: 'chapter',
      unit: units.find((unit) => unit.name === name)!,
      name,
      level: chapter.level,
      className: chapter.className,
      stats: chapter.stats,
      chapters: route.chapters,
      routeKey: route.key,
      chapterNumber: chapter.chapter,
      baseStats: false,
      plan: [],
      steps: stepsFrom(chapter.level),
      options,
    };
  };

  const manualStart = (name: string, level: number, stats: GrowthRates): ProjectionStart => ({
    source: 'manual',
    unit: units.find((unit) => unit.name === name)!,
    name,
    level,
    className: null,
    stats,
    chapters: [],
    routeKey: null,
    chapterNumber: null,
    baseStats: false,
    plan: [],
    steps: stepsFrom(level),
    options,
  });

  const open = (start: ProjectionStart, changes: Partial<ProjectionOptions> = {}) => {
    const fixture = TestBed.createComponent(ProjectionBuildComponent);
    let result: BuildResult | null = null;
    fixture.componentRef.setInput('heading', start.name);
    fixture.componentRef.setInput('start', { ...start, options: { ...start.options, ...changes } });
    fixture.componentInstance.resultChange.subscribe((emitted) => (result = emitted));
    fixture.detectChanges();

    return { fixture, build: fixture.componentInstance, host: fixture.nativeElement as HTMLElement, result: () => result };
  };

  it("averages what the existing projection does from a chapter, plus the class's bonus", () => {
    const start = chapterStart('Cai');
    const { build, result } = open(start);
    const noble = byName(start.className!);
    const average = projectStats(start.stats, start.level, 30, (level) => levelUpGrowth(start.unit, noble, level, null, null));

    for (const row of build.rows()) {
      expect(row.summary.mean).toBeCloseTo(average[row.stat] + noble.bonusStats[row.stat], 10);
    }
    expect(result()!.level).toBe(30);
    expect(result()!.label).toBe('Cai');
  });

  it('projects manual stats as shown in game, removing the starting class bonus first', () => {
    const start = chapterStart('Cai');
    const shown = Object.fromEntries(STAT_KEYS.map((stat) => [stat, start.stats[stat]])) as GrowthRates;
    const fromChapter = open(start).build.rows().map((row) => row.summary.mean);
    const fromManual = open(manualStart('Cai', start.level, shown)).build.rows().map((row) => row.summary.mean);

    // Noble/Commoner has no class bonus, so the same numbers project the same way.
    fromManual.forEach((mean, index) => expect(mean).toBeCloseTo(fromChapter[index], 10));
  });

  it('raises the averages when the guaranteed minimum is on', () => {
    const start = chapterStart('Cai');
    const total = (build: ProjectionBuildComponent) => build.rows().reduce((sum, row) => sum + row.summary.mean, 0);

    expect(total(open(start, { minimum: true, partOneEndLevel: 20 }).build)).toBeGreaterThan(total(open(start).build));
  });

  it('rates an actual stat against the outcomes', () => {
    const { build, fixture, host } = open(chapterStart('Cai'));
    const str = () => build.rows().find((row) => row.stat === 'str')!;
    const field = host.querySelector<HTMLInputElement>('input[aria-label="Actual Str at Lv 30"]')!;

    field.value = String(str().summary.high);
    field.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(str().tone).toBe('high');
    expect(str().verdict).toMatch(/^Well above average\W+better than \d+% of outcomes$/);

    field.value = String(str().summary.low - 1);
    field.dispatchEvent(new Event('change'));
    expect(str().tone).toBe('impossible');
  });

  it('always shows the histogram, for the stat picked', () => {
    const { build, fixture, host } = open(chapterStart('Cai'));

    expect(host.querySelector('app-stat-histogram')).not.toBeNull();
    build.histogramStat.set('mag');
    fixture.detectChanges();
    expect(host.querySelector('figure')!.getAttribute('aria-label')).toBe('Mag distribution');
  });

  it('leaves the rarest outcomes off the histogram, but widens it to show any actual value', () => {
    const { build, fixture, host } = open(chapterStart('Cai'));
    const str = () => build.rows().find((row) => row.stat === 'str')!;
    const values = () => Array.from(host.querySelectorAll('.histogram__bar')).map((bar) => Number(bar.getAttribute('title')!.match(/Str (\d+)/)![1]));

    fixture.detectChanges();
    expect(values()[0]).toBeGreaterThan(str().summary.low);
    expect(values().at(-1)).toBeLessThan(str().summary.high);

    build.actualStats.update((stats) => ({ ...stats, str: 99 }));
    fixture.detectChanges();
    expect(values().at(-1)).toBe(99);
    expect(host.querySelector('.histogram__bar--actual')!.getAttribute('title')).toContain('Str 99');
  });

  it("raises stats below a new class's floors when reclassing into it", () => {
    const start = chapterStart('Cai');
    const eternal = byName('The Eternal');
    const { build } = open({ ...start, steps: stepsFrom(start.level, [20, eternal.name]) }, { level: 21 });

    const str = build.rows().find((row) => row.stat === 'str')!;
    expect(eternal.classFloorStats.str).toBeGreaterThan(0);
    expect(str.summary.low).toBeGreaterThanOrEqual(eternal.classFloorStats.str + eternal.bonusStats.str);
    expect(build.planSummary()).toBe('Noble/Commoner → The Eternal');
  });
});
