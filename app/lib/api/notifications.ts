import { logStore, type LogEntry } from '~/lib/stores/logs';

export type NotificationType = 'info' | 'warning' | 'error' | 'success' | 'update';

export interface NotificationDetails {
  type?: string;
  message?: string;
  currentVersion?: string;
  latestVersion?: string;
  branch?: string;
  updateUrl?: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  timestamp: string;
  details?: NotificationDetails;
}

interface LogEntryWithRead extends LogEntry {
  read?: boolean;
}

const mapLogToNotification = (log: LogEntryWithRead): Notification => {
  const type: NotificationType =
    log.details?.type === 'update'
      ? 'update'
      : log.level === 'error'
        ? 'error'
        : log.level === 'warning'
          ? 'warning'
          : 'info';

  const baseNotification: Notification = {
    id: log.id,
    title: log.category.charAt(0).toUpperCase() + log.category.slice(1),
    message: log.message,
    type,
    read: log.read || false,
    timestamp: log.timestamp,
  };

  if (log.details) {
    return {
      ...baseNotification,
      details: log.details as NotificationDetails,
    };
  }

  return baseNotification;
};

export const getNotifications = async (): Promise<Notification[]> => {
  const logs = Object.values(logStore.logs.get()) as LogEntryWithRead[];

  return logs
    .filter((log) => {
      if (log.details?.type === 'update') {
        return true;
      }

      return log.level === 'error' || log.level === 'warning';
    })
    .map(mapLogToNotification)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const markNotificationRead = async (notificationId: string): Promise<void> => {
  logStore.markAsRead(notificationId);
};

export const clearNotifications = async (): Promise<void> => {
  logStore.clearLogs();
};

export const getUnreadCount = (): number => {
  const logs = Object.values(logStore.logs.get()) as LogEntryWithRead[];

  return logs.filter((log) => {
    if (!log.read) {
      if (log.details?.type === 'update') {
        return true;
      }

      return log.level === 'error' || log.level === 'warning';
    }

    return false;
  }).length;
};
