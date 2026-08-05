import type { TabType } from '~/components/@settings/core/types';
import { getSettingsCoreTabLabel } from '~/lib/i18n/catalogs/settings-core';

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
 * Resolves the friendly settings tab name for a URL slug.
 * Unknown URL fragments deliberately use the localized generic settings label:
 * a raw slug is an implementation identifier, not reviewed interface copy.
 */
export function getSettingsTabName(slug?: string | null, language?: string | null): string {
  if (!slug) {
    return getSettingsCoreTabLabel('', language);
  }

  const tab = TAB_ALIASES[slug];

  if (tab) {
    return getSettingsCoreTabLabel(tab, language);
  }

  return getSettingsCoreTabLabel('', language);
}

/**
 * Builds the browser-tab title for a settings sub-route, e.g.
 * 'Profile | E-Code'. Never leaks the upstream codename or the raw URL slug.
 */
export function settingsTabTitle(slug?: string | null, language?: string | null): string {
  return `${getSettingsTabName(slug, language)} | ${APP_NAME}`;
}
