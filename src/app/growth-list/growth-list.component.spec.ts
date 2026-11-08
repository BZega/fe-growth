import { ComponentFixture, TestBed } from '@angular/core/testing';
import { toGrowth } from '../models/growth.models';
import { GrowthListComponent, GrowthListGroup } from './growth-list.component';

describe('GrowthListComponent tag column', () => {
  let fixture: ComponentFixture<GrowthListComponent>;
  let host: HTMLElement;

  const row = (id: number, name: string, label: string, order: number) => ({
    id,
    name,
    growth: toGrowth(null),
    total: 0,
    tag: { label, order },
  });
  const names = () =>
    Array.from(host.querySelectorAll('tbody tr:not(.group) th')).map((cell) => cell.textContent!.trim());
  const sortByTag = () => {
    host.querySelector<HTMLButtonElement>('thead .list__tag .sort')!.click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [GrowthListComponent] });
    fixture = TestBed.createComponent(GrowthListComponent);
    host = fixture.nativeElement;
    const groups: GrowthListGroup[] = [
      { key: '', rows: [row(1, 'Bravo', 'E', 0), row(2, 'Alpha', 'S', 10), row(3, 'Charlie', 'C', 4), row(4, 'Delta', 'E', 0)] },
    ];
    fixture.componentRef.setInput('groups', groups);
    fixture.componentRef.setInput('tagHeader', 'Rank');
    fixture.detectChanges();
  });

  it('sorts highest rank first, then lowest first, then back to the original order', () => {
    // Like the other columns, a reversed sort also reverses the name order among equal ranks.
    sortByTag();
    expect(names()).toEqual(['Alpha', 'Charlie', 'Delta', 'Bravo']);

    sortByTag();
    expect(names()).toEqual(['Bravo', 'Delta', 'Charlie', 'Alpha']);

    sortByTag();
    expect(names()).toEqual(['Bravo', 'Alpha', 'Charlie', 'Delta']);
  });

  it('leaves out omitted stats, keeping group rows spanning every column', () => {
    fixture.componentRef.setInput('groups', [{ key: 'Group', rows: [row(1, 'Bravo', 'E', 0)] }]);
    fixture.componentRef.setInput('omitStats', ['hp']);
    fixture.detectChanges();

    const headers = Array.from(host.querySelectorAll('thead th')).map((cell) => cell.textContent!.trim());
    expect(headers).not.toContain('HP');
    expect(host.querySelector('tr.group th')!.getAttribute('colspan')).toBe(String(headers.length));
  });

  it('shows configured extra stats such as Movement', () => {
    fixture.componentRef.setInput('groups', [{
      key: '',
      rows: [{ id: 1, name: 'Bravo', growth: { ...toGrowth(null), mov: 1 }, total: 1 }],
    }]);
    fixture.componentRef.setInput('statKeys', ['mov']);
    fixture.componentRef.setInput('valueSuffix', '');
    fixture.detectChanges();

    const headers = Array.from(host.querySelectorAll('thead th')).map((cell) => cell.textContent!.trim());
    expect(headers).toContain('Mov');
    expect(host.querySelector('tbody tr:not(.group) td.positive')!.textContent!.trim()).toBe('1');
  });

  it('uses the configured display for zero-valued stats', () => {
    fixture.componentRef.setInput('groups', [{
      key: '',
      rows: [{ id: 1, name: 'Bravo', growth: toGrowth(null), total: 0 }],
    }]);
    fixture.componentRef.setInput('zeroDisplay', '—');
    fixture.detectChanges();

    expect(host.querySelector('tbody tr:not(.group) td:nth-child(3)')!.textContent!.trim()).toBe('—%');
  });

  it('leaves the column out when there is no tag header', () => {
    fixture.componentRef.setInput('tagHeader', null);
    fixture.detectChanges();

    expect(host.querySelector('.list__tag')).toBeNull();
  });
});

describe('GrowthListComponent stat list layout', () => {
  let fixture: ComponentFixture<GrowthListComponent>;
  let host: HTMLElement;

  const row = (id: number, name: string, bonuses: Partial<Record<'str' | 'spd' | 'dex', number>>) => ({
    id,
    name,
    growth: { ...toGrowth(null), ...bonuses },
    total: 0,
  });
  const names = (groupIndex: number) =>
    Array.from(host.querySelectorAll('tbody')[groupIndex].querySelectorAll('tr:not(.group) th')).map((cell) =>
      cell.textContent!.trim(),
    );
  const chips = (name: string) =>
    Array.from(host.querySelectorAll('tbody tr:not(.group)'))
      .find((tr) => tr.querySelector('th')!.textContent!.trim() === name)!
      .querySelectorAll('.chip');
  const sortBy = (stat: 'str' | 'spd' | null, direction: 'asc' | 'desc' = 'desc') => {
    fixture.componentRef.setInput('bonusSortStat', stat);
    fixture.componentRef.setInput('bonusSortDirection', direction);
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [GrowthListComponent] });
    fixture = TestBed.createComponent(GrowthListComponent);
    host = fixture.nativeElement;
    fixture.componentRef.setInput('groups', [
      { key: 'Ornius', rows: [row(1, 'Wild Ornius', { spd: 2, dex: 3 }), row(2, 'Tame Ornius', { str: 1, spd: 4 })] },
      { key: 'Horse', rows: [row(3, 'Pony', {}), row(4, 'Warhorse', { str: 3 })] },
    ]);
    fixture.componentRef.setInput('valueSuffix', '');
    fixture.componentRef.setInput('bonusLayout', true);
    fixture.detectChanges();
  });

  it('shows the per-stat columns and ignores the stat sort in the table layout', () => {
    sortBy('spd');
    fixture.componentRef.setInput('bonusLayout', false);
    fixture.detectChanges();

    expect(host.querySelector('.list__bonus')).toBeNull();
    expect(names(0)).toEqual(['Wild Ornius', 'Tame Ornius']);
  });

  it('lists only the non-zero bonuses in one Stat Bonus column', () => {
    const headers = Array.from(host.querySelectorAll('thead th')).map((cell) => cell.textContent!.trim());

    expect(headers).toEqual(['Name', 'Stat Bonus']);
    expect(Array.from(chips('Wild Ornius')).map((chip) => chip.textContent!.trim())).toEqual(['+2 Spd', '+3 Dex']);
    expect(chips('Pony')[0].textContent!.trim()).toBe('No bonuses');
  });

  it('sorts each section by the chosen stat in the chosen direction', () => {
    sortBy('spd');
    expect(names(0)).toEqual(['Tame Ornius', 'Wild Ornius']);

    sortBy('str');
    expect(names(1)).toEqual(['Warhorse', 'Pony']);

    sortBy('str', 'asc');
    expect(names(1)).toEqual(['Pony', 'Warhorse']);

    sortBy(null);
    expect(names(1)).toEqual(['Pony', 'Warhorse']);
    expect(names(0)).toEqual(['Wild Ornius', 'Tame Ornius']);
  });
});
