import { Injectable, signal } from '@angular/core';

export interface CalculatorSelection {
  unitId: number | null;
  classId: number | null;
  mountId: number | null;
  mountLevel: number | null;
  classLevel: number | null;
}

const EMPTY: CalculatorSelection = {
  unitId: null,
  classId: null,
  mountId: null,
  mountLevel: null,
  classLevel: null,
};

@Injectable({ providedIn: 'root' })
export class CalculatorStateService {
  private readonly selections = new Map<string, CalculatorSelection>();
  private readonly slotOrder = signal<string[]>(['calc-1']);
  private nextId = 2;

  readonly slots = this.slotOrder.asReadonly();

  get(slotKey: string): CalculatorSelection {
    return this.selections.get(slotKey) ?? EMPTY;
  }

  set(slotKey: string, selection: CalculatorSelection): void {
    this.selections.set(slotKey, selection);
  }

  has(slotKey: string): boolean {
    return this.selections.has(slotKey);
  }

  clear(slotKey: string): void {
    this.selections.delete(slotKey);
  }

  addSlot(): void {
    this.slotOrder.update((slots) => [...slots, `calc-${this.nextId++}`]);
  }

  removeSlot(slotKey: string): void {
    if (this.slotOrder().length <= 1) {
      return;
    }

    this.selections.delete(slotKey);
    this.slotOrder.update((slots) => slots.filter((slot) => slot !== slotKey));
  }
}
