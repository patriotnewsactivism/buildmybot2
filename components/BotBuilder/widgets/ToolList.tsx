import {
  AlertCircle,
  CheckCircle,
  Edit2,
  Globe,
  Mail,
  MoreVertical,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  Webhook,
  XCircle,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { type Column, DataTable } from '../../UI/DataTable';

interface Tool {
  id: string;
  name: string;
  description: string;
  category: 'webhook' | 'database' | 'email' | 'document';
  active: boolean;
  requiresApproval: boolean;
  authType: 'none' | 'api_key' | 'oauth2' | 'bearer';
  executionCount: number;
  lastExecutedAt: string | null;
  createdAt: string;
}

interface ToolListProps {
  botId: string;
  onToolSelect: (toolId: string) => void;
  onNewTool: () => void;
  onStatsUpdate: () => void;
}

export const ToolList: React.FC<ToolListProps> = ({
  botId,
  onToolSelect,
  onNewTool,
  onStatsUpdate,
}) => {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchTools = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tools?botId=${botId}`);
      if (!response.ok) throw new Error('Failed to fetch tools');

      const data = await response.json();
      setTools(data.tools || []);
    } catch (err) {
      console.error('Error fetching tools:', err);
      setTools([]);
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  const handleToggle = async (toolId: string, active: boolean) => {
    try {
      const response = await fetch(`/api/tools/${toolId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });

      if (!response.ok) throw new Error('Failed to toggle tool');

      await fetchTools();
      onStatsUpdate();
    } catch (err) {
      console.error('Toggle error:', err);
      alert('Failed to toggle tool');
    }
  };

  const handleDelete = async (toolId: string) => {
    try {
      const response = await fetch(`/api/tools/${toolId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete tool');

      await fetchTools();
      onStatsUpdate();
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete tool');
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'webhook':
        return <Webhook size={16} className="text-purple-600" />;
      case 'email':
        return <Mail size={16} className="text-blue-600" />;
      case 'database':
        return <Globe size={16} className="text-emerald-600" />;
      default:
        return <Webhook size={16} className="text-slate-600" />;
    }
  };

  const columns: Column<Tool>[] = [
    {
      key: 'name',
      label: 'Tool',
      sortable: true,
      render: (tool) => (
        <div className="flex items-start space-x-3">
          <div className="p-2 bg-slate-50 rounded-lg flex-shrink-0">
            {getCategoryIcon(tool.category)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <p className="font-medium text-slate-900 truncate">{tool.name}</p>
              {tool.requiresApproval && (
                <Shield
                  size={14}
                  className="text-orange-600 flex-shrink-0"
                  title="Requires approval"
                />
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
              {tool.description}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      label: 'Type',
      sortable: true,
      render: (tool) => (
        <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded-full capitalize">
          {tool.category}
        </span>
      ),
    },
    {
      key: 'authType',
      label: 'Auth',
      render: (tool) => (
        <span className="text-xs text-slate-600 capitalize flex items-center space-x-1">
          {tool.authType !== 'none' && (
            <Shield size={12} className="text-emerald-600" />
          )}
          <span>{tool.authType.replace('_', ' ')}</span>
        </span>
      ),
    },
    {
      key: 'executionCount',
      label: 'Executions',
      sortable: true,
      render: (tool) => (
        <span className="text-sm text-slate-900">
          {tool.executionCount || 0}
        </span>
      ),
    },
    {
      key: 'active',
      label: 'Status',
      sortable: true,
      render: (tool) => (
        <button
          type="button"
          onClick={() => handleToggle(tool.id, !tool.active)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            tool.active ? 'bg-emerald-600' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              tool.active ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      ),
    },
    {
      key: 'id',
      label: 'Actions',
      render: (tool) => (
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => onToolSelect(tool.id)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="Edit tool"
          >
            <Edit2 size={16} className="text-slate-600" />
          </button>
          {deleteConfirm === tool.id ? (
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => handleDelete(tool.id)}
                className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="px-2 py-1 bg-slate-200 text-slate-700 text-xs rounded hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDeleteConfirm(tool.id)}
              className="p-2 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete tool"
            >
              <Trash2 size={16} className="text-red-600" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">My Tools</h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage custom actions and integrations for your bot
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={fetchTools}
            disabled={loading}
            className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center space-x-2 disabled:opacity-50 text-sm"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={onNewTool}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2 text-sm"
          >
            <Plus size={16} />
            <span>New Tool</span>
          </button>
        </div>
      </div>

      {tools.length === 0 && !loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="p-4 bg-purple-50 rounded-full inline-block mb-4">
            <Webhook size={32} className="text-purple-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            No Tools Yet
          </h3>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Create your first tool to enable your bot to take actions like calling
            APIs, sending emails, or updating databases.
          </p>
          <button
            type="button"
            onClick={onNewTool}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 inline-flex items-center space-x-2"
          >
            <Plus size={18} />
            <span>Create First Tool</span>
          </button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={tools}
          loading={loading}
          emptyMessage="No tools found"
        />
      )}
    </div>
  );
};
