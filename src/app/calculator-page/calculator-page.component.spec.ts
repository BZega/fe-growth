import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AppComponent } from '../app.component';
import { CalculatorStateService } from '../services/calculator-state.service';
import { CalculatorPageComponent } from './calculator-page.component';

describe('CalculatorPageComponent mobile pinning', () => {
  let fixture: ComponentFixture<AppComponent>;
  let main: HTMLElement;
  let coarse: boolean;
  let home: number;

  const calculators = () =>
    Array.from(fixture.nativeElement.querySelectorAll('app-growth-calculator')) as HTMLElement[];
  const field = (index: number, label: string) =>
    calculators()[index].querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  // Relative to the scroller, since the test page itself may scroll a focused field into view.
  const topOf = (element: Element) => element.getBoundingClientRect().top - main.getBoundingClientRect().top;
  const row = (index: number, label: string) => field(index, label).closest('.picker')!;
  const tap = (target: Element) =>
    target.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', bubbles: true }));
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 50));

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([{ path: '', component: CalculatorPageComponent }])],
    });
    coarse = true;
    const media = window.matchMedia('(pointer: coarse)');
    spyOnProperty(media, 'matches', 'get').and.callFake(() => coarse);
    spyOn(window, 'matchMedia').and.returnValue(media);

    const state = TestBed.inject(CalculatorStateService);
    for (let i = 0; i < 4; i++) {
      state.addSlot();
    }

    fixture = TestBed.createComponent(AppComponent);
    await TestBed.inject(Router).navigateByUrl('/');
    fixture.detectChanges();
    await fixture.whenStable();
    main = fixture.nativeElement.querySelector('main');
    main.scrollTop = 0;
    home = topOf(calculators()[0]);
    main.scrollTop = 600;
  });

  afterEach(() => fixture.destroy());

  it('snaps the tapped field of the last calculator just under the header and locks scrolling', () => {
    field(4, 'Class').focus();

    expect(topOf(row(4, 'Class'))).toBeCloseTo(home + 8, 0);
    expect(main.hasAttribute('data-scroll-pinned')).toBeTrue();
    expect(getComputedStyle(main).overflowY).toBe('hidden');
  });

  it('pins on finger lift, before Safari focuses the field, so focus finds the final layout', () => {
    tap(field(2, 'Class'));
    const pinned = main.scrollTop;

    expect(topOf(row(2, 'Class'))).toBeCloseTo(home + 8, 0);
    expect(document.activeElement).not.toBe(field(2, 'Class'));

    field(2, 'Class').focus();
    expect(main.scrollTop).toBe(pinned);
  });

  it('holds the page in place if the browser scrolls it while pinned', () => {
    field(2, 'Class').focus();
    const pinned = main.scrollTop;

    main.scrollTop = 0;
    main.dispatchEvent(new Event('scroll'));

    expect(main.scrollTop).toBe(pinned);
  });

  it('covers everything above the pinned field with the sticky page header', () => {
    field(2, 'Class').focus();
    const header = fixture.nativeElement.querySelector('.page-header') as HTMLElement;
    const bottom = header.getBoundingClientRect().bottom;

    expect(bottom - main.getBoundingClientRect().top).toBeCloseTo(home, 0);
    expect(calculators()[1].getBoundingClientRect().bottom).toBeLessThanOrEqual(bottom);
    expect(document.elementFromPoint(20, bottom - 2)?.closest('.page-header')).toBe(header);
  });

  it('keeps the nav bar and its mobile menu above the sticky page header', () => {
    const nav = fixture.nativeElement.querySelector('.topnav') as HTMLElement;
    const header = fixture.nativeElement.querySelector('.page-header') as HTMLElement;

    expect(Number(getComputedStyle(nav).zIndex)).toBeGreaterThan(Number(getComputedStyle(header).zIndex));
  });

  it('restores the previous scroll position when editing ends', () => {
    field(2, 'Class').focus();
    field(2, 'Class').blur();

    expect(main.scrollTop).toBe(600);
    expect(main.hasAttribute('data-scroll-pinned')).toBeFalse();
    expect(main.style.getPropertyValue('--pin-room')).toBe('');
  });

  it('re-snaps to each field while moving within a calculator, then restores the original spot', () => {
    field(2, 'Unit').focus();
    expect(topOf(row(2, 'Unit'))).toBeCloseTo(home + 8, 0);

    field(2, 'Class').focus();
    expect(topOf(row(2, 'Class'))).toBeCloseTo(home + 8, 0);
    expect(main.hasAttribute('data-scroll-pinned')).toBeTrue();

    field(2, 'Class').blur();
    expect(main.scrollTop).toBe(600);
  });

  it('restores the position when a picked option takes focus and is removed', async () => {
    field(2, 'Class').focus();
    fixture.detectChanges();
    const option = calculators()[2].querySelector<HTMLButtonElement>('.option:not(.option--clear)')!;
    option.focus();

    expect(main.hasAttribute('data-scroll-pinned')).toBeTrue();

    option.click();
    fixture.detectChanges();
    await settle();

    expect(main.hasAttribute('data-scroll-pinned')).toBeFalse();
    expect(main.scrollTop).toBe(600);
  });

  it('unlocks if a tap never turns into focus', async () => {
    tap(field(2, 'Class'));
    expect(main.hasAttribute('data-scroll-pinned')).toBeTrue();

    await new Promise<void>((resolve) => setTimeout(resolve, 700));

    expect(main.hasAttribute('data-scroll-pinned')).toBeFalse();
    expect(main.scrollTop).toBe(600);
  });

  it('leaves the page alone on fine pointers', () => {
    coarse = false;
    field(2, 'Class').focus();

    expect(main.scrollTop).toBe(600);
    expect(main.hasAttribute('data-scroll-pinned')).toBeFalse();
  });
});