import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ComparisonDialogComponent } from '../comparison-dialog/comparison-dialog.component';
import { GrowthCalculatorComponent } from '../growth-calculator/growth-calculator.component';
import { growthTotal } from '../models/growth.models';
import { SearchableSelectComponent } from '../searchable-select/searchable-select.component';
import { CalculatorStateService } from '../services/calculator-state.service';
import { CalculatorPageComponent } from './calculator-page.component';

describe('CalculatorPageComponent', () => {
  let fixture: ComponentFixture<CalculatorPageComponent>;
  let host: HTMLElement;

  const nextFrames = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const firstCalculatorHeight = () => host.querySelector<HTMLElement>('.panel')!.offsetHeight;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [CalculatorPageComponent] });
    const state = TestBed.inject(CalculatorStateService);
    state.addSlot();
    state.addSlot();
    fixture = TestBed.createComponent(CalculatorPageComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    await nextFrames();
  });

  afterEach(() => fixture.destroy());

  it('sizes the overscroll space below the last calculator to one calculator', () => {
    expect(firstCalculatorHeight()).toBeGreaterThan(0);
    expect(host.style.getPropertyValue('--calculator-height')).toBe(`${firstCalculatorHeight()}px`);
  });

  it('follows the calculator height when calculators are added or removed', async () => {
    TestBed.inject(CalculatorStateService).removeSlot('calc-1');
    fixture.detectChanges();
    await nextFrames();

    expect(host.style.getPropertyValue('--calculator-height')).toBe(`${firstCalculatorHeight()}px`);
  });
});

