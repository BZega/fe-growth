import { ChangeDetectionStrategy, Component, computed, HostListener, input, output } from '@angular/core';
import { STAT_KEYS, STAT_LABELS, StatKey } from '../models/growth.models';
import { compareDistributions, DistributionSummary, summarize } from '../models/stat-distribution';
import { BuildResult } from '../projection-build/projection-build.component';

interface ComparisonRow {
  stat: StatKey;
  label: string;
  a: DistributionSummary;
  b: DistributionSummary;
  difference: number;
  /** Chance the first build ends higher, ties, or ends lower. */
  win: number;
  tie: number;
  lose: number;
}

/** Two projected builds side by side: averages, middle 50% and the chance each ends higher. */
@Component({
  selector: 'app-projection-comparison-dialog',
  templateUrl: './projection-comparison-dialog.component.html',
  styleUrls: ['../exam-dialog/exam-dialog.component.scss', './projection-comparison-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectionComparisonDialogComponent {
  readonly buildA = input.required<BuildResult>();
  readonly buildB = input.required<BuildResult>();

  readonly closed = output<void>();

  readonly rows = computed<ComparisonRow[]>(() => {
    const a = this.buildA();
    const b = this.buildB();

    return STAT_KEYS.map((stat) => {
      const summaryA = summarize(a.totals[stat]);
      const summaryB = summarize(b.totals[stat]);
      const { win, tie } = compareDistributions(a.totals[stat], b.totals[stat]);

      return {
        stat,
        label: STAT_LABELS[stat],
        a: summaryA,
        b: summaryB,
        difference: summaryA.mean - summaryB.mean,
        win,
        tie,
        lose: Math.max(0, 1 - win - tie),
      };
    });
  });

  fixed(value: number): string {
    return value.toFixed(2);
  }

  signed(value: number): string {
    return `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(2)}`;
  }

  percent(chance: number): string {
    return `${Math.round(chance * 100)}%`;
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }
}
