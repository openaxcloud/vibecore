/**
 * Pure helpers for the LandingOptimized "Build Now" core journey.
 *
 * Two homepage CTAs were silently broken:
 *
 * 1. BuildModeSelector (design-first vs full-app) stored its choice in
 *    sessionStorage('pendingBuildMode') and as ?buildMode= on /projects/new, but
 *    /projects/new only ever reads ?prompt= — so the mode was dropped and both
 *    choices produced identical generation. `buildPromptForMode` folds the chosen
 *    mode INTO the prompt (the one channel /projects/new actually consumes) so a
 *    design-first selection demonstrably changes what the generator receives.
 *
 * 2. The hero "Watch Demo" button scrolled to #video-demo, which only exists once
 *    the lazy LandingVideo section mounts via IntersectionObserver. On first paint
 *    that element is absent, so the optional-chained scrollIntoView was a no-op.
 *    `resolveDemoScrollTarget` decides what to do given the current DOM: scroll to
 *    the real anchor if present, otherwise nudge the page toward the video region
 *    so the observer mounts it, then retry.
 */

export type LandingBuildMode = 'design-first' | 'full-app' | 'continue-planning';

/* Marker the generator can key on; kept terse so it survives a URL round-trip. */
export const DESIGN_FIRST_PROMPT_PREFIX =
  'Design-first build: start by producing a clickable visual prototype (UI and layout) of the app before wiring up backend functionality. ';

/**
 * Fold the selected build mode into the prompt text that /projects/new will read
 * from ?prompt=. A `design-first` selection prepends an explicit design-first
 * instruction so the choice has a real, observable effect on generation; a
 * `full-app` selection passes the user's prompt through unchanged.
 *
 * Idempotent for design-first: re-applying does not stack the prefix.
 */
export function buildPromptForMode(mode: LandingBuildMode, prompt: string): string {
  const trimmed = prompt.trim();

  if (mode !== 'design-first') {
    return trimmed;
  }

  if (trimmed.startsWith(DESIGN_FIRST_PROMPT_PREFIX.trim())) {
    return trimmed;
  }

  return `${DESIGN_FIRST_PROMPT_PREFIX}${trimmed}`;
}

export type DemoScrollAction = { kind: 'scroll-to-anchor' } | { kind: 'reveal-and-retry' } | { kind: 'give-up' };

/**
 * Decide how to satisfy a "Watch Demo" click.
 *
 * - If the #video-demo anchor is already in the DOM, scroll straight to it.
 * - Otherwise the lazy video section has not mounted yet: nudge the page toward
 *   the video region to trip its IntersectionObserver, then retry — but only while
 *   attempts remain, so a missing section can never loop forever.
 */
export function resolveDemoScrollTarget(anchorPresent: boolean, attemptsRemaining: number): DemoScrollAction {
  if (anchorPresent) {
    return { kind: 'scroll-to-anchor' };
  }

  if (attemptsRemaining > 0) {
    return { kind: 'reveal-and-retry' };
  }

  return { kind: 'give-up' };
}
