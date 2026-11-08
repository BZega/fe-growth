import { ChangeDetectionStrategy, Component, model } from '@angular/core';

export type ListLayout = 'table' | 'bonus';

@Component({
  selector: 'app-layout-switch',
  template: `
    <div class="layout-switch" role="group" aria-label="List layout">
      @for (option of options; track option.key) {
        <button
          type="button"
          class="layout-switch__option"
          [class.layout-switch__option--active]="layout() === option.key"
          [attr.aria-pressed]="layout() === option.key"
          (click)="layout.set(option.key)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }

    .layout-switch {
      display: inline-flex;
      border: 1px solid var(--panel-border);
      border-radius: 6px;
      overflow: hidden;
    }

    .layout-switch__option {
      background: transparent;
      border: none;
      color: var(--text);
      cursor: pointer;
      font: inherit;
      font-size: 0.8rem;
      opacity: 0.7;
      padding: 0.35rem 0.75rem;

      & + & {
        border-left: 1px solid var(--panel-border);
      }

      &:hover {
        background: rgb(255 255 255 / 8%);
        opacity: 1;
      }
    }

    .layout-switch__option--active,
    .layout-switch__option--active:hover {
      background: rgb(240 192 74 / 15%);
      color: var(--accent);
      opacity: 1;
      font-weight: 600;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutSwitchComponent {
  readonly layout = model<ListLayout>('table');

  readonly options: readonly { key: ListLayout; label: string }[] = [
    { key: 'table', label: 'Table' },
    { key: 'bonus', label: 'Stat list' },
  ];
}
