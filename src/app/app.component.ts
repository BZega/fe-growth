import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SpoilerService } from './services/spoiler.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly spoilers = inject(SpoilerService);

  title = 'fe-growth-frontend';

  readonly links = [
    { path: '/calculator', label: 'Calculator' },
    { path: '/seed-mapper', label: 'Seed Mapper' },
    { path: '/characters', label: 'Characters' },
    { path: '/classes', label: 'Classes' },
    { path: '/mounts', label: 'Mounts' },
  ];

  readonly menuOpen = signal(false);
  readonly hideSpoilers = this.spoilers.hidden;

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  toggleSpoilers(): void {
    this.spoilers.toggle();
  }
}
