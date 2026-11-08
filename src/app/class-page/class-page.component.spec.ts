import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import unitClassData from '../data/unit-classes.json';
import { CLASS_RANK_ORDER, UnitClass } from '../models/growth.models';
import { SpoilerService } from '../services/spoiler.service';
import { ClassPageComponent } from './class-page.component';

const ordered = CLASS_RANK_ORDER.flatMap((rank) =>
  (unitClassData as UnitClass[]).filter((unitClass) => unitClass.rank === rank),
);

describe('ClassPageComponent class switcher keyboard', () => {
  afterEach(() => {
    TestBed.inject(SpoilerService).setAllHidden(true);
    TestBed.flushEffects();
  });

  const open = (id: number) => {
    TestBed.configureTestingModule({
      imports: [ClassPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: String(id) })) } },
      ],
    });
    TestBed.inject(SpoilerService).setAllHidden(false);
    const fixture = TestBed.createComponent(ClassPageComponent);
    fixture.detectChanges();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const host = fixture.nativeElement as HTMLElement;
    const press = (target: Element, key: string) => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      fixture.detectChanges();
    };
    const toggle = () => host.querySelector<HTMLButtonElement>('.switcher__toggle')!;
    const filter = () => host.querySelector<HTMLInputElement>('.switcher__filter')!;
    const active = () => host.querySelector('.switcher__option--active')?.textContent!.trim();

    return { fixture, component: fixture.componentInstance, host, navigate, press, toggle, filter, active };
  };

  const second = ordered[1];

  it('starts on the current class and moves the highlight with the up and down arrows', () => {
    const page = open(second.id);
    page.toggle().click();
    page.fixture.detectChanges();

    expect(page.active()).toBe(second.name);

    page.press(page.filter(), 'ArrowDown');
    expect(page.active()).toBe(ordered[2].name);

    page.press(page.filter(), 'ArrowUp');
    page.press(page.filter(), 'ArrowUp');
    expect(page.active()).toBe(ordered[0].name);
  });

  it('opens the highlighted class with Enter, closes the list and returns focus to the class name', () => {
    const page = open(second.id);
    page.toggle().click();
    page.fixture.detectChanges();

    page.press(page.filter(), 'ArrowDown');
    page.press(page.filter(), 'Enter');

    expect(page.navigate).toHaveBeenCalledWith(['/classes', ordered[2].id]);
    expect(page.component.switcherOpen()).toBeFalse();
    expect(document.activeElement).toBe(page.toggle());
  });

  it('highlights the first match while filtering', () => {
    const page = open(second.id);
    page.toggle().click();
    page.fixture.detectChanges();

    page.filter().value = ordered[3].name;
    page.filter().dispatchEvent(new Event('input'));
    page.fixture.detectChanges();

    expect(page.active()).toBe(ordered[3].name);
  });

  it('keeps stepping through classes with up and down on the class name once the list is closed', () => {
    const page = open(second.id);

    page.press(page.toggle(), 'ArrowDown');
    expect(page.navigate).toHaveBeenCalledWith(['/classes', ordered[2].id]);

    page.press(page.toggle(), 'ArrowUp');
    expect(page.navigate).toHaveBeenCalledWith(['/classes', ordered[0].id]);
  });

  it('wraps from the first class back to the last', () => {
    const page = open(ordered[0].id);

    page.press(page.toggle(), 'ArrowUp');

    expect(page.navigate).toHaveBeenCalledWith(['/classes', ordered.at(-1)!.id]);
  });

  it('links to the previous and next class at the bottom of the page, on opposite sides', () => {
    const page = open(second.id);
    const links = Array.from(page.host.querySelectorAll<HTMLElement>('.class-steps a'));

    expect(links.map((link) => link.textContent!.trim())).toEqual([`‹ ${ordered[0].name}`, `${ordered[2].name} ›`]);
    expect(page.host.querySelector('.profile')!.compareDocumentPosition(links[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(links[1].getBoundingClientRect().left).toBeGreaterThan(links[0].getBoundingClientRect().right);
  });

  it('shows only the next link on the first class and only the previous link on the last', () => {
    expect(Array.from(open(ordered[0].id).host.querySelectorAll('.class-steps a')).map((link) => link.textContent!.trim()))
      .toEqual([`${ordered[1].name} ›`]);
  });

  it('moves to the previous and next class with the left and right arrow keys', () => {
    const page = open(second.id);

    page.press(document.body, 'ArrowRight');
    expect(page.navigate).toHaveBeenCalledWith(['/classes', ordered[2].id]);

    page.press(document.body, 'ArrowLeft');
    expect(page.navigate).toHaveBeenCalledWith(['/classes', ordered[0].id]);
  });

  it('leaves left and right alone while typing, on the stat tabs, or with the list open', () => {
    const page = open(second.id);
    const input = document.createElement('input');
    page.host.appendChild(input);

    page.press(input, 'ArrowRight');
    page.press(page.host.querySelector('[role="tab"]')!, 'ArrowRight');
    page.toggle().click();
    page.fixture.detectChanges();
    page.press(document.body, 'ArrowRight');

    expect(page.navigate).not.toHaveBeenCalled();
  });

  it('keeps the tier label and value as separate pieces with no stray spacing', () => {
    const page = open(second.id);
    const badge = page.host.querySelector('.badge--rank')!;

    expect(Array.from(badge.children).map((child) => child.textContent)).toEqual(['Tier', second.rank]);
  });
});
