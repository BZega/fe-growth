import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { GrowthListComponent, GrowthListGroup } from '../growth-list/growth-list.component';
import { HelpDialogComponent } from '../help-dialog/help-dialog.component';
import { LayoutSwitchComponent, ListLayout } from '../layout-switch/layout-switch.component';
import { Battalion, BATTALION_RANK_ORDER, BATTALION_TYPE_ORDER, BonusStatKey, STAT_KEYS, toGrowth } from '../models/growth.models';
import { GrowthDataService } from '../services/growth-data.service';
import { SpoilerService } from '../services/spoiler.service';
import { StatSortComponent, StatSortDirection } from '../stat-sort/stat-sort.component';

@Component({
  selector: 'app-battalions-page',
  imports: [GrowthListComponent, HelpDialogComponent, LayoutSwitchComponent, StatSortComponent],
  template: `
    <header class="browse-header">
      <div class="browse-header__title">
        <h1>Battalions</h1>
        <app-help-dialog heading="Battalions" [paragraphs]="helpText" />
      </div>
      <div class="browse-header__controls">
        <app-layout-switch [(layout)]="layout" />
        @if (layout() === 'bonus') {
          <app-stat-sort [stats]="statKeys" [(stat)]="sortStat" [(direction)]="sortDirection" />
        }
      </div>
    </header>

    <app-growth-list
      [groups]="groups()"
      nameHeader="Battalion"
      tagHeader="Rank"
      valueSuffix=""
      detailHeader="Skill"
      [omitStats]="['hp']"
      [bonusLayout]="layout() === 'bonus'"
      [bonusSortStat]="sortStat()"
      [bonusSortDirection]="sortDirection()"
    />
  `,
  styleUrl: '../styles/browse-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BattalionsPageComponent {
  private readonly api = inject(GrowthDataService);
  private readonly spoilers = inject(SpoilerService);

  readonly layout = signal<ListLayout>('table');
  // Battalions never give HP.
  readonly statKeys = STAT_KEYS.filter((stat) => stat !== 'hp');
  readonly sortStat = signal<BonusStatKey | null>(null);
  readonly sortDirection = signal<StatSortDirection>('desc');

  readonly helpText = [
    'Each battalion gives flat stat bonuses to its leader and unlocks a skill.',
    'Battalions are grouped by type; rank and skill details are shown in the table.',
  ];

  private readonly allBattalions = toSignal(this.api.getBattalions(), {
    initialValue: [] as Battalion[],
  });

  private readonly battalions = computed(() =>
    this.allBattalions(),
  );

  readonly groups = computed<GrowthListGroup[]>(() =>
    BATTALION_TYPE_ORDER.map((type) => ({
      key: type,
      rows: this.battalions()
        .filter((battalion) => battalion.type === type)
        .map((battalion) => ({
          id: battalion.id,
          name: battalion.name,
          tag: { label: battalion.rank, order: BATTALION_RANK_ORDER.indexOf(battalion.rank) },
          growth: toGrowth(battalion),
          total: battalion.total,
          detail: { title: battalion.skillName, text: battalion.skillDescription },
        })),
    })).filter((group) => group.rows.length > 0),
  );
}
