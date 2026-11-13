import { ChangeDetectionStrategy, Component, computed, HostListener, inject, input, linkedSignal, OnInit, output, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ClassPlanComponent, MAX_PROJECTION_LEVEL, PlanEntry, PlanStep } from '../class-plan/class-plan.component';
import { baseStatsOf, BOOSTED_GROWTH_VARIANTS, characterKey, GrowthRates, STAT_KEYS, STAT_LABELS, StatKey, Unit } from '../models/growth.models';
import { RecruitmentChapter } from '../models/recruitment.models';
import { SearchableSelectComponent } from '../searchable-select/searchable-select.component';
import { GrowthDataService } from '../services/growth-data.service';
import { RecruitmentDataService } from '../services/recruitment-data.service';
import { SpoilerService } from '../services/spoiler.service';

export type StartSource = 'chapter' | 'manual';
export interface ProjectionStart {
  source: StartSource;
  unit: Unit;
  name: string;
  level: number;
  className: string | null;
  stats: GrowthRates;
  chapters: readonly RecruitmentChapter[];
  routeKey: string | null;
  chapterNumber: number | null;
  baseStats: boolean;
  plan: readonly PlanEntry[];
  steps: readonly PlanStep[];
  options: ProjectionOptions;
}

export interface ProjectionOptions {
  level: number;
  minimum: boolean;
  partOneEndLevel: number;
  wideRange: boolean;
}

export const DEFAULT_PROJECTION_OPTIONS: ProjectionOptions = {
  level: MAX_PROJECTION_LEVEL,
  minimum: false,
  partOneEndLevel: 1,
  wideRange: false,
};

type StatInputs = Record<StatKey, number | null>;

const emptyStats = (): StatInputs => Object.fromEntries(STAT_KEYS.map((stat) => [stat, null])) as StatInputs;

