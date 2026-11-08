import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { GrowthListComponent, GrowthListGroup } from '../growth-list/growth-list.component';
import { HelpDialogComponent } from '../help-dialog/help-dialog.component';
import { LayoutSwitchComponent, ListLayout } from '../layout-switch/layout-switch.component';
import { StatSortComponent, StatSortDirection } from '../stat-sort/stat-sort.component';
import { BonusStatKey, growthTotal, Mount, mountBonusAt, mountGrowthAt, MOUNT_TYPE_ORDER, STAT_KEYS } from '../models/growth.models';
import { GrowthDataService } from '../services/growth-data.service';
import { SpoilerService } from '../services/spoiler.service';

type MountView = 'growth' | 'bonus';

@Component({
  selector: 'app-mounts-page',
  imports: [GrowthListComponent, HelpDialogComponent, LayoutSwitchComponent, StatSortComponent],
  template: `
    <header class="browse-header">
      <div class="browse-header__title">
        <h1>Mounts</h1>
        <app-help-dialog heading="Mounts" [paragraphs]="helpText()" />
      </div>
      @if (view() === 'bonus') {
        <div class="browse-header__controls">
          <app-layout-switch [(layout)]="layout" />
          @if (layout() === 'bonus') {
            <app-stat-sort [stats]="statKeys" [(stat)]="sortStat" [(direction)]="sortDirection" />
          }
        </div>
      }
    </header>

    <div class="view-bar">
      <div class="view-tabs" role="tablist" aria-label="Mount stats">
        @for (tab of tabs; track tab.key) {
          <button
            type="button"
            role="tab"
            class="view-tabs__tab"
            [class.view-tabs__tab--active]="view() === tab.key"
            [attr.aria-selected]="view() === tab.key"
            [attr.tabindex]="view() === tab.key ? 0 : -1"
            (click)="view.set(tab.key)"
            (keydown.arrowLeft)="cycleView()"
            (keydown.arrowRight)="cycleView()"
          >
            {{ tab.label }}
          </button>
        }
      </div>

      <label class="bond-picker">
        <span class="bond-picker__label">Bond Level</span>
        <select
          class="bond-picker__select"
          [value]="bondLevel()"
          (change)="onBondLevelChange($any($event.target).value)"
        >
          @for (level of bondLevels(); track level) {
            <option [value]="level" [selected]="level === bondLevel()">Level {{ level }}</option>
          }
        </select>
      </label>
    </div>

    <app-growth-list
      role="tabpanel"
      [groups]="groups()"
      nameHeader="Mount"
      [valueSuffix]="view() === 'growth' ? '%' : ''"
      [bonusLayout]="view() === 'bonus' && layout() === 'bonus'"
      [bonusSortStat]="sortStat()"
      [bonusSortDirection]="sortDirection()"
    />
  `,
  styleUrls: ['../styles/browse-page.scss', './mounts-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MountsPageComponent {
  private readonly api = inject(GrowthDataService);
  private readonly spoilers = inject(SpoilerService);

  private readonly allMounts = toSignal(this.api.getMounts(), {
    initialValue: [] as Mount[],
  });

  private readonly mounts = computed(() => this.spoilers.filter(this.allMounts()));

  readonly tabs: readonly { key: MountView; label: string }[] = [
    { key: 'growth', label: 'Growth Rates' },
    { key: 'bonus', label: 'Bonus Stats' },
  ];

  readonly view = signal<MountView>('growth');
  readonly layout = signal<ListLayout>('table');
  readonly statKeys = STAT_KEYS;
  readonly sortStat = signal<BonusStatKey | null>(null);
  readonly sortDirection = signal<StatSortDirection>('desc');

  readonly helpText = computed(() => [
    `${this.view() === 'growth' ? 'Growth rates' : 'Flat stat bonuses'} from mounts at the selected bond level, grouped by the mount type a class requires.`,
    'Base mounts have no bond and give no bonuses.',
  ]);

  readonly bondLevels = computed(() =>
    [...new Set(this.mounts().flatMap((mount) => mount.bondLevels.map((bond) => bond.level)))].sort(
      (a, b) => a - b,
    ),
  );

  private readonly selectedBondLevel = signal<number | null>(null);

  readonly bondLevel = computed(() => this.selectedBondLevel() ?? this.bondLevels().at(-1) ?? null);

  readonly groups = computed<GrowthListGroup[]>(() => {
    const showBonus = this.view() === 'bonus';
    const level = this.bondLevel();

    return MOUNT_TYPE_ORDER.map((type) => ({
      key: type,
      rows: this.mounts()
        .filter((mount) => mount.type === type)
        .map((mount) => {
          const values = showBonus ? mountBonusAt(mount, level) : mountGrowthAt(mount, level);

          return {
            id: mount.id,
            name: mount.name,
            growth: values,
            total: growthTotal(values),
          };
        }),
    })).filter((group) => group.rows.length > 0);
  });

  onBondLevelChange(value: string): void {
    this.selectedBondLevel.set(Number(value));
  }

  cycleView(): void {
    this.view.update((view) => (view === 'growth' ? 'bonus' : 'growth'));
  }
}
