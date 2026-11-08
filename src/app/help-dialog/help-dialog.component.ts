import { ChangeDetectionStrategy, Component, HostListener, input, signal } from '@angular/core';

@Component({
  selector: 'app-help-dialog',
  templateUrl: './help-dialog.component.html',
  styleUrl: './help-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpDialogComponent {
  readonly heading = input.required<string>();
  readonly paragraphs = input.required<readonly string[]>();
  readonly open = signal(false);

  close(): void {
    this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}