import {
  AlertTriangle,
  BarChart3,
  Clock,
  DollarSign,
  RefreshCw,
  Server,
  Shield,
  Ticket,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';
import { HudMetric } from '../UI/HudMetric';
import { Panel } from '../UI/Panel';
import { StatusDot } from '../UI/StatusDot';
import { TerminalConsole, type LogLine } from '../UI/TerminalConsole';
import { QuickMetricsWidget } from '../UI/QuickMetricsWidget';
import AdminFeaturesOverview from '../Analytics/AdminFeaturesOverview';
import { ComprehensiveAnalytics } from '../Analytics/ComprehensiveAnalytics';
import { ErrorRecoveryDashboard } from './ErrorRecoveryDashboard';
import { NotificationComposer } from './NotificationComposer';
import { PartnerOverviewAdmin } from './PartnerOverviewAdmin';
import { FinancialDashboard } from './widgets/FinancialDashboard';

interface AdminDashboardMetrics {
  totalUsers: number;
  activeBots: number;
  totalRevenue: number;
  newSignupsToday: number;
  apiCallsLast24h: number;
  supportTicketsOpen: number;
  systemHealthScore: number;
  averageResponseTime: number;
  conversionRate: number;
  totalLeads: number;
  totalConversations: number;
}

// The dashboard currently implements 'overview' and 'system-health'. The
// remaining names exist because App.tsx maps admin URL paths onto tabs;
// until those views are built, any unimplemented tab renders the overview.
export type AdminTab =
  | 'overview'
  | 'system-health'
  | 'metrics'
  | 'users'
  | 'partners'
  | 'financial'
  | 'analytics'
  | 'support'
  | 'system'
  | 'affiliates'
  | 'agents'
  | 'clients'
  | 'conversations';

interface AdminDashboardV2Props {
  /** Called when an admin starts impersonating a user (reserved for future
   * drill-down UI; accepted so App can wire it without a type error). */
  onImpersonate?: (
    targetUserId: string,
    reason: string,
  ) => void | Promise<void>;
  /** Controlled tab; when provided with onTabChange the parent owns tab state. */
  activeTab?: AdminTab;
  onTabChange?: (tab: AdminTab) => void;
}

export const AdminDashboardV2: React.FC<AdminDashboardV2Props> = ({
  activeTab: controlledTab,
  onTabChange,
}) => {
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(true);
  const [errorMetrics, setErrorMetrics] = useState<string | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [internalTab, setInternalTab] = useState<AdminTab>('overview');
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tab: AdminTab) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  const pushLog = useCallback((level: LogLine['level'], text: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLog((prev) => [...prev.slice(-49), { time, level, text }]);
  }, []);

  const fetchAdminMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    setErrorMetrics(null);
    pushLog('info', 'GET /admin/metrics ...');
    try {
      const response = await fetch(buildApiUrl('/admin/metrics'));
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch admin metrics');
      }
      const data: AdminDashboardMetrics = await response.json();
      setMetrics(data);
      pushLog(
        'ok',
        `200 OK -- ${data.totalUsers} users / ${data.activeBots} active bots / ${data.totalConversations} conversations`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'An unknown error occurred';
      console.error('Error fetching admin metrics:', error);
      setErrorMetrics(msg);
      pushLog('error', `metrics fetch failed -- ${msg}`);
    } finally {
      setLoadingMetrics(false);
    }
  }, [pushLog]);

  useEffect(() => {
    fetchAdminMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCommand = useCallback(
    async (cmd: string) => {
      const [verb] = cmd.trim().toLowerCase().split(/\s+/);
      if (verb === 'refresh' || verb === 'reload') {
        await fetchAdminMetrics();
      } else if (verb === 'help') {
        pushLog('info', 'available commands: refresh, help');
      } else {
        pushLog('warn', `unknown command: "${cmd}" (try "help")`);
      }
    },
    [fetchAdminMetrics, pushLog],
  );

  const tabs: { id: AdminTab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'system-health', label: 'System Health', icon: AlertTriangle },
  ];

  const systemStatus = errorMetrics ? 'warning' : loadingMetrics ? 'processing' : 'online';
  const apiStatus = errorMetrics ? 'API: ERROR' : 'API: 200 OK';

  const ingestionItems = useMemo(
    () => [
      {
        label: 'Bot Response Pipeline',
        detail: `${metrics?.activeBots ?? 0} active bot${metrics?.activeBots === 1 ? '' : 's'}`,
        status: (metrics?.activeBots ?? 0) > 0 ? 'online' : 'offline',
      },
      {
        label: 'Lead Capture Ingestion',
        detail: `${metrics?.totalLeads ?? 0} total leads`,
        status: 'online',
      },
      {
        label: 'Conversation Logging',
        detail: `${metrics?.totalConversations ?? 0} total conversations`,
        status: 'online',
      },
      {
        label: 'Support Queue',
        detail: `${metrics?.supportTicketsOpen ?? 0} open ticket${metrics?.supportTicketsOpen === 1 ? '' : 's'}`,
        status: (metrics?.supportTicketsOpen ?? 0) > 0 ? 'processing' : 'online',
      },
    ],
    [metrics],
  ) as { label: string; detail: string; status: 'online' | 'processing' | 'offline' }[];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-console-bg font-mono text-console-text">
      {/* ambient background: subtle radial glow + faint technical grid */}
      <div className="pointer-events-none fixed inset-0 bg-console-radial" />

      <div className="relative p-4 lg:p-6">
        {/* Top Status Bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-console-border bg-console-surface px-4 py-2.5">
          <div className="flex items-center gap-4">
            <StatusDot status={systemStatus} label={`SYSTEM: ${systemStatus.toUpperCase()}`} />
            <span className="hidden text-console-border sm:inline">|</span>
            <button
              type="button"
              onClick={() => setActiveTab('system-health')}
              className="hidden items-center gap-1.5 text-xs uppercase tracking-widest text-console-muted transition-colors hover:text-accent-cyan sm:flex"
            >
              <Server size={12} /> Agent Activity Logs
            </button>
          </div>
          <StatusDot
            status={errorMetrics ? 'offline' : 'online'}
            label={apiStatus}
          />
        </div>

        <div className="mb-5 mt-5 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-console-text">
              ADMIN_DASHBOARD<span className="text-accent-cyan">.v2</span>
            </h1>
            <p className="mt-1 font-mono text-[11px] text-console-muted">
              Overview of system health, user activity &amp; financial performance
            </p>
          </div>
          <nav className="flex gap-1 rounded-md border border-console-border bg-console-surface/60 p-1" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs uppercase tracking-wide transition-colors ${
                  activeTab === tab.id
                    ? 'bg-accent-cyan/10 text-accent-cyan'
                    : 'text-console-muted hover:bg-console-surface-raised hover:text-console-text'
                }`}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

      {activeTab !== 'system-health' && (
        <>
          {errorMetrics && (
            <div className="mb-4 border border-accent-red/40 bg-accent-red/10 px-4 py-2 text-xs text-accent-red">
              ERROR: {errorMetrics}
            </div>
          )}

          {/* PRIMARY METRICS HUD + AI PROCESSING QUEUE */}
          <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel
              eyebrow="Real-time data streams"
              title="Primary Metrics HUD"
              right={
                <button
                  type="button"
                  onClick={fetchAdminMetrics}
                  disabled={loadingMetrics}
                  className="flex items-center gap-1.5 border border-console-border px-2.5 py-1 text-xs uppercase tracking-wide text-console-muted hover:text-accent-cyan disabled:opacity-50"
                >
                  <RefreshCw size={12} className={loadingMetrics ? 'animate-spin' : ''} />
                  Refresh
                </button>
              }
              className="xl:col-span-2"
              bodyClassName="p-3"
            >
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                <QuickMetricsWidget
                  totalConversations={metrics?.totalConversations}
                  totalLeads={metrics?.totalLeads}
                  conversionRate={metrics?.conversionRate}
                  estimatedValue={metrics?.totalRevenue}
                  loading={loadingMetrics}
                  error={errorMetrics}
                />
                <HudMetric
                  icon={Users}
                  label="Total Users"
                  value={loadingMetrics ? '—' : metrics?.totalUsers?.toLocaleString() ?? 'N/A'}
                  accent="cyan"
                  loading={loadingMetrics}
                />
                <HudMetric
                  icon={Zap}
                  label="Active Bots"
                  value={loadingMetrics ? '—' : metrics?.activeBots?.toLocaleString() ?? 'N/A'}
                  accent="green"
                  loading={loadingMetrics}
                />
                <HudMetric
                  icon={DollarSign}
                  label="Total Revenue"
                  value={loadingMetrics ? '—' : `$${metrics?.totalRevenue?.toLocaleString() ?? '0'}`}
                  accent="cyan"
                  loading={loadingMetrics}
                />
                <HudMetric
                  icon={UserCheck}
                  label="New Signups Today"
                  value={loadingMetrics ? '—' : metrics?.newSignupsToday?.toLocaleString() ?? 'N/A'}
                  accent="green"
                  loading={loadingMetrics}
                />
                <HudMetric
                  icon={Server}
                  label="API Calls (24h)"
                  value={loadingMetrics ? '—' : metrics?.apiCallsLast24h?.toLocaleString() ?? 'N/A'}
                  accent="cyan"
                  loading={loadingMetrics}
                />
                <HudMetric
                  icon={Ticket}
                  label="Open Support Tickets"
                  value={loadingMetrics ? '—' : metrics?.supportTicketsOpen?.toLocaleString() ?? 'N/A'}
                  accent={
                    (metrics?.supportTicketsOpen ?? 0) > 0 ? 'amber' : 'green'
                  }
                  loading={loadingMetrics}
                />
                <HudMetric
                  icon={Shield}
                  label="System Health"
                  value={loadingMetrics ? '—' : `${metrics?.systemHealthScore ?? 'N/A'}%`}
                  accent="cyan"
                  loading={loadingMetrics}
                />
                <HudMetric
                  icon={Clock}
                  label="Avg. Response Time"
                  value={loadingMetrics ? '—' : `${metrics?.averageResponseTime ?? 'N/A'} ms`}
                  accent="cyan"
                  loading={loadingMetrics}
                />
              </div>
            </Panel>

            <Panel
              eyebrow="Active pipelines"
              title="AI Processing & Ingestion Queue"
              bodyClassName="p-0"
            >
              <div className="divide-y divide-console-border">
                {ingestionItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <div>
                      <div className="text-xs text-console-text">{item.label}</div>
                      <div className="text-[11px] text-console-muted">{item.detail}</div>
                    </div>
                    <StatusDot status={item.status} />
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* SYSTEM TERMINAL */}
          <Panel bodyClassName="p-0" className="mb-4">
            <TerminalConsole
              lines={log}
              onCommand={handleCommand}
              placeholder='Type "refresh" to reload metrics, or "help"'
            />
          </Panel>

          {/* Secondary Widgets */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <div className="lg:col-span-2 xl:col-span-2">
              <FinancialDashboard />
            </div>
            <div>
              <PartnerOverviewAdmin />
            </div>
            <div className="lg:col-span-2 xl:col-span-3">
              <ComprehensiveAnalytics />
            </div>
            <div className="xl:col-span-1">
              <NotificationComposer />
            </div>
            <div className="xl:col-span-2">
              <AdminFeaturesOverview />
            </div>
          </div>
        </>
      )}

        {activeTab === 'system-health' && <ErrorRecoveryDashboard />}
      </div>
    </div>
  );
};
