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
  const viewport = Object.assign(new EventTarget(), {
    height: 400, width: 390, offsetTop: 0, offsetLeft: 0,
    pageTop: 0, pageLeft: 0, scale: 1, onresize: null, onscroll: null,
  });
  // Keyboard-free page content height; the scroller's spacer adds the keyboard inset and extra room.
  const content = 2600;
  let fixture: ReturnType<typeof TestBed.createComponent<AppComponent>>;
  let host: HTMLElement;
  let scroller: HTMLElement;
  let select: HTMLElement;
  let field: HTMLInputElement;
  let panel: HTMLElement;
  let fieldPos: number;
  let panelHeight: number;
  let scrollTop: number;
  let scroll: jasmine.Spy;

  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 400));
  const px = (name: string) => parseFloat(host.style.getPropertyValue(name)) || 0;
  const maxScroll = () => content + px('--keyboard-inset') + px('--scroll-extra') - 784;
  const fieldTop = () => fieldPos - scrollTop;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    spyOnProperty(window, 'visualViewport', 'get').and.returnValue(viewport);
    spyOnProperty(window, 'innerHeight', 'get').and.returnValue(844);
    const media = window.matchMedia('(pointer: coarse)');
    spyOnProperty(media, 'matches', 'get').and.returnValue(true);
    spyOn(window, 'matchMedia').and.returnValue(media);
    viewport.height = 400;
    viewport.offsetTop = 0;
    fieldPos = 600;
    panelHeight = 208;
    scrollTop = 0;
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    host = fixture.nativeElement;
    scroller = host.querySelector('main')!;
    spyOn(scroller, 'getBoundingClientRect').and.returnValue(new DOMRect(0, 60, 390, 784));
    spyOnProperty(scroller, 'scrollHeight', 'get').and.callFake(() => maxScroll() + 784);
    spyOnProperty(scroller, 'clientHeight', 'get').and.returnValue(784);
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
    spyOn(field, 'getBoundingClientRect').and.callFake(() => new DOMRect(0, fieldTop(), 300, 24));
    spyOn(panel, 'getBoundingClientRect').and.callFake(() => new DOMRect(0, fieldTop() + 40, 300, panelHeight));
  });

  afterEach(() => fixture.destroy());

  it('scrolls a full-height dropdown above the keyboard without shrinking it', async () => {
    field.focus();
    await settle();
    expect(scroll).toHaveBeenCalledOnceWith({ top: 460, behavior: 'smooth' });
    expect(panel.getBoundingClientRect().bottom).toBe(388);
    expect(fieldTop()).toBeGreaterThanOrEqual(72);
    expect(select.style.getPropertyValue('--dropdown-max-height')).toBe('');
    expect(host.style.getPropertyValue('--keyboard-inset')).toBe('444px');
    expect(host.style.getPropertyValue('--scroll-extra')).toBe('');
  });

  it('adds just enough room below the last calculator for its dropdown', async () => {
    scrollTop = 2260;
    fieldPos = 2260 + 330;
    field.focus();
    await settle();
    expect(host.style.getPropertyValue('--scroll-extra')).toBe('190px');
    expect(scroll).toHaveBeenCalledOnceWith({ top: 2450, behavior: 'smooth' });
    expect(scrollTop).toBe(2450);
    expect(panel.getBoundingClientRect().bottom).toBe(388);
  });

  it('keeps the normal dropdown height and the field reachable on short screens', async () => {
    viewport.height = 300;
    field.focus();
    await settle();
    expect(scroll).toHaveBeenCalledOnceWith({ top: 528, behavior: 'smooth' });
    expect(fieldTop()).toBe(72);
    expect(panel.getBoundingClientRect().height).toBe(208);
  });

  it('does not move the page while the search filters the list', async () => {
    field.focus();
    await settle();
    panelHeight = 47;
    panel.append(document.createElement('span'));
    await settle();
    panelHeight = 208;
    panel.append(document.createElement('span'));
    await settle();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scrollTop).toBe(460);
  });

  it('re-anchors when mount and bond fields grow or shrink a calculator above', async () => {
    field.focus();
    await settle();
    fieldPos += 80;
    scroller.insertBefore(document.createElement('select'), select);
    await settle();
    expect(scroll).toHaveBeenCalledWith({ top: 540, behavior: 'smooth' });
    expect(panel.getBoundingClientRect().bottom).toBe(388);

    fieldPos -= 160;
    scroller.firstElementChild!.remove();
    await settle();
    expect(scroll).toHaveBeenCalledWith({ top: 448, behavior: 'smooth' });
    expect(fieldTop()).toBe(72);
  });

  it('recalculates when iOS pans the visual viewport without resizing it', async () => {
    field.focus();
    await settle();
    viewport.offsetTop = 200;
    viewport.dispatchEvent(new Event('scroll'));
    await settle();
    expect(scroll).toHaveBeenCalledWith({ top: 388, behavior: 'smooth' });
  });

  it('keeps the page still when the keyboard closes at the bottom of the page', async () => {
    scrollTop = 2260;
    fieldPos = 2260 + 330;
    field.focus();
    await settle();
    field.blur();
    viewport.height = 844;
    viewport.dispatchEvent(new Event('resize'));
    await settle();
    expect(host.style.getPropertyValue('--keyboard-inset')).toBe('');
    expect(scroller.scrollTop).toBe(2450);
    expect(host.style.getPropertyValue('--scroll-extra')).toBe('634px');

    scrollTop = 2000;
    scroller.dispatchEvent(new Event('scroll'));
    expect(host.style.getPropertyValue('--scroll-extra')).toBe('184px');
    expect(scroller.scrollTop).toBe(2000);

    scrollTop = 1000;
    scroller.dispatchEvent(new Event('scroll'));
    expect(host.style.getPropertyValue('--scroll-extra')).toBe('');
  });

  it('releases spare scroll room on blur without moving the page', async () => {
    field.focus();
    await settle();
    host.style.setProperty('--scroll-extra', '100px');
    field.blur();
    expect(host.style.getPropertyValue('--scroll-extra')).toBe('');
    expect(scroller.scrollTop).toBe(460);
  });

  it('keeps the option list stationary while focus moves to an option for selection', async () => {
    const option = document.createElement('button');
    panel.append(option);
    field.focus();
    await settle();
    host.style.setProperty('--scroll-extra', '100px');
    option.focus();
    expect(panel.getBoundingClientRect().height).toBe(208);
    expect(host.style.getPropertyValue('--scroll-extra')).toBe('100px');
    panel.remove();
    await settle();
    expect(host.style.getPropertyValue('--scroll-extra')).toBe('');
  });
});

