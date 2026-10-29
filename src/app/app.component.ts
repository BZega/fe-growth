import { afterNextRender, Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SpoilerService } from './services/spoiler.service';

const TEXT_FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select';
const KEYBOARD_KEY = 'fe-growth:keyboard-inset';
const MARGIN = 8;

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
  private keyboardInset = readKeyboardInset();

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const viewport = window.visualViewport;
      const host = this.host.nativeElement;
      const scroller = host.querySelector('main');

      if (!viewport || !scroller) {
        return;
      }

      let frame = 0;
      let settle = 0;
      let early = 0;
      // The keyboard animates in a burst of viewport events; check the placement once they stop.
      const schedule = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => this.updateKeyboardInset(viewport));
        clearTimeout(settle);
        settle = window.setTimeout(() => this.placeFocusedField(viewport, false), 200);
      };
      // Move once, right after the tap and before the keyboard opens, using the keyboard height
      // from last time. The field is then already above the keyboard, so iOS doesn't scroll it again.
      const onFocusIn = () => {
        clearTimeout(early);
        // After the tap's own mouse events, so moving the page can't redirect them to another element.
        early = window.setTimeout(() => this.placeFocusedField(viewport, true));
        schedule();
      };
      const onFocusOut = (event: FocusEvent) => {
        const select = event.target instanceof Element
          ? event.target.closest('app-searchable-select')
          : null;
        if (event.relatedTarget instanceof Node && select?.contains(event.relatedTarget)) {
          return;
        }

        this.clearDropdownCaps();
        this.trimScrollExtra();
      };
      const onScroll = () => {
        if (!isEditing()) {
          this.trimScrollExtra();
        }
      };
      const contentObserver = new MutationObserver(() => {
        if (isEditing()) {
          schedule();
        } else {
          this.clearDropdownCaps();
          this.trimScrollExtra();
        }
      });
      contentObserver.observe(host, { childList: true, subtree: true, characterData: true });

      viewport.addEventListener('resize', schedule);
      viewport.addEventListener('scroll', schedule);
      host.addEventListener('focusin', onFocusIn);
      host.addEventListener('focusout', onFocusOut);
      scroller.addEventListener('scroll', onScroll, { passive: true });
      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        clearTimeout(settle);
        clearTimeout(early);
        contentObserver.disconnect();
        viewport.removeEventListener('resize', schedule);
        viewport.removeEventListener('scroll', schedule);
        host.removeEventListener('focusin', onFocusIn);
        host.removeEventListener('focusout', onFocusOut);
        scroller.removeEventListener('scroll', onScroll);
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

    // Keep the room the closing keyboard gave up, so the page doesn't snap down; it's released as you scroll.
    if (inset < previous) {
      this.setScrollExtra(this.cssPixels('--scroll-extra') + previous - inset);

      if (!isEditing()) {
        this.trimScrollExtra();
      }
    }

    return inset;
  }

  // Moves the page only when the open dropdown (or field) is covered by the keyboard or above the
  // visible area, to an absolute spot, so repeated checks never stack up or move the page back and forth.
  private placeFocusedField(viewport: VisualViewport, beforeKeyboard: boolean): void {
    const inset = this.updateKeyboardInset(viewport);
    const field = document.activeElement;
    const scroller = this.host.nativeElement.querySelector('main');

    if (
      !matchMedia('(pointer: coarse)').matches ||
      Math.abs(viewport.scale - 1) >= 0.01 ||
      !scroller ||
      !(field instanceof HTMLElement) ||
      !field.matches(TEXT_FIELD)
    ) {
      return;
    }

    const predicted = beforeKeyboard && inset === 0;

    if (!predicted && inset > 0 && inset !== this.keyboardInset) {
      this.keyboardInset = inset;
      writeKeyboardInset(inset);
    }

    const bounds = scroller.getBoundingClientRect();
    const keyboardTop = predicted
      ? window.innerHeight - this.keyboardInset
      : viewport.offsetTop + viewport.height;
    const visibleTop = Math.max(viewport.offsetTop, bounds.top) + MARGIN;
    const visibleBottom = Math.min(keyboardTop, bounds.bottom) - MARGIN;
    const top = field.getBoundingClientRect().top;
    const select = field.closest<HTMLElement>('app-searchable-select');
    const panel = select?.querySelector<HTMLElement>('.panel');

    // Only a list that can't fit above the keyboard at all is shortened, so every option stays reachable.
    if (select && panel && !predicted) {
      const room = visibleBottom - visibleTop - (panel.getBoundingClientRect().top - top);
      select.style.setProperty('--dropdown-max-height', `${Math.max(0, Math.floor(room))}px`);
    }

    const bottom = (panel ?? field).getBoundingClientRect().bottom;
    let delta = 0;

    if (bottom > visibleBottom) {
      delta = Math.min(bottom - visibleBottom, top - visibleTop);
    } else if (top < visibleTop) {
      delta = top - visibleTop;
    }

    if (Math.abs(delta) <= 2) {
      return;
    }

    const target = Math.max(0, Math.round(scroller.scrollTop + delta));
    const shortfall = target - (scroller.scrollHeight - scroller.clientHeight);

    if (shortfall > 0) {
      this.setScrollExtra(this.cssPixels('--scroll-extra') + shortfall);
    }

    scroller.scrollTo({ top: target, behavior: predicted ? 'auto' : 'smooth' });
  }

  private clearDropdownCaps(): void {
    this.host.nativeElement
      .querySelectorAll<HTMLElement>('app-searchable-select')
      .forEach((select) => select.style.removeProperty('--dropdown-max-height'));
  }

  // Drops only spare room that is below the visible area, so the content never moves.
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

// The last measured keyboard height, so the very first tap can already place the field above it.
// Until one is measured, assume a phone keyboard covering half the screen.
function readKeyboardInset(): number {
  try {
    const stored = Number(localStorage.getItem(KEYBOARD_KEY));

    if (stored > 0) {
      return stored;
    }
  } catch {
    // Storage can be unavailable (private mode); fall back to the estimate.
  }

  return Math.round(window.innerHeight / 2);
}

function writeKeyboardInset(inset: number): void {
  try {
    localStorage.setItem(KEYBOARD_KEY, String(inset));
  } catch {
    // Not remembering it only costs one extra correction next time.
  }
}