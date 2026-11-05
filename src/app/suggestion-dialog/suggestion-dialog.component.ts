import { ChangeDetectionStrategy, Component, computed, HostListener, input, output, signal } from '@angular/core';
import { FORMSPREE_FORM_ID, SUGGESTION_MAX_LENGTH } from '../support.config';

type SendState = 'idle' | 'sending' | 'sent' | 'error';

@Component({
  selector: 'app-suggestion-dialog',
  templateUrl: './suggestion-dialog.component.html',
  styleUrls: ['../exam-dialog/exam-dialog.component.scss', './suggestion-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuggestionDialogComponent {
  /** Overridable so tests don't need the real form. */
  readonly formId = input(FORMSPREE_FORM_ID);

  readonly closed = output<void>();

  readonly maxLength = SUGGESTION_MAX_LENGTH;

  readonly message = signal('');
  readonly email = signal('');
  readonly trap = signal('');
  readonly state = signal<SendState>('idle');

  readonly configured = computed(() => this.formId().trim() !== '');
  // Optional, but if given it has to look like an address so replies can reach it.
  readonly emailInvalid = computed(() => {
    const email = this.email().trim();

    return email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  });
  readonly canSend = computed(
    () =>
      this.configured() &&
      this.state() !== 'sending' &&
      this.message().trim().length > 0 &&
      !this.emailInvalid(),
  );

  async send(): Promise<void> {
    if (!this.canSend()) {
      return;
    }

    // Bots fill every field; people never see this one.
    if (this.trap()) {
      this.state.set('sent');
      return;
    }

    this.state.set('sending');

    const email = this.email().trim();

    try {
      const response = await fetch(`https://formspree.io/f/${encodeURIComponent(this.formId().trim())}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _subject: 'FE Growths suggestion',
          message: this.message().trim().slice(0, SUGGESTION_MAX_LENGTH),
          page: location.pathname,
          // Formspree uses `email` as the reply-to address.
          ...(email ? { email } : {}),
        }),
      });

      this.state.set(response.ok ? 'sent' : 'error');

      if (response.ok) {
        this.message.set('');
        this.email.set('');
      }
    } catch {
      this.state.set('error');
    }
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }
}
