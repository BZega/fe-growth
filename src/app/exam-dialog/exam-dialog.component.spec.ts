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

  it('marks exams as not reclassing', () => {
    open();
    dialog.classId.set(9);
    dialog.chanceText.set('40');
    dialog.passed.set(true);
    dialog.confirm();

    expect(confirmed!).toEqual({ classId: 9, chance: 40, passed: true, reclass: false });
  });

  it('hides the Exam/Reclass switch when editing', () => {
    open({ initialMode: 'reclass', canSwitchMode: false, initial: { classId: 1, chance: 100, passed: true } });

    expect(host().querySelector('.mode')).toBeNull();
    expect(dialog.reclassing()).toBeTrue();
    expect(dialog.classId()).toBe(1);
  });
});
