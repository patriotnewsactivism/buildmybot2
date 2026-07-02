import { AlertTriangle, CheckCircle, Clock, Cpu, RefreshCw, Wrench, Search, Filter, XCircle } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { DataTable, type Column } from '../UI/DataTable';
import { MetricCard } from '../UI/MetricCard';
import { ErrorBoundary } from '../UI/ErrorBoundary';

interface RepairLog {
  id: string;
  bot_id: string | null;
  issue_type: string;
  issue_details: Record<string, unknown>;
  status: 'pending' | 'in_progress' | 'resolved' | 'failed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  auto_fixable: boolean;
  fix_attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  fix_summary: string | null;
}

interface RepairLogsResponse {
  logs: RepairLog[];
  summary: {
    total: number;
    resolved: number;
    pending: number;
    autoFixable: number;
  };
}

interface RepairLogsError {
  error: string;
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Summary Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="h-10 w-10 bg-slate-200 rounded-lg mb-4" />
            <div className="h-8 bg-slate-200 rounded w-24 mb-2" />
            <div className="h-4 bg-slate-200 rounded w-32" />
          </div>
        ))}
      </div>
      {/* Table Skeleton */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-slate-200 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ lastChecked }: { lastChecked: Date | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
        <CheckCircle className="w-12 h-12 text-green-600" />
      </div>
      <h3 className="text-xl font-semibold text-slate-900 mb-2">No Issues Found</h3>
      <p className="text-slate-600 text-center max-w-md mb-4">
        All systems are operating normally. No repair logs or errors have been recorded.
      </p>
      {lastChecked && (
        <p className="text-sm text-slate-400">
          Last checked: {lastChecked.toLocaleString()}
        </p>
      )}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mb-6">
        <AlertTriangle className="w-12 h-12 text-red-600" />
      </div>
      <h3 className="text-xl font-semibold text-slate-900 mb-2">Failed to Load Dashboard</h3>
      <p className="text-slate-600 text-center max-w-md mb-6">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Retry
      </button>
    </div>
  );
}

