import { Injectable } from '@angular/core';
import { RECRUITMENT_FILES } from '../data/recruitment';
import { characterKey, SKILL_KEYS, SkillKey, STAT_KEYS, toGrowth } from '../models/growth.models';
import {
  InventoryEntry,
  InventoryGroup,
  RawAbility,
  RawChapter,
  RawPath,
  RawRecruitment,
  RecruitmentChapter,
  RecruitmentRoute,
  routeLabel,
  UnitRecruitment,
} from '../models/recruitment.models';

type Row = Record<string, unknown>;

/** Each inventory list in the files, and the columns to show for it, in order. */
const INVENTORY_LAYOUT: readonly {
  key: string;
  label: string;
  columns: readonly [label: string, value: (row: Row) => unknown][];
}[] = [
  {
    key: 'Weapons',
    label: 'Weapons',
    columns: [
      ['Rank', (row) => skillRank(row['Skill'])],
      ['Uses', (row) => row['Durability']],
      ['Mt', (row) => row['Mt']],
      ['Hit', (row) => row['Hit']],
      ['Crit', (row) => row['Crit']],
      ['Wt', (row) => row['Wt']],
      ['Avo', (row) => row['Avo']],
      ['Rng', (row) => row['Range']],
      ['Curse', (row) => row['Curse']],
      ['Effective', (row) => row['EffectiveType']],
    ],
  },
  {
    key: 'MagicTomes',
    label: 'Black Magic',
    columns: [
      ['Uses', (row) => row['Uses']],
      ['Mt', (row) => row['Mt']],
      ['Hit', (row) => row['Hit']],
      ['Crit', (row) => row['Crit']],
      ['Wt', (row) => row['Wt']],
      ['Avo', (row) => row['Avo']],
      ['Rng', (row) => row['Range']],
      ['Curse', (row) => row['Curse']],
    ],
  },
  {
    key: 'WhiteTomes',
    label: 'White Magic',
    columns: [
      ['Uses', (row) => row['Uses']],
      ['Pwr', (row) => row['Pwr']],
      ['Hit', (row) => row['Hit']],
      ['Crit', (row) => row['Crit']],
      ['Wt', (row) => row['Wt']],
      ['Avo', (row) => row['Avo']],
      ['Rng', (row) => row['Range']],
      ['Curse', (row) => row['Curse']],
    ],
  },
  {
    key: 'CombatArts',
    label: 'Combat Arts',
    columns: [
      ['Type', (row) => row['SkillType']],
      ['Cost', (row) => row['Cost']],
      ['Mt', (row) => row['Mt']],
      ['Hit', (row) => row['Hit']],
      ['Crit', (row) => row['Crit']],
      ['Rng', (row) => row['Rng']],
    ],
  },
  {
    key: 'Items',
    label: 'Items',
    columns: [
      ['Uses', (row) => row['Durability']],
      ['Mt', (row) => row['Mt']],
      ['Hit', (row) => row['Hit']],
      ['Crit', (row) => row['Crit']],
      ['Wt', (row) => row['Wt']],
      ['Avo', (row) => row['Avo']],
      ['Rng', (row) => row['Range']],
    ],
  },
];

/**
 * Recruitment details per unit, from the files in src/app/data/recruitment. Kept apart from
 * GrowthDataService so only the character page loads them.
 */
@Injectable({ providedIn: 'root' })
export class RecruitmentDataService {
  private readonly byUnit = new Map(
    (RECRUITMENT_FILES as RawRecruitment[]).map((file) => [file.UnitId, toRecruitment(file)]),
  );

  forUnit(unitName: string): UnitRecruitment | null {
    return this.byUnit.get(characterKey(unitName)) ?? null;
  }

  /** Routes that list at least one chapter, i.e. ones a stat projection can start from. */
  routesWithChapters(unitName: string): readonly RecruitmentRoute[] {
    return this.forUnit(unitName)?.routes.filter((route) => route.chapters.length > 0) ?? [];
  }
}

function toRecruitment(file: RawRecruitment): UnitRecruitment {
  return {
    unitName: file.UnitId,
    personalAbility: toAbility(file.PersonalAbility),
    bloodmark: toAbility(file.Bloodmark),
    levelUpAbilities: (file.LevelUpPersonalAbilities ?? [])
      .map((ability) => ({ ...toAbility(ability)!, level: ability.LevelAcquired }))
      .sort((a, b) => a.level - b.level),
    routes: (file.Paths ?? []).map(toRoute),
  };
}

function toRoute(path: RawPath): RecruitmentRoute {
  const requirement = path.Requirement;

  return {
    key: path.Path,
    label: routeLabel(path.Path),
    recruitable: path.IsRecruitable,
    requirement: requirement
      ? {
          supportLevel: requirement.SupportLv,
          renownLevel: requirement.RenownLv,
          negotiation: requirement.RecruitmentNegotiation,
        }
      : null,
    chapters: (path.Chapters ?? []).map(toChapter).sort((a, b) => a.chapter - b.chapter),
  };
}

function toChapter(chapter: RawChapter): RecruitmentChapter {
  const skillRanks: Partial<Record<SkillKey, string>> = {};

  for (const [key, rank] of Object.entries(chapter.SkillRanks ?? {})) {
    const skill = (key.charAt(0).toLowerCase() + key.slice(1)) as SkillKey;

    if (SKILL_KEYS.includes(skill) && rank) {
      skillRanks[skill] = rank;
    }
  }

  const stats = Object.fromEntries(
    Object.entries(chapter.Stats ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    chapter: chapter.Chapter,
    level: chapter.Level,
    className: chapter.ClassName,
    skillRanks,
    stats: toGrowth(Object.fromEntries(STAT_KEYS.map((stat) => [stat, stats[stat] ?? 0]))),
    inventory: toInventory(chapter.Inventory ?? {}),
    equippedAbilities: (chapter.EquippedAbilities ?? []).map((ability) => toAbility(ability)!),
  };
}

function toInventory(inventory: Record<string, Row[] | null>): InventoryGroup[] {
  return INVENTORY_LAYOUT.map(({ key, label, columns }) => {
    const rows = inventory[key] ?? [];
    const entries: InventoryEntry[] = rows.map((row) => ({
      name: String(row['Name'] ?? ''),
      description: String(row['Description'] ?? ''),
      values: Object.fromEntries(columns.map(([column, value]) => [column, display(value(row))])),
    }));

    return {
      label,
      columns: columns
        .map(([column]) => column)
        .filter((column) => entries.some((entry) => entry.values[column] !== '')),
      entries,
    };
  }).filter((group) => group.entries.length > 0);
}

// Some files hold an empty list instead of null when there's nothing to show.
function toAbility(ability: RawAbility | readonly unknown[] | null | undefined): { name: string; description: string } | null {
  return ability && !Array.isArray(ability) && (ability as RawAbility).Name
    ? { name: (ability as RawAbility).Name, description: (ability as RawAbility).Description }
    : null;
}

function skillRank(skill: unknown): string {
  const value = skill as { SkillType?: string; SkillRank?: string } | null;

  return value?.SkillType ? `${value.SkillType} ${value.SkillRank ?? ''}`.trim() : '';
}

// "--", null and empty lists mean the stat doesn't apply.
function display(value: unknown): string {
  if (value === null || value === undefined || value === '--') {
    return '';
  }

  return Array.isArray(value) ? value.join(', ') : String(value);
}
