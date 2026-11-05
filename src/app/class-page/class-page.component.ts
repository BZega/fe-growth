import { NgTemplateOutlet } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, Injector, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs/operators';
import { BONUS_STAT_KEYS, BONUS_STAT_LABELS, CLASS_RANK_ORDER, ClassAbility, SKILL_KEYS, SKILL_LABELS, SkillKey, STAT_KEYS, STAT_LABELS, UnitClass } from '../models/growth.models';
import { GrowthDataService } from '../services/growth-data.service';
import { SpoilerService } from '../services/spoiler.service';

type StatTab = 'bonus' | 'base';

@Component({
  selector: 'app-class-page',
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './class-page.component.html',
  styleUrl: './class-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassPageComponent {
  private readonly api = inject(GrowthDataService);
  private readonly spoilers = inject(SpoilerService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  private readonly switcher = viewChild<ElementRef<HTMLElement>>('switcher');
  private readonly toggle = viewChild<ElementRef<HTMLButtonElement>>('toggle');
  private readonly filterBox = viewChild<ElementRef<HTMLInputElement>>('filterBox');

  readonly switcherOpen = signal(false);
  readonly filter = signal('');
  readonly activeSkill = signal<SkillKey | null>(null);

  readonly statTabs: readonly { key: StatTab; label: string }[] = [
    { key: 'bonus', label: 'Stat bonuses' },
    { key: 'base', label: 'Base stats' },
  ];
  readonly statTab = signal<StatTab>('bonus');

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

  cycleStatTab(): void {
    const next = this.statTab() === 'bonus' ? 'base' : 'bonus';
    this.statTab.set(next);
    afterNextRender(() => document.getElementById(`stat-tab-${next}`)?.focus(), {
      injector: this.injector,
    });
  }

  toggleSkillTip(skill: SkillKey): void {
    this.activeSkill.update((current) => (current === skill ? null : skill));
  }

  readonly switcherGroups = computed(() => {
    const needle = this.filter().trim().toLowerCase();

    return CLASS_RANK_ORDER.map((rank) => ({
      rank,
      classes: this.spoilers.filter(this.classes()).filter(
        (unitClass) =>
          unitClass.rank === rank &&
          (needle === '' || unitClass.name.toLowerCase().includes(needle)),
      ),
    })).filter((group) => group.classes.length > 0);
  });

  // Same order as the switcher: by tier, then as listed in the data.
  private readonly orderedClasses = computed(() =>
    CLASS_RANK_ORDER.flatMap((rank) =>
      this.spoilers.filter(this.classes()).filter((unitClass) => unitClass.rank === rank),
    ),
  );

  /** The open switcher's highlighted option; Enter opens it. */
  readonly highlightId = signal<number | null>(null);

  // No wrapping here: the first and last classes just have one link.
  readonly adjacentClasses = computed(() => {
    const list = this.orderedClasses();
    const index = list.findIndex((unitClass) => unitClass.id === this.classId());

    return {
      previous: index > 0 ? list[index - 1] : null,
      next: index >= 0 && index < list.length - 1 ? list[index + 1] : null,
    };
  });

  @HostListener('document:keydown', ['$event'])
  onArrowKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    // Arrow keys already mean something in fields and on the stat tabs.
    const busy = target?.closest('input, textarea, select, [contenteditable="true"], [role="tab"]');

    if (busy || event.defaultPrevented || this.switcherOpen() || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const { previous, next } = this.adjacentClasses();
    const step = event.key === 'ArrowLeft' ? previous : event.key === 'ArrowRight' ? next : null;

    if (step) {
      event.preventDefault();
      this.router.navigate(['/classes', step.id]);
    }
  }

  private readonly matches = computed(() => this.switcherGroups().flatMap((group) => group.classes));

  onFilterInput(value: string): void {
    this.filter.set(value);
    this.highlightId.set(this.matches()[0]?.id ?? null);
  }

  onFilterKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = this.matches().find((unitClass) => unitClass.id === this.highlightId()) ?? this.matches()[0];

      if (target) {
        this.goTo(target.id);
      }
    }
  }

  private moveHighlight(step: number): void {
    const list = this.matches();

    if (list.length === 0) {
      return;
    }

    const index = list.findIndex((unitClass) => unitClass.id === this.highlightId());
    const next = list[(index + step + list.length) % list.length];

    this.highlightId.set(next.id);
    afterNextRender(
      () => document.getElementById(`class-option-${next.id}`)?.scrollIntoView({ block: 'nearest' }),
      { injector: this.injector },
    );
  }

  // With the switcher closed, ↑/↓ on the class name step straight to the previous/next class.
  onToggleKey(event: KeyboardEvent): void {
    if (this.switcherOpen() || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) {
      return;
    }

    const list = this.orderedClasses();
    const index = list.findIndex((unitClass) => unitClass.id === this.classId());

    if (list.length === 0) {
      return;
    }

    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    this.router.navigate(['/classes', list[(index + step + list.length) % list.length].id]);
  }

  /** Opens a class from the switcher and puts focus back on the class name, ready for ↑/↓. */
  goTo(classId: number): void {
    this.closeSwitcher();
    this.router.navigate(['/classes', classId]);
    this.toggle()?.nativeElement.focus();
  }

  toggleSwitcher(): void {
    if (this.switcherOpen()) {
      this.closeSwitcher();
      return;
    }

    this.filter.set('');
    this.highlightId.set(this.classId());
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
