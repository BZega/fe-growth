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
  anchor: HTMLElement;
  scroller: HTMLElement;
  restoreTop: number;
  release: () => void;
}

const PIN_FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=button]), select';
const PIN_GAP = 8;

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

  // On touch screens, editing a field snaps its row to just under the sticky header and locks the page.
  // That spot is always above the iOS keyboard, so Safari has no reason to scroll the page itself.
  // A finger lift pins before Safari focuses the field, so its focus scroll sees the final layout.
  @HostListener('pointerup', ['$event'])
  onPointerUp(event: PointerEvent): void {
    if (event.pointerType === 'mouse' || !(event.target instanceof Element)) {
      return;
    }

    const field =
      event.target.closest('select') ??
      event.target.closest('app-searchable-select .field')?.querySelector('input');

    if (field instanceof HTMLElement) {
      this.pinTo(field);
    }
  }

  @HostListener('focusin', ['$event'])
  onFocusIn(event: FocusEvent): void {
    if (event.target instanceof HTMLElement && event.target.matches(PIN_FIELD)) {
      this.pinTo(event.target);
    }
  }

  @HostListener('focusout', ['$event'])
  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;

    if (this.pin && !(next instanceof Node && this.pin.calculator.contains(next))) {
      this.unpin();
    }
  }

  private pinTo(field: HTMLElement): void {
    const calculator = field.closest<HTMLElement>('app-growth-calculator');
    const header = this.host.nativeElement.querySelector<HTMLElement>('.page-header');
    const scroller = this.host.nativeElement.closest<HTMLElement>('main');
    const anchor = field.closest<HTMLElement>('.picker') ?? field;

    if (
      !matchMedia('(pointer: coarse)').matches ||
      !calculator ||
      !header ||
      !scroller ||
      (field as HTMLInputElement).disabled ||
      this.pin?.anchor === anchor
    ) {
      return;
    }

    const restoreTop = this.pin?.restoreTop ?? scroller.scrollTop;
    this.release();
    scroller.style.removeProperty('--pin-room');

    const offset = anchor.getBoundingClientRect().top - header.getBoundingClientRect().bottom - PIN_GAP;
    const target = Math.max(0, Math.round(scroller.scrollTop + offset));
    const room = Math.ceil(target - (scroller.scrollHeight - scroller.clientHeight));

    if (room > 0) {
      scroller.style.setProperty('--pin-room', `${room}px`);
    }

    scroller.scrollTop = target;
    scroller.setAttribute('data-scroll-pinned', '');

    // Undo any scroll Safari still attempts on focus, both inside the page and of the window itself.
    const hold = () => {
      if (Math.abs(scroller.scrollTop - target) > 1) {
        scroller.scrollTop = target;
      }

      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };
    scroller.addEventListener('scroll', hold);
    window.addEventListener('scroll', hold);

    // Focus can vanish without a focusout (e.g. a tapped option is removed), so also check on DOM changes.
    const observer = new MutationObserver(() => {
      if (!calculator.contains(document.activeElement)) {
        this.unpin();
      }
    });
    observer.observe(calculator, { childList: true, subtree: true });

    // A tap that never turns into focus must not leave the page locked.
    const timer = window.setTimeout(() => {
      if (!calculator.contains(document.activeElement)) {
        this.unpin();
      }
    }, 600);

    this.pin = {
      calculator,
      anchor,
      scroller,
      restoreTop,
      release: () => {
        clearTimeout(timer);
        observer.disconnect();
        scroller.removeEventListener('scroll', hold);
        window.removeEventListener('scroll', hold);
      },
    };
  }

  private release(): void {
    this.pin?.release();
    this.pin = null;
  }

  private unpin(): void {
    if (!this.pin) {
      return;
    }

    const { scroller, restoreTop } = this.pin;
    this.release();
    scroller.removeAttribute('data-scroll-pinned');
    scroller.style.removeProperty('--pin-room');
    scroller.scrollTop = restoreTop;
  }

  private buildOf(slotKey: string): GrowthBuild | null {
    const index = this.slots().indexOf(slotKey);

    return index < 0 ? null : (this.panels()[index]?.build() ?? null);
  }
}
