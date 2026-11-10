import { ChangeDetectionStrategy, Component, computed, HostListener, input, OnInit, output, signal } from '@angular/core';
import { describeBounds, knownOutcome, RollBounds } from '../models/seed-roll';
import { SearchableSelectComponent, SelectItemGroup } from '../searchable-select/searchable-select.component';
import { ExamDraft } from '../services/seed-mapper-state.service';

export type BranchMode = 'exam' | 'reclass';

@Component({
  selector: 'app-exam-dialog',
  imports: [SearchableSelectComponent],
  templateUrl: './exam-dialog.component.html',
  styleUrl: './exam-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamDialogComponent implements OnInit {
  readonly title = input('Exam taken');
  readonly context = input('');
  readonly reclassContext = input('');
  readonly classGroups = input<readonly SelectItemGroup[]>([]);
  readonly reclassGroups = input<readonly SelectItemGroup[]>([]);
  readonly initial = input<{ classId: number | null; chance: number; passed: boolean; keepClass?: boolean } | null>(
    null,
  );
  readonly initialMode = input<BranchMode>('exam');
  /** Off when editing, since an exam and a reclass sit on different rolls. */
  readonly canSwitchMode = input(true);
  readonly strBounds = input<RollBounds>({ lower: null, upper: null });

  readonly confirmed = output<ExamDraft>();
  readonly closed = output<void>();

  readonly mode = signal<BranchMode>('exam');
  readonly classId = signal<number | null>(null);
  readonly chanceText = signal('');
  readonly passed = signal<boolean | null>(null);
  /** On a pass, whether the unit moves into the exam class or only unlocks it. */
  readonly switchClass = signal(true);

  readonly reclassing = computed(() => this.mode() === 'reclass');

  readonly chance = computed(() => {
    const text = this.chanceText().trim();
    const value = Number(text);

    return text !== '' && Number.isInteger(value) && value >= 0 && value <= 100
      ? value
      : null;
  });

  readonly chanceInvalid = computed(
    () => this.chanceText().trim() !== '' && this.chance() === null,
  );

  readonly knownRange = computed(() => describeBounds(this.strBounds()));

  // Bounds only come from reliable level ups (more than 2 stats) and other exams, so they can decide it.
  readonly forced = computed(() => {
    const chance = this.chance();

    return chance === null ? null : knownOutcome(this.strBounds(), chance);
  });

  readonly outcome = computed(() => this.forced() ?? this.passed());

  readonly canConfirm = computed(() =>
    this.reclassing()
      ? this.classId() !== null
      : this.classId() !== null && this.chance() !== null && this.outcome() !== null,
  );

  ngOnInit(): void {
    const initial = this.initial();

    this.mode.set(this.initialMode());

    if (initial) {
      this.classId.set(initial.classId);
      this.chanceText.set(String(initial.chance));
      this.passed.set(initial.passed);
      this.switchClass.set(!initial.keepClass);
    }
  }

  // Exam and reclass offer different classes, so the pick doesn't carry over.
  setMode(mode: BranchMode): void {
    if (mode !== this.mode()) {
      this.mode.set(mode);
      this.classId.set(null);
    }
  }

  confirm(): void {
    const classId = this.classId();

    if (this.reclassing()) {
      if (classId !== null) {
        this.confirmed.emit({ classId, chance: 100, passed: true, reclass: true });
      }
      return;
    }

    const chance = this.chance();
    const passed = this.outcome();

    if (classId !== null && chance !== null && passed !== null) {
      this.confirmed.emit({ classId, chance, passed, reclass: false, keepClass: passed && !this.switchClass() });
    }
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }
}
