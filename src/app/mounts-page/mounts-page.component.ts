import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { GrowthListComponent, GrowthListGroup } from '../growth-list/growth-list.component';
import { Mount, MOUNT_TYPE_ORDER, toGrowth } from '../models/growth.models';
import { GrowthDataService } from '../services/growth-data.service';

@Component({
  selector: 'app-mounts-page',
  imports: [GrowthListComponent],
  template: `
    <header class="browse-header">
      <h1>Mounts</h1>
      <p>Growth bonuses from mounts, grouped by the mount type a class requires.</p>
    </header>

    <app-growth-list [groups]="groups()" nameHeader="Mount" />
  `,
  styleUrl: '../styles/browse-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MountsPageComponent {
  private readonly api = inject(GrowthDataService);

  private readonly mounts = toSignal(this.api.getMounts(), {
    initialValue: [] as Mount[],
  });

  readonly groups = computed<GrowthListGroup[]>(() =>
    MOUNT_TYPE_ORDER.map((type) => ({
      key: type,
      rows: this.mounts()
        .filter((mount) => mount.type === type)
        .map((mount) => ({
          id: mount.id,
          name: mount.name,
          growth: toGrowth(mount),
          total: mount.total,
        })),
    })).filter((group) => group.rows.length > 0),
  );
}
