import {
  Activity,
  AlertTriangle,
  Database,
  Server,
  TrendingUp,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { dbService } from '../../../services/dbService';
import { MetricCard } from '../../UI/MetricCard';

interface SystemMetrics {
  apiCallsPerMin: number;
  errorRate: number;
  avgLatencyMs: number;
  activeUsers: number;
  dbConnections: number;
  dbIdleConnections: number;
  dbWaitingConnections: number;
  totalUsers: number;
  mrrCents: number;
}

export const LiveMetrics: React.FC = () => {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    apiCallsPerMin: 0,
    errorRate: 0,
    avgLatencyMs: 0,
    activeUsers: 0,
    dbConnections: 0,
    dbIdleConnections: 0,
    dbWaitingConnections: 0,
    totalUsers: 0,
    mrrCents: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const data = await dbService.getAdminMetrics();
        setMetrics(data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching metrics:', err);
        setLoading(false);
      }
    };

    // Initial fetch
    fetchMetrics();

    // Refresh every 5 seconds
    const interval = setInterval(fetchMetrics, 5000);

    return () => clearInterval(interval);
  }, []);

  const dbConnectionStatus =
    metrics.dbConnections > 80
      ? 'critical'
      : metrics.dbConnections > 60
        ? 'warning'
        : 'healthy';

  const errorRateStatus =
    metrics.errorRate > 5
      ? 'critical'
      : metrics.errorRate > 1
        ? 'warning'
        : 'healthy';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900">
          Live System Metrics
        </h2>
        <div className="flex items-center space-x-2 text-sm text-slate-600">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span>Live updating every 5s</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          icon={Users}
          label="Active Users"
          value={metrics.activeUsers}
          loading={loading}
        />
        <MetricCard
          icon={Activity}
          label="API Calls/min"
          value={metrics.apiCallsPerMin}
          loading={loading}
        />
        <MetricCard
          icon={Database}
          label="DB Connections"
          value={metrics.dbConnections}
          status={dbConnectionStatus}
          loading={loading}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Error Rate"
          value={`${metrics.errorRate.toFixed(2)}%`}
          status={errorRateStatus}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          icon={Server}
          label="Avg Latency"
          value={`${metrics.avgLatencyMs}ms`}
          status={metrics.avgLatencyMs > 1000 ? 'warning' : 'healthy'}
          loading={loading}
        />
        <MetricCard
          icon={Users}
          label="Total Users"
          value={metrics.totalUsers}
          loading={loading}
        />
        <MetricCard
          icon={TrendingUp}
          label="Monthly Recurring Revenue"
          value={`$${(metrics.mrrCents / 100).toLocaleString()}`}
          loading={loading}
        />
      </div>

      {!loading && (
        <div className="mt-6 bg-slate-50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            Database Pool Details
          </h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-slate-600">Total:</span>
              <span className="ml-2 font-medium text-slate-900">
                {metrics.dbConnections}
              </span>
            </div>
            <div>
              <span className="text-slate-600">Idle:</span>
              <span className="ml-2 font-medium text-slate-900">
                {metrics.dbIdleConnections}
              </span>
            </div>
            <div>
              <span className="text-slate-600">Waiting:</span>
              <span className="ml-2 font-medium text-slate-900">
                {metrics.dbWaitingConnections}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
