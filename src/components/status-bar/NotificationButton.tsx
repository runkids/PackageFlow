import React, { useState, useRef, useEffect } from 'react';
import { Bell, Check, Trash2, X, AlertCircle, CheckCircle, XCircle, GitBranch, Shield, Rocket, Webhook, Play } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { useNotificationCenter } from '../../hooks/useNotificationCenter';
import type { NotificationRecord, NotificationCategoryId } from '../../types/notification';

// Category icons mapping
const getCategoryIcon = (category: NotificationCategoryId) => {
  switch (category) {
    case 'webhooks':
      return Webhook;
    case 'workflowExecution':
      return Play;
    case 'gitOperations':
      return GitBranch;
    case 'securityScans':
      return Shield;
    case 'deployments':
      return Rocket;
    default:
      return Bell;
  }
};

// Status icon based on notification type
const getStatusIcon = (type: string) => {
  if (type.includes('success') || type.includes('completed')) {
    return CheckCircle;
  }
  if (type.includes('failed') || type.includes('failure')) {
    return XCircle;
  }
  return AlertCircle;
};

const getStatusColor = (type: string) => {
  if (type.includes('success') || type.includes('completed')) {
    return 'text-green-400';
  }
  if (type.includes('failed') || type.includes('failure')) {
    return 'text-red-400';
  }
  return 'text-blue-400';
};

// Format relative time
const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
};

interface NotificationItemProps {
  notification: NotificationRecord;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkAsRead,
  onDelete,
}) => {
  const CategoryIcon = getCategoryIcon(notification.category);
  const StatusIcon = getStatusIcon(notification.notificationType);
  const statusColor = getStatusColor(notification.notificationType);

  return (
    <div
      className={cn(
        'group px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer',
        !notification.isRead && 'bg-blue-500/5'
      )}
      onClick={() => !notification.isRead && onMarkAsRead(notification.id)}
    >
      <div className="flex items-start gap-3">
        {/* Category icon */}
        <div className={cn('mt-0.5 p-1.5 rounded-lg', statusColor.replace('text-', 'bg-').replace('400', '500/20'))}>
          <CategoryIcon className={cn('w-4 h-4', statusColor)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <StatusIcon className={cn('w-3.5 h-3.5', statusColor)} />
              <span className={cn('text-sm font-medium', notification.isRead ? 'text-muted-foreground' : 'text-foreground')}>
                {notification.title}
              </span>
            </div>
            {!notification.isRead && (
              <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {notification.body}
          </p>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-muted-foreground/60">
              {formatRelativeTime(notification.createdAt)}
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!notification.isRead && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkAsRead(notification.id);
                  }}
                  className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
                  title="Mark as read"
                >
                  <Check className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(notification.id);
                }}
                className="p-1 hover:bg-red-500/20 rounded text-muted-foreground hover:text-red-400"
                title="Delete"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const NotificationButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    loadMore,
    hasMore,
  } = useNotificationCenter();

  // Close panel on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        panelRef.current &&
        buttonRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close panel on Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div className="relative">
      {/* Bell Button */}
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 w-8 relative"
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <Bell
          className={cn(
            'w-4 h-4 transition-colors',
            unreadCount > 0 ? 'text-blue-400' : 'text-muted-foreground'
          )}
        />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 bg-red-500/80 text-white text-[10px] font-medium leading-[15px] rounded-full flex items-center justify-center whitespace-nowrap">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className={cn(
            'absolute right-0 top-full mt-2',
            'w-[360px] max-h-[480px]',
            'bg-card border border-border rounded-xl shadow-lg',
            'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150',
            'flex flex-col overflow-hidden',
            'z-50'
          )}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
            <h3 className="font-medium text-sm text-foreground">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                >
                  Mark all as read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-border">
                  {notifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkAsRead={markAsRead}
                      onDelete={deleteNotification}
                    />
                  ))}
                </div>
                {hasMore && (
                  <div className="px-4 py-2 border-t border-border">
                    <button
                      onClick={loadMore}
                      className="w-full text-xs text-blue-400 hover:text-blue-300 py-1"
                    >
                      Load more
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer - Hidden triangle pointer */}
          <div className="absolute -top-1 right-4 w-2 h-2 bg-card border-l border-t border-border transform rotate-45" />
        </div>
      )}
    </div>
  );
};

export default NotificationButton;
