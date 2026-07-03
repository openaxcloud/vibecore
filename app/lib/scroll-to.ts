/**
 * Reduced-motion-aware scrolling for marketing pages. Smooth scrolling is the
 * default, but users who set `prefers-reduced-motion: reduce` get an instant
 * jump instead (extracted from the Pricing "more features" C4 implementation).
 */

function resolveScrollBehavior(): ScrollBehavior {
  // Guard matchMedia for jsdom, where it isn't implemented.
  const reduceMotion =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return reduceMotion ? 'auto' : 'smooth';
}

/**
 * Scroll an element into view, respecting the user's reduced-motion
 * preference. Optionally move real focus to a target after the scroll (with
 * preventScroll, so the browser doesn't yank the viewport a second time) —
 * that way keyboard/AT users land where they scrolled.
 */
export function scrollToElement(
  element: HTMLElement,
  options?: { block?: ScrollLogicalPosition; focus?: HTMLElement | null },
) {
  // jsdom doesn't implement scrollIntoView; treat it as a no-op there.
  if (typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ behavior: resolveScrollBehavior(), ...(options?.block ? { block: options.block } : {}) });
  }

  options?.focus?.focus({ preventScroll: true });
}

/**
 * Scroll the window vertically by `top` pixels, respecting the user's
 * reduced-motion preference.
 */
export function scrollWindowBy(top: number) {
  window.scrollBy({ top, behavior: resolveScrollBehavior() });
}
