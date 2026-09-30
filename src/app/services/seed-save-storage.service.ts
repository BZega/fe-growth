import { Injectable, signal } from '@angular/core';
import { migrateSave, newSaveId, SeedDto, SeedSave } from '../models/seed-save';

const STORAGE_KEY = 'fe-growth.seed-saves';

@Injectable({ providedIn: 'root' })
export class SeedSaveStorageService {
  private readonly saveList = signal<SeedSave[]>(this.read());

  readonly saves = this.saveList.asReadonly();

  get(id: string): SeedSave | null {
    return this.saveList().find((save) => save.id === id) ?? null;
  }

  create(name: string, seeds: SeedDto[]): SeedSave {
    const save: SeedSave = {
      version: 1,
      id: newSaveId(),
      name,
      savedAt: new Date().toISOString(),
      seeds,
    };

    this.commit([...this.saveList(), save]);

    return save;
  }

  overwrite(id: string, seeds: SeedDto[]): SeedSave | null {
    const existing = this.get(id);

    if (!existing) {
      return null;
    }

    const updated: SeedSave = {
      ...existing,
      seeds,
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
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return [];
      }

      const parsed: unknown = JSON.parse(raw);

      return Array.isArray(parsed)
        ? parsed.flatMap((entry) => {
            try {
              return [migrateSave(entry)];
            } catch {
              return [];
            }
          })
        : [];
    } catch {
      return [];
    }
  }
}
