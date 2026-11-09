import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExamDraft } from '../services/seed-mapper-state.service';
import { ExamDialogComponent } from './exam-dialog.component';

describe('ExamDialogComponent reclass mode', () => {
  let fixture: ComponentFixture<ExamDialogComponent>;
  let dialog: ExamDialogComponent;
  let confirmed: ExamDraft | null;

  const examGroups = [{ label: 'Intermediate', items: [{ id: 9, name: 'Sniper' }] }];
  const reclassGroups = [{ label: 'Base', items: [{ id: 1, name: 'Noble/Commoner' }] }];

  const open = (inputs: Record<string, unknown> = {}) => {
    fixture = TestBed.createComponent(ExamDialogComponent);
    dialog = fixture.componentInstance;
    fixture.componentRef.setInput('classGroups', examGroups);
    fixture.componentRef.setInput('reclassGroups', reclassGroups);
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    confirmed = null;
    dialog.confirmed.subscribe((draft) => (confirmed = draft));
    fixture.detectChanges();
  };
  const host = () => fixture.nativeElement as HTMLElement;

  it('only needs a class to reclass, and emits a passed, no-roll branch', () => {
    open();
    dialog.setMode('reclass');
    fixture.detectChanges();

    expect(host().querySelector('.chance')).toBeNull();
    expect(dialog.canConfirm()).toBeFalse();

    dialog.classId.set(1);
    dialog.confirm();

    expect(confirmed!).toEqual({ classId: 1, chance: 100, passed: true, reclass: true });
  });

  it('clears the picked class when switching between exam and reclass', () => {
    open();
    dialog.classId.set(9);
    dialog.setMode('reclass');

    expect(dialog.classId()).toBeNull();
  });

  it("shows the known Str roll but doesn't let it decide the result", () => {
    // Str failed to rise at 55%, yet a 47% exam can still pass.
    open({ strBounds: { lower: 55, upper: null } });
    dialog.classId.set(9);
    dialog.chanceText.set('47');
    fixture.detectChanges();

    const buttons = Array.from(host().querySelectorAll<HTMLButtonElement>('.outcome__option'));
    expect(buttons.every((button) => !button.disabled)).toBeTrue();
    expect(host().querySelector('.known')!.textContent).toContain('above 55%');

    buttons[0].click();
    dialog.confirm();

    expect(confirmed!.passed).toBeTrue();
  });

  it('marks exams as not reclassing', () => {
    open();
    dialog.classId.set(9);
    dialog.chanceText.set('40');
    dialog.passed.set(true);
    dialog.confirm();

    expect(confirmed!).toEqual({ classId: 9, chance: 40, passed: true, reclass: false, keepClass: false });
  });

  it('offers "Switch to new class" on a pass, ticked by default, and can keep the current class', () => {
    open();
    dialog.classId.set(9);
    dialog.chanceText.set('40');
    const toggle = () => host().querySelector<HTMLInputElement>('.switch-class input');

    dialog.passed.set(false);
    fixture.detectChanges();
    expect(toggle()).toBeNull();

    dialog.passed.set(true);
    fixture.detectChanges();
    expect(toggle()!.checked).toBeTrue();
    expect(host().querySelector('.switch-class')!.textContent).toContain('Switch to new class');

    toggle()!.click();
    fixture.detectChanges();
    dialog.confirm();

    expect(confirmed!).toEqual({ classId: 9, chance: 40, passed: true, reclass: false, keepClass: true });
  });

  it('shows a saved keep-class pass unticked when editing', () => {
    open({ canSwitchMode: false, initial: { classId: 9, chance: 40, passed: true, keepClass: true } });

    expect(host().querySelector<HTMLInputElement>('.switch-class input')!.checked).toBeFalse();
  });

  it('hides the Exam/Reclass switch when editing', () => {
    open({ initialMode: 'reclass', canSwitchMode: false, initial: { classId: 1, chance: 100, passed: true } });

    expect(host().querySelector('.mode')).toBeNull();
    expect(dialog.reclassing()).toBeTrue();
    expect(dialog.classId()).toBe(1);
  });
});
