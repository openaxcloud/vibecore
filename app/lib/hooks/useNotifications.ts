import { useState, useEffect, useRef } from 'react';
import { getNotifications, markNotificationRead, type Notification } from '~/lib/api/notifications';
import { logStore } from '~/lib/stores/logs';

export const useNotifications = () => {
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState<Notification[]>([]);
  const mountedRef = useRef(true);

  const checkNotifications = async () => {
    try {
      const notifications = await getNotifications();
      const unread = notifications.filter((n) => !logStore.isRead(n.id));

      // Guard against setState after unmount (the fetch may resolve late).
      if (!mountedRef.current) {
        return;
      }

      setUnreadNotifications(unread);
      setHasUnreadNotifications(unread.length > 0);
    } catch (error) {
      console.error('Failed to check notifications:', error);
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    // Poll once immediately and then once a minute. This intentionally does NOT
    // depend on the log store: `logStore.logs` is a nanostores map whose key set
    // changes on essentially every logged event (API/system/provider/network),
    // so keying the effect on it turned a 60s poll into a notifications fetch per
    // log entry — a request storm during chat streaming / heavy API activity.
    checkNotifications();

    const interval = setInterval(checkNotifications, 60 * 1000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  const markAsRead = async (notificationId: string) => {
    try {
      await markNotificationRead(notificationId);
      await checkNotifications();
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const notifications = await getNotifications();
      await Promise.all(notifications.map((n) => markNotificationRead(n.id)));
      await checkNotifications();
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  return { hasUnreadNotifications, unreadNotifications, markAsRead, markAllAsRead };
};
