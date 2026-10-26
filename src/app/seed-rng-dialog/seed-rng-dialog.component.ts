import { afterNextRender, ChangeDetectionStrategy, Component, computed, effect, ElementRef, HostListener, inject, Injector, input, output, signal, viewChild } from '@angular/core';
import { STAT_KEYS, STAT_LABELS } from '../models/growth.models';
import { RollEstimate } from '../models/seed-roll';

export interface RngRow {
  label: string;
  exam: boolean;
  rolls: RollEstimate[];
}

export interface RngSection {
  id: number;
  title: string;
  rows: RngRow[];
}

@Component({
  selector: 'app-seed-rng-dialog',
  templateUrl: './seed-rng-dialog.component.html',
  styleUrl: './seed-rng-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeedRngDialogComponent {
  private readonly injector = inject(Injector);

  readonly sections = input.required<readonly RngSection[]>();
  readonly activeId = input.required<number>();

  readonly selected = output<number>();
  readonly closed = output<void>();

  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;

  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');

  readonly canScrollBack = signal(false);
  readonly canScrollForward = signal(false);

  readonly active = computed(
    () => this.sections().find((section) => section.id === this.activeId()) ?? null,
  );

  constructor() {
    effect(() => {
      const id = this.activeId();
      this.sections();

      afterNextRender(
        () => {
          const strip = this.strip()?.nativeElement;
          const tab = strip?.querySelector<HTMLElement>(`[data-section="${id}"]`);

          tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

          if (tab && strip?.contains(document.activeElement)) {
            tab.focus();
          }

          this.updateScroll();
        },
        { injector: this.injector },
      );
    });
  }

  scrollTabs(direction: -1 | 1): void {
    const strip = this.strip()?.nativeElement;

    strip?.scrollBy({ left: direction * strip.clientWidth * 0.8, behavior: 'smooth' });
  }

  onWheel(event: WheelEvent): void {
    const strip = this.strip()?.nativeElement;

    if (strip && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      strip.scrollLeft += event.deltaY;
      event.preventDefault();
    }
  }

  updateScroll(): void {
    const strip = this.strip()?.nativeElement;

    this.canScrollBack.set(!!strip && strip.scrollLeft > 1);
    this.canScrollForward.set(
      !!strip && strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1,
    );
  }

  selectNext(step: -1 | 1): void {
    const sections = this.sections();
    const index = sections.findIndex((section) => section.id === this.activeId());
    const next = sections[Math.min(sections.length - 1, Math.max(0, index + step))];

    if (next) {
      this.selected.emit(next.id);
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updateScroll();
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }
}
