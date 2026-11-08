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
    spoilers.setAllHidden(false);
    fixture = TestBed.createComponent(BattalionsPageComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    spoilers.setAllHidden(true);
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

  it('switches to the stat list from the switch in the page header', () => {
    const switchButtons = host.querySelectorAll<HTMLButtonElement>('.browse-header app-layout-switch button');
    expect(Array.from(switchButtons).map((button) => button.textContent!.trim())).toEqual(['Table', 'Stat list']);

    switchButtons[1].click();
    fixture.detectChanges();

    const headers = Array.from(host.querySelectorAll('thead th')).map((cell) => cell.textContent!.trim());
    expect(headers).toEqual(['Battalion', 'Rank', 'Stat Bonus', 'Skill']);
  });

  it('puts the stat sort to the right of the switch, with arrows once a stat is picked', () => {
    const controls = () => host.querySelector('.browse-header__controls')!;
    expect(controls().querySelector('app-stat-sort')).toBeNull();

    controls().querySelectorAll<HTMLButtonElement>('app-layout-switch button')[1].click();
    fixture.detectChanges();

    expect(Array.from(controls().children).map((child) => child.tagName.toLowerCase())).toEqual([
      'app-layout-switch',
      'app-stat-sort',
    ]);
    expect(controls().querySelector('.stat-sort__arrows')).toBeNull();

    const select = controls().querySelector<HTMLSelectElement>('.stat-sort__select')!;
    expect(Array.from(select.options).map((option) => option.text)).not.toContain('HP');
    select.value = 'str';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const strengths = rows().map((row) => {
      const name = row.querySelector('th')!.textContent!.trim();
      return battalions.find((battalion) => battalion.name === name)!;
    });
    const firstGroup = strengths.filter((battalion) => battalion.type === strengths[0].type).map((b) => b.str);
    expect(firstGroup).toEqual([...firstGroup].sort((a, b) => b - a));
    expect(controls().querySelectorAll('.stat-sort__arrow').length).toBe(2);
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