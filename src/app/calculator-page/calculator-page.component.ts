import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, signal, viewChildren } from '@angular/core';
import { ComparisonDialogComponent } from '../comparison-dialog/comparison-dialog.component';
import { GrowthCalculatorComponent } from '../growth-calculator/growth-calculator.component';
import { GrowthBuild } from '../models/growth.models';
import { CalculatorStateService } from '../services/calculator-state.service';

interface Comparison {
  a: GrowthBuild;
  b: GrowthBuild;
  labelA: string;
  labelB: string;
  editorA: GrowthCalculatorComponent;
  editorB: GrowthCalculatorComponent;
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const host = this.host.nativeElement;
      const panels = host.querySelector('.panels');

      if (!panels) {
        return;
      }

      // Track one calculator's height for the mobile overscroll spacer below the last calculator.
      const observer = new ResizeObserver(() => {
        const first = panels.querySelector<HTMLElement>('.panel');
        host.style.setProperty('--calculator-height', `${first?.offsetHeight ?? 0}px`);
      });
      observer.observe(panels);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  readonly slots = this.state.slots;

  readonly selectionMode = signal(false);
  readonly picked = signal<string[]>([]);
  private readonly comparisonOpen = signal(false);

  readonly canCompare = computed(() => this.slots().length >= 2);
  readonly remainingPicks = computed(() => 2 - this.picked().length);

  // "Unit (Class)" once both are picked, numbering repeats of the same unit; otherwise "Calculator N".
  readonly headings = computed(() => {
    const panels = this.panels();
    const picks = this.slots().map((_, i) => {
      const unit = panels[i]?.unit();
      const unitClass = panels[i]?.unitClass();

      return unit && unitClass ? { unitId: unit.id, unit: unit.name, unitClass: unitClass.name } : null;
    });
    const totals = new Map<number, number>();

    for (const pick of picks) {
      if (pick) {
        totals.set(pick.unitId, (totals.get(pick.unitId) ?? 0) + 1);
      }
    }

    const seen = new Map<number, number>();

    return picks.map((pick, i) => {
      if (!pick) {
        return `Calculator ${i + 1}`;
      }

      if (totals.get(pick.unitId)! < 2) {
        return `${pick.unit} (${pick.unitClass})`;
      }

      const n = (seen.get(pick.unitId) ?? 0) + 1;
      seen.set(pick.unitId, n);

      return `${pick.unit} ${n} (${pick.unitClass})`;
    });
  });

  readonly comparison = computed<Comparison | null>(() => {
    if (!this.comparisonOpen()) {
      return null;
    }

    const [keyA, keyB] = this.picked();

    if (keyA === undefined || keyB === undefined) {
      return null;
    }

    const editorA = this.calculatorOf(keyA);
    const editorB = this.calculatorOf(keyB);

    if (!editorA || !editorB) {
      return null;
    }

    return {
      a: editorA.build(),
      b: editorB.build(),
      labelA: this.labelOf(keyA),
      labelB: this.labelOf(keyB),
      editorA,
      editorB,
    };
  });

  labelOf(slotKey: string): string {
    return this.headings()[this.slots().indexOf(slotKey)] ?? 'Calculator';
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
    const slots = this.slots();

    if (slots.length === 2) {
      this.picked.set([...slots]);
      this.selectionMode.set(false);
      this.comparisonOpen.set(true);
      return;
    }

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

  private calculatorOf(slotKey: string): GrowthCalculatorComponent | null {
    const index = this.slots().indexOf(slotKey);

    return index < 0 ? null : (this.panels()[index] ?? null);
  }
}
