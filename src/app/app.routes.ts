import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'calculator' },
  {
    path: 'calculator',
    title: 'Growth Calculator',
    loadComponent: () =>
      import('./calculator-page/calculator-page.component').then(
        (m) => m.CalculatorPageComponent,
      ),
  },
  {
    path: 'seed-mapper',
    title: 'Seed Mapper',
    loadComponent: () =>
      import('./seed-mapper-page/seed-mapper-page.component').then(
        (m) => m.SeedMapperPageComponent,
      ),
  },
  {
    path: 'characters',
    title: 'Characters',
    loadComponent: () =>
      import('./units-page/units-page.component').then((m) => m.UnitsPageComponent),
  },
  {
    path: 'characters/:id',
    title: 'Character',
    loadComponent: () =>
      import('./character-page/character-page.component').then(
        (m) => m.CharacterPageComponent,
      ),
  },
  {
    path: 'classes',
    title: 'Classes',
    loadComponent: () =>
      import('./classes-page/classes-page.component').then(
        (m) => m.ClassesPageComponent,
      ),
  },
  {
    path: 'classes/:id',
    title: 'Class',
    loadComponent: () =>
      import('./class-page/class-page.component').then((m) => m.ClassPageComponent),
  },
  {
    path: 'mounts',
    title: 'Mounts',
    loadComponent: () =>
      import('./mounts-page/mounts-page.component').then((m) => m.MountsPageComponent),
  },
  {
    path: 'battalions',
    title: 'Battalions',
    loadComponent: () =>
      import('./battalions-page/battalions-page.component').then(
        (m) => m.BattalionsPageComponent,
      ),
  },
  { path: '**', redirectTo: 'calculator' },
];
