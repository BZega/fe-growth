import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import unitClassData from '../data/unit-classes.json';
import unitData from '../data/units.json';
import skillPreferenceData from '../data/unit-skill-preferences.json';
import { characterKey, growthTotal, SKILL_KEYS, SKILL_LABELS, STAT_KEYS, STAT_LABELS, sumGrowth, toGrowth, Unit, UnitClass } from '../models/growth.models';
import { RecruitmentChapter, RecruitmentRoute, UnitRecruitment } from '../models/recruitment.models';
import { GrowthDataService } from '../services/growth-data.service';
import { RecruitmentDataService } from '../services/recruitment-data.service';
import { CharacterPageComponent } from './character-page.component';

const units = unitData as Omit<Unit, 'skillPreference'>[];
const classes = unitClassData as UnitClass[];

function chapter(number: number, className: string, str: number): RecruitmentChapter {
  return {
    chapter: number,
    level: 20 + number,
    className,
    skillRanks: { sword: 'C', axe: 'E', blackMagic: 'B', whiteMagic: 'D', authority: 'C', infantry: 'E' },
    stats: { ...toGrowth(null), hp: 30, str },
    inventory: [],
    equippedAbilities: [{ name: 'Sword Lv. 2', description: 'Hit+5.' }],
  };
}

function route(key: string, chapters: RecruitmentChapter[], recruitable = true): RecruitmentRoute {
  return {
    key,
    label: key === 'WarArc' ? 'War Arc' : key,
    recruitable,
    requirement: { supportLevel: 3, renownLevel: 8, negotiation: 'Give 3,000G' },
    chapters,
  };
}

