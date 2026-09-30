import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Traps Tab focus inside the referenced container while `active` is true.
 * Moves focus to the first focusable element on activation and restores it
 * to the previously focused element on deactivation.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const container = containerRef.current;

    if (!container) {
      return undefined;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initialTarget = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? container;
    initialTarget.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }

      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );

      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      /*
       * BUG-QA0928-MODALE-SANS-FOCUS — CHAQUE tabulation est menée ici, pas
       * seulement aux bords. Sur WebKit, Tab ne passe pas par les boutons : laisser
       * le navigateur avancer au milieu emmenait le focus hors de la modale dès la
       * première tabulation (mesuré le 2026-09-30, projet webkit-iphone).
       */
      event.preventDefault();

      const index = focusables.indexOf(document.activeElement as HTMLElement);
      const pas = event.shiftKey ? -1 : 1;
      const suivant = index === -1 ? (event.shiftKey ? focusables.length - 1 : 0) : index + pas;

      focusables[(suivant + focusables.length) % focusables.length].focus();
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [active]);

  return containerRef;
}
