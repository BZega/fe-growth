import { TestBed } from '@angular/core/testing';
import { MOVE_NOTICE_KEY, MoveNoticeDialogComponent, moveNoticeHidden } from './move-notice-dialog.component';

describe('MoveNoticeDialogComponent', () => {
  beforeEach(() => localStorage.removeItem(MOVE_NOTICE_KEY));
  afterEach(() => localStorage.removeItem(MOVE_NOTICE_KEY));

  const open = () => {
    const fixture = TestBed.createComponent(MoveNoticeDialogComponent);
    let closed = false;
    fixture.componentInstance.closed.subscribe(() => (closed = true));
    fixture.detectChanges();

    return { fixture, host: fixture.nativeElement as HTMLElement, closed: () => closed };
  };

  it('links to FE Forge', () => {
    const { host } = open();
    const links = Array.from(host.querySelectorAll<HTMLAnchorElement>('a'));

    expect(links.length).toBeGreaterThan(0);
    expect(links.every((link) => link.href === 'https://feforge.app/' && link.target === '_blank')).toBeTrue();
    expect(host.textContent).toContain("We can't wait to see you there!");
  });

  it('shows again next time unless "Don\'t show this again" is ticked when closing', () => {
    let { host, closed } = open();
    host.querySelector<HTMLButtonElement>('.dialog__close')!.click();
    expect(closed()).toBeTrue();
    expect(moveNoticeHidden()).toBeFalse();

    ({ host, closed } = open());
    host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    host.querySelector<HTMLButtonElement>('.notice__footer .button:not(.button--primary)')!.click();
    expect(closed()).toBeTrue();
    expect(moveNoticeHidden()).toBeTrue();
  });
});
