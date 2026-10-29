import { ComponentFixture, TestBed } from '@angular/core/testing';
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
