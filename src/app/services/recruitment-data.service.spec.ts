import { TestBed } from '@angular/core/testing';
import { RECRUITMENT_FILES } from '../data/recruitment';
import { RawRecruitment } from '../models/recruitment.models';
import { RecruitmentDataService } from './recruitment-data.service';

// Expectations come from the files themselves, so editing them doesn't break these tests.
const files = RECRUITMENT_FILES as RawRecruitment[];

describe('RecruitmentDataService', () => {
  let service: RecruitmentDataService;

  beforeEach(() => {
    service = TestBed.inject(RecruitmentDataService);
  });

  it('has a recruitment entry for every file in the recruitment folder', () => {
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      expect(service.forUnit(file.UnitId)?.unitName).toBe(file.UnitId);
    }
    expect(service.forUnit('Nobody')).toBeNull();
  });

  it("reads each unit's own abilities, level-up abilities in level order, and bloodmark", () => {
    for (const file of files) {
      const unit = service.forUnit(file.UnitId)!;

      expect(unit.personalAbility?.name ?? null).toBe(file.PersonalAbility?.Name ?? null);
      expect(unit.bloodmark?.name ?? null).toBe(file.Bloodmark?.Name ?? null);
      expect(unit.levelUpAbilities.map((ability) => ability.level)).toEqual(
        (file.LevelUpPersonalAbilities ?? []).map((ability) => ability.LevelAcquired).sort((a, b) => a - b),
      );
    }
  });

  it("reads every route, and each chapter's level, class, stats and skill ranks", () => {
    for (const file of files) {
      const unit = service.forUnit(file.UnitId)!;

      expect(unit.routes.map((route) => route.key)).toEqual(file.Paths.map((path) => path.Path));

      for (const path of file.Paths) {
        const route = unit.routes.find((candidate) => candidate.key === path.Path)!;
        expect(route.recruitable).toBe(path.IsRecruitable);

        for (const raw of path.Chapters) {
          const chapter = route.chapters.find((candidate) => candidate.chapter === raw.Chapter)!;
          expect(chapter.level).toBe(raw.Level);
          expect(chapter.className).toBe(raw.ClassName);
          expect(chapter.stats.hp).toBe(raw.Stats!['Hp']);
          expect(chapter.stats.cha).toBe(raw.Stats!['Cha']);
          expect(chapter.skillRanks.blackMagic).toBe(raw.SkillRanks!['BlackMagic']);
          expect(chapter.skillRanks.heavyArmor).toBe(raw.SkillRanks!['HeavyArmor']);
        }
      }
    }
  });

  it('lists only the inventory that has entries, and only columns with a value', () => {
    for (const file of files) {
      for (const route of service.forUnit(file.UnitId)!.routes) {
        for (const chapter of route.chapters) {
          for (const group of chapter.inventory) {
            expect(group.entries.length).toBeGreaterThan(0);
            for (const column of group.columns) {
              expect(group.entries.some((entry) => entry.values[column] !== '')).toBeTrue();
            }
          }
        }
      }
    }
  });

  it('shows a weapon with its rank, uses and stats, leaving out columns no weapon has', () => {
    const troy = service.forUnit('Troy');
    const weapons = troy?.routes.flatMap((route) => route.chapters).flatMap((chapter) => chapter.inventory)
      .find((group) => group.label === 'Weapons');

    if (!weapons) {
      pending("Troy's file has no weapons to check against");
      return;
    }

    expect(weapons.columns).toContain('Rank');
    expect(weapons.columns).toContain('Mt');
    expect(weapons.entries[0].values['Rank']).toMatch(/^\w+ [A-Z+]+$/);
  });
});
