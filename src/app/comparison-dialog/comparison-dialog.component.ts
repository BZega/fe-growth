import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, HostListener, input, output, signal } from '@angular/core';
import type { GrowthCalculatorComponent } from '../growth-calculator/growth-calculator.component';
import { diffGrowth, GrowthBuild, growthTotal, STAT_KEYS, STAT_LABELS } from '../models/growth.models';
import { SearchableSelectComponent } from '../searchable-select/searchable-select.component';

@Component({
  selector: 'app-comparison-dialog',
  imports: [NgTemplateOutlet, SearchableSelectComponent],
  templateUrl: './comparison-dialog.component.html',
  styleUrl: './comparison-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComparisonDialogComponent {
  readonly buildA = input.required<GrowthBuild>();
  readonly buildB = input.required<GrowthBuild>();
  readonly labelA = input('Build A');
  readonly labelB = input('Build B');
  readonly editorA = input<GrowthCalculatorComponent | null>(null);
  readonly editorB = input<GrowthCalculatorComponent | null>(null);
  readonly editing = signal<'a' | 'b' | null>(null);

  readonly closed = output<void>();

  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;
  readonly totalOf = growthTotal;

  readonly title = computed(() => {
    const a = this.buildA().unit?.name ?? 'No unit';
    const b = this.buildB().unit?.name ?? 'No unit';

    return a === b ? `${a}: build comparison` : `${a} vs ${b}`;
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

  // Escape backs out one step: an open dropdown closes itself first, then the pickers, then the dialog.
  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }

    if (this.editing()) {
      this.editing.set(null);
    } else {
      this.close();
    }
  }

  toggleEditing(side: 'a' | 'b'): void {
    this.editing.update((current) => (current === side ? null : side));
  }

  close(): void {
    this.closed.emit();
  }

  describe(build: GrowthBuild): string {
    const unitClass = build.unitClass
      ? build.classLevel === null
        ? build.unitClass.name
        : `${build.unitClass.name} (Lv ${build.classLevel})`
      : 'No class';

    return [unitClass, this.mountNote(build)].filter(Boolean).join(' • ');
  }

  mountNote(build: GrowthBuild): string | null {
    if (build.mount) {
      return build.mountLevel === null
        ? build.mount.name
        : `${build.mount.name} (Bond Lv ${build.mountLevel})`;
    }

    return build.mountType !== 'None' ? 'No mount picked' : null;
  }
}
