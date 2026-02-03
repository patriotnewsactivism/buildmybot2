import {
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
  Shield,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { type Column, DataTable } from '../../UI/DataTable';

interface PendingAction {
  id: string;
  toolName: string;
  inputParameters: Record<string, any>;
  status: string;
  createdAt: string;
  conversationId: string;
}

interface ApprovalQueueProps {
  botId: string;
  onApprovalAction: () => void;
}

export const ApprovalQueue: React.FC<ApprovalQueueProps> = ({
  botId,
  onApprovalAction,
}) => {
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchPendingActions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/tools/pending?botId=${botId}`);
      if (!response.ok) throw new Error('Failed to fetch pending actions');

      const data = await response.json();
      setActions(data.actions || []);
    } catch (err) {
      console.error('Error fetching pending actions:', err);
      setActions([]);
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    fetchPendingActions();
  }, [fetchPendingActions]);

  const handleApprove = async (actionId: string) => {
    setProcessing(actionId);
    try {
      const response = await fetch(`/api/tools/approve/${actionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      });

      if (!response.ok) throw new Error('Failed to approve action');

      await fetchPendingActions();
      onApprovalAction();
    } catch (err) {
      console.error('Approval error:', err);
      alert('Failed to approve action');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (actionId: string) => {
    setProcessing(actionId);
    try {
      const response = await fetch(`/api/tools/approve/${actionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: false }),
      });

      if (!response.ok) throw new Error('Failed to reject action');

      await fetchPendingActions();
      onApprovalAction();
    } catch (err) {
      console.error('Reject error:', err);
      alert('Failed to reject action');
    } finally {
      setProcessing(null);
    }
  };

  const columns: Column<PendingAction>[] = [
    {
      key: 'toolName',
      label: 'Action',
      sortable: true,
      render: (action) => (
        <div>
          <p className="font-medium text-slate-900">{action.toolName}</p>
          <p className="text-xs text-slate-500">
            {new Date(action.createdAt).toLocaleString()}
          </p>
        </div>
      ),
    },
    {
      key: 'inputParameters',
      label: 'Parameters',
      render: (action) => (
        <div className="max-w-xs">
          <pre className="text-xs bg-slate-50 p-2 rounded overflow-x-auto">
            {JSON.stringify(action.inputParameters, null, 2)}
          </pre>
        </div>
      ),
    },
    {
      key: 'conversationId',
      label: 'Context',
      render: (action) => (
        <span className="text-xs text-slate-600 font-mono truncate max-w-[100px] block">
          {action.conversationId}
        </span>
      ),
    },
    {
      key: 'id',
      label: 'Actions',
      render: (action) => (
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => handleApprove(action.id)}
            disabled={processing === action.id}
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center space-x-1"
          >
            <ThumbsUp size={14} />
            <span>Approve</span>
          </button>
          <button
            type="button"
            onClick={() => handleReject(action.id)}
            disabled={processing === action.id}
            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center space-x-1"
          >
            <ThumbsDown size={14} />
            <span>Reject</span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Approval Queue</h2>
          <p className="text-sm text-slate-500 mt-1">
            Review and approve high-stakes actions
          </p>
        </div>
        <button
          type="button"
          onClick={fetchPendingActions}
          disabled={loading}
          className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center space-x-2 disabled:opacity-50 text-sm self-start sm:self-auto"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {actions.length === 0 && !loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="p-4 bg-green-50 rounded-full inline-block mb-4">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            No Pending Approvals
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            All actions have been reviewed. New actions requiring approval will
            appear here.
          </p>
        </div>
      ) : (
        <>
          {actions.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle
                className="text-orange-600 flex-shrink-0"
                size={20}
              />
              <div>
                <p className="text-sm font-medium text-orange-900">
                  {actions.length} {actions.length === 1 ? 'Action' : 'Actions'}{' '}
                  Awaiting Approval
                </p>
                <p className="text-xs text-orange-700 mt-1">
                  Review the parameters and approve or reject each action
                </p>
              </div>
            </div>
          )}

          <DataTable
            columns={columns}
            data={actions}
            loading={loading}
            emptyMessage="No pending approvals"
          />
        </>
      )}
    </div>
  );
};
