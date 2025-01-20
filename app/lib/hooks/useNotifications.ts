import { useState, useEffect } from 'react';
import { getNotifications, markNotificationRead, type Notification } from '~/lib/api/notifications';

const READ_NOTIFICATIONS_KEY = 'bolt_read_notifications';

const getReadNotifications = (): string[] => {
  try {
    const stored = localStorage.getItem(READ_NOTIFICATIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const setReadNotifications = (notificationIds: string[]) => {
  try {
    localStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify(notificationIds));
  } catch (error) {
    console.error('Failed to persist read notifications:', error);
  }
};

export const useNotifications = () => {
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState<Notification[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() => getReadNotifications());

  const checkNotifications = async () => {
    try {
      const notifications = await getNotifications();
      const unread = notifications.filter((n) => !readNotificationIds.includes(n.id));
      setUnreadNotifications(unread);
      setHasUnreadNotifications(unread.length > 0);
    } catch (error) {
      console.error('Failed to check notifications:', error);
    }
  };

  useEffect(() => {
    // Check immediately and then every minute
    checkNotifications();

    const interval = setInterval(checkNotifications, 60 * 1000);

    return () => clearInterval(interval);
  }, [readNotificationIds]);

  const markAsRead = async (notificationId: string) => {
    try {
      await markNotificationRead(notificationId);

      const newReadIds = [...readNotificationIds, notificationId];
      setReadNotificationIds(newReadIds);
      setReadNotifications(newReadIds);
      setUnreadNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      setHasUnreadNotifications(unreadNotifications.length > 1);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await Promise.all(unreadNotifications.map((n) => markNotificationRead(n.id)));

      const newReadIds = [...readNotificationIds, ...unreadNotifications.map((n) => n.id)];
      setReadNotificationIds(newReadIds);
      setReadNotifications(newReadIds);
      setUnreadNotifications([]);
      setHasUnreadNotifications(false);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  return { hasUnreadNotifications, unreadNotifications, markAsRead, markAllAsRead };
};
