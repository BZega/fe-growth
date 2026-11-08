import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BONUS_STAT_LABELS, BonusStatKey, STAT_KEYS, StatKey } from '../models/growth.models';

export interface GrowthListRow {
  id: number;
  name: string;
  growth: Partial<Record<BonusStatKey, number>>;
  total: number;
  /** Shown in an extra column after the name when the list has a tagHeader. */
  tag?: GrowthListTag;
  /** Shown in an extra column after Total when the list has a detailHeader. */
  detail?: GrowthListDetail;
}

export interface GrowthListTag {
  label: string;
  /** Sort position; higher sorts first. */
  order: number;
}

export interface GrowthListDetail {
  title: string;
  text: string;
}

export interface GrowthListGroup {
  key: string;
  rows: GrowthListRow[];
}

export type GrowthSortKey = 'name' | 'tag' | BonusStatKey | 'total' | 'detail';
export type GrowthColorScale = 'sign' | 'tier';

type SortDirection = 'asc' | 'desc';

export interface StatBonusChip {
  stat: BonusStatKey;
  text: string;
  positive: boolean;
}

@Component({
  selector: 'app-growth-list',
  imports: [RouterLink],
  templateUrl: './growth-list.component.html',
  styleUrl: './growth-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrowthListComponent {
  readonly groups = input.required<GrowthListGroup[]>();
  readonly nameHeader = input('Name');
  readonly colorScale = input<GrowthColorScale>('sign');
  readonly linkBase = input<string | null>(null);
  readonly valueSuffix = input('%');
  readonly zeroDisplay = input('0');
  readonly tagHeader = input<string | null>(null);
  /** Shown after Total on wider screens; phones leave it out to keep the stats readable. */
  readonly detailHeader = input<string | null>(null);
  /** Stats that never apply to this list's rows (e.g. HP for battalions), left out of the table. */
  readonly statKeys = input<readonly BonusStatKey[]>(STAT_KEYS);
  readonly omitStats = input<readonly BonusStatKey[]>([]);
  /** Lists each row's non-zero bonuses in one Stat Bonus column instead of a column per stat. */
  readonly bonusLayout = input(false);
  /** Stat-list sort, chosen in the page header. */
  readonly bonusSortStat = input<BonusStatKey | null>(null);
  readonly bonusSortDirection = input<SortDirection>('desc');

  readonly statLabels = BONUS_STAT_LABELS;

  readonly visibleStats = computed(() => this.statKeys().filter((stat) => !this.omitStats().includes(stat)));

  readonly sortKey = signal<GrowthSortKey | null>(null);
  readonly sortDirection = signal<SortDirection>('asc');

  readonly sortStat = computed(() => {
    const stat = this.bonusSortStat();
    return this.bonusLayout() && stat !== null && this.visibleStats().includes(stat) ? stat : null;
  });

  // Name, the stats and Total (or the one Stat Bonus column), plus whichever optional columns are shown.
  readonly columnCount = computed(
    () =>
      (this.bonusLayout() ? 2 : this.visibleStats().length + 2) +
      (this.tagHeader() ? 1 : 0) +
      (this.detailHeader() ? 1 : 0),
  );
  readonly rowCount = computed(() =>
    this.groups().reduce((count, group) => count + group.rows.length, 0),
  );

  readonly sortedGroups = computed<GrowthListGroup[]>(() => {
    const stat = this.sortStat();
    const key = stat ?? this.sortKey();

    if (key === null) {
      return this.groups();
    }

    const direction = (stat ? this.bonusSortDirection() : this.sortDirection()) === 'asc' ? 1 : -1;

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

  bonusChips(row: GrowthListRow): StatBonusChip[] {
    return this.visibleStats()
      .map((stat) => ({ stat, value: row.growth[stat] ?? 0 }))
      .filter(({ value }) => value !== 0)
      .map(({ stat, value }) => ({
        stat,
        text: `${value > 0 ? '+' : ''}${value}${this.valueSuffix()} ${this.statLabels[stat]}`,
        positive: value > 0,
      }));
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
  if (key === 'tag') {
    return row.tag?.order ?? -1;
  }

  return key === 'total' ? row.total : row.growth[key as BonusStatKey] ?? 0;
}

function defaultDirection(key: GrowthSortKey): SortDirection {
  return key === 'name' || key === 'detail' ? 'asc' : 'desc';
}

function compareRows(
  a: GrowthListRow,
  b: GrowthListRow,
  key: GrowthSortKey,
): number {
  if (key === 'name') {
    return a.name.localeCompare(b.name);
  }

  if (key === 'detail') {
    return (a.detail?.title ?? '').localeCompare(b.detail?.title ?? '') || a.name.localeCompare(b.name);
  }

  return valueOf(a, key) - valueOf(b, key) || a.name.localeCompare(b.name);
}
