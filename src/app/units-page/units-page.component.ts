import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { GrowthListComponent, GrowthListGroup } from '../growth-list/growth-list.component';
import { toGrowth, Unit } from '../models/growth.models';
import { GrowthDataService } from '../services/growth-data.service';

@Component({
  selector: 'app-units-page',
  imports: [GrowthListComponent],
  template: `
    <header class="browse-header">
      <h1>Characters</h1>
      <p>Personal growth rates for every recruitable unit.</p>
    </header>

    <app-growth-list
      [groups]="groups()"
      nameHeader="Character"
      [colorScale]="'tier'"
    />
  `,
  styleUrl: '../styles/browse-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnitsPageComponent {
  private readonly api = inject(GrowthDataService);

  private readonly units = toSignal(this.api.getUnits(), {
    initialValue: [] as Unit[],
  });

  readonly groups = computed<GrowthListGroup[]>(() => [
    {
      key: '',
      rows: this.units().map((unit) => ({
        id: unit.id,
        name: unit.name,
        growth: toGrowth(unit),
        total: unit.total,
      })),
    },
  ]);
}