describe('CalculatorPageComponent comparison', () => {
  let fixture: ComponentFixture<CalculatorPageComponent>;
  let host: HTMLElement;

  const dialog = () => host.querySelector<HTMLElement>('app-comparison-dialog');
  const pickers = () =>
    fixture.debugElement
      .query(By.directive(ComparisonDialogComponent))
      .queryAll(By.directive(SearchableSelectComponent))
      .map((debug) => debug.componentInstance as SearchableSelectComponent);
  const calculators = () =>
    fixture.debugElement
      .queryAll(By.directive(GrowthCalculatorComponent))
      .map((debug) => debug.componentInstance as GrowthCalculatorComponent);
  const field = (root: Element, label: string) =>
    root.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  const changeButtons = () =>
    Array.from(dialog()!.querySelectorAll<HTMLButtonElement>('.summary__change'));
  const change = (side: number) => {
    changeButtons()[side].click();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [CalculatorPageComponent] });
    TestBed.inject(CalculatorStateService).addSlot();
    fixture = TestBed.createComponent(CalculatorPageComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.startCompare();
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('keeps the summary as it was until Change is pressed, then shows pickers in that box only', () => {
    expect(pickers().length).toBe(0);
    expect(changeButtons().map((button) => button.textContent!.trim())).toEqual(['Change', 'Change']);

    change(0);
    expect(pickers().map((picker) => picker.label())).toEqual(['Unit of the first build', 'Class of the first build']);
    expect(changeButtons()[0].textContent!.trim()).toBe('Done');

    change(1);
    expect(pickers().map((picker) => picker.label())).toEqual(['Unit of the second build', 'Class of the second build']);

    change(1);
    expect(pickers().length).toBe(0);
  });

  it('swaps the unit and build lines for one row of unit and class dropdowns in that box only', () => {
    const box = dialog()!.querySelector('.summary__side--a')!;
    expect(box.querySelector('.summary__label')).not.toBeNull();

    change(0);

    const rows = box.querySelectorAll('.summary__row');
    expect(rows.length).toBe(1);
    expect(field(rows[0], 'Unit of the first build')).not.toBeNull();
    expect(field(rows[0], 'Class of the first build')).not.toBeNull();
    expect(box.querySelector('.summary__label')).toBeNull();
    expect(box.querySelector('.summary__build')).toBeNull();
    expect(box.querySelector('.summary__foot .summary__change')!.textContent!.trim()).toBe('Done');
    expect(dialog()!.querySelector('.summary__side--b app-searchable-select')).toBeNull();
  });

  it('stacks unit and class when they are the only pickers, without stretching them across the box', async () => {
    const [first] = calculators();
    const charioteer = first.classGroups().flatMap((group) => group.items).find((item) => item.name === 'Charioteer')!;
    change(0);

    const box = dialog()!.querySelector('.summary__side--a')!;
    const unit = () => field(box, 'Unit of the first build').closest('app-searchable-select')!.getBoundingClientRect();
    const unitClass = () => field(box, 'Class of the first build').closest('app-searchable-select')!.getBoundingClientRect();
    const rowWidth = box.querySelector('.summary__row')!.getBoundingClientRect().width;

    expect(unitClass().top).toBeGreaterThan(unit().bottom - 1);
    expect(unit().width).toBeLessThan(rowWidth);
    expect(unitClass().width).toBe(unit().width);

    pickers()[1].valueChange.emit(charioteer.id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(unitClass().top).toBe(unit().top);
  });
  it('puts the class level beside the class, and mount and bond level on a second row', async () => {
    const [first] = calculators();
    const charioteer = first.classGroups().flatMap((group) => group.items).find((item) => item.name === 'Charioteer')!;

    change(0);
    pickers()[1].valueChange.emit(charioteer.id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const box = dialog()!.querySelector('.summary__side--a')!;
    const level = box.querySelector<HTMLSelectElement>('select[aria-label="Class level of the first build"]')!;
    expect(level.closest('.summary__row')).toBe(box.querySelectorAll('.summary__row')[0]);

    level.value = '35';
    level.dispatchEvent(new Event('change'));
    pickers()[2].valueChange.emit(first.mountOptions()[0].id);
    fixture.detectChanges();

    const rows = box.querySelectorAll('.summary__row');
    expect(rows.length).toBe(2);
    expect(field(rows[1], 'Horse mount of the first build')).not.toBeNull();
    expect(first.classLevel()).toBe(35);
    expect(host.querySelectorAll('.panels app-growth-calculator')[0]
      .querySelector<HTMLSelectElement>('.picker--class-level select')!.value).toBe('35');
  });
  it('adds boxed mount and bond level pickers for a mounted class, changing the calculator', async () => {
    const [first] = calculators();
    const lightCavalry = first.classGroups().flatMap((group) => group.items).find((item) => item.name === 'Light Cavalry')!;

    change(0);
    expect(field(dialog()!, 'Horse mount of the first build')).toBeNull();

    pickers()[1].valueChange.emit(lightCavalry.id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const box = dialog()!.querySelector('.summary__side--a')!;
    expect(field(box, 'Horse mount of the first build')).not.toBeNull();

    const wildHorse = first.mountOptions().find((mount) => mount.name === 'Wild Horse')!;
    pickers()[2].valueChange.emit(wildHorse.id);
    fixture.detectChanges();

    const bond = box.querySelector<HTMLSelectElement>('select[aria-label="Bond level of the first build"]')!;
    expect(bond).not.toBeNull();
    bond.value = '3';
    bond.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(first.mount()?.id).toBe(wildHorse.id);
    expect(first.mountLevel()).toBe(3);
    const pageBond = host.querySelectorAll('.panels app-growth-calculator')[0]
      .querySelector<HTMLSelectElement>('.picker--bond select')!;
    expect(pageBond.value).toBe('3');
    expect(box.querySelectorAll('.summary__row')[1].querySelector('select[aria-label="Bond level of the first build"]')).not.toBeNull();
  });
  it('switches the unit and class of each side, updating the comparison and the calculators', () => {
    const [first, second] = calculators();
    const unit = first.units()[0];
    const unitClass = second.classGroups()[0].items[0];

    change(0);
    pickers()[0].valueChange.emit(unit.id);
    change(1);
    pickers()[1].valueChange.emit(unitClass.id);
    fixture.detectChanges();

    expect(first.selectedUnitId()).toBe(unit.id);
    expect(second.selectedClassId()).toBe(unitClass.id);
    expect(dialog()!.querySelector('h2')!.textContent).toContain(unit.name);
    expect(field(dialog()!, 'Class of the second build').value).toBe(unitClass.name);
    expect(dialog()!.querySelector('.summary__side--a .summary__total')!.textContent!.trim())
      .toBe(`${growthTotal(first.build().total)}%`);

    const pageCalculators = host.querySelectorAll('.panels app-growth-calculator');
    expect(field(pageCalculators[0], 'Unit').value).toBe(unit.name);
    expect(field(pageCalculators[1], 'Class').value).toBe(unitClass.name);
  });

  it('backs out one step per Escape: the dropdown, then the pickers, then the dialog', () => {
    change(0);
    const input = field(dialog()!, 'Unit of the first build');
    input.focus();
    fixture.detectChanges();
    expect(dialog()!.querySelector('.panel')).not.toBeNull();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(dialog()!.querySelector('.panel')).toBeNull();
    expect(pickers().length).toBe(2);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(dialog()).not.toBeNull();
    expect(pickers().length).toBe(0);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(dialog()).toBeNull();
  });});
