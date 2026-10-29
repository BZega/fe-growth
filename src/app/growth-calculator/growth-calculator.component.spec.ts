import { ComponentFixture, TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { GrowthDataService } from '../services/growth-data.service';
import { GrowthCalculatorComponent } from './growth-calculator.component';

describe('GrowthCalculatorComponent', () => {
  let fixture: ComponentFixture<GrowthCalculatorComponent>;
  let calculator: GrowthCalculatorComponent;
  let api: GrowthDataService;

  const classId = async (name: string) =>
    (await firstValueFrom(api.getClasses())).find((unitClass) => unitClass.name === name)!.id;
  const mountId = async (name: string) =>
    (await firstValueFrom(api.getMounts())).find((mount) => mount.name === name)!.id;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [GrowthCalculatorComponent] });
    api = TestBed.inject(GrowthDataService);
    fixture = TestBed.createComponent(GrowthCalculatorComponent);
    fixture.componentRef.setInput('heading', 'Calculator 1');
    fixture.componentRef.setInput('slotKey', 'calc-test');
    calculator = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('always shows the mount growth rows, even for an unmounted class', async () => {
    calculator.onClassChange(await classId('Soldier'));
    fixture.detectChanges();
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tr.band--mount');

    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('No Mount Growth');
  });

  it('splits the right half of row 2 between Level and Bond Level only when both are shown', async () => {
    const element = fixture.nativeElement as HTMLElement;
    const half = (selector: string) =>
      element.querySelector(selector)?.classList.contains('picker--half');

    calculator.onClassChange(await classId('Light Cavalry'));
    fixture.detectChanges();
    await fixture.whenStable();
    calculator.onMountChange(await mountId('Wild Horse'));
    fixture.detectChanges();
    expect(element.querySelector('.picker--class-level')).toBeNull();
    expect(half('.picker--bond')).toBeFalse();

    calculator.onClassChange(await classId('Charioteer'));
    fixture.detectChanges();
    await fixture.whenStable();
    calculator.onMountChange(await mountId('Wild Horse'));
    fixture.detectChanges();
    expect(half('.picker--class-level')).toBeTrue();
    expect(half('.picker--bond')).toBeTrue();
  });
});
