import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  BarChart3,
  Calendar,
  Check,
  CheckCircle,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Gauge,
  Key,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';

interface ApiKey {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimitPerMin: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
}

interface ApiRequestLog {
  id: string;
  apiKeyId: string;
  organizationId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
  ipAddress: string | null;
  createdAt: string;
}

interface ApiUsageStats {
  totalRequests: number;
  successfulRequests: number;
  errorRate: number;
  avgResponseTime: number;
}

interface ApiKeyManagerProps {
  organizationId: string;
  userId?: string;
}

const AVAILABLE_SCOPES = [
  {
    id: 'bots:read',
    label: 'Read Bots',
    description: 'View bot configurations',
  },
  {
    id: 'bots:write',
    label: 'Write Bots',
    description: 'Create and update bots',
  },
  { id: 'leads:read', label: 'Read Leads', description: 'View captured leads' },
  { id: 'leads:write', label: 'Write Leads', description: 'Manage lead data' },
  {
    id: 'analytics:read',
    label: 'Read Analytics',
    description: 'View analytics data',
  },
  {
    id: 'chat:read',
    label: 'Read Conversations',
    description: 'View chat logs',
  },
  {
    id: 'chat:write',
    label: 'Send Messages',
    description: 'Send messages via API',
  },
  {
    id: 'knowledge:read',
    label: 'Read Knowledge Base',
    description: 'View knowledge base content',
  },
  {
    id: 'knowledge:write',
    label: 'Write Knowledge Base',
    description: 'Update knowledge base',
  },
  { id: '*', label: 'Full Access', description: 'Access to all API endpoints' },
];

const PremiumCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}
  >
    {children}
  </div>
);

const StatCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}> = ({ icon: Icon, label, value, trend, trendValue }) => (
  <PremiumCard className="p-4 md:p-6">
    <div className="flex items-start justify-between">
      <div className="p-2 md:p-3 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg">
        <Icon className="text-white" size={20} />
      </div>
      {trend && trendValue && (
        <div
          className={`flex items-center gap-1 text-xs font-medium ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-slate-500'}`}
        >
          {trend === 'up' ? (
            <ArrowUpRight size={14} />
          ) : trend === 'down' ? (
            <ArrowDownRight size={14} />
          ) : null}
          {trendValue}
        </div>
      )}
    </div>
    <div className="mt-3 md:mt-4">
      <div className="text-2xl md:text-3xl font-bold text-slate-900">
        {value}
      </div>
      <div className="text-xs md:text-sm font-medium text-slate-600 mt-1">
        {label}
      </div>
    </div>
  </PremiumCard>
);

