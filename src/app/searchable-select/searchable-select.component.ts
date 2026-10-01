import { afterNextRender, ChangeDetectionStrategy, Component, computed, effect, ElementRef, HostListener, inject, Injector, input, output, signal, viewChild } from '@angular/core';

export interface SelectItem {
  id: number;
  name: string;
}

export interface SelectItemGroup {
  label: string;
  items: readonly SelectItem[];
}

@Component({
  selector: 'app-searchable-select',
  templateUrl: './searchable-select.component.html',
  styleUrl: './searchable-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchableSelectComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  readonly items = input<readonly SelectItem[]>([]);
  readonly groups = input<readonly SelectItemGroup[]>([]);
  readonly value = input<number | null>(null);
  readonly placeholder = input('— Select —');
  readonly label = input('');
  readonly disabled = input(false);
  readonly clearable = input(true);

  readonly valueChange = output<number | null>();

  readonly open = signal(false);
  readonly query = signal('');

  private readonly searchBox =
    viewChild<ElementRef<HTMLInputElement>>('search');

  private readonly allGroups = computed<readonly SelectItemGroup[]>(() => {
    const groups = this.groups();

    return groups.length > 0 ? groups : [{ label: '', items: this.items() }];
  });

  readonly filtered = computed<SelectItemGroup[]>(() => {
    const needle = this.query().trim().toLowerCase();

    return this.allGroups()
      .map((group) => ({
        label: group.label,
        items: needle
          ? group.items.filter((item) =>
              item.name.toLowerCase().includes(needle),
            )
          : group.items,
      }))
      .filter((group) => group.items.length > 0);
  });

  readonly flattened = computed<SelectItem[]>(() =>
    this.filtered().flatMap((group) => [...group.items]),
  );

  private readonly allItems = computed<SelectItem[]>(() =>
    this.allGroups().flatMap((group) => [...group.items]),
  );

  readonly selectedName = computed(() => {
    const id = this.value();

    return id === null
      ? null
      : (this.allItems().find((item) => item.id === id)?.name ?? null);
  });

  readonly activeIndex = signal(0);

  private openBeforePress = false;

  constructor() {
    effect(() => {
      const element = this.searchBox()?.nativeElement;

      if (element && !this.open()) {
        element.value = this.selectedName() ?? '';
      }
    });
  }

  openPanel(): void {
    if (this.disabled() || this.open()) {
      return;
    }

    this.open.set(true);
    this.query.set('');

    const selected = this.flattened().findIndex(
      (item) => item.id === this.value(),
    );
    this.activeIndex.set(Math.max(selected, 0));
    this.scrollActiveIntoView();

    const element = this.searchBox()?.nativeElement;

    if (element) {
      element.value = '';
    }
  }

  onFieldPointerDown(): void {
    this.openBeforePress = this.open();
  }

  onFieldClick(): void {
    if (this.openBeforePress) {
      this.close();

      return;
    }

    this.openPanel();
    this.searchBox()?.nativeElement.focus();
  }

  pick(id: number | null): void {
    this.valueChange.emit(id);
    this.open.set(false);
    this.query.set('');

    if (matchMedia('(pointer: coarse)').matches) {
      this.searchBox()?.nativeElement.blur();
    }
  }

  close(): void {
    this.open.set(false);
    this.query.set('');
    this.searchBox()?.nativeElement.blur();
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
    this.open.set(true);
  }

  onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.step(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.step(-1);
        break;
      case 'Enter': {
        event.preventDefault();

        if (!this.open()) {
          this.openPanel();
          break;
        }

        const option = this.flattened()[this.activeIndex()];

        if (option) {
          this.pick(option.id);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
    }
  }

  private step(delta: number): void {
    if (!this.open()) {
      const items = this.allItems();
      const current = items.findIndex((item) => item.id === this.value());
      const next = items[clamp(current + delta, items.length)];

      if (next && next.id !== this.value()) {
        this.valueChange.emit(next.id);
      }

      return;
    }

    this.activeIndex.update((index) =>
      clamp(index + delta, this.flattened().length),
    );
    this.scrollActiveIntoView();
  }

  private scrollActiveIntoView(): void {
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector('.option--active')
          ?.scrollIntoView({ block: 'nearest' }),
      { injector: this.injector },
    );
  }

  isActive(item: SelectItem): boolean {
    return this.flattened()[this.activeIndex()]?.id === item.id;
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (
      this.open() &&
      !this.host.nativeElement.contains(event.target as Node)
    ) {
      this.close();
    }
  }
}

function clamp(index: number, length: number): number {
  return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}
