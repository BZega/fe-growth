import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { chanceOf, DistributionSummary, quantile, StatDistribution } from '../models/stat-distribution';

interface Bar {
  value: number;
  chance: number;
  height: number;
  middle: boolean;
  actual: boolean;
  label: boolean;
}

// Tails thinner than this are left off, so the bars stay readable.
const TAIL = 0.001;
const MAX_LABELS = 12;

/** Bars for the chance of each value of one stat, marking the average, middle 50% and actual value. */
@Component({
  selector: 'app-stat-histogram',
  templateUrl: './stat-histogram.component.html',
  styleUrl: './stat-histogram.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatHistogramComponent {
  readonly distribution = input.required<StatDistribution>();
  readonly summary = input.required<DistributionSummary>();
  readonly statLabel = input.required<string>();
  readonly actual = input<number | null>(null);

  // The rarest outcomes are left off, but an actual value always shows, however far out (even impossible).
  private readonly span = computed(() => {
    const distribution = this.distribution();
    const actual = this.actual();
    let from = quantile(distribution, TAIL);
    let to = quantile(distribution, 1 - TAIL);

    if (actual !== null) {
      from = Math.min(from, actual);
      to = Math.max(to, actual);
    }

    return { from, to };
  });

  readonly bars = computed<Bar[]>(() => {
    const distribution = this.distribution();
    const { p25, p75 } = this.summary();
    const { from, to } = this.span();
    const count = to - from + 1;
    const every = Math.max(1, Math.ceil(count / MAX_LABELS));
    const values = Array.from({ length: count }, (_, index) => from + index);
    const tallest = Math.max(...values.map((value) => chanceOf(distribution, value)));

    return values.map((value, index) => {
      const chance = chanceOf(distribution, value);

      return {
        value,
        chance,
        height: tallest > 0 ? (chance / tallest) * 100 : 0,
        middle: value >= p25 && value <= p75,
        actual: value === this.actual(),
        label: index % every === 0 || value === this.actual(),
      };
    });
  });

  readonly tallest = computed(() => Math.max(...this.bars().map((bar) => bar.chance)));

  readonly shownTotal = computed(() => this.bars().reduce((sum, bar) => sum + bar.chance, 0));

  /** Where the average falls across the bars, as a percentage of the width. */
  readonly meanAt = computed(() => {
    const { from, to } = this.span();

    return ((this.summary().mean - from + 0.5) / (to - from + 1)) * 100;
  });

  readonly actualOutside = computed(() => {
    const actual = this.actual();

    return actual !== null && chanceOf(this.distribution(), actual) === 0;
  });

  percent(chance: number): string {
    return `${(chance * 100).toFixed(chance >= 0.1 ? 1 : 2)}%`;
  }
}
