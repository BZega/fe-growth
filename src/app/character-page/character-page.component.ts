import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, viewChildren } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';
import { GrowthCalculatorComponent } from '../growth-calculator/growth-calculator.component';
import { diffGrowth, growthTotal, STAT_KEYS, STAT_LABELS, Unit, UnitClass } from '../models/growth.models';
import { CalculatorStateService } from '../services/calculator-state.service';
import { GrowthDataService } from '../services/growth-data.service';

type CharacterTab = 'build' | 'skill' | 'recruitment';

@Component({
  selector: 'app-character-page',
  imports: [GrowthCalculatorComponent, RouterLink],
  templateUrl: './character-page.component.html',
  styleUrl: './character-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CharacterPageComponent {
  private readonly api = inject(GrowthDataService);
  private readonly state = inject(CalculatorStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly panels = viewChildren(GrowthCalculatorComponent);

  readonly tabs: readonly { key: CharacterTab; label: string }[] = [
    { key: 'build', label: 'Build' },
    { key: 'skill', label: 'Skill' },
    { key: 'recruitment', label: 'Recruitment' },
  ];

  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;

  private readonly units = toSignal(this.api.getUnits(), {
    initialValue: [] as Unit[],
  });

  private readonly classes = toSignal(this.api.getClasses(), {
    initialValue: [] as UnitClass[],
  });

  readonly defaultClassId = computed(
    () => this.classes().find((c) => c.name === 'Noble/Commoner')?.id ?? null,
  );

  readonly unitId = toSignal(
    this.route.paramMap.pipe(map((params) => Number(params.get('id')))),
    { initialValue: NaN },
  );

  readonly unit = computed(
    () => this.units().find((u) => u.id === this.unitId()) ?? null,
  );

  readonly activeTab = linkedSignal<number, CharacterTab>({
    source: this.unitId,
    computation: () => 'build',
  });

  readonly slotA = computed(() => `character-${this.unitId()}-1`);
  readonly slotB = computed(() => `character-${this.unitId()}-2`);

  readonly comparing = linkedSignal(() => this.state.has(this.slotB()));

  readonly difference = computed(() => {
    const [a, b] = this.panels();

    if (!this.comparing() || !a || !b) {
      return null;
    }

    const buildA = a.build();
    const buildB = b.build();
    const growth = diffGrowth(buildB.total, buildA.total);

    return {
      growth,
      total: growthTotal(growth),
      labelA: buildA.unitClass?.name ?? 'No class',
      labelB: buildB.unitClass?.name ?? 'No class',
    };
  });

  selectTab(tab: CharacterTab): void {
    this.activeTab.set(tab);
  }

  startCompare(): void {
    this.state.set(this.slotB(), {
      unitId: this.unitId(),
      classId: this.defaultClassId(),
      mountId: null,
      mountLevel: null,
      classLevel: null,
    });
    this.comparing.set(true);
  }

  stopCompare(): void {
    this.state.clear(this.slotB());
    this.comparing.set(false);
  }
}
