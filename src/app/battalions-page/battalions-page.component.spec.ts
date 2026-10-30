import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SpoilerService } from '../services/spoiler.service';
import { BattalionsPageComponent } from './battalions-page.component';

describe('BattalionsPageComponent', () => {
  let fixture: ComponentFixture<BattalionsPageComponent>;
  let host: HTMLElement;
  let spoilers: SpoilerService;

  const groups = () =>
    Array.from(host.querySelectorAll('.group__label')).map((label) => label.textContent!.replace(/\s+/g, ' ').trim());
  const rowNamed = (name: string) =>
    Array.from(host.querySelectorAll<HTMLTableRowElement>('tbody tr:not(.group):not(.detail-row)')).find(
      (row) => row.querySelector('th')!.textContent!.trim() === name,
    );
  const names = () =>
    Array.from(host.querySelectorAll('tbody tr:not(.group):not(.detail-row) th')).map((cell) => cell.textContent!.trim());

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
    expect(groups()).toEqual(['Physical 18', 'Magic 16', 'Defense 18', 'Recovery 17']);
  });

  it('shows the flat stat bonuses, their total and the skill for each battalion', () => {
    const cells = Array.from(rowNamed('Novice Hunters')!.querySelectorAll('td')).map((cell) =>
      cell.innerText.replace(/\s+/g, ' ').trim(),
    );

    // Rank | HP Str Mag Spd Dex Def Res Lck Cha | Total | Skill
    expect(cells).toEqual([
      'E',
      '0', '1', '0', '0', '1', '0', '0', '0', '3',
      '5',
      'Disrupting Shot Counters flying units. On hit, prevents the foe from moving.',
    ]);
    expect(rowNamed('Novice Hunters')!.querySelector('.detail__title')!.textContent!.trim()).toBe('Disrupting Shot');
  });

  it('shows a Rank column right after the battalion name', () => {
    const headers = Array.from(host.querySelectorAll('thead th')).map((cell) => cell.textContent!.trim());

    expect(headers.slice(0, 3)).toEqual(['Battalion', 'Rank', 'HP']);
    expect(headers.at(-1)).toBe('Skill');
  });

  it('hides battalions named after spoiler characters while spoilers are hidden', () => {
    spoilers.hidden.set(true);
    fixture.detectChanges();

    expect(groups()).toEqual(['Physical 18', 'Magic 14', 'Defense 18', 'Recovery 15']);
    expect(rowNamed("Kalla's Divas")).toBeUndefined();
    expect(rowNamed("Aurora's Stargazers")).toBeUndefined();
    expect(rowNamed('Aegina Monks')).toBeDefined();
  });

  it('sorts each group by skill name from the Skill column', () => {
    const skillHeader = Array.from(host.querySelectorAll<HTMLButtonElement>('thead .sort')).find(
      (button) => button.textContent!.includes('Skill'),
    )!;
    skillHeader.click();
    fixture.detectChanges();

    const physical = names().slice(0, 18);
    const skills = physical.map((name) => rowNamed(name)!.querySelector('.detail__title')!.textContent!.trim());
    expect(skills).toEqual([...skills].sort((a, b) => a.localeCompare(b)));
    expect(skills[0]).toBe('All-Out Offensive');
  });
});
