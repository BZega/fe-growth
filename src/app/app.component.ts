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
      const host = this.host.nativeElement;

      viewport.addEventListener('resize', schedule);
      host.addEventListener('focusin', schedule);
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        viewport.removeEventListener('resize', schedule);
        host.removeEventListener('focusin', schedule);
      });
    });
  }

  // iOS overlays the keyboard without resizing the layout, so pad the scroller by the covered height.
  private fitToVisualViewport(viewport: VisualViewport): void {
    const host = this.host.nativeElement;
    const zoomed = Math.abs(viewport.scale - 1) >= 0.01;
    const inset = zoomed ? 0 : Math.max(0, Math.round(window.innerHeight - viewport.height));

    if (inset > 0) {
      host.style.setProperty('--keyboard-inset', `${inset}px`);
    } else {
      host.style.removeProperty('--keyboard-inset');
    }

    const field = document.activeElement;
    const scroller = host.querySelector('main');

    if (!inset || !scroller || !(field instanceof HTMLElement) || !field.matches(TEXT_FIELD)) {
      return;
    }

    const margin = 12;
    const rect = field.getBoundingClientRect();
    const visibleTop = Math.max(viewport.offsetTop, scroller.getBoundingClientRect().top);
    const visibleBottom = viewport.offsetTop + viewport.height;

    if (rect.bottom > visibleBottom - margin) {
      scroller.scrollTop += rect.bottom - visibleBottom + margin;
    } else if (rect.top < visibleTop + margin) {
      scroller.scrollTop -= visibleTop + margin - rect.top;
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
