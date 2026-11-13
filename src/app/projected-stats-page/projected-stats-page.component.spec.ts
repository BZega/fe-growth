import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Unit } from '../models/growth.models';
import { ProjectionBuildComponent } from '../projection-build/projection-build.component';
import { ProjectionComparisonDialogComponent } from '../projection-comparison-dialog/projection-comparison-dialog.component';
import { ProjectionStart, ProjectionStartDialogComponent } from '../projection-start-dialog/projection-start-dialog.component';
import { GrowthDataService } from '../services/growth-data.service';
import { SpoilerService } from '../services/spoiler.service';
import { ProjectedStatsPageComponent } from './projected-stats-page.component';

describe('ProjectedStatsPageComponent', () => {
  let units: Unit[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ProjectedStatsPageComponent], providers: [provideRouter([])] });
    TestBed.inject(SpoilerService).setAllHidden(false);
    TestBed.inject(GrowthDataService).getUnits().subscribe((loaded) => (units = loaded));
  });

  afterEach(() => {
    TestBed.inject(SpoilerService).setAllHidden(true);
    TestBed.flushEffects();
  });

  const render = () => {
    const fixture = TestBed.createComponent(ProjectedStatsPageComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      Array.from(host.querySelectorAll<HTMLButtonElement>('.page-header button')).find((candidate) => candidate.textContent!.trim() === label);
    const startDialog = () =>
      fixture.debugElement.query(By.directive(ProjectionStartDialogComponent))?.componentInstance as ProjectionStartDialogComponent | undefined;
    const builds = () => fixture.debugElement.queryAll(By.directive(ProjectionBuildComponent));
    const settle = () => {
      fixture.detectChanges();
      TestBed.flushEffects();
      fixture.detectChanges();
    };

    return { fixture, page: fixture.componentInstance, host, button, startDialog, builds, settle };
  };

  const addManual = (ctx: ReturnType<typeof render>, name: string) => {
    ctx.button('+ Build')!.click();
    ctx.fixture.detectChanges();
    const dialog = ctx.startDialog()!;
    dialog.pickManualUnit(units.find((unit) => unit.name === name)!.id);
    ctx.fixture.detectChanges();
    dialog.confirm();
    ctx.settle();
  };

  it('shows a greyed-out empty build until one is added with + Build, which opens the modal in Manual', () => {
    const ctx = render();

    expect(ctx.builds().length).toBe(1);
    expect(ctx.host.querySelector('.build--placeholder')).not.toBeNull();
    expect(ctx.host.querySelector('.placeholder-histogram')).not.toBeNull();
    expect(ctx.host.querySelector('.build__edit')).toBeNull();

    ctx.button('+ Build')!.click();
    ctx.fixture.detectChanges();
    expect(ctx.startDialog()!.source()).toBe('manual');
    ctx.startDialog()!.close();
    ctx.fixture.detectChanges();
    expect(ctx.startDialog()).toBeUndefined();

    addManual(ctx, 'Cai');
    expect(ctx.builds().length).toBe(1);
    expect(ctx.host.querySelector('.build--placeholder')).toBeNull();
    expect(ctx.startDialog()).toBeUndefined();
  });

  it('keeps each build’s level and options its own, set in the modal with its class plan', () => {
    const ctx = render();
    ctx.button('+ Build')!.click();
    ctx.fixture.detectChanges();
    const dialog = ctx.startDialog()!;
    dialog.pickManualUnit(units.find((unit) => unit.name === 'Cai')!.id);
    ctx.fixture.detectChanges();

    expect(ctx.host.querySelector('app-projection-start-dialog app-class-plan')).not.toBeNull();
    expect(ctx.host.querySelector('app-projection-start-dialog input[aria-label="Projection level"]')).not.toBeNull();
    dialog.setOption('level', 20);
    dialog.setOption('minimum', true);
    dialog.confirm();
    ctx.settle();
    addManual(ctx, 'Peter');

    const [first, second] = ctx.builds().map((debug) => debug.componentInstance as ProjectionBuildComponent);
    expect(first.level()).toBe(20);
    expect(first.options().minimum).toBeTrue();
    expect(second.level()).toBe(99);
    expect(second.options().minimum).toBeFalse();
  });

  it('changes a build’s level from its card, by typing or with the slider', () => {
    const ctx = render();
    addManual(ctx, 'Cai');
    const card = () => ctx.builds()[0].componentInstance as ProjectionBuildComponent;
    const field = (label: string) => ctx.host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;

    expect(card().level()).toBe(99);

    field('Projected level').value = '30';
    field('Projected level').dispatchEvent(new Event('change'));
    ctx.settle();
    expect(card().level()).toBe(30);
    expect(ctx.page.builds()[0].start.options.level).toBe(30);

    field('Projected level slider').value = '45';
    field('Projected level slider').dispatchEvent(new Event('input'));
    ctx.settle();
    expect(card().level()).toBe(45);

    // Below the starting level isn't possible.
    field('Projected level').value = '0';
    field('Projected level').dispatchEvent(new Event('change'));
    ctx.settle();
    expect(card().level()).toBe(1);
  });

  it('edits a build’s start in the modal, keeping the build', () => {
    const ctx = render();
    addManual(ctx, 'Cai');

    ctx.host.querySelector<HTMLButtonElement>('.build__edit')!.click();
    ctx.fixture.detectChanges();
    const dialog = ctx.startDialog()!;
    expect(dialog.source()).toBe('manual');
    expect(dialog.manualUnitId()).toBe(units.find((unit) => unit.name === 'Cai')!.id);

    dialog.pickManualUnit(units.find((unit) => unit.name === 'Peter')!.id);
    ctx.fixture.detectChanges();
    dialog.confirm();
    ctx.settle();

    expect(ctx.builds().length).toBe(1);
    expect((ctx.page.builds()[0].start as ProjectionStart).name).toBe('Peter');
  });

  it('compares two builds in a modal, picking them first when there are more', () => {
    const ctx = render();
    addManual(ctx, 'Cai');
    expect(ctx.button('Compare Builds')).toBeUndefined();

    addManual(ctx, 'Peter');
    addManual(ctx, 'Tialla');
    ctx.button('Compare Builds')!.click();
    ctx.fixture.detectChanges();
    expect(ctx.page.selectionMode()).toBeTrue();

    const pickers = () => Array.from(ctx.host.querySelectorAll<HTMLButtonElement>('.panel__picker'));
    expect(pickers().length).toBe(3);
    pickers()[0].click();
    pickers()[2].click();
    ctx.fixture.detectChanges();

    const comparison = ctx.fixture.debugElement.query(By.directive(ProjectionComparisonDialogComponent))
      .componentInstance as ProjectionComparisonDialogComponent;
    expect(comparison.buildA().label).toBe('Cai');
    expect(comparison.buildB().label).toBe('Tialla');
    expect(comparison.rows().length).toBe(9);
    expect(comparison.rows().every((row) => Math.abs(row.win + row.tie + row.lose - 1) < 1e-9)).toBeTrue();
  });
});