export const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({
  organizationId,
  userId,
}) => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [logs, setLogs] = useState<ApiRequestLog[]>([]);
  const [stats, setStats] = useState<ApiUsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([]);
  const [newKeyExpiration, setNewKeyExpiration] = useState<string>('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [showScopes, setShowScopes] = useState<string | null>(null);

  const newKeyNameId = 'api-key-name';
  const newKeyExpirationId = 'api-key-expiration';

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [keysRes, statsRes, logsRes] = await Promise.all([
        fetch(buildApiUrl(`/revenue/api-keys/${organizationId}`)),
        fetch(buildApiUrl(`/revenue/api-keys/${organizationId}/stats`)),
        fetch(buildApiUrl(`/revenue/api-keys/${organizationId}/logs`)),
      ]);

      if (keysRes.ok) {
        const keysData = await keysRes.json();
        setApiKeys(keysData);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setLogs(logsData.slice(0, 20));
      }
    } catch (error) {
      console.error('Failed to fetch API key data:', error);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const createApiKey = async () => {
    if (!newKeyName.trim()) {
      setNotification({
        type: 'error',
        message: 'Please enter a name for the API key',
      });
      return;
    }

    try {
      setCreating(true);
      const expiresInDays = newKeyExpiration
        ? Math.ceil(
            (new Date(newKeyExpiration).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24),
          )
        : undefined;

      const response = await fetch(
        buildApiUrl(`/revenue/api-keys/${organizationId}`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newKeyName,
            scopes: newKeyScopes.length > 0 ? newKeyScopes : ['*'],
            createdBy: userId,
            expiresInDays:
              expiresInDays && expiresInDays > 0 ? expiresInDays : undefined,
          }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        setCreatedKey(data.key);
        setApiKeys([data, ...apiKeys]);
        setNotification({
          type: 'success',
          message: 'API key created successfully!',
        });
      } else {
        const error = await response.json();
        setNotification({
          type: 'error',
          message: error.error || 'Failed to create API key',
        });
        setShowCreateModal(false);
      }
    } catch (error) {
      setNotification({ type: 'error', message: 'Failed to create API key' });
      setShowCreateModal(false);
    } finally {
      setCreating(false);
    }
  };

  const revokeApiKey = async (apiKeyId: string) => {
    if (
      !confirm(
        'Are you sure you want to revoke this API key? This action cannot be undone.',
      )
    )
      return;

    try {
      const response = await fetch(
        buildApiUrl(`/revenue/api-keys/${apiKeyId}/revoke`),
        {
          method: 'POST',
        },
      );

      if (response.ok) {
        setApiKeys(
          apiKeys.map((k) =>
            k.id === apiKeyId ? { ...k, isActive: false } : k,
          ),
        );
        setNotification({
          type: 'success',
          message: 'API key revoked successfully',
        });
      } else {
        setNotification({ type: 'error', message: 'Failed to revoke API key' });
      }
    } catch (error) {
      setNotification({ type: 'error', message: 'Failed to revoke API key' });
    }
  };

  const deleteApiKey = async (apiKeyId: string) => {
    if (!confirm('Are you sure you want to permanently delete this API key?'))
      return;

    try {
      const response = await fetch(
        buildApiUrl(`/revenue/api-keys/${apiKeyId}`),
        {
          method: 'DELETE',
        },
      );

      if (response.ok) {
        setApiKeys(apiKeys.filter((k) => k.id !== apiKeyId));
        setNotification({
          type: 'success',
          message: 'API key deleted successfully',
        });
      } else {
        setNotification({ type: 'error', message: 'Failed to delete API key' });
      }
    } catch (error) {
      setNotification({ type: 'error', message: 'Failed to delete API key' });
    }
  };

  const copyToClipboard = async (text: string, id?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (id) {
        setCopiedKeyId(id);
        setTimeout(() => setCopiedKeyId(null), 2000);
      }
      setNotification({ type: 'success', message: 'Copied to clipboard!' });
    } catch (error) {
      setNotification({ type: 'error', message: 'Failed to copy' });
    }
  };

  const toggleScope = (scopeId: string) => {
    if (scopeId === '*') {
      setNewKeyScopes(newKeyScopes.includes('*') ? [] : ['*']);
    } else {
      const filtered = newKeyScopes.filter((s) => s !== '*');
      if (filtered.includes(scopeId)) {
        setNewKeyScopes(filtered.filter((s) => s !== scopeId));
      } else {
        setNewKeyScopes([...filtered, scopeId]);
      }
    }
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewKeyName('');
    setNewKeyScopes([]);
    setNewKeyExpiration('');
    setCreatedKey(null);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getMethodColor = (method: string) => {
    const colors: Record<string, string> = {
      GET: 'bg-emerald-100 text-emerald-700',
      POST: 'bg-blue-100 text-blue-700',
      PUT: 'bg-amber-100 text-amber-700',
      PATCH: 'bg-purple-100 text-purple-700',
      DELETE: 'bg-red-100 text-red-700',
    };
    return colors[method] || 'bg-slate-100 text-slate-700';
  };

  const getStatusColor = (code: number) => {
    if (code >= 200 && code < 300) return 'text-emerald-600';
    if (code >= 400 && code < 500) return 'text-amber-600';
    if (code >= 500) return 'text-red-600';
    return 'text-slate-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in px-2 md:px-0">
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in ${
            notification.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle size={18} />
          ) : (
            <AlertCircle size={18} />
          )}
          {notification.message}
        </div>
      )}

      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl md:rounded-2xl p-4 md:p-8">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-transparent to-amber-500/10" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-orange-500/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-amber-500/20 to-transparent rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-sm font-medium">
                  API Management
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-white via-orange-100 to-amber-200 bg-clip-text text-transparent">
                API Keys
              </h1>
              <p className="text-slate-400 mt-2 text-sm md:text-base">
                Manage your API keys and monitor usage
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-lg shadow-lg shadow-orange-500/25 hover:shadow-xl hover:shadow-orange-500/30 transition-all duration-200"
            >
              <Plus size={18} />
              <span>Create API Key</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <div className="flex items-center space-x-2 text-slate-400 text-sm">
              <Shield size={16} className="text-emerald-400" />
              <span>Secure Access</span>
            </div>
            <div className="w-px h-4 bg-slate-700 hidden sm:block" />
            <div className="flex items-center space-x-2 text-slate-400 text-sm">
              <Zap size={16} className="text-amber-400" />
              <span>Rate Limited</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Activity}
          label="Total Requests"
          value={stats?.totalRequests.toLocaleString() || '0'}
        />
        <StatCard
          icon={CheckCircle}
          label="Success Rate"
          value={`${stats ? (100 - stats.errorRate).toFixed(1) : '0'}%`}
          trend={stats && stats.errorRate < 5 ? 'up' : 'neutral'}
          trendValue={stats && stats.errorRate < 5 ? 'Healthy' : undefined}
        />
        <StatCard
          icon={Clock}
          label="Avg Response Time"
          value={`${stats?.avgResponseTime || 0}ms`}
        />
        <StatCard
          icon={Key}
          label="Active Keys"
          value={apiKeys.filter((k) => k.isActive).length}
        />
      </div>

      <PremiumCard className="p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg">
            <Key className="text-white" size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">API Keys</h3>
            <p className="text-sm text-slate-500">
              Your organization's API access tokens
            </p>
          </div>
        </div>

        {apiKeys.length === 0 ? (
          <div className="text-center py-12">
            <div className="p-4 bg-slate-100 rounded-full inline-block mb-4">
              <Key className="text-slate-400" size={32} />
            </div>
            <h4 className="text-lg font-semibold text-slate-900 mb-2">
              No API Keys Yet
            </h4>
            <p className="text-slate-500 mb-4">
              Create your first API key to start integrating with our API.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors"
            >
              Create API Key
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Key Prefix
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Scopes
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Last Used
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((key) => (
                  <tr
                    key={key.id}
                    className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="py-4 px-4">
                      <div className="font-medium text-slate-900">
                        {key.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Rate: {key.rateLimitPerMin}/min
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <code className="text-sm font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded">
                        {key.keyPrefix}...
                      </code>
                    </td>
                    <td className="py-4 px-4">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setShowScopes(showScopes === key.id ? null : key.id)
                          }
                          className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
                        >
                          {showScopes === key.id ? (
                            <EyeOff size={14} />
                          ) : (
                            <Eye size={14} />
                          )}
                          {(key.scopes as string[]).includes('*')
                            ? 'Full Access'
                            : `${(key.scopes as string[]).length} scopes`}
                        </button>
                        {showScopes === key.id && (
                          <div className="absolute z-10 mt-2 p-3 bg-white rounded-lg shadow-xl border border-slate-200 min-w-[200px]">
                            <div className="text-xs font-medium text-slate-500 mb-2">
                              Permissions
                            </div>
                            <div className="space-y-1">
                              {(key.scopes as string[]).map((scope) => (
                                <div
                                  key={scope}
                                  className="text-sm text-slate-700 flex items-center gap-2"
                                >
                                  <Check
                                    size={12}
                                    className="text-emerald-500"
                                  />
                                  {scope === '*' ? 'Full Access' : scope}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600">
                      {formatDateTime(key.lastUsedAt)}
                    </td>
                    <td className="py-4 px-4 text-sm text-slate-600">
                      {formatDate(key.createdAt)}
                    </td>
                    <td className="py-4 px-4">
                      {key.isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          Revoked
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(key.keyPrefix, key.id)}
                          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Copy prefix"
                        >
                          {copiedKeyId === key.id ? (
                            <Check size={16} className="text-emerald-500" />
                          ) : (
                            <Copy size={16} />
                          )}
                        </button>
                        {key.isActive && (
                          <button
                            type="button"
                            onClick={() => revokeApiKey(key.id)}
                            className="p-2 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Revoke key"
                          >
                            <Ban size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteApiKey(key.id)}
                          className="p-2 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete key"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PremiumCard>

      <PremiumCard className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg">
              <Gauge className="text-white" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Rate Limits</h3>
              <p className="text-sm text-slate-500">
                Current API rate limiting configuration
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="text-2xl font-bold text-slate-900">60</div>
            <div className="text-sm text-slate-600 mt-1">
              Requests per minute (default)
            </div>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="text-2xl font-bold text-slate-900">1,000</div>
            <div className="text-sm text-slate-600 mt-1">Requests per hour</div>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="text-2xl font-bold text-slate-900">10,000</div>
            <div className="text-sm text-slate-600 mt-1">Requests per day</div>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-sm text-blue-800">
            <strong>Need higher limits?</strong> Upgrade your plan or contact
            support for enterprise rate limits.
          </p>
        </div>
      </PremiumCard>

      <PremiumCard className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg">
              <BarChart3 className="text-white" size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Recent API Requests
              </h3>
              <p className="text-sm text-slate-500">
                Latest API activity across all keys
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw size={18} />
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="mx-auto text-slate-300 mb-3" size={40} />
            <p className="text-slate-500">No API requests logged yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Method
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Endpoint
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Response Time
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getMethodColor(log.method)}`}
                      >
                        {log.method}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <code className="text-sm text-slate-700">
                        {log.endpoint}
                      </code>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-medium ${getStatusColor(log.statusCode)}`}
                      >
                        {log.statusCode}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {log.responseTimeMs}ms
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500">
                      {formatDateTime(log.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PremiumCard>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">
                  {createdKey ? 'API Key Created' : 'Create New API Key'}
                </h3>
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6">
              {createdKey ? (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertCircle
                        className="text-amber-500 shrink-0 mt-0.5"
                        size={20}
                      />
                      <div>
                        <p className="text-sm font-medium text-amber-800">
                          Save this key now!
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          This is the only time you'll see this key. Store it
                          securely - you won't be able to see it again.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="block text-sm font-medium text-slate-700">
                      Your API Key
                    </p>
                    <div className="flex items-center gap-2 p-3 bg-slate-900 rounded-lg">
                      <code className="flex-1 text-sm font-mono text-emerald-400 break-all">
                        {createdKey}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(createdKey)}
                        className="p-2 text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors shrink-0"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="w-full px-4 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <label
                      className="block text-sm font-medium text-slate-700 mb-2"
                      htmlFor={newKeyNameId}
                    >
                      Key Name *
                    </label>
                    <input
                      id={newKeyNameId}
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g., Production Server, Mobile App"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <p className="block text-sm font-medium text-slate-700 mb-2">
                      Permissions
                    </p>
                    <div className="space-y-2 max-h-48 overflow-y-auto p-3 bg-slate-50 rounded-lg border border-slate-200">
                      {AVAILABLE_SCOPES.map((scope) => (
                        <label
                          key={scope.id}
                          className={`flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                            newKeyScopes.includes(scope.id)
                              ? 'bg-orange-50 border border-orange-200'
                              : 'hover:bg-slate-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={
                              newKeyScopes.includes(scope.id) ||
                              (scope.id !== '*' && newKeyScopes.includes('*'))
                            }
                            onChange={() => toggleScope(scope.id)}
                            disabled={
                              scope.id !== '*' && newKeyScopes.includes('*')
                            }
                            className="mt-0.5 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                          />
                          <div>
                            <div className="text-sm font-medium text-slate-900">
                              {scope.label}
                            </div>
                            <div className="text-xs text-slate-500">
                              {scope.description}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                    {newKeyScopes.length === 0 && (
                      <p className="text-xs text-slate-500 mt-2">
                        No scopes selected - key will have full access by
                        default
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      className="block text-sm font-medium text-slate-700 mb-2"
                      htmlFor={newKeyExpirationId}
                    >
                      <span className="flex items-center gap-2">
                        <Calendar size={16} />
                        Expiration Date (Optional)
                      </span>
                    </label>
                    <input
                      id={newKeyExpirationId}
                      type="date"
                      value={newKeyExpiration}
                      onChange={(e) => setNewKeyExpiration(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Leave empty for a non-expiring key
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={closeCreateModal}
                      className="flex-1 px-4 py-2.5 text-slate-700 font-medium border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={createApiKey}
                      disabled={creating || !newKeyName.trim()}
                      className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {creating ? (
                        <>
                          <Loader2 className="animate-spin" size={18} />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Key size={18} />
                          Create Key
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
