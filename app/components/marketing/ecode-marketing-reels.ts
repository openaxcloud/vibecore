/**
 * Pure helpers for the AI Agent marketing "quick reel" cards.
 *
 * The reel cards advertise short demo clips with a "Watch Now" affordance. There is no
 * standalone video player on the page, so each reel deep-links to the in-page live demo
 * frame (the `#agent-demo` section). Centralising the anchor target here keeps the link
 * destination testable and consistent with the hero "Watch Live Demo" button.
 */

/** The DOM id of the live demo section that every reel scrolls to when activated. */
export const AGENT_DEMO_ANCHOR_ID = 'agent-demo';

/**
 * Returns the in-page href a reel card should link to so that "Watch Now" scrolls the
 * visitor to the live demo frame instead of being an inert label.
 */
export function getReelDemoHref(): string {
  return `#${AGENT_DEMO_ANCHOR_ID}`;
}
