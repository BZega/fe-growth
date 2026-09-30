import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { GrowthListComponent, GrowthListGroup,} from '../growth-list/growth-list.component';
import { CLASS_RANK_ORDER, toGrowth, UnitClass } from '../models/growth.models';
import { GrowthDataService } from '../services/growth-data.service';

@Component({
  selector: 'app-classes-page',
  imports: [GrowthListComponent],
  template: `
    <header class="browse-header">
      <h1>Classes</h1>
      <p>Growth modifiers for each class.</p>
    </header>

    <app-growth-list [groups]="groups()" nameHeader="Class" />
  `,
  styleUrl: '../styles/browse-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassesPageComponent {
  private readonly api = inject(GrowthDataService);

  private readonly classes = toSignal(this.api.getClasses(), {
    initialValue: [] as UnitClass[],
  });

  readonly groups = computed<GrowthListGroup[]>(() =>
    CLASS_RANK_ORDER.map((rank) => ({
      key: rank,
      rows: this.classes()
        .filter((unitClass) => unitClass.rank === rank)
        .map((unitClass) => ({
          id: unitClass.id,
          name: unitClass.name,
          growth: toGrowth(unitClass),
          total: unitClass.total,
        })),
    })).filter((group) => group.rows.length > 0),
  );
}
