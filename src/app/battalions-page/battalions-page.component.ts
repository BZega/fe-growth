import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { GrowthListComponent, GrowthListGroup } from '../growth-list/growth-list.component';
import { Battalion, BATTALION_RANK_ORDER, BATTALION_TYPE_ORDER, toGrowth } from '../models/growth.models';
import { GrowthDataService } from '../services/growth-data.service';
import { SpoilerService } from '../services/spoiler.service';

@Component({
  selector: 'app-battalions-page',
  imports: [GrowthListComponent],
  template: `
    <header class="browse-header">
      <h1>Battalions</h1>
      <p>
        Flat stat bonuses each battalion gives the unit leading it, and the skill it unlocks,
        grouped by battalion type.
      </p>
    </header>

    <app-growth-list
      [groups]="groups()"
      nameHeader="Battalion"
      tagHeader="Rank"
      valueSuffix=""
      detailHeader="Skill"
    />
  `,
  styleUrl: '../styles/browse-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BattalionsPageComponent {
  private readonly api = inject(GrowthDataService);
  private readonly spoilers = inject(SpoilerService);

  private readonly allBattalions = toSignal(this.api.getBattalions(), {
    initialValue: [] as Battalion[],
  });

  private readonly battalions = computed(() =>
    this.spoilers.hidden()
      ? this.allBattalions().filter((battalion) => !this.spoilers.isNamedAfterSpoiler(battalion.name))
      : this.allBattalions(),
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
