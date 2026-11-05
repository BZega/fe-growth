import { ChangeDetectionStrategy, Component, HostListener, output } from '@angular/core';
import { CASH_APP_TAG, VENMO_USERNAME } from '../support.config';

@Component({
  selector: 'app-support-dialog',
  templateUrl: './support-dialog.component.html',
  styleUrls: ['../exam-dialog/exam-dialog.component.scss', './support-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupportDialogComponent {
  readonly closed = output<void>();

  readonly links = [
    { label: 'Venmo', url: `https://venmo.com/u/${encodeURIComponent(VENMO_USERNAME)}` },
    { label: 'Cash App', url: `https://cash.app/$${encodeURIComponent(CASH_APP_TAG)}` },
  ];

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }
}
