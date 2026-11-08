import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { GrowthListComponent, GrowthListGroup } from '../growth-list/growth-list.component';
import { HelpDialogComponent } from '../help-dialog/help-dialog.component';
import { LayoutSwitchComponent, ListLayout } from '../layout-switch/layout-switch.component';
import { StatSortComponent, StatSortDirection } from '../stat-sort/stat-sort.component';
import { BONUS_STAT_KEYS, BonusStatKey, CLASS_RANK_ORDER, STAT_KEYS, toGrowth, UnitClass } from '../models/growth.models';
import { GrowthDataService } from '../services/growth-data.service';
import { SpoilerService } from '../services/spoiler.service';

type ClassListView = 'growth' | 'bonus' | 'floors';

@Component({
  selector: 'app-classes-page',
  imports: [GrowthListComponent, HelpDialogComponent, LayoutSwitchComponent, StatSortComponent],
  template: `
    <header class="browse-header">
      <div class="browse-header__title">
        <h1>Classes</h1>
        <app-help-dialog heading="Classes" [paragraphs]="helpText()" />
      </div>
      @if (view() === 'bonus') {
        <div class="browse-header__controls">
          <app-layout-switch [(layout)]="layout" />
          @if (layout() === 'bonus') {
            <app-stat-sort [stats]="visibleStatKeys()" [(stat)]="sortStat" [(direction)]="sortDirection" />
          }
        </div>
      }
    </header>

    <div class="view-bar">
      <div class="view-tabs" role="tablist" aria-label="Class stats">
        @for (tab of tabs; track tab.key) {
          <button
            type="button"
            role="tab"
            class="view-tabs__tab"
            [class.view-tabs__tab--active]="view() === tab.key"
            [attr.aria-selected]="view() === tab.key"
            [attr.tabindex]="view() === tab.key ? 0 : -1"
            (click)="view.set(tab.key)"
            (keydown.arrowLeft)="cycleView(-1)"
            (keydown.arrowRight)="cycleView(1)"
          >
            {{ tab.label }}
          </button>
        }
      </div>
    </div>

    <app-growth-list
      role="tabpanel"
      [groups]="groups()"
      nameHeader="Class"
      linkBase="/classes"
      [statKeys]="visibleStatKeys()"
      [valueSuffix]="view() === 'growth' ? '%' : ''"
      [zeroDisplay]="view() === 'floors' ? '—' : '0'"
      [bonusLayout]="view() === 'bonus' && layout() === 'bonus'"
      [bonusSortStat]="sortStat()"
      [bonusSortDirection]="sortDirection()"
    />
  `,
  styleUrls: ['../styles/browse-page.scss', './classes-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassesPageComponent {
  private readonly api = inject(GrowthDataService);
  private readonly spoilers = inject(SpoilerService);

  readonly tabs: readonly { key: ClassListView; label: string }[] = [
    { key: 'growth', label: 'Growth Rates' },
    { key: 'bonus', label: 'Class Bonuses' },
    { key: 'floors', label: 'Class Floors' },
  ];
  readonly view = signal<ClassListView>('growth');
  readonly layout = signal<ListLayout>('table');
  readonly sortStat = signal<BonusStatKey | null>(null);
  readonly sortDirection = signal<StatSortDirection>('desc');

  readonly visibleStatKeys = computed(() =>
    this.view() === 'bonus' ? BONUS_STAT_KEYS : STAT_KEYS,
  );

  readonly helpText = computed(() => [
    this.view() === 'growth'
      ? 'Growth rates for each class.'
      : this.view() === 'bonus'
        ? 'Flat stat bonuses for each class.'
        : 'Minimum stats guaranteed by each class.',
    'You can sort classes by clicking any column header.',
    'Click any class name to open that class’s detail page.',
    'In the class detail page you can scroll through each class by using the tabs at the bottom or using the left and right arrow keys on your keyboard.',
  ]);

  private readonly allClasses = toSignal(this.api.getClasses(), {
    initialValue: [] as UnitClass[],
  });

  private readonly classes = computed(() => this.spoilers.filter(this.allClasses()));

  readonly groups = computed<GrowthListGroup[]>(() => {
    const view = this.view();
    const statKeys = this.visibleStatKeys();

    return CLASS_RANK_ORDER.map((rank) => ({
      key: rank,
      rows: this.classes()
        .filter((unitClass) => unitClass.rank === rank)
        .map((unitClass) => {
          const values = valuesForView(unitClass, view);

          return {
            id: unitClass.id,
            name: unitClass.name,
            growth: values,
            total: statKeys.reduce((total, stat) => total + (values[stat] ?? 0), 0),
          };
        }),
    })).filter((group) => group.rows.length > 0);
  });

  cycleView(direction: -1 | 1): void {
    const currentIndex = this.tabs.findIndex((tab) => tab.key === this.view());
    const nextIndex = (currentIndex + direction + this.tabs.length) % this.tabs.length;
    this.view.set(this.tabs[nextIndex].key);
  }
}

function valuesForView(
  unitClass: UnitClass,
  view: ClassListView,
): Partial<Record<BonusStatKey, number>> {
  if (view === 'bonus') {
    return unitClass.bonusStats;
  }

  if (view === 'floors') {
    return unitClass.classFloorStats;
  }

  return toGrowth(unitClass);
}
