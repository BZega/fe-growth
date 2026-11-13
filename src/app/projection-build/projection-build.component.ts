import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { MAX_PROJECTION_LEVEL } from '../class-plan/class-plan.component';
import { GrowthRates, mountBonusAt, STAT_KEYS, STAT_LABELS, StatKey, sumGrowth, toGrowth } from '../models/growth.models';
import { levelUpGrowth, routeLabel, stepAtLevel } from '../models/recruitment.models';
import { DistributionSummary, projectDistributions, quantile, rankOf, Ranking, shift, StatDistribution, summarize } from '../models/stat-distribution';
import { DEFAULT_PROJECTION_OPTIONS, ProjectionStart } from '../projection-start-dialog/projection-start-dialog.component';
import { StatHistogramComponent } from '../stat-histogram/stat-histogram.component';

export interface BuildResult {
  label: string;
  level: number;
  totals: Record<StatKey, StatDistribution>;
}

type StatInputs = Record<StatKey, number | null>;

export interface StatRow {
  stat: StatKey;
  label: string;
  distribution: StatDistribution;
  summary: DistributionSummary;
  actual: number | null;
  rank: Ranking | null;
  verdict: string | null;
  tone: 'low' | 'typical' | 'high' | 'impossible' | null;
  /** Positions across the row's range bar, in percent. */
  bar: { wideFrom: number; wideTo: number; from: number; to: number; mean: number; actual: number | null };
}

const emptyStats = (): StatInputs => Object.fromEntries(STAT_KEYS.map((stat) => [stat, null])) as StatInputs;

