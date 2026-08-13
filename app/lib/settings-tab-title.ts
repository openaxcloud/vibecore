import { TAB_LABELS, type TabType } from '~/components/@settings/core/types';

/**
 * Maps a URL slug (e.g. from /settings/:tab) onto the canonical settings TabType.
 * Several human-friendly aliases resolve to the same internal tab.
 */
export const TAB_ALIASES: Record<string, TabType> = {
  profile: 'profile',
  settings: 'settings',
  notifications: 'notifications',
  features: 'features',
  data: 'data',
  'cloud-providers': 'cloud-providers',
  providers: 'cloud-providers',
  'local-providers': 'local-providers',
  local: 'local-providers',
  github: 'github',
  connection: 'connections',
  connections: 'connections',
  gitlab: 'gitlab',
  netlify: 'netlify',
  vercel: 'vercel',
  supabase: 'supabase',
  'event-logs': 'event-logs',
  logs: 'event-logs',
  mcp: 'mcp',
  update: 'update',
  updates: 'update',
  debug: 'debug',
  'task-manager': 'task-manager',
  tasks: 'task-manager',
  'service-status': 'service-status',
  status: 'service-status',
};

/** Brand name used in user-facing browser-tab titles. */
export const APP_NAME = 'E-Code';

/**
 * Turns a raw URL slug into a friendly, capitalized label when it is not a
 * recognized settings tab (e.g. 'cloud-providers' -> 'Cloud Providers').
 */
function capitalizeSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Resolves the friendly settings tab name for a URL slug.
 * Returns 'Settings' when no slug is given, the canonical TAB_LABELS entry for
 * known tabs/aliases, and a capitalized version of the slug otherwise.
 */
export function getSettingsTabName(slug?: string | null): string {
  if (!slug) {
    return 'Settings';
  }

  const tab = TAB_ALIASES[slug];

  if (tab) {
    return TAB_LABELS[tab];
  }

  return capitalizeSlug(slug);
}

/**
 * Builds the browser-tab title for a settings sub-route, e.g.
 * 'Profile | E-Code'. Never leaks the upstream codename or the raw URL slug.
 */
export function settingsTabTitle(slug?: string | null): string {
  return `${getSettingsTabName(slug)} | ${APP_NAME}`;
}
