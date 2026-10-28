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
      let settle = 0;
      const schedule = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => this.updateKeyboardInset(viewport));
        // Let the keyboard animation and iOS's own focus scroll finish before correcting.
        clearTimeout(settle);
        settle = window.setTimeout(() => this.revealFocusedField(viewport), 300);
      };
      const host = this.host.nativeElement;
      const clearExtra = () => host.style.removeProperty('--scroll-extra');

      viewport.addEventListener('resize', schedule);
      host.addEventListener('focusin', schedule);
      host.addEventListener('focusout', clearExtra);
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        clearTimeout(settle);
        viewport.removeEventListener('resize', schedule);
        host.removeEventListener('focusin', schedule);
        host.removeEventListener('focusout', clearExtra);
      });
    });
  }

  // iOS overlays the keyboard without resizing the layout, so pad the scroller by the covered height.
  private updateKeyboardInset(viewport: VisualViewport): number {
    const host = this.host.nativeElement;
    const zoomed = Math.abs(viewport.scale - 1) >= 0.01;
    const inset = zoomed ? 0 : Math.max(0, Math.round(window.innerHeight - viewport.height));

    if (inset > 0) {
      host.style.setProperty('--keyboard-inset', `${inset}px`);
    } else {
      host.style.removeProperty('--keyboard-inset');
    }

    return inset;
  }

  private revealFocusedField(viewport: VisualViewport): void {
    this.updateKeyboardInset(viewport);
    const field = document.activeElement;
    const scroller = this.host.nativeElement.querySelector('main');

    if (
      !matchMedia('(pointer: coarse)').matches ||
      !scroller ||
      !(field instanceof HTMLElement) ||
      !field.matches(TEXT_FIELD)
    ) {
      return;
    }

    const margin = 12;
    const visibleTop = Math.max(viewport.offsetTop, scroller.getBoundingClientRect().top) + margin;
    const visibleBottom = viewport.offsetTop + viewport.height - margin;
    const top = field.getBoundingClientRect().top;
    const panel = field.closest('app-searchable-select')?.querySelector('.panel');
    let delta: number;

    if (panel) {
      // Rest the open dropdown right above the keyboard, but never push the field itself out of view.
      delta = Math.min(panel.getBoundingClientRect().bottom - visibleBottom, top - visibleTop);
    } else {
      const bottom = field.getBoundingClientRect().bottom;
      delta = bottom > visibleBottom ? bottom - visibleBottom : 0;
    }

    if (Math.abs(delta) > 1) {
      // The dropdown can overhang the end of the page; add just enough room to scroll it clear.
      const room = () => scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
      let extra = 0;

      for (let tries = 0; tries < 3 && delta > room() + 1; tries++) {
        extra += Math.ceil(delta - room());
        this.host.nativeElement.style.setProperty('--scroll-extra', `${extra}px`);
      }

      scroller.scrollBy({ top: delta, behavior: 'smooth' });
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
