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
      // iOS scrolls the page itself the moment a field it will cover gets focus, which fights any later
      // move. So a tap on a dropdown is caught as the finger lifts: the page is moved first, and only then
      // is the field focused (still within the tap, so the keyboard opens). iOS finds it already in view.
      let touch: { x: number; y: number } | null = null;
      const onTouchStart = (event: TouchEvent) => {
        const point = event.touches.length === 1 ? event.touches[0] : undefined;
        touch = point ? { x: point.clientX, y: point.clientY } : null;
      };
      const onTouchEnd = (event: TouchEvent) => {
        const start = touch;
        const point = event.changedTouches[0];
        touch = null;

        if (!start || !point || Math.hypot(point.clientX - start.x, point.clientY - start.y) > 10) {
          return;
        }

        const input = dropdownInputAt(event.target);

        if (input && this.openDropdownAboveKeyboard(viewport, input)) {
          event.preventDefault();
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
      host.addEventListener('touchstart', onTouchStart, { passive: true });
      host.addEventListener('touchend', onTouchEnd, { passive: false });
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
        host.removeEventListener('touchstart', onTouchStart);
        host.removeEventListener('touchend', onTouchEnd);
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
    const scroller = field instanceof HTMLElement ? this.scrollerFor(field) : null;

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

    const visible = this.visibleArea(viewport, scroller, predicted);
    const top = field.getBoundingClientRect().top;
    const select = field.closest<HTMLElement>('app-searchable-select');
    const panel = select?.querySelector<HTMLElement>('.panel');

    // The list's size is fixed once, at the tap: only a list too tall to fit between the top of the
    // page and the keyboard is shortened, and it never changes again while open.
    if (select && panel && beforeKeyboard) {
      capDropdown(select, visible, panel.getBoundingClientRect().top - top);
    }

    const bottom = (panel ?? field).getBoundingClientRect().bottom;
    let delta = 0;

    if (bottom > visible.bottom) {
      delta = Math.min(bottom - visible.bottom, top - visible.top);
    } else if (top < visible.top && beforeKeyboard) {
      delta = top - visible.top;
    }

    // Once the keyboard is up, only ever nudge up to uncover the list, never pull the page back down.
    if (!beforeKeyboard && delta < 0) {
      return;
    }

    this.scrollBy(scroller, delta, predicted ? 'auto' : 'smooth');
  }

  // Before a tapped dropdown gets focus: size its list, move the page so the list will rest just above
  // the keyboard, then focus it. Returns false (leaving the tap alone) when it doesn't apply.
  private openDropdownAboveKeyboard(viewport: VisualViewport, input: HTMLInputElement): boolean {
    const scroller = this.scrollerFor(input);
    const select = input.closest<HTMLElement>('app-searchable-select');

    if (!scroller || !select || Math.abs(viewport.scale - 1) >= 0.01) {
      return false;
    }

    const inset = this.updateKeyboardInset(viewport);
    const visible = this.visibleArea(viewport, scroller, inset === 0);
    const top = input.getBoundingClientRect().top;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    // The list opens 0.25rem below the field, at most --dropdown-height tall (see searchable-select).
    const panelTop = select.getBoundingClientRect().bottom + 0.25 * rem;
    const listHeight = (parseFloat(getComputedStyle(select).getPropertyValue('--dropdown-height')) || 13) * rem;
    const height = Math.min(listHeight, capDropdown(select, visible, panelTop - top));
    const bottom = panelTop + height;
    let delta = 0;

    if (bottom > visible.bottom) {
      delta = Math.min(bottom - visible.bottom, top - visible.top);
    } else if (top < visible.top) {
      delta = top - visible.top;
    }

    this.scrollBy(scroller, delta, 'auto');
    input.focus({ preventScroll: true });

    return true;
  }

  // The part of the scroller the user can see above the keyboard; before the keyboard opens, the
  // remembered keyboard height stands in for it.
  private visibleArea(viewport: VisualViewport, scroller: HTMLElement, predicted: boolean): VisibleArea {
    const bounds = scroller.getBoundingClientRect();
    const keyboardTop = predicted
      ? window.innerHeight - this.keyboardInset
      : viewport.offsetTop + viewport.height;

    return {
      top: Math.max(viewport.offsetTop, bounds.top) + MARGIN,
      bottom: Math.min(keyboardTop, bounds.bottom) - MARGIN,
    };
  }

  private scrollBy(scroller: HTMLElement, delta: number, behavior: ScrollBehavior): void {
    if (Math.abs(delta) <= 2) {
      return;
    }

    const target = Math.max(0, Math.round(scroller.scrollTop + delta));
    const shortfall = target - (scroller.scrollHeight - scroller.clientHeight);

    // Only the page has spare room to add; a dialog scrolls as far as its own content allows.
    if (shortfall > 0 && scroller.matches('main')) {
      this.setScrollExtra(this.cssPixels('--scroll-extra') + shortfall);
    }

    scroller.scrollTo({ top: target, behavior });
  }

  // A field in a dialog scrolls with the dialog, which floats above the page; anything else, with the page.
  private scrollerFor(field: HTMLElement): HTMLElement | null {
    return (
      field.closest<HTMLElement>('[aria-modal="true"]') ??
      this.host.nativeElement.querySelector('main')
    );
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
// Until one is measured, guess a little high: a list resting slightly higher needs no second move.
function readKeyboardInset(): number {
  try {
    const stored = Number(localStorage.getItem(KEYBOARD_KEY));

    // Ignore a height that can't be a keyboard (e.g. saved in another orientation).
    if (stored > 0 && stored < window.innerHeight * 0.8) {
      return stored;
    }
  } catch {
    // Storage can be unavailable (private mode); fall back to the estimate.
  }

  return Math.round(window.innerHeight * 0.6);
}

function writeKeyboardInset(inset: number): void {
  try {
    localStorage.setItem(KEYBOARD_KEY, String(inset));
  } catch {
    // Not remembering it only costs one extra correction next time.
  }
}

interface VisibleArea {
  top: number;
  bottom: number;
}

// Limits a dropdown's list to the room between the top of the visible area and the keyboard, given
// how far below the field's top the list starts. Returns that room.
function capDropdown(select: HTMLElement, visible: VisibleArea, listOffset: number): number {
  const room = Math.max(0, Math.floor(visible.bottom - visible.top - listOffset));
  select.style.setProperty('--dropdown-max-height', `${room}px`);

  return room;
}

// The search box of a not-yet-focused, enabled dropdown field under the tap, if any.
function dropdownInputAt(target: EventTarget | null): HTMLInputElement | null {
  const input = target instanceof Element
    ? target.closest('app-searchable-select .field')?.querySelector('input')
    : null;

  return input instanceof HTMLInputElement && !input.disabled && document.activeElement !== input
    ? input
    : null;
}