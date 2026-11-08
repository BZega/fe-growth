import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HelpDialogComponent } from './help-dialog.component';

describe('HelpDialogComponent', () => {
  let fixture: ComponentFixture<HelpDialogComponent>;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HelpDialogComponent] });
    fixture = TestBed.createComponent(HelpDialogComponent);
    host = fixture.nativeElement;
    fixture.componentRef.setInput('heading', 'Page help');
    fixture.componentRef.setInput('paragraphs', ['Details for this page.']);
    fixture.detectChanges();
  });

  it('stays an inline button that does not cover the page while closed', () => {
    expect(getComputedStyle(host).position).not.toBe('fixed');
    expect(host.hasAttribute('title')).toBeFalse();
  });

  it('only shows details after the user opens help', () => {
    expect(host.querySelector('[role="dialog"]')).toBeNull();

    host.querySelector<HTMLButtonElement>('.help-button')!.click();
    fixture.detectChanges();

    expect(host.querySelector('[role="dialog"]')!.textContent).toContain('Details for this page.');
  });

  it('closes on Escape', () => {
    host.querySelector<HTMLButtonElement>('.help-button')!.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
});