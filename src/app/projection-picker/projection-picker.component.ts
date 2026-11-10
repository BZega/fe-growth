import { ChangeDetectionStrategy, Component, computed, HostListener, inject, linkedSignal, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BOOSTED_GROWTH_VARIANTS, characterKey, Unit } from '../models/growth.models';
import { ProjectionDialogComponent } from '../projection-dialog/projection-dialog.component';
import { SearchableSelectComponent } from '../searchable-select/searchable-select.component';
import { GrowthDataService } from '../services/growth-data.service';
import { RecruitmentDataService } from '../services/recruitment-data.service';
import { SpoilerService } from '../services/spoiler.service';

/** Picks a character, route and chapter, then opens the stat projection for them. */
@Component({
  selector: 'app-projection-picker',
  imports: [ProjectionDialogComponent, SearchableSelectComponent],
  templateUrl: './projection-picker.component.html',
  styleUrls: ['../exam-dialog/exam-dialog.component.scss', './projection-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectionPickerComponent {
  private readonly api = inject(GrowthDataService);
  private readonly recruitment = inject(RecruitmentDataService);
  private readonly spoilers = inject(SpoilerService);

  readonly closed = output<void>();

  private readonly allUnits = toSignal(this.api.getUnits(), { initialValue: [] as Unit[] });

  private readonly boostedNames = new Set(Object.values(BOOSTED_GROWTH_VARIANTS));

  // Boosted variants (Mu*) are projected from their base character's entry instead.
  readonly characters = computed(() =>
    this.spoilers
      .filter(this.allUnits())
      .filter((unit) => !this.boostedNames.has(unit.name) && this.recruitment.routesWithChapters(unit.name).length > 0),
  );

  readonly unitId = signal<number | null>(null);

  readonly unit = computed(() => this.characters().find((unit) => unit.id === this.unitId()) ?? null);

  readonly routes = computed(() => {
    const unit = this.unit();

    return unit ? this.recruitment.routesWithChapters(unit.name) : [];
  });

  readonly routeKey = linkedSignal<readonly { key: string }[], string | null>({
    source: this.routes,
    computation: (routes, previous) => routes.find((route) => route.key === previous?.value)?.key ?? routes[0]?.key ?? null,
  });

  readonly route = computed(() => this.routes().find((route) => route.key === this.routeKey()) ?? null);

  readonly chapterNumber = linkedSignal(() => this.route()?.chapters[0]?.chapter ?? null);

  /** The unit whose growths drive the projection (Mu*'s for Mu), as on the character page. */
  readonly growthUnit = computed(() => {
    const unit = this.unit();
    const boosted = unit ? BOOSTED_GROWTH_VARIANTS[characterKey(unit.name)] : undefined;

    return (boosted && this.allUnits().find((candidate) => candidate.name === boosted)) || unit;
  });

  readonly projecting = signal(false);

  readonly canProject = computed(() => this.growthUnit() !== null && this.route() !== null && this.chapterNumber() !== null);

  project(): void {
    if (this.canProject()) {
      this.projecting.set(true);
    }
  }

  @HostListener('document:keydown.escape')
  close(): void {
    // The projection dialog closes on Escape too, and then the whole flow ends.
    this.closed.emit();
  }
}