function ErrorRecoveryDashboardContent() {
  const [data, setData] = useState<RepairLogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterIssueType, setFilterIssueType] = useState<string>('all');

  const fetchRepairLogs = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/admin/repair-logs');
      if (!response.ok) {
        const errorData: RepairLogsError = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const result: RepairLogsResponse = await response.json();
      setData(result);
      setLastChecked(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRepairLogs();
    const interval = setInterval(fetchRepairLogs, 30000);
    return () => clearInterval(interval);
  }, [fetchRepairLogs]);

  const handleQuickFix = async (logId: string) => {
    try {
      setFixingId(logId);
      const response = await fetch(`/api/admin/repair-logs/${logId}/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const errorData: RepairLogsError = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      await fetchRepairLogs();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply quick fix';
      setError(message);
    } finally {
      setFixingId(null);
    }
  };

  if (loading && !data) {
    return <LoadingSkeleton />;
  }

  if (error && !data) {
    return <ErrorState message={error} onRetry={fetchRepairLogs} />;
  }

  if (!data || data.logs.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyState lastChecked={lastChecked} />
        <div className="flex justify-center">
          <button
            type="button"
            onClick={fetchRepairLogs}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>
    );
  }

  const { summary, logs } = data;

  const filteredLogs = logs.filter((log) => {
    if (filterStatus !== 'all' && log.status !== filterStatus) return false;
    if (filterIssueType !== 'all' && log.issue_type !== filterIssueType) return false;
    return true;
  });

  const issueTypes = [...new Set(logs.map((log) => log.issue_type))];

  const columns: Column<RepairLog>[] = [
    {
      key: 'issue_type',
      label: 'Issue Type',
      sortable: true,
      render: (item) => (
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="capitalize">{item.issue_type.replace(/_/g, ' ')}</span>
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (item) => {
        const statusStyles: Record<string, string> = {
          pending: 'bg-yellow-100 text-yellow-800',
          in_progress: 'bg-blue-100 text-blue-800',
          resolved: 'bg-green-100 text-green-800',
          failed: 'bg-red-100 text-red-800',
        };
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[item.status] || 'bg-slate-100 text-slate-800'}`}>
            {item.status.replace(/_/g, ' ')}
          </span>
        );
      },
    },
    {
      key: 'severity',
      label: 'Severity',
      sortable: true,
      render: (item) => {
        const severityStyles: Record<string, string> = {
          low: 'bg-slate-100 text-slate-700',
          medium: 'bg-amber-100 text-amber-700',
          high: 'bg-orange-100 text-orange-700',
          critical: 'bg-red-100 text-red-700',
        };
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${severityStyles[item.severity] || 'bg-slate-100 text-slate-700'}`}>
            {item.severity}
          </span>
        );
      },
    },
    {
      key: 'bot_id',
      label: 'Bot ID',
      sortable: true,
      render: (item) => (
        <span className="font-mono text-xs">
          {item.bot_id ? item.bot_id.substring(0, 8) + '...' : 'N/A'}
        </span>
      ),
    },
    {
      key: 'auto_fixable',
      label: 'Auto-Fixable',
      sortable: true,
      render: (item) => (
        <span className={`inline-flex items-center gap-1 ${item.auto_fixable ? 'text-green-600' : 'text-slate-400'}`}>
          {item.auto_fixable ? (
            <><Cpu className="w-4 h-4" /> Yes</>
          ) : (
            <><XCircle className="w-4 h-4" /> No</>
          )}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      render: (item) => (
        <span className="text-slate-500 text-sm">
          {new Date(item.created_at).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (item) => {
        if (item.status === 'resolved') {
          return (
            <span className="inline-flex items-center gap-1 text-green-600 text-sm">
              <CheckCircle className="w-4 h-4" />
              Resolved
            </span>
          );
        }
        if (item.status === 'pending' && item.auto_fixable) {
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleQuickFix(item.id);
              }}
              disabled={fixingId === item.id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
            >
              {fixingId === item.id ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Fixing...
                </>
              ) : (
                <>
                  <Wrench className="w-4 h-4" />
                  Quick Fix
                </>
              )}
            </button>
          );
        }
        return (
          <span className="text-slate-400 text-sm">
            {item.status === 'in_progress' ? 'In Progress' : 'Manual Fix Required'}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={AlertTriangle}
          label="Total Errors"
          value={summary.total}
          variant="volume"
          subtext="All recorded issues"
        />
        <MetricCard
          icon={CheckCircle}
          label="Resolved"
          value={summary.resolved}
          variant="savings"
          subtext="Successfully fixed"
        />
        <MetricCard
          icon={Clock}
          label="Pending"
          value={summary.pending}
          variant="efficiency"
          subtext="Awaiting resolution"
        />
        <MetricCard
          icon={Cpu}
          label="Auto-Fixable"
          value={summary.autoFixable}
          variant="revenue"
          subtext="Can be automatically repaired"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white min-h-[44px]"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
            <select
              value={filterIssueType}
              onChange={(e) => setFilterIssueType(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white min-h-[44px]"
            >
              <option value="all">All Issue Types</option>
              {issueTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastChecked && (
            <span className="text-xs text-slate-400">
              Last updated: {lastChecked.toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={fetchRepairLogs}
            className="inline-flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm min-h-[44px]"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Data Table */}
      <DataTable<RepairLog>
        columns={columns}
        data={filteredLogs}
        searchable
        searchPlaceholder="Search repair logs..."
        emptyMessage="No repair logs match your filters."
      />

      {/* Auto-refresh indicator */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
        <RefreshCw className="w-3 h-3" />
        Auto-refreshing every 30 seconds
      </div>
    </div>
  );
}

export function ErrorRecoveryDashboard() {
  return (
    <ErrorBoundary>
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">System Health</h2>
          <p className="text-slate-600 mt-1">
            Monitor and resolve system errors automatically
          </p>
        </div>
        <ErrorRecoveryDashboardContent />
      </div>
    </ErrorBoundary>
  );
}