/** One character's projected stat distributions from its start and class plan, against its actual stats. */
@Component({
  selector: 'app-projection-build',
  imports: [StatHistogramComponent],
  templateUrl: './projection-build.component.html',
  styleUrl: './projection-build.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectionBuildComponent {
  readonly heading = input.required<string>();
  /** Null shows an empty, greyed-out card until a build is added. */
  readonly start = input<ProjectionStart | null>(null);

  readonly options = computed(() => this.start()?.options ?? DEFAULT_PROJECTION_OPTIONS);

  readonly editRequested = output<void>();
  readonly removeRequested = output<void>();
  readonly resultChange = output<BuildResult | null>();
  /** The level picked on the card, to save into the build's options. */
  readonly levelChange = output<number>();

  readonly maxLevel = MAX_PROJECTION_LEVEL;

  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;
  readonly placeholderBars = Array.from({ length: 17 }, (_, index) => Math.round(100 * Math.exp(-(((index - 8) / 3.2) ** 2) / 2)));

  readonly actualStats = signal<StatInputs>(emptyStats());
  readonly histogramStat = signal<StatKey>('str');

  readonly startSummary = computed(() => {
    const start = this.start();

    if (!start) {
      return;
    }

    if (start.source === 'manual') {
      return start.baseStats ? 'Manual · Lv 1 base stats' : `Manual · Lv ${start.level} stats`;
    }

    return `Recruitment · ${routeLabel(start.routeKey ?? '')} · Chapter ${start.chapterNumber} · Lv ${start.level} ${start.className ?? ''}`.trim();
  });

  private readonly steps = computed(() => this.start()?.steps ?? []);

  /** The class the build starts in and the one it's in at the projected level; one name when they match. */
  readonly planSummary = computed(() => {
    const steps = this.steps();
    const first = steps[0]?.unitClass;
    const last = stepAtLevel(steps, this.level())?.unitClass;

    if (!first || !last) {
      return '';
    }

    return first.id === last.id ? first.name : `${first.name} → ${last.name}`;
  });

  readonly level = computed(() =>
    Math.min(MAX_PROJECTION_LEVEL, Math.max(this.start()?.level ?? 1, this.options().level)),
  );

  private bonusesAt(level: number): GrowthRates {
    const step = stepAtLevel(this.steps(), level);

    return sumGrowth(
      toGrowth(step?.unitClass.bonusStats ?? null),
      toGrowth(mountBonusAt(step?.mount ?? null, step?.bondLevel ?? null)),
    );
  }

  private readonly baseStats = computed<GrowthRates | null>(() => {
    const start = this.start();

    if (!start || this.steps().length === 0) {
      return null;
    }

    if (start.source === 'chapter') {
      return start.stats;
    }

    const bonuses = this.bonusesAt(start.level);

    return Object.fromEntries(this.statKeys.map((stat) => [stat, start.stats[stat] - bonuses[stat]])) as GrowthRates;
  });

  // Reclassing into a class for the first time raises stats below its floors (as passing its exam does).
  private readonly reclassFloors = computed(() => {
    const floors = new Map<number, GrowthRates>();
    const seen = new Set<number>();

    this.steps().forEach((step, index) => {
      if (index > 0 && !seen.has(step.unitClass.id)) {
        floors.set(step.fromLevel, toGrowth(step.unitClass.classFloorStats));
      }

      seen.add(step.unitClass.id);
    });

    return floors;
  });

  /** Each stat's chance of each value at the chosen level, as shown in game (with class and mount bonuses). */
  readonly totals = computed<Record<StatKey, StatDistribution> | null>(() => {
    const start = this.start();
    const base = this.baseStats();

    if (!start || !base) {
      return null;
    }

    const steps = this.steps();
    const options = this.options();
    const level = this.level();
    const reclassFloors = this.reclassFloors();
    const distributions = projectDistributions(base, start.level, level, {
      growthAt: (at) => {
        const step = stepAtLevel(steps, at);

        return step ? levelUpGrowth(start.unit, step.unitClass, at, step.mount, step.bondLevel) : null;
      },
      floorsAt: (at) => reclassFloors.get(at) ?? null,
      minimumAt: (at) => (options.minimum ? (at < options.partOneEndLevel ? 2 : 1) : 0),
    });
    const bonuses = this.bonusesAt(level);

    return Object.fromEntries(
      this.statKeys.map((stat) => [stat, shift(distributions[stat], bonuses[stat])]),
    ) as Record<StatKey, StatDistribution>;
  });

  readonly rows = computed<StatRow[]>(() => {
    const totals = this.totals();

    if (!totals) {
      return [];
    }

    return this.statKeys.map((stat) => {
      const distribution = totals[stat];
      const summary = summarize(distribution);
      const actual = this.actualStats()[stat];
      const rank = actual === null ? null : rankOf(distribution, actual);
      const low = Math.min(quantile(distribution, 0.005), actual ?? Infinity);
      const high = Math.max(quantile(distribution, 0.995), actual ?? -Infinity);
      const at = (value: number) => (high === low ? 50 : ((value - low) / (high - low)) * 100);

      return {
        stat,
        label: this.statLabels[stat],
        distribution,
        summary,
        actual,
        rank,
        ...assess(rank),
        bar: {
          wideFrom: at(summary.p10),
          wideTo: at(summary.p90),
          from: at(summary.p25),
          to: at(summary.p75),
          mean: at(summary.mean),
          actual: actual === null ? null : at(actual),
        },
      };
    });
  });

  readonly histogramRow = computed(() => this.rows().find((row) => row.stat === this.histogramStat()) ?? null);

  readonly result = computed<BuildResult | null>(() => {
    const totals = this.totals();

    return totals ? { label: this.heading(), level: this.level(), totals } : null;
  });

  constructor() {
    effect(() => this.resultChange.emit(this.result()));
  }

  setActual(stat: StatKey, event: Event): void {
    const field = event.target as HTMLInputElement;
    const value = Math.round(Number(field.value));
    const next = field.value.trim() === '' || !Number.isFinite(value) || value < 0 ? null : value;

    this.actualStats.update((stats) => ({ ...stats, [stat]: next }));
    field.value = next === null ? '' : String(next);
  }

  setLevel(field: HTMLInputElement): void {
    const level = Math.round(Number(field.value));

    if (field.value.trim() !== '' && Number.isFinite(level)) {
      this.levelChange.emit(Math.min(MAX_PROJECTION_LEVEL, Math.max(this.start()?.level ?? 1, level)));
    }
  }

  selectValue(event: FocusEvent): void {
    const field = event.target as HTMLInputElement;

    setTimeout(() => {
      if (document.activeElement === field) {
        field.select();
      }
    });
  }

  clearActual(): void {
    this.actualStats.set(emptyStats());
  }

  hasActual(): boolean {
    return this.statKeys.some((stat) => this.actualStats()[stat] !== null);
  }

  fixed(value: number, digits = 2): string {
    return value.toFixed(digits);
  }

  percent(chance: number): string {
    return `${Math.round(chance * 100)}%`;
  }
}

function assess(rank: Ranking | null): Pick<StatRow, 'verdict' | 'tone'> {
  if (!rank) {
    return { verdict: null, tone: null };
  }

  if (rank.equal === 0 && (rank.below === 0 || rank.below >= 1 - 1e-9)) {
    return { verdict: 'Not possible with this plan: check the start, classes or level', tone: 'impossible' };
  }

  const better = `better than ${Math.round(rank.below * 100)}% of outcomes`;
  const { percentile } = rank;

  if (percentile < 10) {
    return { verdict: `Well below average: ${better}`, tone: 'low' };
  }

  if (percentile < 25) {
    return { verdict: `Below average: ${better}`, tone: 'low' };
  }

  if (percentile <= 75) {
    return { verdict: `Typical: ${better}`, tone: 'typical' };
  }

  if (percentile <= 90) {
    return { verdict: `Above average: ${better}`, tone: 'high' };
  }

  return { verdict: `Well above average: ${better}`, tone: 'high' };
}
