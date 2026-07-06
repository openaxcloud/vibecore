/**
 * Marketing "surface" slugs (rendered by routes/$slug.tsx) that duplicate a real
 * in-app destination. A signed-in visitor who types the bare marketing route
 * should land on their actual page rather than the marketing twin of it.
 *
 * Every key here MUST be a real EcodeSurfacePages slug (so the route matches) and
 * every value MUST be a real in-app route. Extend as more twins surface.
 */
export const SURFACE_AUTHED_TWINS: Record<string, string> = {
  account: '/account-settings',
  profile: '/account-settings',
  plans: '/billing',
  subscribe: '/upgrade',
  teams: '/organization-members',
};

/** Resolve the in-app destination for a surface slug, if it has an authed twin. */
export function resolveSurfaceTwin(slug: string): string | undefined {
  return SURFACE_AUTHED_TWINS[slug];
}
