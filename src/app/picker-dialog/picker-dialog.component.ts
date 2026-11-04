import { ChangeDetectionStrategy, Component, computed, HostListener, input, OnInit, output, signal } from '@angular/core';

export interface PickerItem {
  id: string;
  name: string;
  description?: string;
  /** Always selected and can't be unticked. */
  fixed?: boolean;
  /** Items sharing a family replace each other instead of being picked together. */
  family?: string;
  /** Why the item can't be picked right now; shown in place of a checkbox action. */
  locked?: string;
}

export interface PickerGroup {
  label: string;
  items: readonly PickerItem[];
}

@Component({
  selector: 'app-picker-dialog',
  templateUrl: './picker-dialog.component.html',
  styleUrls: ['../exam-dialog/exam-dialog.component.scss', './picker-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PickerDialogComponent implements OnInit {
  readonly title = input.required<string>();
  readonly context = input('');
  readonly groups = input<readonly PickerGroup[]>([]);
  readonly selected = input<readonly string[]>([]);
  readonly max = input<number | null>(null);

  readonly confirmed = output<string[]>();
  readonly closed = output<void>();

  readonly picked = signal<string[]>([]);
  readonly query = signal('');

  private readonly items = computed(() => this.groups().flatMap((group) => group.items));

  readonly count = computed(() => this.picked().length);
  readonly full = computed(() => {
    const max = this.max();
    return max !== null && this.count() >= max;
  });

  readonly filtered = computed(() => {
    const needle = this.query().trim().toLowerCase();

    return this.groups()
      .map((group) => ({
        label: group.label,
        items: needle ? group.items.filter((item) => item.name.toLowerCase().includes(needle)) : group.items,
      }))
      .filter((group) => group.items.length > 0);
  });

  ngOnInit(): void {
    const fixed = this.items().filter((item) => item.fixed).map((item) => item.id);
    this.picked.set([...new Set([...fixed, ...this.selected()])]);
  }

  isPicked(item: PickerItem): boolean {
    return this.picked().includes(item.id);
  }

  // A family member can always be swapped in, even when every slot is used.
  isDisabled(item: PickerItem): boolean {
    if (item.fixed || (item.locked && !this.isPicked(item))) {
      return true;
    }

    return !this.isPicked(item) && this.full() && !this.familyMember(item);
  }

  toggle(item: PickerItem): void {
    if (this.isDisabled(item)) {
      return;
    }

    if (this.isPicked(item)) {
      this.picked.update((ids) => ids.filter((id) => id !== item.id));
      return;
    }

    const swapped = this.familyMember(item);

    this.picked.update((ids) =>
      swapped ? ids.map((id) => (id === swapped ? item.id : id)) : [...ids, item.id],
    );
  }

  private familyMember(item: PickerItem): string | null {
    if (!item.family) {
      return null;
    }

    return (
      this.items().find(
        (other) => other.id !== item.id && other.family === item.family && this.isPicked(other),
      )?.id ?? null
    );
  }

  confirm(): void {
    this.confirmed.emit(this.picked());
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }
}
