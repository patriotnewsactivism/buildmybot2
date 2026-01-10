import {
  AlertCircle,
  AlertTriangle,
  Bell,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Info,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';

interface NotificationStats {
  totalReceipts: number;
  deliveredCount?: number;
  viewedCount: number;
  acknowledgedCount: number;
}

interface Notification {
  id: string;
  title: string;
  body: string;
  isPopup: boolean;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdBy: string;
  publishAt: string | null;
  expiresAt: string | null;
  audienceType: 'all' | 'plan' | 'role';
  audienceFilter: { plans?: string[]; roles?: string[] };
  createdAt: string;
  updatedAt: string;
  stats: NotificationStats;
}

interface NotificationFormData {
  title: string;
  body: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  isPopup: boolean;
  audienceType: 'all' | 'plan' | 'role';
  audienceFilter: { plans?: string[]; roles?: string[] };
  scheduleEnabled: boolean;
  publishAt: string;
}

const priorityConfig = {
  low: { label: 'Low', color: 'bg-gray-100 text-gray-700', icon: Info },
  normal: { label: 'Normal', color: 'bg-blue-100 text-blue-700', icon: Bell },
  high: {
    label: 'High',
    color: 'bg-orange-100 text-orange-700',
    icon: AlertTriangle,
  },
  urgent: {
    label: 'Urgent',
    color: 'bg-red-100 text-red-700',
    icon: AlertCircle,
  },
};

const planOptions = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
const roleOptions = ['User', 'Partner', 'Reseller', 'Admin', 'MasterAdmin'];

const PremiumCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}
  >
    {children}
  </div>
);

