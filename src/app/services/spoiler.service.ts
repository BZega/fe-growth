import { computed, effect, Injectable, signal } from '@angular/core';

export type SpoilerTier = 'war' | 'salvation' | 'dlc';

export const SPOILER_TIERS: readonly { key: SpoilerTier; label: string }[] = [
  { key: 'war', label: 'War Arc' },
  { key: 'salvation', label: 'Salvation Arc' },
  { key: 'dlc', label: 'DLC' },
];

type HiddenTiers = Record<SpoilerTier, boolean>;

const STORAGE_KEY = 'fe-growth.hidden-spoiler-tiers';
const LEGACY_STORAGE_KEY = 'fe-growth.hide-spoilers';

const UNIT_TIERS: Readonly<Record<string, SpoilerTier>> = {
  Nathan: 'war',
  Creek: 'war',
  Tahonia: 'salvation',
  Aswan: 'salvation',
  Klapka: 'salvation',
  Centurio: 'salvation',
  Aurora: 'dlc',
  Jurah: 'dlc',
  Mars: 'dlc',
  Smyrnos: 'dlc',
  Credna: 'dlc',
  Kalla: 'dlc',
  Cleobulus: 'dlc',
  Myson: 'dlc',
  Anna: 'dlc',
  Gladius: 'dlc',
};

const DLC_CLASS_NAMES: ReadonlySet<string> = new Set([
  'Trickster',
  'Awakened',
  'Seere',
  'Badhbh Cath',
]);

const SALVATION_CLASS_RANKS: ReadonlySet<string> = new Set(['Master', 'Divine']);

@Injectable({ providedIn: 'root' })
export class SpoilerService {
  readonly hiddenTiers = signal<HiddenTiers>(read());
  readonly hidden = computed(() => Object.values(this.hiddenTiers()).some(Boolean));

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.hiddenTiers()));
      } catch {
        
      }
    });
  }

  isHidden(tier: SpoilerTier): boolean {
    return this.hiddenTiers()[tier];
  }

  setHidden(tier: SpoilerTier, hidden: boolean): void {
    this.hiddenTiers.update((tiers) => ({ ...tiers, [tier]: hidden }));
  }

  setAllHidden(hidden: boolean): void {
    this.hiddenTiers.set(allTiers(hidden));
  }

  toggle(tier: SpoilerTier): void {
    this.setHidden(tier, !this.isHidden(tier));
  }

  isSpoiler(item: { name: string; rank?: string }): boolean {
    const tiers = this.hiddenTiers();
    const unitTier = UNIT_TIERS[item.name];

    if (unitTier) {
      return tiers[unitTier];
    }

    // DLC classes are also Master rank, so they only show once both Salvation Arc and DLC are revealed.
    if (DLC_CLASS_NAMES.has(item.name) && tiers.dlc) {
      return true;
    }

    return item.rank !== undefined && SALVATION_CLASS_RANKS.has(item.rank) && tiers.salvation;
  }

  filter<T extends { name: string; rank?: string }>(items: readonly T[]): T[] {
    return items.filter((item) => !this.isSpoiler(item));
  }
}

function allTiers(hidden: boolean): HiddenTiers {
  return { war: hidden, salvation: hidden, dlc: hidden };
}

function read(): HiddenTiers {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored) {
      const parsed = JSON.parse(stored) as Partial<HiddenTiers>;
      return {
        war: parsed.war !== false,
        salvation: parsed.salvation !== false,
        dlc: parsed.dlc !== false,
      };
    }

    // Carry over the old single toggle.
    return allTiers(localStorage.getItem(LEGACY_STORAGE_KEY) !== 'false');
  } catch {
    return allTiers(true);
  }
}
