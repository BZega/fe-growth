import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { GrowthListComponent, GrowthListGroup } from '../growth-list/growth-list.component';
import { HelpDialogComponent } from '../help-dialog/help-dialog.component';
import { toGrowth, Unit } from '../models/growth.models';
import { GrowthDataService } from '../services/growth-data.service';
import { SpoilerService } from '../services/spoiler.service';

@Component({
  selector: 'app-units-page',
  imports: [GrowthListComponent, HelpDialogComponent],
  template: `
    <header class="browse-header">
      <div class="browse-header__title">
        <h1>Characters</h1>
        <app-help-dialog heading="Characters" [paragraphs]="helpText" />
      </div>
    </header>

    <app-growth-list
      [groups]="groups()"
      nameHeader="Character"
      [colorScale]="'tier'"
      linkBase="/characters"
    />
  `,
  styleUrl: '../styles/browse-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnitsPageComponent {
  private readonly api = inject(GrowthDataService);
  private readonly spoilers = inject(SpoilerService);

  readonly helpText = [
    'Personal growth rates for every recruitable character.',
    'You can sort characters by clicking any column header.',
    'Click any character name to open that character’s detail page.',
    'The character detail page has a dedicated Calculator for Growth Rates, Abilities, and Recruitment info.',
    'In the recruitment tab, you can view a character’s recruitment requirements, the chapter info, and can calculate projected stats.',
    'Projected stats are calculated based on the character’s growth rates, class growth rates, and base stats for each chapter.',
    'Some character data is still a WIP so please be patient with the developer.'
  ];

  private readonly allUnits = toSignal(this.api.getUnits(), {
    initialValue: [] as Unit[],
  });

  private readonly units = computed(() => this.spoilers.filter(this.allUnits()));

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
