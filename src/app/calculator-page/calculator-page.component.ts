import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChildren } from '@angular/core';
import { ComparisonDialogComponent } from '../comparison-dialog/comparison-dialog.component';
import { GrowthCalculatorComponent } from '../growth-calculator/growth-calculator.component';
import { GrowthBuild } from '../models/growth.models';
import { CalculatorStateService } from '../services/calculator-state.service';

interface Comparison {
  a: GrowthBuild;
  b: GrowthBuild;
  labelA: string;
  labelB: string;
}

@Component({
  selector: 'app-calculator-page',
  imports: [GrowthCalculatorComponent, ComparisonDialogComponent],
  templateUrl: './calculator-page.component.html',
  styleUrl: './calculator-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalculatorPageComponent {
  private readonly state = inject(CalculatorStateService);
  private readonly panels = viewChildren(GrowthCalculatorComponent);

  readonly slots = this.state.slots;

  readonly selectionMode = signal(false);
  readonly picked = signal<string[]>([]);
  private readonly comparisonOpen = signal(false);

  readonly canCompare = computed(() => this.slots().length >= 2);
  readonly remainingPicks = computed(() => 2 - this.picked().length);

  readonly comparison = computed<Comparison | null>(() => {
    if (!this.comparisonOpen()) {
      return null;
    }

    const [keyA, keyB] = this.picked();

    if (keyA === undefined || keyB === undefined) {
      return null;
    }

    const a = this.buildOf(keyA);
    const b = this.buildOf(keyB);

    if (!a || !b) {
      return null;
    }

    return { a, b, labelA: this.labelOf(keyA), labelB: this.labelOf(keyB) };
  });

  labelOf(slotKey: string): string {
    return `Calculator ${this.slots().indexOf(slotKey) + 1}`;
  }

  isPicked(slotKey: string): boolean {
    return this.picked().includes(slotKey);
  }

  pickNumber(slotKey: string): number {
    return this.picked().indexOf(slotKey) + 1;
  }

  add(): void {
    this.state.addSlot();
  }

  remove(slotKey: string): void {
    this.state.removeSlot(slotKey);
    this.picked.update((picked) => picked.filter((key) => key !== slotKey));

    if (!this.canCompare()) {
      this.selectionMode.set(false);
      this.comparisonOpen.set(false);
    }
  }

  startCompare(): void {
    this.picked.set([]);
    this.comparisonOpen.set(false);
    this.selectionMode.set(true);
  }

  cancelCompare(): void {
    this.selectionMode.set(false);
    this.picked.set([]);
  }

  togglePick(slotKey: string): void {
    const next = this.isPicked(slotKey)
      ? this.picked().filter((key) => key !== slotKey)
      : [...this.picked(), slotKey];

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

  private buildOf(slotKey: string): GrowthBuild | null {
    const index = this.slots().indexOf(slotKey);

    return index < 0 ? null : (this.panels()[index]?.build() ?? null);
  }
}
