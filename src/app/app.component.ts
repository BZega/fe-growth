import { afterNextRender, Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SpoilerService } from './services/spoiler.service';

const TEXT_FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select';

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

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const viewport = window.visualViewport;

      if (!viewport) {
        return;
      }

      let frame = 0;
      const schedule = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => this.fitToVisualViewport(viewport));
      };

      viewport.addEventListener('resize', schedule);
      viewport.addEventListener('scroll', schedule);
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        viewport.removeEventListener('resize', schedule);
        viewport.removeEventListener('scroll', schedule);
      });
    });
  }

  private fitToVisualViewport(viewport: VisualViewport): void {
    const style = this.host.nativeElement.style;
    const keyboardOpen =
      Math.abs(viewport.scale - 1) < 0.01 &&
      Math.round(viewport.height) < window.innerHeight;

    if (!keyboardOpen) {
      style.removeProperty('--app-height');
      style.removeProperty('--app-shift');
      return;
    }

    const previousHeight = this.host.nativeElement.offsetHeight;

    style.setProperty('--app-height', `${viewport.height}px`);

    if (viewport.offsetTop > 0) {
      style.setProperty('--app-shift', `translateY(${viewport.offsetTop}px)`);
    } else {
      style.removeProperty('--app-shift');
    }

    const field = document.activeElement;

    if (
      field instanceof HTMLElement &&
      field.matches(TEXT_FIELD) &&
      this.host.nativeElement.offsetHeight !== previousHeight
    ) {
      field.scrollIntoView({ block: 'nearest' });
    }
  }

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
