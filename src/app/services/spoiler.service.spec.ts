import { TestBed } from '@angular/core/testing';
import { SpoilerService } from './spoiler.service';

describe('SpoilerService tiers', () => {
  let spoilers: SpoilerService;

  const shown = (...items: { name: string; rank?: string }[]) =>
    spoilers.filter(items).map((item) => item.name);

  beforeEach(() => {
    TestBed.configureTestingModule({});
    spoilers = TestBed.inject(SpoilerService);
    spoilers.setAllHidden(false);
  });

  afterEach(() => {
    spoilers.setAllHidden(true);
    TestBed.flushEffects();
  });

  it('hides only the characters in a hidden tier', () => {
    spoilers.setHidden('war', true);

    expect(shown({ name: 'Nathan' }, { name: 'Creek' }, { name: 'Tahonia' }, { name: 'Kalla' })).toEqual([
      'Tahonia',
      'Kalla',
    ]);
  });

  it('hides Master and Divine classes with the Salvation Arc tier', () => {
    spoilers.setHidden('salvation', true);

    expect(
      shown({ name: 'Aswan' }, { name: 'Swordmaster', rank: 'Advanced' }, { name: 'Paladin', rank: 'Master' }, { name: 'God', rank: 'Divine' }),
    ).toEqual(['Swordmaster']);
  });

  it('hides the Salvation Arc mounts and Elephant Rider with the Salvation Arc tier', () => {
    const items = [
      { name: 'Wild Horse' },
      { name: 'Black Horse' },
      { name: 'Red Falicorn' },
      { name: 'Red Bau' },
      { name: 'Black Bau' },
      { name: 'Saramis War Elephant' },
      { name: 'Elephant Rider', rank: 'Advanced' },
    ];

    expect(shown(...items).length).toBe(items.length);

    spoilers.setHidden('salvation', true);
    expect(shown(...items)).toEqual(['Wild Horse']);
  });

  it('keeps the selected item listed even when it is a hidden spoiler', () => {
    spoilers.setHidden('salvation', true);
    const mounts = [{ id: 1, name: 'Wild Horse' }, { id: 2, name: 'Black Horse' }];

    expect(spoilers.filterKeeping(mounts, 2).map((mount) => mount.name)).toEqual(['Wild Horse', 'Black Horse']);
    expect(spoilers.filterKeeping(mounts, 1).map((mount) => mount.name)).toEqual(['Wild Horse']);
  });

  it('shows the DLC classes only when Salvation Arc and DLC are both revealed', () => {
    const trickster = { name: 'Trickster', rank: 'Master' };

    spoilers.setHidden('dlc', true);
    expect(shown(trickster)).toEqual([]);

    spoilers.setHidden('dlc', false);
    spoilers.setHidden('salvation', true);
    expect(shown(trickster)).toEqual([]);

    spoilers.setHidden('salvation', false);
    expect(shown(trickster)).toEqual(['Trickster']);
  });
});
