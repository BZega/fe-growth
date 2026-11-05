import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SuggestionDialogComponent } from './suggestion-dialog.component';

describe('SuggestionDialogComponent', () => {
  let fixture: ComponentFixture<SuggestionDialogComponent>;
  let dialog: SuggestionDialogComponent;
  let host: HTMLElement;
  let fetchSpy: jasmine.Spy;

  const open = (formId = 'testform') => {
    fixture = TestBed.createComponent(SuggestionDialogComponent);
    dialog = fixture.componentInstance;
    host = fixture.nativeElement;
    fixture.componentRef.setInput('formId', formId);
    fixture.detectChanges();
  };
  const type = (text: string) => {
    const box = host.querySelector<HTMLTextAreaElement>('textarea')!;
    box.value = text;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const typeEmail = (text: string) => {
    const box = host.querySelector<HTMLInputElement>('input[type="email"]')!;
    box.value = text;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const sentBody = () => JSON.parse((fetchSpy.calls.mostRecent().args[1] as RequestInit).body as string);
  const submit = async () => {
    host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    fetchSpy = spyOn(window, 'fetch').and.resolveTo(new Response('{}', { status: 200 }));
  });

  it('only allows submitting once something is written', () => {
    open();

    expect(host.querySelector<HTMLButtonElement>('.button--primary')!.disabled).toBeTrue();
    type('More class data please');
    expect(host.querySelector<HTMLButtonElement>('.button--primary')!.disabled).toBeFalse();
  });

  it('posts the suggestion to the form service, not to an email address, and thanks the user', async () => {
    open();
    type('  More class data please  ');
    await submit();

    const [url, init] = fetchSpy.calls.mostRecent().args as [string, RequestInit];
    expect(url).toBe('https://formspree.io/f/testform');
    expect(JSON.parse(init.body as string).message).toBe('More class data please');
    expect(String(init.body)).not.toContain('@');
    expect(host.querySelector('.suggestion__done')!.textContent).toContain('Thanks');
  });

  it('shows an error and keeps the text when sending fails', async () => {
    fetchSpy.and.resolveTo(new Response('{}', { status: 500 }));
    open();
    type('Typo on Hunter');
    await submit();

    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(dialog.message()).toBe('Typo on Hunter');
  });

  it("doesn't send anything when the hidden spam field is filled in", async () => {
    open();
    type('Buy now');
    dialog.trap.set('bot');
    await submit();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("says suggestions aren't set up yet when there's no form ID", () => {
    open('');
    type('Hello');

    expect(host.querySelector<HTMLButtonElement>('.button--primary')!.disabled).toBeTrue();
    expect(host.textContent).toContain("Suggestions aren't set up yet.");
  });

  it('sends the optional email as the reply-to address when one is given', async () => {
    open();
    type('Please add more units');
    typeEmail('  fan@example.com ');
    await submit();

    expect(sentBody().email).toBe('fan@example.com');
  });

  it('leaves the email out entirely when it is blank', async () => {
    open();
    type('Please add more units');
    await submit();

    expect('email' in sentBody()).toBeFalse();
  });

  it("won't submit with an email that doesn't look like an address", () => {
    open();
    type('Please add more units');
    typeEmail('not-an-email');

    expect(host.querySelector<HTMLButtonElement>('.button--primary')!.disabled).toBeTrue();
    expect(host.textContent).toContain("That doesn't look like an email address.");

    typeEmail('');
    expect(host.querySelector<HTMLButtonElement>('.button--primary')!.disabled).toBeFalse();
  });

  it('has no support links, which live in their own modal', () => {
    open();

    expect(host.querySelector('a[href*="venmo"]')).toBeNull();
  });
});
