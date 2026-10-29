import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, HostListener, inject, signal, viewChildren } from '@angular/core';
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

interface Pin {
  calculator: HTMLElement;
  scroller: HTMLElement;
  restoreTop: number;
  observer: MutationObserver;
}

const PIN_FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=button]), select';

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
  private pin: Pin | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.unpin());
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

    const a = this.buildOf(keyA);
    const b = this.buildOf(keyB);

    if (!a || !b) {
      return null;
    }

    return { a, b, labelA: this.labelOf(keyA), labelB: this.labelOf(keyB) };
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

  // On touch screens, editing a calculator snaps it to Calculator 1's unscrolled spot and locks the page,
  // so its dropdowns and the keyboard always lay out exactly as they do for Calculator 1.
  @HostListener('focusin', ['$event'])
  onFocusIn(event: FocusEvent): void {
    const field = event.target;

    if (!(field instanceof HTMLElement) || !field.matches(PIN_FIELD) || !matchMedia('(pointer: coarse)').matches) {
      return;
    }

    const calculator = field.closest<HTMLElement>('app-growth-calculator');
    const first = this.host.nativeElement.querySelector<HTMLElement>('app-growth-calculator');
    const scroller = this.host.nativeElement.closest<HTMLElement>('main');

    if (!calculator || !first || !scroller || this.pin?.calculator === calculator) {
      return;
    }

    this.unpin();

    const restoreTop = scroller.scrollTop;
    const target = calculator.getBoundingClientRect().top - first.getBoundingClientRect().top;
    const room = Math.ceil(target - (scroller.scrollHeight - scroller.clientHeight));

    if (room > 0) {
      scroller.style.setProperty('--pin-room', `${room}px`);
    }

    scroller.scrollTop = target;
    scroller.setAttribute('data-scroll-pinned', '');

    // Focus can vanish without a focusout (e.g. a tapped option is removed), so also check on DOM changes.
    const observer = new MutationObserver(() => {
      if (!calculator.contains(document.activeElement)) {
        this.unpin();
      }
    });
    observer.observe(calculator, { childList: true, subtree: true });
    this.pin = { calculator, scroller, restoreTop, observer };
  }

  @HostListener('focusout', ['$event'])
  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;

    if (this.pin && !(next instanceof Node && this.pin.calculator.contains(next))) {
      this.unpin();
    }
  }

  private unpin(): void {
    if (!this.pin) {
      return;
    }

    const { scroller, restoreTop, observer } = this.pin;
    this.pin = null;
    observer.disconnect();
    scroller.removeAttribute('data-scroll-pinned');
    scroller.style.removeProperty('--pin-room');
    scroller.scrollTop = restoreTop;
  }

  private buildOf(slotKey: string): GrowthBuild | null {
    const index = this.slots().indexOf(slotKey);

    return index < 0 ? null : (this.panels()[index]?.build() ?? null);
  }
}
