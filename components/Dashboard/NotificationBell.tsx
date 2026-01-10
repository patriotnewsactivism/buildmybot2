import { AlertCircle, Bell, Check, CheckCheck, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { dbService } from '../../services/dbService';

interface NotificationReceipt {
  viewedAt: string | null;
  acknowledgedAt: string | null;
}

interface Notification {
  id: string;
  title: string;
  body: string;
  isPopup: boolean;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  createdAt: string;
  receipt: NotificationReceipt;
}

interface NotificationsResponse {
  unread: Notification[];
  recent: Notification[];
  unreadCount: number;
}

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  normal: 'bg-blue-500',
  low: 'bg-gray-400',
};

const priorityBorderColors: Record<string, string> = {
  urgent: 'border-l-red-500',
  high: 'border-l-orange-500',
  normal: 'border-l-blue-500',
  low: 'border-l-gray-400',
};

function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

export const NotificationBell: React.FC = () => {
  const [notifications, setNotifications] =
    useState<NotificationsResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [popupNotification, setPopupNotification] =
    useState<Notification | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await dbService.getNotifications();
      setNotifications(data);

      const unacknowledgedPopup = data.unread.find(
        (n: Notification) => n.isPopup && !n.receipt.acknowledgedAt,
      );
      if (unacknowledgedPopup && !popupNotification) {
        setPopupNotification(unacknowledgedPopup);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  }, [popupNotification]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDropdownOpen = async () => {
    setIsOpen(!isOpen);
    if (!isOpen && notifications?.unread) {
      const unreadIds = notifications.unread
        .filter((n) => !n.receipt.viewedAt)
        .map((n) => n.id);

      if (unreadIds.length > 0) {
        try {
          await Promise.all(
            unreadIds.map((id) => dbService.markNotificationViewed(id)),
          );
          fetchNotifications();
        } catch (error) {
          console.error('Failed to mark notifications as viewed:', error);
        }
      }
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!notifications?.unread) return;

    setMarkingAllRead(true);
    const unreadIds = notifications.unread.map((n) => n.id);

    try {
      await dbService.markAllNotificationsViewed(unreadIds);
      await fetchNotifications();
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    } finally {
      setMarkingAllRead(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!popupNotification) return;

    setAcknowledging(true);
    try {
      await dbService.acknowledgeNotification(popupNotification.id);
      setPopupNotification(null);
      await fetchNotifications();
    } catch (error) {
      console.error('Failed to acknowledge notification:', error);
    } finally {
      setAcknowledging(false);
    }
  };

  const unreadCount = notifications?.unreadCount || 0;
  const hasUrgentUnread = notifications?.unread.some(
    (n) => n.priority === 'urgent' && !n.receipt.viewedAt,
  );

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          className={`p-2.5 rounded-md text-slate-600 hover:bg-slate-100 active:bg-slate-200 relative min-h-[44px] min-w-[44px] flex items-center justify-center ${
            hasUrgentUnread ? 'animate-pulse' : ''
          }`}
          onClick={handleDropdownOpen}
          aria-label="Notifications"
        >
          <Bell size={20} className={hasUrgentUnread ? 'animate-shake' : ''} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full text-white text-xs font-bold flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-lg border border-slate-200 z-50 max-h-[70vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  disabled={markingAllRead}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 disabled:opacity-50"
                >
                  <CheckCheck size={14} />
                  {markingAllRead ? 'Marking...' : 'Mark all as read'}
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {notifications?.recent && notifications.recent.length > 0 ? (
                notifications.recent.map((notification) => {
                  const isUnread = !notification.receipt.viewedAt;
                  const isExpanded = expandedId === notification.id;

                  return (
                    <div
                      key={notification.id}
                      className={`px-4 py-3 border-b border-slate-50 last:border-b-0 cursor-pointer transition-colors border-l-4 ${
                        priorityBorderColors[notification.priority]
                      } ${isUnread ? 'bg-blue-50/50' : 'bg-white hover:bg-slate-50'}`}
                      onClick={() =>
                        setExpandedId(isExpanded ? null : notification.id)
                      }
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                            priorityColors[notification.priority]
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4
                              className={`text-sm truncate ${
                                isUnread
                                  ? 'font-semibold text-slate-900'
                                  : 'font-medium text-slate-700'
                              }`}
                            >
                              {notification.title}
                            </h4>
                            {notification.isPopup && (
                              <AlertCircle
                                size={12}
                                className="text-amber-500 flex-shrink-0"
                              />
                            )}
                          </div>
                          <p
                            className={`text-sm text-slate-600 mt-0.5 ${
                              isExpanded ? '' : 'line-clamp-2'
                            }`}
                          >
                            {notification.body}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {timeAgo(notification.createdAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-4 py-8 text-center text-slate-500">
                  <Bell size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No notifications</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {popupNotification && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div
            className={`bg-white rounded-lg shadow-xl max-w-md w-full border-t-4 ${priorityBorderColors[
              popupNotification.priority
            ].replace('border-l-', 'border-t-')}`}
          >
            <div className="p-6">
              <div className="flex items-start gap-3">
                <span
                  className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${
                    priorityColors[popupNotification.priority]
                  }`}
                />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {popupNotification.title}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {timeAgo(popupNotification.createdAt)}
                  </p>
                </div>
              </div>

              <div className="mt-4 text-slate-700 whitespace-pre-wrap">
                {popupNotification.body}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={handleAcknowledge}
                  disabled={acknowledging}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Check size={16} />
                  {acknowledging ? 'Acknowledging...' : 'Acknowledge'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes shake {
          0%, 100% { transform: rotate(0deg); }
          10%, 30%, 50%, 70%, 90% { transform: rotate(-5deg); }
          20%, 40%, 60%, 80% { transform: rotate(5deg); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out infinite;
        }
      `}</style>
    </>
  );
};
