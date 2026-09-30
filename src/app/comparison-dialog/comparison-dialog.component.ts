import { ChangeDetectionStrategy, Component, computed, HostListener, input, output } from '@angular/core';
import { diffGrowth, GrowthBuild, growthTotal, STAT_KEYS, STAT_LABELS } from '../models/growth.models';

@Component({
  selector: 'app-comparison-dialog',
  templateUrl: './comparison-dialog.component.html',
  styleUrl: './comparison-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComparisonDialogComponent {
  readonly buildA = input.required<GrowthBuild>();
  readonly buildB = input.required<GrowthBuild>();
  readonly labelA = input('Build A');
  readonly labelB = input('Build B');

  readonly closed = output<void>();

  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;
  readonly totalOf = growthTotal;

  readonly title = computed(() => {
    const a = this.buildA().unit?.name ?? 'No unit';
    const b = this.buildB().unit?.name ?? 'No unit';

    return a === b ? `${a} — build comparison` : `${a} vs ${b}`;
  });

  readonly delta = computed(() =>
    diffGrowth(this.buildB().total, this.buildA().total),
  );

  readonly totalDelta = computed(
    () => growthTotal(this.buildB().total) - growthTotal(this.buildA().total),
  );

  readonly winsA = computed(
    () => this.statKeys.filter((stat) => this.delta()[stat] < 0).length,
  );

  readonly winsB = computed(
    () => this.statKeys.filter((stat) => this.delta()[stat] > 0).length,
  );

  readonly ties = computed(
    () => this.statKeys.filter((stat) => this.delta()[stat] === 0).length,
  );

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }

  describe(build: GrowthBuild): string {
    const parts = [build.unitClass?.name ?? 'No class'];

    if (build.mount) {
      parts.push(build.mount.name);
    } else if (build.mountType !== 'None') {
      parts.push('no mount picked');
    } else {
      parts.push('unmounted');
    }

    return parts.join(' • ');
  }
}
