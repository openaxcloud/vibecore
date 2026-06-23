import type { Notification } from '~/lib/api/notifications';

/**
 * Decide whether a notification should count toward the unread/"actionable"
 * badge shown on the notifications bell.
 *
 * This mirrors the canonical unread definition in `getUnreadCount`
 * (app/lib/api/notifications.ts): only update notifications and
 * error/warning-level entries are actionable. Routine `info`-level logs
 * (e.g. successful API calls recorded via `logStore.logApiCall`) must NOT
 * light up the bell, otherwise ordinary app activity perpetually shows
 * "unread" and diverges from `getUnreadCount`.
 */
export const isActionableNotification = (notification: Pick<Notification, 'type' | 'details'>): boolean => {
  if (notification.details?.type === 'update') {
    return true;
  }

  return notification.type === 'error' || notification.type === 'warning';
};
