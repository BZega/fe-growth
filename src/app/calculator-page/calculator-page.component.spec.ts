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
  const topOf = (element: Element) => element.getBoundingClientRect().top;
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

  it('pins the last calculator to Calculator 1\'s unscrolled spot and locks scrolling', () => {
    field(4, 'Unit').focus();

    expect(topOf(calculators()[4])).toBeCloseTo(home, 0);
    expect(main.hasAttribute('data-scroll-pinned')).toBeTrue();
    expect(getComputedStyle(main).overflowY).toBe('hidden');
  });

  it('covers the calculator above the pinned spot with the sticky page header', () => {
    field(2, 'Class').focus();
    const header = fixture.nativeElement.querySelector('.page-header') as HTMLElement;
    const bottom = header.getBoundingClientRect().bottom;

    expect(bottom).toBeCloseTo(home, 0);
    expect(calculators()[1].getBoundingClientRect().bottom).toBeLessThanOrEqual(bottom);
    expect(document.elementFromPoint(20, bottom - 2)?.closest('.page-header')).toBe(header);
  });

  it('restores the previous scroll position when editing ends', () => {
    field(2, 'Class').focus();
    field(2, 'Class').blur();

    expect(main.scrollTop).toBe(600);
    expect(main.hasAttribute('data-scroll-pinned')).toBeFalse();
    expect(main.style.getPropertyValue('--pin-room')).toBe('');
  });

  it('stays pinned while moving between fields of the same calculator', () => {
    field(2, 'Unit').focus();
    field(2, 'Class').focus();

    expect(topOf(calculators()[2])).toBeCloseTo(home, 0);
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

  it('leaves the page alone on fine pointers', () => {
    coarse = false;
    field(2, 'Class').focus();

    expect(main.scrollTop).toBe(600);
    expect(main.hasAttribute('data-scroll-pinned')).toBeFalse();
  });
});
