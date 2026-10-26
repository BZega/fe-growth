import { ChangeDetectionStrategy, Component, computed, HostListener, input, OnInit, output, signal } from '@angular/core';
import { describeBounds, knownOutcome, RollBounds } from '../models/seed-roll';
import { SearchableSelectComponent, SelectItemGroup } from '../searchable-select/searchable-select.component';
import { ExamDraft } from '../services/seed-mapper-state.service';

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
  readonly classGroups = input<readonly SelectItemGroup[]>([]);
  readonly initial = input<{ classId: number | null; chance: number; passed: boolean } | null>(
    null,
  );
  readonly strBounds = input<RollBounds>({ lower: null, upper: null });

  readonly confirmed = output<ExamDraft>();
  readonly closed = output<void>();

  readonly classId = signal<number | null>(null);
  readonly chanceText = signal('');
  readonly passed = signal<boolean | null>(null);

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

  readonly forced = computed(() => {
    const chance = this.chance();

    return chance === null ? null : knownOutcome(this.strBounds(), chance);
  });

  readonly outcome = computed(() => this.forced() ?? this.passed());

  readonly canConfirm = computed(
    () => this.classId() !== null && this.chance() !== null && this.outcome() !== null,
  );

  ngOnInit(): void {
    const initial = this.initial();

    if (initial) {
      this.classId.set(initial.classId);
      this.chanceText.set(String(initial.chance));
      this.passed.set(initial.passed);
    }
  }

  confirm(): void {
    const classId = this.classId();
    const chance = this.chance();
    const passed = this.outcome();

    if (classId !== null && chance !== null && passed !== null) {
      this.confirmed.emit({ classId, chance, passed });
    }
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }
}
