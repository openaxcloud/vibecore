import { useEffect, useRef } from 'react';

const focusable = 'a[href],button,input,select,textarea,[tabindex]';

/** Own only entry and Tab traversal; MobileOverlayFocus owns shell handoff and restoration. */
export function useMobileModalFocus(active: boolean) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const dialog = ref.current;

    if (!active || !dialog) {
      return undefined;
    }

    const controls = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(focusable)).filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.matches(':disabled') &&
          !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
          element.getClientRects().length > 0 &&
          getComputedStyle(element).visibility !== 'hidden' &&
          element.closest('[role="dialog"], [role="alertdialog"]') === dialog,
      );

    // Layout handoff has already restored any pending control. Never replace it.
    if (!dialog.contains(document.activeElement)) {
      // Do not open the virtual keyboard by implicitly focusing a search input.
      dialog.focus({ preventScroll: true });
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Tab' ||
        event.defaultPrevented ||
        !(event.target instanceof Element) ||
        event.target.closest('[role="dialog"], [role="alertdialog"]') !== dialog
      ) {
        return;
      }

      const items = controls();
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = index < 0 ? (event.shiftKey ? items.length - 1 : 0) : index + (event.shiftKey ? -1 : 1);

      // Traverse all controls, including buttons on WebKit's default keyboard settings.
      event.preventDefault();

      // Keyboard navigation must reveal controls outside the sheet's current scroll position.
      (items[(next + items.length) % items.length] ?? dialog).focus();
    };

    // Document bubble runs after React child handlers have had a chance to consume Tab.
    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active]);

  return ref;
}
