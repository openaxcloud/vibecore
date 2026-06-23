import type { TabType } from './types';

/**
 * Inputs that drive the per-tab "update" badge shown on the Control Panel tiles.
 *
 * Note: connector tabs (github/gitlab/supabase/vercel/netlify) are intentionally
 * NOT driven from the global app-backend connection status. That hook
 * (`useConnectionStatus`) pings the E-Code backend health endpoint and has no
 * knowledge of whether any individual provider integration is connected or
 * healthy. Wiring it to the connector tiles produced a false "Connection lost"
 * badge on all five tiles on any transient backend latency spike, even when none
 * of those integrations was connected. Until each provider exposes real
 * per-provider connection state, the connector tiles show no status badge.
 */
export interface TabStatusInputs {
  hasNewFeatures: boolean;
  unviewedFeaturesCount: number;
  hasUnreadNotifications: boolean;
  unreadNotificationsCount: number;
}

/**
 * Whether the given tab should show the pulsing "update" indicator dot.
 */
export function getTabUpdateStatus(tabId: TabType, inputs: TabStatusInputs): boolean {
  switch (tabId) {
    case 'features':
      return inputs.hasNewFeatures;
    case 'notifications':
      return inputs.hasUnreadNotifications;
    default:
      return false;
  }
}

/**
 * Tooltip message shown when a tab has an active update indicator.
 */
export function getStatusMessage(tabId: TabType, inputs: TabStatusInputs): string {
  switch (tabId) {
    case 'features': {
      const count = inputs.unviewedFeaturesCount;
      return `${count} new feature${count === 1 ? '' : 's'} to explore`;
    }
    case 'notifications': {
      const count = inputs.unreadNotificationsCount;
      return `${count} unread notification${count === 1 ? '' : 's'}`;
    }
    default:
      return '';
  }
}
