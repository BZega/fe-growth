import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { GrowthRates, STAT_KEYS, STAT_LABELS, StatKey } from '../models/growth.models';

export interface GrowthListRow {
  id: number;
  name: string;
  growth: GrowthRates;
  total: number;
}

export interface GrowthListGroup {
  key: string;
  rows: GrowthListRow[];
}

export type GrowthSortKey = 'name' | StatKey | 'total';
export type GrowthColorScale = 'sign' | 'tier';

type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-growth-list',
  templateUrl: './growth-list.component.html',
  styleUrl: './growth-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrowthListComponent {
  readonly groups = input.required<GrowthListGroup[]>();
  readonly nameHeader = input('Name');
  readonly colorScale = input<GrowthColorScale>('sign');

  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;

  readonly sortKey = signal<GrowthSortKey | null>(null);
  readonly sortDirection = signal<SortDirection>('asc');

  readonly columnCount = computed(() => this.statKeys.length + 2);
  readonly rowCount = computed(() =>
    this.groups().reduce((count, group) => count + group.rows.length, 0),
  );

  readonly sortedGroups = computed<GrowthListGroup[]>(() => {
    const key = this.sortKey();

    if (key === null) {
      return this.groups();
    }

    const direction = this.sortDirection() === 'asc' ? 1 : -1;

    return this.groups().map((group) => ({
      ...group,
      rows: [...group.rows].sort((a, b) => direction * compareRows(a, b, key)),
    }));
  });

  sortBy(key: GrowthSortKey): void {
    const initial = defaultDirection(key);

    if (this.sortKey() !== key) {
      this.sortKey.set(key);
      this.sortDirection.set(initial);
      return;
    }

    if (this.sortDirection() === initial) {
      this.sortDirection.set(initial === 'asc' ? 'desc' : 'asc');
      return;
    }

    this.sortKey.set(null);
  }

  ariaSort(key: GrowthSortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) {
      return 'none';
    }

    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }

  sortIndicator(key: GrowthSortKey): string {
    if (this.sortKey() !== key) {
      return '';
    }

    return this.sortDirection() === 'asc' ? '▲' : '▼';
  }

  cellClass(value: number): string {
    if (this.colorScale() === 'sign') {
      if (value > 0) {
        return 'positive';
      }

      return value < 0 ? 'negative' : '';
    }

    if (value >= 50) {
      return 'tier-best';
    }

    if (value >= 40) {
      return 'tier-good';
    }

    if (value >= 30) {
      return 'tier-fair';
    }

    if (value >= 25) {
      return 'tier-poor';
    }

    return 'tier-worst';
  }
}

function valueOf(row: GrowthListRow, key: GrowthSortKey): number {
  return key === 'total' ? row.total : row.growth[key as StatKey];
}

function defaultDirection(key: GrowthSortKey): SortDirection {
  return key === 'name' ? 'asc' : 'desc';
}

function compareRows(
  a: GrowthListRow,
  b: GrowthListRow,
  key: GrowthSortKey,
): number {
  if (key === 'name') {
    return a.name.localeCompare(b.name);
  }

  return valueOf(a, key) - valueOf(b, key) || a.name.localeCompare(b.name);
}
