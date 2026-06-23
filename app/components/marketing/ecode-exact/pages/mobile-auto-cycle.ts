/**
 * Pure helpers for the Mobile features-showcase auto-cycle behaviour.
 *
 * The showcase advances a single `activeFeatureIndex` on a timer, which drives
 * both the hero phone mockup and the large Features Showcase tabs (whose panels
 * hold real interactive demos). Auto-cycling must pause while the visitor is
 * operating a demo, otherwise the active panel — and its local interaction state
 * (terminal step, accepted AI suggestion, selected preview device, collab/git
 * sub-view) — is yanked away every few seconds.
 *
 * These helpers keep the timing/index maths out of the component so they can be
 * unit-tested without rendering React.
 */

/** How long the auto-cycle stays paused after a manual interaction, in ms. */
export const AUTO_CYCLE_RESUME_DELAY_MS = 15000;

/** Interval between automatic feature advances, in ms. */
export const AUTO_CYCLE_INTERVAL_MS = 6000;

/**
 * Compute the next feature index for the auto-cycle, wrapping around the end.
 * Returns the current index unchanged when there are no features to cycle.
 */
export function nextFeatureIndex(currentIndex: number, featureCount: number): number {
  if (!Number.isFinite(featureCount) || featureCount <= 0) {
    return Number.isFinite(currentIndex) ? currentIndex : 0;
  }

  const safeIndex = Number.isFinite(currentIndex) && currentIndex >= 0 ? Math.floor(currentIndex) : 0;

  return (safeIndex + 1) % featureCount;
}

/**
 * Whether the auto-cycle interval should be running given the current state.
 * It runs only when cycling is enabled and there is more than one feature to
 * move between.
 */
export function shouldAutoCycle(isAutoCycling: boolean, featureCount: number): boolean {
  return isAutoCycling && Number.isFinite(featureCount) && featureCount > 1;
}
