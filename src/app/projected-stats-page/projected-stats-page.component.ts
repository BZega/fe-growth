import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { HelpDialogComponent } from '../help-dialog/help-dialog.component';
import { BuildResult, ProjectionBuildComponent } from '../projection-build/projection-build.component';
import { ProjectionComparisonDialogComponent } from '../projection-comparison-dialog/projection-comparison-dialog.component';
import { ProjectionStart, ProjectionStartDialogComponent } from '../projection-start-dialog/projection-start-dialog.component';

interface Build {
  id: number;
  start: ProjectionStart;
}

interface StartDialogState {
  /** The build being edited; null adds a new one. */
  editId: number | null;
}

@Component({
  selector: 'app-projected-stats-page',
  imports: [HelpDialogComponent, ProjectionBuildComponent, ProjectionComparisonDialogComponent, ProjectionStartDialogComponent],
  templateUrl: './projected-stats-page.component.html',
  styleUrl: './projected-stats-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectedStatsPageComponent {
  readonly helpText = [
    'Use + Build to add a character: choose Manual (their Lv 1 base stats, or stats you enter at any level) or Recruitment (the stats they join with). In the same window, plan their classes (each reclass has its own level, and classes unlock by rank) and set the level and options for that build. Edit reopens it.',
    'Each stat shows its average, its spread (standard deviation) and the middle 50% of outcomes at the build’s level, with a histogram of every outcome. Enter the stats you actually got to see how lucky they were.',
    'The chances are calculated exactly from the growth rates, level by level, not simulated. Reclassing into a class for the first time raises stats below its class floors.',
    'With Guaranteed minimum on, a level up that raises too few stats (fewer than 2 in Part I, 1 after) gets extra ones. Which stats the game picks isn’t known, so they’re assumed to be spread evenly over the stats that could have risen; turn it off to see plain independent rolls.',
    'Rolls are fixed per save (see the Seed Mapper), but until you know them each is treated as an even 0–99 roll.',
    'Compare Builds (with two or more builds) shows two of them side by side, with the chance each ends higher.',
  ];

  private nextId = 1;
  readonly builds = signal<Build[]>([]);
  private readonly results = signal<ReadonlyMap<number, BuildResult | null>>(new Map());

  // The character's name, numbered when the same character has several builds.
  readonly headings = computed(() => {
    const builds = this.builds();
    const totals = new Map<string, number>();
    const seen = new Map<string, number>();

    builds.forEach((build) => totals.set(build.start.name, (totals.get(build.start.name) ?? 0) + 1));

    return builds.map((build) => {
      const name = build.start.name;

      if (totals.get(name)! < 2) {
        return name;
      }

      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);

      return `${name} ${n}`;
    });
  });

  // --- start modal -------------------------------------------------------------------

  readonly startDialog = signal<StartDialogState | null>(null);

  readonly editing = computed(() => {
    const dialog = this.startDialog();

    return dialog?.editId == null ? null : (this.builds().find((build) => build.id === dialog.editId)?.start ?? null);
  });

  openStart(): void {
    this.startDialog.set({ editId: null });
  }

  editStart(id: number): void {
    this.startDialog.set({ editId: id });
  }

  onStartConfirmed(start: ProjectionStart): void {
    const editId = this.startDialog()?.editId ?? null;

    if (editId === null) {
      this.builds.update((builds) => [...builds, { id: this.nextId++, start }]);
    } else {
      this.builds.update((builds) => builds.map((build) => (build.id === editId ? { ...build, start } : build)));
    }

    this.startDialog.set(null);
  }

  setBuildLevel(id: number, level: number): void {
    this.builds.update((builds) =>
      builds.map((build) =>
        build.id === id ? { ...build, start: { ...build.start, options: { ...build.start.options, level } } } : build,
      ),
    );
  }

  removeBuild(id: number): void {
    this.builds.update((builds) => builds.filter((build) => build.id !== id));
    this.results.update((results) => {
      const next = new Map(results);
      next.delete(id);
      return next;
    });
    this.picked.update((picked) => picked.filter((pick) => pick !== id));

    if (!this.canCompare()) {
      this.cancelCompare();
      this.comparisonOpen.set(false);
    }
  }

  onResult(id: number, result: BuildResult | null): void {
    this.results.update((results) => new Map(results).set(id, result));
  }

  // --- comparison (picked like the calculator's Compare Builds) ----------------------

  readonly selectionMode = signal(false);
  readonly picked = signal<number[]>([]);
  private readonly comparisonOpen = signal(false);

  private readonly comparable = computed(() => this.builds().filter((build) => this.results().get(build.id)));

  readonly canCompare = computed(() => this.comparable().length >= 2);
  readonly remainingPicks = computed(() => 2 - this.picked().length);

  readonly comparison = computed(() => {
    const [a, b] = this.picked();
    const resultA = a === undefined ? null : this.labelled(a);
    const resultB = b === undefined ? null : this.labelled(b);

    return this.comparisonOpen() && resultA && resultB ? { a: resultA, b: resultB } : null;
  });

  private labelled(id: number): BuildResult | null {
    const result = this.results().get(id);
    const index = this.builds().findIndex((build) => build.id === id);

    return result ? { ...result, label: this.headings()[index] ?? result.label } : null;
  }

  isPickable(id: number): boolean {
    return Boolean(this.results().get(id));
  }

  isPicked(id: number): boolean {
    return this.picked().includes(id);
  }

  pickNumber(id: number): number {
    return this.picked().indexOf(id) + 1;
  }

  startCompare(): void {
    const comparable = this.comparable();

    if (comparable.length === 2) {
      this.picked.set(comparable.map((build) => build.id));
      this.comparisonOpen.set(true);
      return;
    }

    this.picked.set([]);
    this.selectionMode.set(true);
  }

  cancelCompare(): void {
    this.selectionMode.set(false);
    this.picked.set([]);
  }

  togglePick(id: number): void {
    const next = this.isPicked(id) ? this.picked().filter((pick) => pick !== id) : [...this.picked(), id];

    this.picked.set(next);

    if (next.length === 2) {
      this.selectionMode.set(false);
      this.comparisonOpen.set(true);
    }
  }

  closeComparison(): void {
    this.comparisonOpen.set(false);
    this.picked.set([]);
  }
}
