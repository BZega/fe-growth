import { effect, Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'fe-growth.hide-spoilers';

const SPOILER_UNIT_NAMES: ReadonlySet<string> = new Set([
  'Creek',
  'Nathan',
  'Bertrand',
  'Talimun',
  'Anatolia',
  'Orchel',
  'Centurio',
  'Aswan',
  'Tahonia',
  'Klapka',
]);

@Injectable({ providedIn: 'root' })
export class SpoilerService {
  readonly hidden = signal(read());

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, String(this.hidden()));
      } catch {
        
      }
    });
  }

  toggle(): void {
    this.hidden.update((hidden) => !hidden);
  }

  isSpoiler(name: string): boolean {
    return SPOILER_UNIT_NAMES.has(name);
  }

  filter<T extends { name: string }>(items: readonly T[]): T[] {
    return this.hidden()
      ? items.filter((item) => !this.isSpoiler(item.name))
      : [...items];
  }
}

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}
