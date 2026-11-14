import { ChangeDetectionStrategy, Component, HostListener, output, signal } from '@angular/core';

export const MOVE_NOTICE_KEY = 'fe-growth:hide-move-notice';

/** Tells visitors FE Growth is moving to FE Forge; can be dismissed for good. */
@Component({
  selector: 'app-move-notice-dialog',
  templateUrl: './move-notice-dialog.component.html',
  styleUrls: ['../exam-dialog/exam-dialog.component.scss', './move-notice-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoveNoticeDialogComponent {
  readonly closed = output<void>();

  readonly dontShowAgain = signal(false);

  @HostListener('document:keydown.escape')
  close(): void {
    if (this.dontShowAgain()) {
      try {
        localStorage.setItem(MOVE_NOTICE_KEY, 'true');
      } catch {
        // Without storage it just shows again next visit.
      }
    }

    this.closed.emit();
  }
}

export function moveNoticeHidden(): boolean {
  try {
    return localStorage.getItem(MOVE_NOTICE_KEY) === 'true';
  } catch {
    return false;
  }
}
