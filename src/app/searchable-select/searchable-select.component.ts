import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, HostListener, inject, input, output, signal, viewChild } from '@angular/core';

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

  readonly selectedName = computed(() => {
    const id = this.value();

    return id === null
      ? null
      : (this.allGroups()
          .flatMap((group) => [...group.items])
          .find((item) => item.id === id)?.name ?? null);
  });

  readonly activeIndex = signal(0);

  constructor() {
    effect(() => {
      if (this.open()) {
        this.searchBox()?.nativeElement.focus();
      }
    });
  }

  toggle(): void {
    if (this.disabled()) {
      return;
    }

    this.open.update((open) => !open);
    this.query.set('');
    this.activeIndex.set(0);
  }

  pick(id: number | null): void {
    this.valueChange.emit(id);
    this.close();
  }

  close(): void {
    this.open.set(false);
    this.query.set('');
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
  }

  onKeydown(event: KeyboardEvent): void {
    const options = this.flattened();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.activeIndex.update((i) => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter': {
        event.preventDefault();
        const option = options[this.activeIndex()];

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
