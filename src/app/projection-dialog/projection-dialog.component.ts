import { ChangeDetectionStrategy, Component, computed, HostListener, input, OnInit, output, signal, viewChild } from '@angular/core';
import { ClassPlanComponent, MAX_PROJECTION_LEVEL, PlanStep } from '../class-plan/class-plan.component';
import { mountBonusAt, STAT_KEYS, STAT_LABELS, Unit } from '../models/growth.models';
import { levelUpGrowth, projectStats, RecruitmentChapter, stepAtLevel } from '../models/recruitment.models';

@Component({
  selector: 'app-projection-dialog',
  imports: [ClassPlanComponent],
  templateUrl: './projection-dialog.component.html',
  styleUrls: ['../exam-dialog/exam-dialog.component.scss', './projection-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectionDialogComponent implements OnInit {
  readonly unit = input.required<Unit>();
  readonly chapters = input.required<readonly RecruitmentChapter[]>();
  readonly initialChapter = input<number | null>(null);
  /** False when the start isn't a recruitment chapter (e.g. the Seed Mapper's current stats). */
  readonly chapterPicker = input(true);
  /** A plan made elsewhere (the start modal): the dialog opens on its results, and Back asks to return. */
  readonly plannedSteps = input<readonly PlanStep[] | null>(null);

  readonly closed = output<void>();
  readonly back = output<void>();

  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;
  readonly maxLevel = MAX_PROJECTION_LEVEL;

  /** Kept alive on the results page, so Back returns to the same plan. */
  readonly planEditor = viewChild(ClassPlanComponent);

  private readonly steps = computed(() => this.plannedSteps() ?? this.planEditor()?.steps() ?? []);

  readonly page = signal<'plan' | 'results'>('plan');
  readonly chapterNumber = signal<number | null>(null);
  readonly endLevel = signal(MAX_PROJECTION_LEVEL);

  readonly chapter = computed<RecruitmentChapter | null>(
    () => this.chapters().find((candidate) => candidate.chapter === this.chapterNumber()) ?? this.chapters().at(0) ?? null,
  );

  readonly startLevel = computed(() => this.chapter()?.level ?? 1);

  ngOnInit(): void {
    this.chapterNumber.set(this.initialChapter() ?? this.chapters()[0]?.chapter ?? null);

    if (this.plannedSteps()) {
      this.page.set('results');
    }
  }

  goBack(): void {
    if (this.plannedSteps()) {
      this.back.emit();
    } else {
      this.page.set('plan');
    }
  }

  private readonly endStep = computed(() => stepAtLevel(this.steps(), this.endLevel()));

  readonly endClass = computed(() => this.endStep()?.unitClass ?? null);

  readonly endMount = computed(() => {
    const step = this.endStep();

    return step?.mount ? { name: step.mount.name, bondLevel: step.bondLevel } : null;
  });

  readonly projection = computed(() => {
    const chapter = this.chapter();

    if (!chapter) {
      return [];
    }

    const unit = this.unit();
    const steps = this.steps();
    const end = Math.max(this.startLevel(), this.endLevel());
    const projected = projectStats(chapter.stats, chapter.level, end, (level) => {
      const step = stepAtLevel(steps, level);

      return step ? levelUpGrowth(unit, step.unitClass, level, step.mount, step.bondLevel) : null;
    });
    const step = this.endStep();
    const classBonus = step?.unitClass.bonusStats;
    const mountBonus = mountBonusAt(step?.mount ?? null, step?.bondLevel ?? null);

    return this.statKeys.map((stat) => ({
      stat,
      label: this.statLabels[stat],
      base: projected[stat],
      bonus: classBonus?.[stat] ?? 0,
      mountBonus: mountBonus[stat],
      total: projected[stat] + (classBonus?.[stat] ?? 0) + mountBonus[stat],
    }));
  });

  submit(): void {
    this.endLevel.set(this.maxLevel);
    this.page.set('results');
  }

  setEndLevel(value: string): void {
    const level = Math.round(Number(value));

    if (Number.isFinite(level)) {
      this.endLevel.set(Math.min(this.maxLevel, Math.max(this.startLevel(), level)));
    }
  }

  fixed(value: number): string {
    return value.toFixed(2);
  }

  // Deferred: mobile browsers place the caret after focus, which would undo an immediate select.
  selectValue(event: FocusEvent): void {
    const field = event.target as HTMLInputElement;

    setTimeout(() => {
      if (document.activeElement === field) {
        field.select();
      }
    });
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }
}
