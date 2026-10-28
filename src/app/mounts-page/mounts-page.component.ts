import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { GrowthListComponent, GrowthListGroup } from '../growth-list/growth-list.component';
import { growthTotal, Mount, mountBonusAt, mountGrowthAt, MOUNT_TYPE_ORDER } from '../models/growth.models';
import { GrowthDataService } from '../services/growth-data.service';

type MountView = 'growth' | 'bonus';

@Component({
  selector: 'app-mounts-page',
  imports: [GrowthListComponent],
  template: `
    <header class="browse-header">
      <h1>Mounts</h1>
      <p>
        {{ view() === 'growth' ? 'Growth bonuses' : 'Flat stat bonuses' }} from mounts at the
        selected bond level, grouped by the mount type a class requires. Base mounts have no
        bond and give nothing.
      </p>
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
    />
  `,
  styleUrls: ['../styles/browse-page.scss', './mounts-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MountsPageComponent {
  private readonly api = inject(GrowthDataService);

  private readonly mounts = toSignal(this.api.getMounts(), {
    initialValue: [] as Mount[],
  });

  readonly tabs: readonly { key: MountView; label: string }[] = [
    { key: 'growth', label: 'Growth Rates' },
    { key: 'bonus', label: 'Bonus Stats' },
  ];

  readonly view = signal<MountView>('growth');

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
