import {
  AlertCircle,
  CheckCircle,
  Code,
  Globe,
  Lock,
  Plus,
  Save,
  Settings,
  Shield,
  Trash2,
  Webhook,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { MetricCard } from '../UI/MetricCard';
import { ApprovalQueue } from './widgets/ApprovalQueue';
import { TestExecutionPanel } from './widgets/TestExecutionPanel';
import { ToolList } from './widgets/ToolList';
import { WebhookDesigner } from './widgets/WebhookDesigner';

export type ToolBuilderTab = 'tools' | 'designer' | 'test' | 'approvals';

interface ToolBuilderProps {
  botId: string;
  activeTab?: ToolBuilderTab;
  onTabChange?: (tab: ToolBuilderTab) => void;
}

interface ToolStats {
  totalTools: number;
  enabledTools: number;
  pendingApprovals: number;
  executionsToday: number;
}

const defaultStats: ToolStats = {
  totalTools: 0,
  enabledTools: 0,
  pendingApprovals: 0,
  executionsToday: 0,
};

export const ToolBuilder: React.FC<ToolBuilderProps> = ({
  botId,
  activeTab: controlledTab,
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<ToolBuilderTab>('tools');
  const [stats, setStats] = useState<ToolStats>(defaultStats);
  const [loading, setLoading] = useState(true);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);

  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tab: ToolBuilderTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tools/stats?botId=${botId}`);
      if (!response.ok) throw new Error('Failed to fetch stats');

      const data = await response.json();
      setStats(data.stats || defaultStats);
    } catch (err) {
      console.error('Error fetching tool stats:', err);
      setStats(defaultStats);
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleToolSelect = (toolId: string) => {
    setSelectedToolId(toolId);
    setActiveTab('designer');
  };

  const handleNewTool = () => {
    setSelectedToolId(null);
    setActiveTab('designer');
  };

  const tabs = [
    { id: 'tools' as ToolBuilderTab, label: 'My Tools', icon: Webhook },
    { id: 'designer' as ToolBuilderTab, label: 'Designer', icon: Code },
    { id: 'test' as ToolBuilderTab, label: 'Test', icon: Zap },
    { id: 'approvals' as ToolBuilderTab, label: 'Approvals', icon: Shield },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-4 md:space-y-6 animate-fade-in px-2 md:px-0">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-xl md:rounded-2xl p-4 md:p-8">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-transparent to-blue-500/10" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-500/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-blue-500/20 to-transparent rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
            <span className="text-purple-400 text-sm font-medium">
              Agentic Actions
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white via-purple-100 to-blue-200 bg-clip-text text-transparent">
            Tool Builder
          </h1>
          <p className="text-slate-300 mt-2 text-lg">
            Build custom actions and integrations for your bot
          </p>
          <div className="flex items-center space-x-4 mt-4">
            <div className="flex items-center space-x-2 text-slate-400 text-sm">
              <Webhook size={16} className="text-purple-400" />
              <span>Webhooks & APIs</span>
            </div>
            <div className="w-px h-4 bg-slate-700" />
            <div className="flex items-center space-x-2 text-slate-400 text-sm">
              <Shield size={16} className="text-blue-400" />
              <span>Approval Workflows</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <MetricCard
          icon={Webhook}
          label="Total Tools"
          value={stats.totalTools.toString()}
          loading={loading}
        />
        <MetricCard
          icon={CheckCircle}
          label="Enabled"
          value={stats.enabledTools.toString()}
          loading={loading}
          status="healthy"
        />
        <MetricCard
          icon={Shield}
          label="Pending Approvals"
          value={stats.pendingApprovals.toString()}
          loading={loading}
          status={stats.pendingApprovals > 0 ? 'warning' : undefined}
        />
        <MetricCard
          icon={Zap}
          label="Executions Today"
          value={stats.executionsToday.toString()}
          loading={loading}
        />
      </div>

      {/* Tab Navigation */}
      <div className="bg-slate-900 rounded-xl p-1.5 md:p-2 shadow-lg overflow-hidden">
        <div className="flex flex-wrap md:flex-nowrap gap-1 overflow-x-hidden">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-1.5 md:space-x-2 px-3 md:px-5 py-2.5 md:py-3 rounded-lg transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold shadow-lg shadow-purple-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon size={16} className="md:w-[18px] md:h-[18px]" />
                <span className="text-xs md:text-sm">{tab.label}</span>
                {tab.id === 'approvals' && stats.pendingApprovals > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-orange-500 text-white text-xs rounded-full">
                    {stats.pendingApprovals}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="animate-fade-in">
        {activeTab === 'tools' && (
          <ToolList
            botId={botId}
            onToolSelect={handleToolSelect}
            onNewTool={handleNewTool}
            onStatsUpdate={fetchStats}
          />
        )}
        {activeTab === 'designer' && (
          <WebhookDesigner
            botId={botId}
            toolId={selectedToolId}
            onSave={() => {
              fetchStats();
              setActiveTab('tools');
            }}
            onCancel={() => setActiveTab('tools')}
          />
        )}
        {activeTab === 'test' && (
          <TestExecutionPanel botId={botId} onStatsUpdate={fetchStats} />
        )}
        {activeTab === 'approvals' && (
          <ApprovalQueue botId={botId} onApprovalAction={fetchStats} />
        )}
      </div>
    </div>
  );
};