export const NotificationComposer: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [form, setForm] = useState<NotificationFormData>({
    title: '',
    body: '',
    priority: 'normal',
    isPopup: false,
    audienceType: 'all',
    audienceFilter: {},
    scheduleEnabled: false,
    publishAt: '',
  });

  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/admin/notifications', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch notifications');
      const data = await response.json();
      setNotifications(data);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: any = {
        title: form.title,
        body: form.body,
        priority: form.priority,
        isPopup: form.isPopup,
        audienceType: form.audienceType,
        audienceFilter: form.audienceFilter,
      };

      if (form.scheduleEnabled && form.publishAt) {
        payload.publishAt = new Date(form.publishAt).toISOString();
      }

      const response = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send notification');
      }

      setForm({
        title: '',
        body: '',
        priority: 'normal',
        isPopup: false,
        audienceType: 'all',
        audienceFilter: {},
        scheduleEnabled: false,
        publishAt: '',
      });

      await fetchNotifications();
    } catch (err: any) {
      setError(err.message || 'Failed to send notification');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this notification?')) return;

    try {
      const response = await fetch(`/api/admin/notifications/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to delete notification');
      await fetchNotifications();
    } catch (err) {
      console.error('Error deleting notification:', err);
      setError('Failed to delete notification');
    }
  };

  const getPercentage = (count: number, total: number): string => {
    if (total === 0) return '0%';
    return `${Math.round((count / total) * 100)}%`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getAudienceLabel = (notification: Notification): string => {
    if (notification.audienceType === 'all') return 'All Users';
    if (notification.audienceType === 'plan') {
      const plans = notification.audienceFilter?.plans || [];
      return plans.length > 0 ? `Plans: ${plans.join(', ')}` : 'By Plan';
    }
    if (notification.audienceType === 'role') {
      const roles = notification.audienceFilter?.roles || [];
      return roles.length > 0 ? `Roles: ${roles.join(', ')}` : 'By Role';
    }
    return 'Unknown';
  };

  const PriorityBadge: React.FC<{ priority: keyof typeof priorityConfig }> = ({
    priority,
  }) => {
    const config = priorityConfig[priority];
    const Icon = config.icon;
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}
      >
        <Icon size={12} />
        {config.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <PremiumCard className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg md:text-xl font-bold text-slate-900">
              Compose Notification
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Broadcast messages to users across the platform
            </p>
          </div>
          <div className="p-2 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg">
            <Bell className="text-white" size={20} />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) =>
                setForm({ ...form, title: e.target.value.slice(0, 255) })
              }
              placeholder="Notification title..."
              maxLength={255}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              required
            />
            <p className="text-xs text-slate-400 mt-1">
              {form.title.length}/255 characters
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Body
            </label>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Notification content..."
              rows={4}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Priority
              </label>
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value as any })
                }
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Audience
              </label>
              <select
                value={form.audienceType}
                onChange={(e) => {
                  const newType = e.target.value as any;
                  setForm({
                    ...form,
                    audienceType: newType,
                    audienceFilter: {},
                  });
                }}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="all">All Users</option>
                <option value="plan">By Plan</option>
                <option value="role">By Role</option>
              </select>
            </div>
          </div>

          {form.audienceType === 'plan' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Select Plans
              </label>
              <div className="flex flex-wrap gap-2">
                {planOptions.map((plan) => (
                  <label key={plan} className="inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={
                        form.audienceFilter.plans?.includes(plan) || false
                      }
                      onChange={(e) => {
                        const plans = form.audienceFilter.plans || [];
                        if (e.target.checked) {
                          setForm({
                            ...form,
                            audienceFilter: { plans: [...plans, plan] },
                          });
                        } else {
                          setForm({
                            ...form,
                            audienceFilter: {
                              plans: plans.filter((p) => p !== plan),
                            },
                          });
                        }
                      }}
                      className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                    />
                    <span className="ml-2 text-sm text-slate-700">{plan}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {form.audienceType === 'role' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Select Roles
              </label>
              <div className="flex flex-wrap gap-2">
                {roleOptions.map((role) => (
                  <label key={role} className="inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={
                        form.audienceFilter.roles?.includes(role) || false
                      }
                      onChange={(e) => {
                        const roles = form.audienceFilter.roles || [];
                        if (e.target.checked) {
                          setForm({
                            ...form,
                            audienceFilter: { roles: [...roles, role] },
                          });
                        } else {
                          setForm({
                            ...form,
                            audienceFilter: {
                              roles: roles.filter((r) => r !== role),
                            },
                          });
                        }
                      }}
                      className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                    />
                    <span className="ml-2 text-sm text-slate-700">{role}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isPopup}
                  onChange={(e) =>
                    setForm({ ...form, isPopup: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500" />
              </label>
              <div>
                <span className="text-sm font-medium text-slate-700">
                  Require Acknowledgment
                </span>
                <p className="text-xs text-slate-500">
                  Shows as modal popup users must dismiss
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.scheduleEnabled}
                  onChange={(e) =>
                    setForm({ ...form, scheduleEnabled: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500" />
              </label>
              <div>
                <span className="text-sm font-medium text-slate-700">
                  Schedule for Later
                </span>
                <p className="text-xs text-slate-500">
                  Set a specific time to publish
                </p>
              </div>
            </div>
            {form.scheduleEnabled && (
              <input
                type="datetime-local"
                value={form.publishAt}
                onChange={(e) =>
                  setForm({ ...form, publishAt: e.target.value })
                }
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            )}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Eye size={18} />
              Preview
            </button>
            <button
              type="submit"
              disabled={submitting || !form.title.trim()}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg hover:from-orange-600 hover:to-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={18} />
              {submitting
                ? 'Sending...'
                : form.scheduleEnabled
                  ? 'Schedule'
                  : 'Send Now'}
            </button>
          </div>
        </form>
      </PremiumCard>

      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-slate-900">
                Notification Preview
              </h4>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div
              className={`p-4 rounded-lg border-l-4 ${
                form.priority === 'urgent'
                  ? 'bg-red-50 border-red-500'
                  : form.priority === 'high'
                    ? 'bg-orange-50 border-orange-500'
                    : form.priority === 'low'
                      ? 'bg-gray-50 border-gray-500'
                      : 'bg-blue-50 border-blue-500'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    form.priority === 'urgent'
                      ? 'bg-red-100'
                      : form.priority === 'high'
                        ? 'bg-orange-100'
                        : form.priority === 'low'
                          ? 'bg-gray-100'
                          : 'bg-blue-100'
                  }`}
                >
                  <Bell
                    size={20}
                    className={
                      form.priority === 'urgent'
                        ? 'text-red-600'
                        : form.priority === 'high'
                          ? 'text-orange-600'
                          : form.priority === 'low'
                            ? 'text-gray-600'
                            : 'text-blue-600'
                    }
                  />
                </div>
                <div className="flex-1">
                  <h5 className="font-semibold text-slate-900">
                    {form.title || 'Untitled'}
                  </h5>
                  <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">
                    {form.body || 'No content'}
                  </p>
                </div>
              </div>
              {form.isPopup && (
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    className="px-4 py-1.5 bg-slate-900 text-white text-sm rounded-lg"
                  >
                    Acknowledge
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-3 text-center">
              {form.isPopup
                ? 'This will appear as a modal popup'
                : 'This will appear in the notification feed'}
            </p>
          </div>
        </div>
      )}

      <PremiumCard className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg md:text-xl font-bold text-slate-900">
              Notification History
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Past broadcasts and their engagement stats
            </p>
          </div>
          <button
            type="button"
            onClick={fetchNotifications}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            title="Refresh"
          >
            <Clock size={20} />
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse h-16 bg-slate-100 rounded-lg"
              />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12">
            <div className="p-4 bg-slate-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <Bell className="text-slate-400" size={28} />
            </div>
            <h4 className="text-lg font-semibold text-slate-900 mb-2">
              No notifications yet
            </h4>
            <p className="text-slate-500">
              Create your first broadcast notification above
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => {
              const isExpanded = expandedId === notification.id;
              const stats = notification.stats;
              const total = stats.totalReceipts || 1;

              return (
                <div
                  key={notification.id}
                  className="border border-slate-200 rounded-lg overflow-hidden"
                >
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : notification.id)
                    }
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <PriorityBadge priority={notification.priority} />
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-slate-900 truncate">
                          {notification.title}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatDate(notification.createdAt)} •{' '}
                          {getAudienceLabel(notification)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="hidden md:flex items-center gap-4 text-sm">
                        <span className="text-slate-600">
                          <span className="font-medium">
                            {getPercentage(stats.viewedCount, total)}
                          </span>{' '}
                          viewed
                        </span>
                        <span className="text-slate-600">
                          <span className="font-medium">
                            {getPercentage(stats.acknowledgedCount, total)}
                          </span>{' '}
                          acknowledged
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp size={20} className="text-slate-400" />
                      ) : (
                        <ChevronDown size={20} className="text-slate-400" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50">
                      <div className="pt-4 space-y-4">
                        <div>
                          <h5 className="text-sm font-medium text-slate-700 mb-1">
                            Content
                          </h5>
                          <p className="text-sm text-slate-600 whitespace-pre-wrap">
                            {notification.body || 'No content'}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="p-3 bg-white rounded-lg border border-slate-200">
                            <div className="text-2xl font-bold text-slate-900">
                              {stats.totalReceipts}
                            </div>
                            <div className="text-xs text-slate-500">
                              Delivered
                            </div>
                          </div>
                          <div className="p-3 bg-white rounded-lg border border-slate-200">
                            <div className="text-2xl font-bold text-blue-600">
                              {stats.viewedCount}
                            </div>
                            <div className="text-xs text-slate-500">
                              {getPercentage(stats.viewedCount, total)} Viewed
                            </div>
                          </div>
                          <div className="p-3 bg-white rounded-lg border border-slate-200">
                            <div className="text-2xl font-bold text-emerald-600">
                              {stats.acknowledgedCount}
                            </div>
                            <div className="text-xs text-slate-500">
                              {getPercentage(stats.acknowledgedCount, total)}{' '}
                              Acknowledged
                            </div>
                          </div>
                          <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-center">
                            {notification.isPopup && (
                              <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded">
                                Popup Required
                              </span>
                            )}
                            {notification.publishAt &&
                              new Date(notification.publishAt) > new Date() && (
                                <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded">
                                  Scheduled
                                </span>
                              )}
                            {!notification.isPopup &&
                              !(
                                notification.publishAt &&
                                new Date(notification.publishAt) > new Date()
                              ) && (
                                <span className="text-xs text-slate-400">
                                  Standard
                                </span>
                              )}
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(notification.id);
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
                          >
                            <Trash2 size={16} />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PremiumCard>
    </div>
  );
};
