import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationHistoryAPI, tauriEvents, type NotificationRecord, type NotificationListResponse } from '../lib/tauri-api';

const DEFAULT_PAGE_SIZE = 20;
const MAX_NOTIFICATIONS = 100;

export interface UseNotificationCenterOptions {
  pageSize?: number;
  autoRefresh?: boolean;
}

export interface UseNotificationCenterReturn {
  // State
  notifications: NotificationRecord[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadMore: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  refresh: () => Promise<void>;

  // Pagination
  hasMore: boolean;
  totalCount: number;
}

export function useNotificationCenter(options: UseNotificationCenterOptions = {}): UseNotificationCenterReturn {
  const { pageSize = DEFAULT_PAGE_SIZE, autoRefresh = true } = options;

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track if initial load has completed
  const initialLoadComplete = useRef(false);

  // Fetch notifications
  const fetchNotifications = useCallback(async (append = false, offset = 0) => {
    try {
      if (!append) {
        setIsLoading(true);
      }
      setError(null);

      const response: NotificationListResponse = await notificationHistoryAPI.getNotifications(pageSize, offset);

      setNotifications(prev => append ? [...prev, ...response.notifications] : response.notifications);
      setTotalCount(response.totalCount);
      setUnreadCount(response.unreadCount);
      initialLoadComplete.current = true;
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch notifications');
    } finally {
      setIsLoading(false);
    }
  }, [pageSize]);

  // Fetch unread count only (lightweight) - exported for potential use
  const fetchUnreadCount = useCallback(async () => {
    try {
      const count = await notificationHistoryAPI.getUnreadCount();
      setUnreadCount(count);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, []);
  // Note: fetchUnreadCount is available but currently not used in favor of full refresh
  void fetchUnreadCount; // Suppress unused warning

  // Initial load
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Listen for new notifications
  useEffect(() => {
    if (!autoRefresh) return;

    const unlistenPromise = tauriEvents.onNewNotification((notification) => {
      // Add new notification to the top of the list
      setNotifications(prev => {
        // Avoid duplicates
        if (prev.some(n => n.id === notification.id)) {
          return prev;
        }
        // Keep list within max size
        const updated = [notification, ...prev];
        if (updated.length > MAX_NOTIFICATIONS) {
          return updated.slice(0, MAX_NOTIFICATIONS);
        }
        return updated;
      });
      setTotalCount(prev => prev + 1);
      setUnreadCount(prev => prev + 1);
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, [autoRefresh]);

  // Load more notifications
  const loadMore = useCallback(async () => {
    if (isLoading || notifications.length >= totalCount) return;
    await fetchNotifications(true, notifications.length);
  }, [isLoading, notifications.length, totalCount, fetchNotifications]);

  // Mark a notification as read
  const markAsRead = useCallback(async (id: string) => {
    try {
      await notificationHistoryAPI.markAsRead(id);
      setNotifications(prev => prev.map(n =>
        n.id === id ? { ...n, isRead: true } : n
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      await notificationHistoryAPI.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  }, []);

  // Delete a notification
  const deleteNotification = useCallback(async (id: string) => {
    try {
      await notificationHistoryAPI.deleteNotification(id);
      setNotifications(prev => {
        const notification = prev.find(n => n.id === id);
        if (notification && !notification.isRead) {
          setUnreadCount(prevCount => Math.max(0, prevCount - 1));
        }
        return prev.filter(n => n.id !== id);
      });
      setTotalCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  }, []);

  // Refresh notifications
  const refresh = useCallback(async () => {
    await fetchNotifications();
  }, [fetchNotifications]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refresh,
    hasMore: notifications.length < totalCount,
    totalCount,
  };
}
