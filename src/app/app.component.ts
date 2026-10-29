import { afterNextRender, Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SpoilerService } from './services/spoiler.service';

const TEXT_FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select';

const isEditing = () => document.activeElement?.matches(TEXT_FIELD) ?? false;

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
      const scroller = host.querySelector('main');
      const release = (event?: FocusEvent) => {
        const select = event?.target instanceof Element
          ? event.target.closest('app-searchable-select')
          : null;
        if (event?.relatedTarget instanceof Node && select?.contains(event.relatedTarget)) {
          return;
        }

        this.trimScrollExtra();
      };
      const releaseWhenIdle = () => {
        if (!isEditing()) {
          this.trimScrollExtra();
        }
      };
      // Mount, mount stat and bond level fields resize a calculator, so re-anchor whenever the layout changes.
      const contentObserver = new MutationObserver(() => {
        if (isEditing()) {
          schedule();
        } else {
          this.trimScrollExtra();
        }
      });
      contentObserver.observe(host, { childList: true, subtree: true, characterData: true });

      viewport.addEventListener('resize', schedule);
      viewport.addEventListener('scroll', schedule);
      host.addEventListener('focusin', schedule);
      host.addEventListener('focusout', release);
      scroller?.addEventListener('scroll', releaseWhenIdle, { passive: true });
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        clearTimeout(settle);
        contentObserver.disconnect();
        viewport.removeEventListener('resize', schedule);
        viewport.removeEventListener('scroll', schedule);
        host.removeEventListener('focusin', schedule);
        host.removeEventListener('focusout', release);
        scroller?.removeEventListener('scroll', releaseWhenIdle);
      });
    });
  }

  // iOS overlays the keyboard without resizing the layout, so pad the scroller by the covered height.
  private updateKeyboardInset(viewport: VisualViewport): number {
    const host = this.host.nativeElement;
    const zoomed = Math.abs(viewport.scale - 1) >= 0.01;
    const inset = zoomed ? 0 : Math.max(0, Math.round(window.innerHeight - viewport.height));
    const previous = this.cssPixels('--keyboard-inset');

    if (inset > 0) {
      host.style.setProperty('--keyboard-inset', `${inset}px`);
    } else {
      host.style.removeProperty('--keyboard-inset');
    }

    // Hand the room the keyboard gave up to the spare padding so the page doesn't snap down as it closes.
    if (inset < previous) {
      this.setScrollExtra(this.cssPixels('--scroll-extra') + previous - inset);

      if (!isEditing()) {
        this.trimScrollExtra();
      }
    }

    return inset;
  }

  // Drop only spare padding that is below the visible area, so the content never moves.
  private trimScrollExtra(): void {
    const scroller = this.host.nativeElement.querySelector('main');
    const extra = this.cssPixels('--scroll-extra');

    if (!scroller || extra <= 0) {
      return;
    }

    const slack = Math.floor(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop);
    this.setScrollExtra(Math.max(0, extra - Math.max(0, slack)));
  }

  private setScrollExtra(extra: number): void {
    const host = this.host.nativeElement;

    if (extra > 0) {
      host.style.setProperty('--scroll-extra', `${Math.ceil(extra)}px`);
    } else {
      host.style.removeProperty('--scroll-extra');
    }
  }

  private cssPixels(name: string): number {
    return parseFloat(this.host.nativeElement.style.getPropertyValue(name)) || 0;
  }

  private revealFocusedField(viewport: VisualViewport): void {
    this.updateKeyboardInset(viewport);
    const field = document.activeElement;
    const scroller = this.host.nativeElement.querySelector('main');

    if (
      !matchMedia('(pointer: coarse)').matches ||
      Math.abs(viewport.scale - 1) >= 0.01 ||
      !scroller ||
      // A pinned calculator page is already laid out for the keyboard and must not move.
      scroller.hasAttribute('data-scroll-pinned') ||
      !(field instanceof HTMLElement) ||
      !field.matches(TEXT_FIELD)
    ) {
      return;
    }

    const margin = 12;
    const bounds = scroller.getBoundingClientRect();
    const visibleTop = Math.max(viewport.offsetTop, bounds.top) + margin;
    const visibleBottom = Math.min(viewport.offsetTop + viewport.height, bounds.bottom) - margin;
    const { top, bottom: fieldBottom } = field.getBoundingClientRect();
    const panel = field.closest('app-searchable-select')?.querySelector<HTMLElement>('.panel');
    const bottom = panel ? panel.getBoundingClientRect().bottom : fieldBottom;
    let delta = 0;

    // Move only as far as needed: a list that shrinks while filtering, or a calculator that grows
    // with mount fields, must not drag the page around once the dropdown already clears the keyboard.
    if (bottom > visibleBottom) {
      delta = Math.min(bottom - visibleBottom, top - visibleTop);
    } else if (top < visibleTop) {
      delta = top - visibleTop;
    }

    if (Math.abs(delta) <= 1) {
      return;
    }

    // Absolute target, so a correction during an in-flight smooth scroll can't overshoot.
    const target = Math.max(0, scroller.scrollTop + delta);
    const shortfall = target - (scroller.scrollHeight - scroller.clientHeight);

    if (shortfall > 0) {
      this.setScrollExtra(this.cssPixels('--scroll-extra') + shortfall);
    }

    scroller.scrollTo({ top: target, behavior: 'smooth' });
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
