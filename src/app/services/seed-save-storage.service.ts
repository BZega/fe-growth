import { Injectable, signal } from '@angular/core';
import { CURRENT_SAVE_VERSION, migrateSave, newSaveId, SeedMapDto, SeedSave } from '../models/seed-save';

const STORAGE_KEY = 'fe-growth.seed-saves';

@Injectable({ providedIn: 'root' })
export class SeedSaveStorageService {
  private dropped = 0;
  private readonly saveList = signal<SeedSave[]>(this.read());

  readonly saves = this.saveList.asReadonly();

  /** How many stored saves were deleted on start-up because they no longer fit the format. */
  readonly droppedOnLoad = this.dropped;

  get(id: string): SeedSave | null {
    return this.saveList().find((save) => save.id === id) ?? null;
  }

  create(name: string, seed: SeedMapDto): SeedSave {
    const save: SeedSave = {
      version: CURRENT_SAVE_VERSION,
      id: newSaveId(),
      name,
      savedAt: new Date().toISOString(),
      seed,
    };

    this.commit([...this.saveList(), save]);

    return save;
  }

  overwrite(id: string, seed: SeedMapDto): SeedSave | null {
    const existing = this.get(id);

    if (!existing) {
      return null;
    }

    const updated: SeedSave = {
      ...existing,
      seed,
      savedAt: new Date().toISOString(),
    };

    this.commit(this.saveList().map((s) => (s.id === id ? updated : s)));

    return updated;
  }

  rename(id: string, name: string): void {
    this.commit(
      this.saveList().map((save) => (save.id === id ? { ...save, name } : save)),
    );
  }

  remove(id: string): void {
    this.commit(this.saveList().filter((save) => save.id !== id));
  }

  upsert(save: SeedSave): SeedSave {
    const saves = this.saveList();
    const index = saves.findIndex((s) => s.id === save.id);

    if (index < 0) {
      this.commit([...saves, save]);
    } else {
      const next = [...saves];
      next[index] = save;
      this.commit(next);
    }

    return save;
  }

  private commit(saves: SeedSave[]): void {
    this.saveList.set(saves);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
    } catch {
    
    }
  }

  private read(): SeedSave[] {
    let parsed: unknown;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      parsed = raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }

    if (!Array.isArray(parsed)) {
      return [];
    }

    const saves = parsed.flatMap((entry) => {
      try {
        return [migrateSave(entry)];
      } catch {
        return [];
      }
    });

    this.dropped = parsed.length - saves.length;

    const upgraded = parsed.some(
      (entry) => (entry as { version?: unknown } | null)?.version !== CURRENT_SAVE_VERSION,
    );

    if (this.dropped > 0 || upgraded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
      } catch {
      }
    }

    return saves;
  }
}
