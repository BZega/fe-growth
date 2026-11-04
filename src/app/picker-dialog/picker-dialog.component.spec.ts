import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PickerDialogComponent, PickerGroup } from './picker-dialog.component';

describe('PickerDialogComponent', () => {
  let fixture: ComponentFixture<PickerDialogComponent>;
  let dialog: PickerDialogComponent;
  let confirmed: string[] | null;
  let closed: boolean;

  const groups: PickerGroup[] = [
    {
      label: 'Class abilities',
      items: [
        { id: 'fixed', name: 'Always On', fixed: true },
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
        { id: 'c', name: 'Gamma' },
      ],
    },
    {
      label: 'Character abilities',
      items: [
        { id: 'wb', name: "Warrior's Blood", family: 'wb' },
        { id: 'wb+', name: "Warrior's Blood+", family: 'wb' },
      ],
    },
  ];

  const open = (selected: string[], max: number | null) => {
    fixture = TestBed.createComponent(PickerDialogComponent);
    dialog = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'Pick');
    fixture.componentRef.setInput('groups', groups);
    fixture.componentRef.setInput('selected', selected);
    fixture.componentRef.setInput('max', max);
    confirmed = null;
    closed = false;
    dialog.confirmed.subscribe((ids) => (confirmed = ids));
    dialog.closed.subscribe(() => (closed = true));
    fixture.detectChanges();
  };
  const item = (id: string) => groups.flatMap((group) => group.items).find((candidate) => candidate.id === id)!;
  const checkbox = (name: string) =>
    Array.from(fixture.nativeElement.querySelectorAll('.picker-item') as NodeListOf<HTMLElement>)
      .find((row) => row.textContent!.includes(name))!
      .querySelector('input') as HTMLInputElement;
  const click = (selector: string) => {
    (fixture.nativeElement.querySelector(selector) as HTMLButtonElement).click();
    fixture.detectChanges();
  };

  it('starts with the selected and fixed items ticked, and fixed ones locked', () => {
    open(['b'], null);

    expect(dialog.picked()).toEqual(['fixed', 'b']);
    expect(checkbox('Always On').disabled).toBeTrue();
    expect(checkbox('Beta').checked).toBeTrue();
  });

  it('only applies the choice on Confirm', () => {
    open([], null);
    checkbox('Alpha').click();
    fixture.detectChanges();

    expect(confirmed).toBeNull();

    click('.button--primary');
    expect(confirmed!).toEqual(['fixed', 'a']);
  });

  it('closes without confirming on Cancel', () => {
    open(['a'], null);
    dialog.toggle(item('a'));
    click('.dialog__footer .button:not(.button--primary)');

    expect(closed).toBeTrue();
    expect(confirmed).toBeNull();
  });

  it('stops adding at the limit but still allows unticking', () => {
    open(['a', 'b'], 3);

    dialog.toggle(item('c'));
    expect(dialog.picked()).toEqual(['fixed', 'a', 'b']);
    expect(dialog.isDisabled(item('c'))).toBeTrue();

    dialog.toggle(item('a'));
    dialog.toggle(item('c'));
    expect(dialog.picked()).toEqual(['fixed', 'b', 'c']);
  });

  it("swaps an ability for its upgrade in place, never holding both, even when full", () => {
    open(['a', 'wb', 'b'], 4);

    expect(dialog.isDisabled(item('wb+'))).toBeFalse();
    dialog.toggle(item('wb+'));

    expect(dialog.picked()).toEqual(['fixed', 'a', 'wb+', 'b']);

    dialog.toggle(item('wb'));
    expect(dialog.picked()).toEqual(['fixed', 'a', 'wb', 'b']);
  });

  it('shows why a locked item cannot be ticked and keeps it unticked', () => {
    fixture = TestBed.createComponent(PickerDialogComponent);
    dialog = fixture.componentInstance;
    const locked = { id: 'x', name: 'Hunting Basics', locked: 'Needs Hunter in available classes' };
    fixture.componentRef.setInput('title', 'Pick');
    fixture.componentRef.setInput('groups', [{ label: '', items: [locked] }]);
    fixture.detectChanges();

    dialog.toggle(locked);

    expect(dialog.picked()).toEqual([]);
    expect(checkbox('Hunting Basics').disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('.picker-item__locked').textContent).toContain('Needs Hunter');
  });

  it('filters by search text', () => {
    open([], null);
    dialog.query.set('blood');
    fixture.detectChanges();

    expect(dialog.filtered().map((group) => group.label)).toEqual(['Character abilities']);
    expect(fixture.nativeElement.querySelectorAll('.picker-item').length).toBe(2);
  });
});
