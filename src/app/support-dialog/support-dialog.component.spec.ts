import { TestBed } from '@angular/core/testing';
import { SupportDialogComponent } from './support-dialog.component';

describe('SupportDialogComponent', () => {
  const open = () => {
    const fixture = TestBed.createComponent(SupportDialogComponent);
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  };

  it('shows the support message', () => {
    const { host } = open();

    expect(host.querySelector('h2')!.textContent!.trim()).toBe('Support the Developer');
    expect(host.textContent).toContain('Enjoying the FE Growth App?');
    expect(host.textContent).toContain('always appreciated, but never expected!');
  });

  it('links to Venmo and Cash App in a new tab', () => {
    const { host } = open();
    const links = Array.from(host.querySelectorAll<HTMLAnchorElement>('.support__link'));

    expect(links.map((link) => link.href)).toEqual(['https://venmo.com/u/bzega', 'https://cash.app/$BZega']);
    expect(links.map((link) => link.textContent!.trim())).toEqual(['Venmo', 'Cash App']);
    expect(links.every((link) => link.target === '_blank' && link.rel.includes('noopener'))).toBeTrue();
  });

  it('closes on Escape or the close button', () => {
    const { fixture, host } = open();
    let closes = 0;
    fixture.componentInstance.closed.subscribe(() => closes++);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    host.querySelector<HTMLButtonElement>('.dialog__close')!.click();

    expect(closes).toBe(2);
  });
});
