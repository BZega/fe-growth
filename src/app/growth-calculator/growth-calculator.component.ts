import { ChangeDetectionStrategy,  Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { CLASS_LEVEL_CONFIGS, CLASS_RANK_ORDER, ClassRank, GrowthBuild, growthTotal, Mount, MountType, scaleGrowth, STAT_KEYS, STAT_LABELS, sumGrowth, toGrowth, Unit, UnitClass } from '../models/growth.models';
import { SearchableSelectComponent, SelectItemGroup } from '../searchable-select/searchable-select.component';
import { CalculatorStateService } from '../services/calculator-state.service';
import { GrowthDataService } from '../services/growth-data.service';
import { SpoilerService } from '../services/spoiler.service';

@Component({
  selector: 'app-growth-calculator',
  imports: [SearchableSelectComponent],
  templateUrl: './growth-calculator.component.html',
  styleUrl: './growth-calculator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrowthCalculatorComponent implements OnInit {
  private readonly api = inject(GrowthDataService);
  private readonly state = inject(CalculatorStateService);
  private readonly spoilers = inject(SpoilerService);

  readonly heading = input.required<string>();
  readonly slotKey = input.required<string>();
  readonly canRemove = input(false);

  readonly removeRequested = output<void>();

  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;
  readonly totalOf = growthTotal;

  private readonly allUnits = toSignal(this.api.getUnits(), {
    initialValue: [] as Unit[],
  });
  private readonly classes = toSignal(this.api.getClasses(), {
    initialValue: [] as UnitClass[],
  });

  readonly units = computed(() => this.spoilers.filter(this.allUnits()));

  readonly selectedUnitId = signal<number | null>(null);
  readonly selectedClassId = signal<number | null>(null);
  readonly selectedMountId = signal<number | null>(null);
  readonly selectedLevel = signal<number | null>(null);

  readonly classGroups = computed<SelectItemGroup[]>(() =>
    CLASS_RANK_ORDER.map((rank: ClassRank) => ({
      label: rank,
      items: this.classes().filter((unitClass) => unitClass.rank === rank),
    })).filter((group) => group.items.length > 0),
  );

  readonly mountOptions = toSignal(
    toObservable(this.selectedClassId).pipe(
      switchMap((classId) =>
        classId === null ? of<Mount[]>([]) : this.api.getMountsForClass(classId),
      ),
    ),
    { initialValue: [] as Mount[] },
  );

  readonly unit = computed(
    () => this.units().find((u) => u.id === this.selectedUnitId()) ?? null,
  );

  readonly unitClass = computed(
    () => this.classes().find((c) => c.id === this.selectedClassId()) ?? null,
  );

  readonly mount = computed(() => {
    const options = this.mountOptions();

    return (
      options.find((m) => m.id === this.selectedMountId()) ??
      options.at(0) ??
      null
    );
  });

  readonly mountType = computed<MountType>(
    () => this.mountOptions()[0]?.type ?? 'None',
  );

  readonly isMounted = computed(() => this.mountOptions().length > 0);

  readonly levelConfig = computed(() => {
    const name = this.unitClass()?.name;
    return name ? (CLASS_LEVEL_CONFIGS[name] ?? null) : null;
  });

  readonly classLevel = computed(() => {
    const config = this.levelConfig();
    if (!config) {
      return null;
    }

    const level = this.selectedLevel();
    return level !== null && config.levels.includes(level) ? level : config.defaultLevel;
  });

  readonly build = computed<GrowthBuild>(() => {
    const config = this.levelConfig();
    const level = this.classLevel();
    const unitGrowth = toGrowth(this.unit());
    const levelBonus = toGrowth(config && level !== null ? config.bonuses[level] : null);
    const classGrowth = sumGrowth(toGrowth(this.unitClass()), levelBonus);
    const baseMountGrowth = this.isMounted() ? toGrowth(this.mount()) : toGrowth(null);
    const mountGrowth = scaleGrowth(baseMountGrowth, config?.mountMultiplier ?? 1);

    return {
      unit: this.unit(),
      unitClass: this.unitClass(),
      classLevel: level,
      mount: this.isMounted() ? this.mount() : null,
      mountType: this.mountType(),
      unitGrowth,
      classGrowth,
      mountGrowth,
      total: sumGrowth(unitGrowth, classGrowth, mountGrowth),
    };
  });

  onUnitChange(id: number | null): void {
    this.selectedUnitId.set(id);
    this.persist();
  }

  onClassChange(id: number | null): void {
    this.selectedClassId.set(id);
    this.selectedMountId.set(null);
    this.selectedLevel.set(null);
    this.persist();
  }

  onLevelChange(value: string): void {
    this.selectedLevel.set(Number(value));
    this.persist();
  }

  onMountChange(id: number | null): void {
    this.selectedMountId.set(id);
    this.persist();
  }

  reset(): void {
    this.selectedUnitId.set(null);
    this.selectedClassId.set(null);
    this.selectedMountId.set(null);
    this.selectedLevel.set(null);
    this.persist();
  }

  ngOnInit(): void {
    const saved = this.state.get(this.slotKey());
    this.selectedUnitId.set(saved.unitId);
    this.selectedClassId.set(saved.classId);
    this.selectedMountId.set(saved.mountId);
    this.selectedLevel.set(saved.classLevel);
  }

  private persist(): void {
    this.state.set(this.slotKey(), {
      unitId: this.selectedUnitId(),
      classId: this.selectedClassId(),
      mountId: this.selectedMountId(),
      classLevel: this.selectedLevel(),
    });
  }
}