describe('CharacterPageComponent recruitment', () => {
  let fixture: ComponentFixture<CharacterPageComponent>;
  let host: HTMLElement;
  let recruitment: UnitRecruitment | null;

  const unit = units.find((candidate) => candidate.name === 'Hong Hua')!;
  const text = (selector: string) =>
    Array.from(host.querySelectorAll<HTMLElement>(selector)).map((element) => element.textContent!.replace(/\s+/g, ' ').trim());
  const pill = (section: string, label: string) =>
    Array.from(host.querySelectorAll<HTMLElement>(`section[aria-labelledby="${section}"] :is(.stat-row, .skill-rank)`))
      .find((item) => item.querySelector('.stat-row__label, .skill-rank__label')!.textContent!.trim() === label)
      ?.querySelector('.stat-row__value, .skill-rank__value')!.textContent!.trim();
  const skillLabels = (selector = '.skill-rank') => text(`section[aria-labelledby="ranks-title"] ${selector} .skill-rank__label`);
  const openRecruitment = () => {
    Array.from(host.querySelectorAll<HTMLButtonElement>('.tabs__tab'))
      .find((tab) => tab.textContent!.includes('Recruitment'))!
      .click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    recruitment = {
      unitName: unit.name,
      personalAbility: { name: 'Zhu Ming', description: 'Hit+10.' },
      bloodmark: { name: 'Diadem', description: 'Hit+20.' },
      levelUpAbilities: [{ name: 'Amplify Magic', description: 'Atk+4.', level: 50 }],
      routes: [
        route('Prologue', [chapter(1, 'Ovate', 15), chapter(3, 'Noble/Commoner', 6)]),
        route('Leda', []),
        route('WarArc', [chapter(2, 'Ovate', 31)], false),
      ],
    };

    TestBed.configureTestingModule({
      imports: [CharacterPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: String(unit.id) })) } },
        { provide: RecruitmentDataService, useValue: { forUnit: () => recruitment } },
      ],
    });
    fixture = TestBed.createComponent(CharacterPageComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('shows the personal ability, level-up abilities and bloodmark with the name, above the tabs', () => {
    const header = host.querySelector('.page-header')!;

    expect(header.querySelector('h1')!.textContent).toContain('Hong Hua');
    expect(text('.page-header .section-title')).toEqual(['Personal Ability', 'Level-Up Personal Abilities', 'Bloodmark']);
    expect(text('.page-header .ability__name')).toEqual(['Zhu Ming', 'Amplify Magic', 'Diadem']);
    expect(text('.page-header .tag')).toEqual(['Lv 50']);
    expect(header.compareDocumentPosition(host.querySelector('.tabs')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows a tab only for routes with chapters, recruitable or not', () => {
    openRecruitment();

    expect(text('.route-tabs__tab')).toEqual(['Prologue', 'War Arc']);
    expect(text('.route-status .tag')).toEqual(['Recruitable']);
    expect(text('.route-status__requirement')).toEqual(['Give 3,000G · Support Lv 3 · Renown Lv 8']);
  });

  it("offers the route's chapters and shows the chosen one", () => {
    openRecruitment();

    expect(text('.chapter-picker option')).toEqual(['Chapter 1', 'Chapter 3']);
    expect([...text('.profile__class'), pill('stats-title', 'Lv')]).toEqual(['Ovate', '21']);

    const select = host.querySelector<HTMLSelectElement>('.chapter-picker select')!;
    select.value = '3';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect([...text('.profile__class'), pill('stats-title', 'Lv')]).toEqual(['Noble/Commoner', '23']);
  });

  it('switches to the chosen route, starting at its first chapter', () => {
    openRecruitment();
    host.querySelectorAll<HTMLButtonElement>('.route-tabs__tab')[1].click();
    fixture.detectChanges();

    expect(text('.chapter-picker option')).toEqual(['Chapter 2']);
    expect(text('.route-status .tag')).toEqual(['Not recruitable']);
    expect(host.querySelector('.route-status__requirement')).toBeNull();
  });

  it('works out Mov from the class, Bld from Str, and growths from unit plus class', () => {
    openRecruitment();
    const ovate = classes.find((candidate) => candidate.name === 'Ovate')!;
    const growth = sumGrowth(toGrowth(unit), toGrowth(ovate));

    expect(pill('stats-title', 'Mov')).toBe(String(4 + ovate.bonusStats.mov));
    expect(pill('stats-title', 'Bld')).toBe(String(Math.max(1, Math.floor((15 + ovate.bonusStats.str) / 5))));
    for (const stat of STAT_KEYS) {
      expect(pill('stats-title', STAT_LABELS[stat])).toBe(String(chapter(1, 'Ovate', 15).stats[stat] + ovate.bonusStats[stat]));
    }
    expect(pill('growth-title', 'Mag')).toBe(`${growth.mag}%`);
    expect(text('section[aria-labelledby="growth-title"] .section-hint')).toEqual([`Total ${growthTotal(growth)}%`]);
    expect(skillLabels()).toEqual(
      SKILL_KEYS.filter((skill) => chapter(1, 'Ovate', 15).skillRanks[skill]).map((skill) => SKILL_LABELS[skill]),
    );
    expect(fixture.componentInstance.chapterView()!.skillRanks.map((skill) => skill.usable)).toEqual(
      SKILL_KEYS.filter((skill) => chapter(1, 'Ovate', 15).skillRanks[skill]).map((skill) => ovate.skills[skill] || skill === 'authority'),
    );
    expect(text('section[aria-labelledby="equipped-title"] .ability__name')).toEqual(['Sword Lv. 2']);
  });

  it('updates class bonuses and highlights usable skills while keeping all ranks when the chapter changes', () => {
    recruitment!.routes = [route('Prologue', [chapter(1, 'Gladiator', 9), chapter(3, 'Noble/Commoner', 9)])];
    fixture = TestBed.createComponent(CharacterPageComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
    openRecruitment();

    expect(pill('stats-title', 'HP')).toBe('31');
    expect(pill('stats-title', 'Str')).toBe('10');
    expect(pill('stats-title', 'Bld')).toBe('2');
    expect(skillLabels()).toEqual(['Sword', 'Axe', 'Black Magic', 'White Magic', 'Authority', 'Infantry']);
    expect(skillLabels('.skill-rank--usable')).toEqual(['Sword', 'Axe', 'Authority', 'Infantry']);
    expect(pill('ranks-title', 'Axe')).toBe('E');

    const select = host.querySelector<HTMLSelectElement>('.chapter-picker select')!;
    select.value = '3';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(pill('stats-title', 'HP')).toBe('30');
    expect(pill('stats-title', 'Str')).toBe('9');
    expect(pill('stats-title', 'Bld')).toBe('1');
    expect(skillLabels()).toEqual(['Sword', 'Axe', 'Black Magic', 'White Magic', 'Authority', 'Infantry']);
    expect(skillLabels('.skill-rank--usable')).toEqual(['Sword', 'Axe', 'Black Magic', 'White Magic', 'Authority', 'Infantry']);
    expect(recruitment!.routes[0].chapters[0].stats.str).toBe(9);
  });

  it('keeps the class Authority flag for mounted classes', () => {
    const mountedClasses = classes.filter((candidate) => ['Light Cavalry', 'Bow Knight'].includes(candidate.name));
    recruitment!.routes = [route('Prologue', mountedClasses.map((candidate, index) => chapter(index + 1, candidate.name, 9)))];
    fixture = TestBed.createComponent(CharacterPageComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
    openRecruitment();

    for (const [index, unitClass] of mountedClasses.entries()) {
      fixture.componentInstance.selectedChapter.set(index + 1);
      fixture.detectChanges();

      expect(fixture.componentInstance.chapterView()!.skillRanks.find((skill) => skill.label === 'Authority')!.usable)
        .toBe(unitClass.skills.authority);
      expect(pill('ranks-title', 'Authority')).toBe('C');
    }
  });

  it('puts HP in the class summary and lays stats out Str-Dex left, Def-Cha right, with growth HP on its own row', () => {
    openRecruitment();
    const column = (section: Element) => {
      const rows = Array.from(section.querySelectorAll<HTMLElement>('.stat-row'));
      const left = Math.min(...rows.map((row) => row.getBoundingClientRect().left));
      const label = (row: HTMLElement) => row.querySelector('.stat-row__label')!.textContent!.trim();
      const at = (side: 'left' | 'right') => rows
        .filter((row) => !row.classList.contains('stat-row--wide'))
        .filter((row) => (row.getBoundingClientRect().left === left) === (side === 'left'))
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
        .map(label);
      return { wide: rows.filter((row) => row.classList.contains('stat-row--wide')).map(label), left: at('left'), right: at('right') };
    };

    expect(text('.profile .stat-row__label')).toEqual(['HP', 'Lv', 'Mov', 'Bld']);
    const profile = column(host.querySelector('.profile')!);
    expect(profile).toEqual({ wide: ['HP', 'Lv'], left: ['Mov'], right: ['Bld'] });
    const profileValue = (label: string) =>
      Array.from(host.querySelectorAll('.profile .stat-row'))
        .find((row) => row.querySelector('.stat-row__label')!.textContent!.trim() === label)!
        .querySelector('.stat-row__value')!.getBoundingClientRect();
    expect(profileValue('HP').right).toBeCloseTo(profileValue('Mov').right, 0);
    expect(profileValue('Lv').right).toBeCloseTo(profileValue('Mov').right, 0);
    expect(profileValue('HP').top).toBeLessThan(profileValue('Lv').top);
    expect(profileValue('Lv').top).toBeLessThan(profileValue('Mov').top);
    const stats = column(host.querySelectorAll('section[aria-labelledby="stats-title"]')[1]);
    expect(stats).toEqual({ wide: [], left: ['Str', 'Mag', 'Spd', 'Dex'], right: ['Def', 'Res', 'Lck', 'Cha'] });
    const growths = column(host.querySelector('section[aria-labelledby="growth-title"]')!);
    expect(growths).toEqual({ wide: ['HP'], left: ['Str', 'Mag', 'Spd', 'Dex'], right: ['Def', 'Res', 'Lck', 'Cha'] });
    const growthValue = (label: string) =>
      Array.from(host.querySelectorAll('section[aria-labelledby="growth-title"] .stat-row'))
        .find((row) => row.querySelector('.stat-row__label')!.textContent!.trim() === label)!
        .querySelector('.stat-row__value')!.getBoundingClientRect().right;
    expect(growthValue('HP')).toBeCloseTo(growthValue('Str'), 0);
  });

  it('fits all twelve skill ranks into two rows of icon tiles', () => {
    recruitment!.routes = [route('Prologue', [{
      ...chapter(1, 'Ovate', 15),
      skillRanks: Object.fromEntries(SKILL_KEYS.map((skill) => [skill, 'E'])),
    }])];
    fixture = TestBed.createComponent(CharacterPageComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
    openRecruitment();

    const tiles = Array.from(host.querySelectorAll<HTMLElement>('.skill-rank'));
    expect(tiles.length).toBe(12);
    expect(new Set(tiles.map((tile) => Math.round(tile.getBoundingClientRect().top))).size).toBe(2);
    expect(tiles[0].getAttribute('title')).toBe('Sword');
    expect(host.querySelector<HTMLElement>('.skill-rank__label')!.getBoundingClientRect().width).toBeLessThanOrEqual(1);
  });

  it("colors each Skill Lv icon by the character's preference: good gold, neutral black, bad silver", () => {
    openRecruitment();
    const component = fixture.componentInstance;

    expect(component.unit()!.skillPreference.sword).toBe('neutral');
    expect(host.querySelector<HTMLImageElement>('.skill-rank__icon')!.getAttribute('src')).toBe('icons/skills/black/sword.svg');
    expect(component.skillIcon('axe', 'good')).toBe('icons/skills/gold/axe.svg');
    expect(component.skillIcon('axe', 'neutral')).toBe('icons/skills/black/axe.svg');
    expect(component.skillIcon('axe', 'bad')).toBe('icons/skills/silver/axe.svg');
  });

  it('has one preference entry per character, with every skill set to good, neutral or bad', () => {
    const preferences = skillPreferenceData as Record<string, Record<string, string>>;

    expect(Object.keys(preferences).sort()).toEqual([...new Set(units.map((candidate) => characterKey(candidate.name)))].sort());
    for (const preference of Object.values(preferences)) {
      expect(Object.keys(preference)).toEqual([...SKILL_KEYS]);
      for (const value of Object.values(preference)) {
        expect(['good', 'neutral', 'bad']).toContain(value);
      }
    }
  });

  it('gives unit variants the preferences written for their character', () => {
    let all: Unit[] = [];
    TestBed.inject(GrowthDataService).getUnits().subscribe((loaded) => (all = loaded));
    const preferenceOf = (name: string) => all.find((candidate) => candidate.name === name)!.skillPreference;

    expect(preferenceOf('Mu*')).toEqual(preferenceOf('Mu'));
    expect(preferenceOf('Eshmel (M)')).toEqual(preferenceOf('Eshmel (F)'));
    expect(preferenceOf('Eshmel (M)')).toEqual((skillPreferenceData as Record<string, Unit['skillPreference']>)['Eshmel']);
  });

  it('stacks growths over the stat block and lists inventory above Skill Lv', () => {
    recruitment!.routes = [route('Prologue', [{
      ...chapter(1, 'Ovate', 15),
      inventory: [
        {
          label: 'Weapons',
          columns: ['Mt', 'Curse'],
          entries: [{ name: 'Iron Sword', description: 'A plain sword.', values: { Mt: '5', Curse: '' } }],
        },
        {
          label: 'Combat Arts',
          columns: ['Cost'],
          entries: [{ name: 'Tempest Spear', description: 'High Hit.', values: { Cost: '2' } }],
        },
      ],
    }])];
    fixture = TestBed.createComponent(CharacterPageComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
    openRecruitment();

    const [left, middle, right] = Array.from(host.querySelectorAll('.sheet__col'));
    expect(Array.from(left.querySelectorAll('h2')).map((h) => h.textContent!.trim())).toEqual(['Growth Rates', 'Basic Stats']);
    expect(Array.from(middle.querySelectorAll('h2')).map((h) => h.textContent!.trim())).toEqual(['Weapons', 'Skill Lv']);
    expect(Array.from(right.querySelectorAll('h2')).map((h) => h.textContent!.trim())).toEqual(['Equipped Abilities', 'Combat Arts']);
    expect(text('.inventory__item')).toEqual(['Iron Sword', 'Tempest Spear']);
    expect(text('.inventory__stat')).toEqual(['Mt 5', 'Cost 2']);
  });

  it('says there is no recruitment data when no route has chapters', () => {
    recruitment = { ...recruitment!, routes: [route('Leda', [])] };
    fixture = TestBed.createComponent(CharacterPageComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
    openRecruitment();

    expect(host.querySelector('.route-tabs')).toBeNull();
    expect(text('.empty--boxed')).toEqual(['No recruitment data for Hong Hua yet.']);
  });
});

describe("CharacterPageComponent Mu's recruitment", () => {
  const mu = units.find((candidate) => candidate.name === 'Mu')!;
  const muStar = units.find((candidate) => candidate.name === 'Mu*')!;

  const open = (unitName: string) => {
    const id = units.find((candidate) => candidate.name === unitName)!.id;

    TestBed.configureTestingModule({
      imports: [CharacterPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: String(id) })) } },
      ],
    });
    const fixture = TestBed.createComponent(CharacterPageComponent);
    const host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    Array.from(host.querySelectorAll<HTMLButtonElement>('.tabs__tab'))
      .find((tab) => tab.textContent!.includes('Recruitment'))!
      .click();
    fixture.detectChanges();

    const growthRow = (label: string) =>
      Array.from(host.querySelectorAll<HTMLElement>('section[aria-labelledby="growth-title"] .stat-row')).find(
        (row) => row.querySelector('.stat-row__label')!.textContent!.trim() === label,
      )!;

    return { fixture, host, growthRow };
  };

  for (const name of ['Mu', 'Mu*']) {
    it(`loads Mu.json for ${name}`, () => {
      const { fixture } = open(name);

      expect(fixture.componentInstance.recruitment()?.unitName).toBe('Mu');
      expect(fixture.componentInstance.chapter()?.className).toBe('Noble/Commoner');
    });

    it(`shows Mu*'s growth rates for ${name}, with Mu's base plus the bonus on hover`, () => {
      const { growthRow } = open(name);
      const noble = classes.find((candidate) => candidate.name === 'Noble/Commoner')!;
      const hp = growthRow('HP');

      expect(hp.querySelector('.stat-row__value')!.textContent!.trim()).toBe(`${muStar.hp + noble.hp}%`);
      expect(hp.getAttribute('title')).toBe(`Base: ${mu.hp + noble.hp}% + Bonus: ${muStar.hp - mu.hp}%`);
    });
  }

  it('gives every stat the same +20 bonus over Mu', () => {
    expect(STAT_KEYS.map((stat) => muStar[stat] - mu[stat])).toEqual(STAT_KEYS.map(() => 20));
  });

  it("doesn't show a Bloodmark when the file has none", () => {
    const { host } = open('Mu');

    expect(Array.from(host.querySelectorAll('.page-header .section-title')).map((title) => title.textContent!.trim()))
      .not.toContain('Bloodmark');
  });

  it("leaves other characters' growths without a breakdown", () => {
    const { host } = open('Hong Hua');

    expect(host.querySelector('section[aria-labelledby="growth-title"] .stat-row[title]')).toBeNull();
  });
});
