import { ComponentFixture, TestBed } from '@angular/core/testing';
import battalionData from '../data/battalions.json';
import { Battalion, BATTALION_TYPE_ORDER } from '../models/growth.models';
import { SpoilerService } from '../services/spoiler.service';
import { BattalionsPageComponent } from './battalions-page.component';

// Expectations come from the data file, so editing battalions.json doesn't break these tests.
const battalions = battalionData as Battalion[];

describe('BattalionsPageComponent', () => {
  let fixture: ComponentFixture<BattalionsPageComponent>;
  let host: HTMLElement;
  let spoilers: SpoilerService;

  const groups = () =>
    Array.from(host.querySelectorAll('.group__label')).map((label) => label.textContent!.replace(/\s+/g, ' ').trim());
  const expectedGroups = (shown: readonly Battalion[]) =>
    BATTALION_TYPE_ORDER.map((type) => [type, shown.filter((battalion) => battalion.type === type).length] as const)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `${type} ${count}`);
  const rows = () => Array.from(host.querySelectorAll<HTMLTableRowElement>('tbody tr:not(.group)'));
  const rowNamed = (name: string) => rows().find((row) => row.querySelector('th')!.textContent!.trim() === name);

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BattalionsPageComponent] });
    spoilers = TestBed.inject(SpoilerService);
    spoilers.hidden.set(false);
    fixture = TestBed.createComponent(BattalionsPageComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    spoilers.hidden.set(true);
    TestBed.flushEffects();
    fixture.destroy();
  });

  it('groups every battalion by type, in type order', () => {
    expect(groups()).toEqual(expectedGroups(battalions));
  });

  it('shows the rank, flat stat bonuses, their total and the skill for each battalion', () => {
    const first = battalions[0];
    const cells = Array.from(rowNamed(first.name)!.querySelectorAll('td')).map((cell) =>
      cell.innerText.replace(/\s+/g, ' ').trim(),
    );

    // Rank | Str Mag Spd Dex Def Res Lck Cha | Total | Skill (no battalion gives HP)
    expect(cells).toEqual([
      first.rank,
      ...[first.str, first.mag, first.spd, first.dex, first.def, first.res, first.lck, first.cha].map(String),
      String(first.total),
      `${first.skillName} ${first.skillDescription}`,
    ]);
  });

  it('shows a Rank column right after the battalion name, and no HP column', () => {
    const headers = Array.from(host.querySelectorAll('thead th')).map((cell) => cell.textContent!.trim());

    expect(headers.slice(0, 3)).toEqual(['Battalion', 'Rank', 'Str']);
    expect(headers).not.toContain('HP');
    expect(headers.at(-1)).toBe('Skill');
  });

  it('hides battalions named after spoiler characters while spoilers are hidden', () => {
    const named = battalions.filter((battalion) => spoilers.isNamedAfterSpoiler(battalion.name));
    expect(named.length).toBeGreaterThan(0);

    spoilers.hidden.set(true);
    fixture.detectChanges();

    expect(groups()).toEqual(expectedGroups(battalions.filter((battalion) => !named.includes(battalion))));
    for (const battalion of named) {
      expect(rowNamed(battalion.name)).toBeUndefined();
    }
  });

  it('sorts each group by skill name from the Skill column', () => {
    const skillHeader = Array.from(host.querySelectorAll<HTMLButtonElement>('thead .sort')).find(
      (button) => button.textContent!.includes('Skill'),
    )!;
    skillHeader.click();
    fixture.detectChanges();

    const physicalCount = battalions.filter((battalion) => battalion.type === 'Physical').length;
    const skills = rows()
      .slice(0, physicalCount)
      .map((row) => row.querySelector('.detail__title')!.textContent!.trim());
    expect(skills).toEqual([...skills].sort((a, b) => a.localeCompare(b)));
  });
});