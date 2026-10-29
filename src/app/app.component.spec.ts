import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'fe-growth-frontend' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('fe-growth-frontend');
  });

  it('should render the router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});

describe('AppComponent mobile field visibility', () => {
  // A 390x844 phone: nav bar to y=56, a 444px keyboard leaves y=0..400 visible.
  const viewport = Object.assign(new EventTarget(), {
    height: 844, width: 390, offsetTop: 0, offsetLeft: 0,
    pageTop: 0, pageLeft: 0, scale: 1, onresize: null, onscroll: null,
  });
  const content = 3000;
  let fixture: ReturnType<typeof TestBed.createComponent<AppComponent>>;
  let host: HTMLElement;
  let scroller: HTMLElement;
  let select: HTMLElement;
  let field: HTMLInputElement;
  let panel: HTMLElement;
  let fieldPos: number;
  let panelHeight: number;
  let scrollTop: number;
  let coarse: boolean;
  let scroll: jasmine.Spy;

  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const px = (name: string) => parseFloat(host.style.getPropertyValue(name)) || 0;
  const maxScroll = () => content + px('--keyboard-inset') + px('--scroll-extra') - 788;
  const fieldTop = () => fieldPos - scrollTop;
  const panelBottom = () => panel.getBoundingClientRect().bottom;
  const openKeyboard = async (height = 400) => {
    viewport.height = height;
    viewport.dispatchEvent(new Event('resize'));
    await wait(300);
  };
  const closeKeyboard = async () => {
    viewport.height = 844;
    viewport.dispatchEvent(new Event('resize'));
    await wait(300);
  };
  const tap = async () => {
    field.focus();
    await wait(0);
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    localStorage.setItem('fe-growth:keyboard-inset', '444');
    spyOnProperty(window, 'visualViewport', 'get').and.returnValue(viewport);
    spyOnProperty(window, 'innerHeight', 'get').and.returnValue(844);
    coarse = true;
    const media = window.matchMedia('(pointer: coarse)');
    spyOnProperty(media, 'matches', 'get').and.callFake(() => coarse);
    spyOn(window, 'matchMedia').and.returnValue(media);
    viewport.height = 844;
    viewport.offsetTop = 0;
    fieldPos = 700;
    panelHeight = 208;
    scrollTop = 0;
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    host = fixture.nativeElement;
    scroller = host.querySelector('main')!;
    spyOn(scroller, 'getBoundingClientRect').and.returnValue(new DOMRect(0, 56, 390, 788));
    spyOnProperty(scroller, 'scrollHeight', 'get').and.callFake(() => maxScroll() + 788);
    spyOnProperty(scroller, 'clientHeight', 'get').and.returnValue(788);
    // Like a browser, the scroll position clamps when the page gets shorter.
    spyOnProperty(scroller, 'scrollTop', 'get').and.callFake(() => (scrollTop = Math.min(scrollTop, maxScroll())));
    scroll = spyOn(scroller, 'scrollTo').and.callFake(((options: ScrollToOptions) => {
      scrollTop = Math.min(options.top ?? 0, maxScroll());
    }) as unknown as typeof scroller.scrollTo);
    select = document.createElement('app-searchable-select');
    field = document.createElement('input');
    panel = document.createElement('div');
    panel.className = 'panel';
    select.append(field, panel);
    scroller.append(select);
    spyOn(field, 'getBoundingClientRect').and.callFake(() => new DOMRect(0, fieldTop(), 300, 30));
    spyOn(panel, 'getBoundingClientRect').and.callFake(() => {
      const cap = parseFloat(select.style.getPropertyValue('--dropdown-max-height'));
      return new DOMRect(0, fieldTop() + 34, 300, Math.min(panelHeight, Number.isNaN(cap) ? panelHeight : cap));
    });
  });

  afterEach(() => {
    fixture.destroy();
    localStorage.removeItem('fe-growth:keyboard-inset');
  });

  it('moves the dropdown just above the keyboard right after the tap, before the keyboard opens', async () => {
    await tap();

    expect(scroll).toHaveBeenCalledOnceWith({ top: 550, behavior: 'auto' });
    expect(panelBottom()).toBe(392);
    expect(fieldTop()).toBeGreaterThanOrEqual(64);
  });

  it('does not move again once the keyboard opens where it was expected', async () => {
    await tap();
    await openKeyboard();

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(panelBottom()).toBe(392);
    expect(panel.getBoundingClientRect().height).toBe(208);
  });

  it('makes one small correction for a keyboard of a new height, and remembers it', async () => {
    localStorage.removeItem('fe-growth:keyboard-inset');
    fixture.componentInstance['keyboardInset'] = 422;

    await tap();
    expect(scroll).toHaveBeenCalledOnceWith({ top: 528, behavior: 'auto' });

    await openKeyboard();
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll.calls.mostRecent().args[0]).toEqual({ top: 550, behavior: 'smooth' });
    expect(panelBottom()).toBe(392);
    expect(localStorage.getItem('fe-growth:keyboard-inset')).toBe('444');
  });

  it('does not move the page while the search filters the list', async () => {
    await tap();
    await openKeyboard();
    panelHeight = 47;
    panel.append(document.createElement('span'));
    await wait(300);
    panelHeight = 208;
    panel.append(document.createElement('span'));
    await wait(300);

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scrollTop).toBe(550);
  });

  it('sizes a list that cannot fit above the keyboard once, at the tap, and keeps that size', async () => {
    fixture.componentInstance['keyboardInset'] = 594;
    await tap();

    expect(panel.getBoundingClientRect().height).toBe(144);
    expect(scroll).toHaveBeenCalledOnceWith({ top: 636, behavior: 'auto' });

    await openKeyboard(250);

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(panel.getBoundingClientRect().height).toBe(144);
    expect(fieldTop()).toBe(64);
    expect(panelBottom()).toBe(242);
  });

  it('never shrinks the list after the keyboard opens, even when the keyboard is taller than expected', async () => {
    await tap();
    await openKeyboard(344);

    expect(panel.getBoundingClientRect().height).toBe(208);
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll.calls.mostRecent().args[0]).toEqual({ top: 606, behavior: 'smooth' });
    expect(panelBottom()).toBe(336);
  });

  it('adds room below the last calculator so its dropdown can reach the keyboard too', async () => {
    scrollTop = 2212;
    fieldPos = 2212 + 600;
    await tap();

    expect(host.style.getPropertyValue('--scroll-extra')).toBe('450px');
    expect(scroll).toHaveBeenCalledOnceWith({ top: 2662, behavior: 'auto' });
    expect(panelBottom()).toBe(392);
  });

  it('keeps the page still when the keyboard closes, releasing the spare room as you scroll up', async () => {
    scrollTop = 2212;
    fieldPos = 2212 + 600;
    await tap();
    await openKeyboard();
    field.blur();
    await closeKeyboard();

    expect(scroller.scrollTop).toBe(2662);
    expect(host.style.getPropertyValue('--keyboard-inset')).toBe('');

    scrollTop = 2400;
    scroller.dispatchEvent(new Event('scroll'));
    expect(host.style.getPropertyValue('--scroll-extra')).toBe('188px');
    expect(scroller.scrollTop).toBe(2400);

    scrollTop = 1000;
    scroller.dispatchEvent(new Event('scroll'));
    expect(host.style.getPropertyValue('--scroll-extra')).toBe('');
  });

  it('does not pull the page back down when iOS pans the screen while the keyboard is open', async () => {
    await tap();
    await openKeyboard();
    viewport.offsetTop = 200;
    viewport.dispatchEvent(new Event('scroll'));
    await wait(300);

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(panel.getBoundingClientRect().height).toBe(208);
  });

  it('keeps the option list stationary while focus moves to an option for selection', async () => {
    const option = document.createElement('button');
    panel.append(option);
    await tap();
    await openKeyboard();
    host.style.setProperty('--scroll-extra', '100px');
    option.focus();

    expect(select.style.getPropertyValue('--dropdown-max-height')).not.toBe('');
    expect(host.style.getPropertyValue('--scroll-extra')).toBe('100px');
  });

  describe('tapping a dropdown', () => {
    let dropdown: HTMLElement;
    let input: HTMLInputElement;

    const touch = (type: string, target: Element, y: number) => {
      const point = new Touch({ identifier: 1, target, clientX: 10, clientY: y });
      const event = new TouchEvent(type, {
        touches: type === 'touchend' ? [] : [point],
        changedTouches: [point],
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      return event;
    };
    const tapOn = (target: Element, from = 300, to = from) => {
      touch('touchstart', target, from);
      return touch('touchend', target, to);
    };

    beforeEach(() => {
      dropdown = document.createElement('app-searchable-select');
      dropdown.style.setProperty('--dropdown-height', '13rem');
      const box = document.createElement('div');
      box.className = 'field';
      input = document.createElement('input');
      box.append(input);
      dropdown.append(box);
      scroller.append(dropdown);
      // The field box is 30px tall around an 18px search box; the list opens 4px below it.
      spyOn(dropdown, 'getBoundingClientRect').and.callFake(() => new DOMRect(0, fieldTop() - 6, 300, 30));
      spyOn(input, 'getBoundingClientRect').and.callFake(() => new DOMRect(0, fieldTop(), 300, 18));
    });

    it('moves the page so the list will rest above the keyboard before the field gets focus', async () => {
      const focusedWhenMoved: (Element | null)[] = [];
      scroll.and.callFake(((options: ScrollToOptions) => {
        focusedWhenMoved.push(document.activeElement);
        scrollTop = Math.min(options.top ?? 0, maxScroll());
      }) as unknown as typeof scroller.scrollTo);

      const event = tapOn(input);

      expect(event.defaultPrevented).toBeTrue();
      expect(scroll).toHaveBeenCalledOnceWith({ top: 544, behavior: 'auto' });
      expect(focusedWhenMoved).toEqual([document.body]);
      expect(document.activeElement).toBe(input);
      expect(dropdown.style.getPropertyValue('--dropdown-max-height')).toBe('300px');
      expect(fieldTop() + 28 + 208).toBe(392);

      await wait(0);
      await openKeyboard();
      expect(scroll).toHaveBeenCalledTimes(1);
    });

    it('works the same from the arrow part of the field', () => {
      const event = tapOn(dropdown.querySelector('.field')!);

      expect(event.defaultPrevented).toBeTrue();
      expect(document.activeElement).toBe(input);
    });

    it('leaves a scrolling drag alone', () => {
      const event = tapOn(input, 300, 360);

      expect(event.defaultPrevented).toBeFalse();
      expect(scroll).not.toHaveBeenCalled();
      expect(document.activeElement).not.toBe(input);
    });

    it('leaves a tap on the already open dropdown alone, so it can close as usual', async () => {
      input.focus();
      await wait(0);
      scroll.calls.reset();

      const event = tapOn(input);

      expect(event.defaultPrevented).toBeFalse();
      expect(scroll).not.toHaveBeenCalled();
    });
  });
  it('leaves the page alone with a mouse', async () => {
    coarse = false;
    await tap();
    await openKeyboard();

    expect(scroll).not.toHaveBeenCalled();
  });
});
