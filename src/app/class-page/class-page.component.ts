import { NgTemplateOutlet } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, Injector, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';
import { BONUS_STAT_KEYS, BONUS_STAT_LABELS, CLASS_RANK_ORDER, ClassAbility, SKILL_KEYS, SKILL_LABELS, SkillKey, STAT_KEYS, STAT_LABELS, UnitClass } from '../models/growth.models';
import { GrowthDataService } from '../services/growth-data.service';

@Component({
  selector: 'app-class-page',
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './class-page.component.html',
  styleUrl: './class-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassPageComponent {
  private readonly api = inject(GrowthDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);

  private readonly switcher = viewChild<ElementRef<HTMLElement>>('switcher');
  private readonly filterBox = viewChild<ElementRef<HTMLInputElement>>('filterBox');

  readonly switcherOpen = signal(false);
  readonly filter = signal('');
  readonly activeSkill = signal<SkillKey | null>(null);

  readonly statKeys = STAT_KEYS;
  readonly statLabels = STAT_LABELS;
  readonly bonusStatKeys = BONUS_STAT_KEYS;
  readonly bonusStatLabels = BONUS_STAT_LABELS;
  readonly skillKeys = SKILL_KEYS;
  readonly skillLabels = SKILL_LABELS;

  private readonly classes = toSignal(this.api.getClasses(), {
    initialValue: [] as UnitClass[],
  });

  private readonly abilities = toSignal(this.api.getClassAbilities(), {
    initialValue: [] as ClassAbility[],
  });

  readonly classId = toSignal(
    this.route.paramMap.pipe(map((params) => Number(params.get('id')))),
    { initialValue: NaN },
  );

  readonly unitClass = computed(
    () => this.classes().find((c) => c.id === this.classId()) ?? null,
  );

  readonly mountType = computed(() => {
    const unitClass = this.unitClass();

    return unitClass ? this.api.mountTypeOfClass(unitClass.name) : 'None';
  });

  readonly usableSkills = computed(() => {
    const unitClass = this.unitClass();

    return unitClass
      ? this.skillKeys
          .filter((skill) => unitClass.skills[skill])
          .map((skill) => ({
            key: skill,
            label: this.skillLabels[skill],
            expBonus: unitClass.skillExpBonus[skill] ?? 0,
          }))
      : [];
  });

  readonly descriptionLines = computed(() =>
    (this.unitClass()?.description ?? '')
      .split(/(?<=\.)\//)
      .map((line) => line.trim())
      .filter(Boolean),
  );

  readonly classAbilities = computed(() =>
    this.lookUp(this.unitClass()?.classAbilities ?? []),
  );

  readonly masterAbilities = computed(() =>
    this.lookUp(this.unitClass()?.masterAbilities ?? []),
  );

  /** Ids that are missing from the abilities data are skipped rather than shown blank. */
  private lookUp(ids: readonly number[]): ClassAbility[] {
    const byId = new Map(this.abilities().map((ability) => [ability.id, ability]));

    return ids.flatMap((id) => {
      const ability = byId.get(id);
      return ability ? [ability] : [];
    });
  }

  signed(value: number): string {
    return value > 0 ? `+${value}` : `${value}`;
  }

  tone(value: number): 'positive' | 'negative' | 'zero' {
    return value > 0 ? 'positive' : value < 0 ? 'negative' : 'zero';
  }

  skillIcon(skill: SkillKey): string {
    return `icons/skills/black/${skill}.svg`;
  }

  initials(name: string): string {
    const words = name.split(/[\s/]+/).filter(Boolean);

    return words.length > 1
      ? (words[0][0] + words[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }

  toggleSkillTip(skill: SkillKey): void {
    this.activeSkill.update((current) => (current === skill ? null : skill));
  }

  readonly switcherGroups = computed(() => {
    const needle = this.filter().trim().toLowerCase();

    return CLASS_RANK_ORDER.map((rank) => ({
      rank,
      classes: this.classes().filter(
        (unitClass) =>
          unitClass.rank === rank &&
          (needle === '' || unitClass.name.toLowerCase().includes(needle)),
      ),
    })).filter((group) => group.classes.length > 0);
  });

  toggleSwitcher(): void {
    if (this.switcherOpen()) {
      this.closeSwitcher();
      return;
    }

    this.filter.set('');
    this.switcherOpen.set(true);

    afterNextRender(
      () => {
        this.filterBox()?.nativeElement.focus();
        this.switcher()
          ?.nativeElement.querySelector('.switcher__option--current')
          ?.scrollIntoView({ block: 'nearest' });
      },
      { injector: this.injector },
    );
  }

  closeSwitcher(): void {
    this.switcherOpen.set(false);
  }

  openFirstMatch(event: Event): void {
    event.preventDefault();
    this.switcher()
      ?.nativeElement.querySelector<HTMLAnchorElement>('.switcher__option')
      ?.click();
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target as Element | null;
    const switcher = this.switcher()?.nativeElement;

    if (this.switcherOpen() && switcher && !switcher.contains(target)) {
      this.closeSwitcher();
    }

    if (this.activeSkill() && !target?.closest?.('.skill')) {
      this.activeSkill.set(null);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeSwitcher();
    this.activeSkill.set(null);
  }
}
