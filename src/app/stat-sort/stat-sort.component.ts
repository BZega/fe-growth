import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { BONUS_STAT_LABELS, BonusStatKey } from '../models/growth.models';

export type StatSortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-stat-sort',
  template: `
    <label class="stat-sort__label">
      <select class="stat-sort__select" (change)="pick($any($event.target).value)">
        <option value="" [selected]="stat() === null">—</option>
        @for (key of stats(); track key) {
          <option [value]="key" [selected]="stat() === key">{{ labels[key] }}</option>
        }
      </select>
    </label>

    @if (stat()) {
      <div class="stat-sort__arrows" role="group" aria-label="Sort direction">
        <button
          type="button"
          class="stat-sort__arrow"
          [class.stat-sort__arrow--active]="direction() === 'desc'"
          [attr.aria-pressed]="direction() === 'desc'"
          aria-label="Highest first"
          (click)="direction.set('desc')"
        >
          ▼
        </button>
        <button
          type="button"
          class="stat-sort__arrow"
          [class.stat-sort__arrow--active]="direction() === 'asc'"
          [attr.aria-pressed]="direction() === 'asc'"
          aria-label="Lowest first"
          (click)="direction.set('asc')"
        >
          ▲
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .stat-sort__label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      white-space: nowrap;
    }

    .stat-sort__select {
      background: #1d222c;
      border: 1px solid var(--panel-border);
      border-radius: 6px;
      color: inherit;
      cursor: pointer;
      font-size: 0.85rem;
      padding: 0.3rem 0.45rem;
      text-transform: none;

      &:hover,
      &:focus {
        border-color: var(--accent);
      }
    }

    .stat-sort__arrows {
      display: inline-flex;
      gap: 0.25rem;
    }

    .stat-sort__arrow {
      width: 1.9rem;
      height: 1.9rem;
      background: transparent;
      border: 1px solid var(--panel-border);
      border-radius: 6px;
      color: var(--text);
      cursor: pointer;
      font-size: 0.7rem;
      opacity: 0.7;

      &:hover {
        border-color: var(--accent);
        opacity: 1;
      }
    }

    .stat-sort__arrow--active,
    .stat-sort__arrow--active:hover {
      border-color: var(--accent);
      color: var(--accent);
      opacity: 1;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatSortComponent {
  readonly stats = input.required<readonly BonusStatKey[]>();
  readonly stat = model<BonusStatKey | null>(null);
  readonly direction = model<StatSortDirection>('desc');

  readonly labels = BONUS_STAT_LABELS;

  pick(value: string): void {
    this.stat.set(value === '' ? null : (value as BonusStatKey));
    this.direction.set('desc');
  }
}