@Component({
  selector: 'app-projection-start-dialog',
  imports: [ClassPlanComponent, SearchableSelectComponent],
  templateUrl: './projection-start-dialog.component.html',
  styleUrls: ['../exam-dialog/exam-dialog.component.scss', './projection-start-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectionStartDialogComponent implements OnInit {
  private readonly api = inject(GrowthDataService);
  private readonly recruitment = inject(RecruitmentDataService);
  private readonly spoilers = inject(SpoilerService);

  readonly heading = input('Projected Stats');
  readonly eyebrow = input('');
  readonly confirmLabel = input('Next');
  readonly initialSource = input<StartSource>('manual');
  readonly initial = input<ProjectionStart | null>(null);
  readonly showOptions = input(false);

  readonly confirmed = output<ProjectionStart>();
  readonly closed = output<void>();

  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;
  readonly maxLevel = MAX_PROJECTION_LEVEL;

  private readonly allUnits = toSignal(this.api.getUnits(), { initialValue: [] as Unit[] });
  private readonly boostedNames = new Set(Object.values(BOOSTED_GROWTH_VARIANTS));

  readonly source = signal<StartSource>('manual');

  readonly characters = computed(() =>
    this.spoilers
      .filter(this.allUnits())
      .filter((unit) => !this.boostedNames.has(unit.name) && this.recruitment.routesWithChapters(unit.name).length > 0),
  );

  readonly unitId = signal<number | null>(null);

  readonly unit = computed(() => this.characters().find((unit) => unit.id === this.unitId()) ?? null);

  readonly routes = computed(() => {
    const unit = this.unit();

    return unit ? this.recruitment.routesWithChapters(unit.name) : [];
  });

  readonly routeKey = linkedSignal<readonly { key: string }[], string | null>({
    source: this.routes,
    computation: (routes, previous) => routes.find((route) => route.key === previous?.value)?.key ?? routes[0]?.key ?? null,
  });

  readonly route = computed(() => this.routes().find((route) => route.key === this.routeKey()) ?? null);

  readonly chapterNumber = linkedSignal(() => this.route()?.chapters[0]?.chapter ?? null);

  readonly chapter = computed(() => this.route()?.chapters.find((chapter) => chapter.chapter === this.chapterNumber()) ?? null);

  /** The unit whose growths drive the projection (Mu*'s for Mu), as on the character page. */
  readonly growthUnit = computed(() => {
    const unit = this.unit();
    const boosted = unit ? BOOSTED_GROWTH_VARIANTS[characterKey(unit.name)] : undefined;

    return (boosted && this.allUnits().find((candidate) => candidate.name === boosted)) || unit;
  });

  // --- manual entry ----------------------------------------------------------------

  readonly manualUnits = computed(() => this.spoilers.filter(this.allUnits()));
  readonly manualUnitId = signal<number | null>(null);
  readonly manualLevel = signal(1);
  readonly manualStats = signal<StatInputs>(emptyStats());
  /** Once a level is typed in, the stats are the player's own rather than the Lv 1 base stat chart. */
  readonly manualLevelEdited = signal(false);

  private readonly manualUnit = computed(() => this.manualUnits().find((unit) => unit.id === this.manualUnitId()) ?? null);

  // --- options -------------------------------------------------------------------

  readonly options = signal<ProjectionOptions>(DEFAULT_PROJECTION_OPTIONS);

  setOption<K extends keyof ProjectionOptions>(key: K, value: ProjectionOptions[K]): void {
    this.options.update((options) => ({ ...options, [key]: value }));
  }

  setLevelOption(field: HTMLInputElement, key: 'level' | 'partOneEndLevel'): void {
    const level = Math.round(Number(field.value));

    if (field.value.trim() !== '' && Number.isFinite(level)) {
      this.setOption(key, Math.min(MAX_PROJECTION_LEVEL, Math.max(1, level)));
    }

    field.value = String(this.options()[key]);
  }

  readonly hasBaseStats = computed(() => {
    const unit = this.manualUnit();

    return unit !== null && baseStatsOf(unit.name) !== null;
  });

  ngOnInit(): void {
    const initial = this.initial();

    this.source.set(initial?.source ?? this.initialSource());

    if (initial) {
      this.options.set({ ...initial.options });
    }

    if (initial?.source === 'chapter') {
      this.unitId.set(this.characters().find((unit) => unit.name === initial.name)?.id ?? null);
      this.routeKey.set(initial.routeKey);
      // Settle the chapter list for the route first, or it would reset the chapter to its first.
      this.chapterNumber();
      this.chapterNumber.set(initial.chapterNumber);
    } else if (initial) {
      this.manualUnitId.set(initial.unit.id);
      this.manualLevel.set(initial.level);
      this.manualStats.set({ ...initial.stats });
      this.manualLevelEdited.set(!initial.baseStats);
    }
  }

  setSource(source: StartSource): void {
    // The character carries over when switching to manual entry.
    if (source === 'manual' && this.manualUnitId() === null && this.growthUnit()) {
      this.pickManualUnit(this.growthUnit()!.id);
    }

    this.source.set(source);
  }

  pickManualUnit(id: number | null): void {
    this.manualUnitId.set(id);

    if (!this.manualLevelEdited()) {
      this.useBaseStats();
    }
  }

  useBaseStats(): void {
    const unit = this.manualUnit();
    const base = unit ? baseStatsOf(unit.name) : null;

    if (base) {
      this.manualLevel.set(1);
      this.manualStats.set({ ...base });
      this.manualLevelEdited.set(false);
    }
  }

  setManualLevel(event: Event): void {
    const field = event.target as HTMLInputElement;
    const level = Math.round(Number(field.value));

    if (field.value.trim() !== '' && Number.isFinite(level)) {
      this.manualLevel.set(Math.min(MAX_PROJECTION_LEVEL - 1, Math.max(1, level)));
      this.manualLevelEdited.set(true);
    }

    field.value = String(this.manualLevel());
  }

  setStat(stat: StatKey, event: Event): void {
    const field = event.target as HTMLInputElement;
    const value = Math.round(Number(field.value));
    const next = field.value.trim() === '' || !Number.isFinite(value) || value < 0 ? null : value;

    this.manualStats.update((stats) => ({ ...stats, [stat]: next }));
    field.value = next === null ? '' : String(next);
  }

  readonly start = computed<ProjectionStart | null>(() => {
    const plan = this.planEditor();
    const steps = plan?.steps() ?? [];

    if (!plan || steps.length === 0) {
      return null;
    }

    if (this.source() === 'chapter') {
      const unit = this.growthUnit();
      const picked = this.unit();
      const chapter = this.chapter();

      return unit && picked && chapter
        ? {
            source: 'chapter',
            unit,
            name: picked.name,
            level: chapter.level,
            className: chapter.className,
            stats: chapter.stats,
            chapters: this.route()!.chapters,
            routeKey: this.routeKey(),
            chapterNumber: chapter.chapter,
            baseStats: false,
            plan: plan.plan(),
            steps,
            options: this.options(),
          }
        : null;
    }

    const unit = this.manualUnit();
    const stats = this.manualStats();

    if (!unit || this.statKeys.some((stat) => stats[stat] === null)) {
      return null;
    }

    return {
      source: 'manual',
      unit,
      name: unit.name,
      level: this.manualLevel(),
      className: null,
      stats: stats as GrowthRates,
      chapters: [],
      routeKey: null,
      chapterNumber: null,
      baseStats: !this.manualLevelEdited(),
      plan: plan.plan(),
      steps,
      options: this.options(),
    };
  });

  /** Where the class plan starts, once a character (and chapter) is picked. */
  readonly planStart = computed<{ unit: Unit; level: number; className: string | null } | null>(() => {
    if (this.source() === 'chapter') {
      const unit = this.growthUnit();
      const chapter = this.chapter();

      return unit && chapter ? { unit, level: chapter.level, className: chapter.className } : null;
    }

    const unit = this.manualUnit();

    return unit ? { unit, level: this.manualLevel(), className: null } : null;
  });

  private readonly planEditor = viewChild(ClassPlanComponent);

  confirm(): void {
    const start = this.start();

    if (start) {
      this.confirmed.emit(start);
    }
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }
}
