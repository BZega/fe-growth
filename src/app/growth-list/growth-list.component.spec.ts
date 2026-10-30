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

  it('leaves the column out when there is no tag header', () => {
    fixture.componentRef.setInput('tagHeader', null);
    fixture.detectChanges();

    expect(host.querySelector('.list__tag')).toBeNull();
  });
});
