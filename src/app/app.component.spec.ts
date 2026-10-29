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
    height: 300, width: 390, offsetTop: 0, offsetLeft: 0,
    pageTop: 0, pageLeft: 0, scale: 1, onresize: null, onscroll: null,
  });
  let fixture: ReturnType<typeof TestBed.createComponent<AppComponent>>;
  let host: HTMLElement;
  let scroller: HTMLElement;
  let select: HTMLElement;
  let field: HTMLInputElement;
  let panel: HTMLElement;
  let fieldTop: number;
  let scroll: jasmine.Spy;

  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 400));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    spyOnProperty(window, 'visualViewport', 'get').and.returnValue(viewport);
    const media = window.matchMedia('(pointer: coarse)');
    spyOnProperty(media, 'matches', 'get').and.returnValue(true);
    spyOn(window, 'matchMedia').and.returnValue(media);
    viewport.height = 400;
    viewport.offsetTop = 0;
    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    host = fixture.nativeElement;
    scroller = host.querySelector('main')!;
    spyOn(scroller, 'getBoundingClientRect').and.returnValue(new DOMRect(0, 60, 390, 784));
    spyOnProperty(scroller, 'scrollHeight', 'get').and.returnValue(2000);
    spyOnProperty(scroller, 'clientHeight', 'get').and.returnValue(784);
    scroll = spyOn(scroller, 'scrollBy');
    select = document.createElement('app-searchable-select');
    field = document.createElement('input');
    panel = document.createElement('div');
    panel.className = 'panel';
    select.append(field, panel);
    scroller.append(select);
    fieldTop = 600;
    spyOn(field, 'getBoundingClientRect').and.callFake(() => new DOMRect(0, fieldTop, 300, 24));
    spyOn(panel, 'getBoundingClientRect').and.callFake(() =>
      new DOMRect(0, fieldTop + 40, 300, 208),
    );
  });

  afterEach(() => fixture.destroy());

  it('scrolls a full-height bottom dropdown above the keyboard without shrinking it', async () => {
    field.focus();
    await settle();
    expect(select.style.getPropertyValue('--dropdown-max-height')).toBe('');
    expect(panel.getBoundingClientRect().height).toBe(208);
    expect(scroll).toHaveBeenCalledWith({ top: 460, behavior: 'smooth' });
    const delta = scroll.calls.mostRecent().args[0].top;
    expect(fieldTop - delta).toBeGreaterThanOrEqual(72);
    expect(panel.getBoundingClientRect().bottom - delta).toBe(388);
    expect(host.style.getPropertyValue('--keyboard-inset')).toBe(`${Math.max(0, window.innerHeight - viewport.height)}px`);
  });

  it('adds scroll room when the last calculator is already at the bottom of the page', async () => {
    spyOnProperty(scroller, 'scrollTop', 'get').and.returnValue(1216);
    field.focus();
    await settle();
    expect(host.style.getPropertyValue('--scroll-extra')).not.toBe('');
    expect(parseFloat(host.style.getPropertyValue('--scroll-extra'))).toBeGreaterThanOrEqual(460);
    expect(scroll).toHaveBeenCalledWith({ top: 460, behavior: 'smooth' });
  });

  it('keeps the normal dropdown height and the field reachable on short screens', async () => {
    viewport.height = 300;
    field.focus();
    await settle();
    expect(select.style.getPropertyValue('--dropdown-max-height')).toBe('');
    expect(panel.getBoundingClientRect().height).toBe(208);
    expect(scroll).toHaveBeenCalledWith({ top: 528, behavior: 'smooth' });
    expect(fieldTop - scroll.calls.mostRecent().args[0].top).toBe(72);
  });

  it('recalculates when conditional mount or bond fields change the layout', async () => {
    field.focus();
    await settle();
    scroll.calls.reset();
    fieldTop += 80;
    const bond = document.createElement('select');
    scroller.insertBefore(bond, select);
    await settle();
    expect(scroll).toHaveBeenCalledWith({ top: 540, behavior: 'smooth' });
  });

  it('recalculates when iOS pans the visual viewport without resizing it', async () => {
    field.focus();
    await settle();
    scroll.calls.reset();
    viewport.offsetTop = 40;
    viewport.dispatchEvent(new Event('scroll'));
    await settle();
    expect(scroll).toHaveBeenCalledWith({ top: 420, behavior: 'smooth' });
  });

  it('clears extra scroll room on blur', async () => {
    field.focus();
    await settle();
    host.style.setProperty('--scroll-extra', '100px');
    field.blur();
    expect(select.style.getPropertyValue('--dropdown-max-height')).toBe('');
    expect(host.style.getPropertyValue('--scroll-extra')).toBe('');
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
    expect(select.style.getPropertyValue('--dropdown-max-height')).toBe('');
    expect(host.style.getPropertyValue('--scroll-extra')).toBe('');
  });
});
