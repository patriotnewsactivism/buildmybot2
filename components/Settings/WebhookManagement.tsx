import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Activity, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface Webhook {
  id: string;
  url: string;
  eventTypes: string[];
  isActive: boolean;
  description?: string;
  secret: string;
  createdAt: string;
}

interface WebhookLog {
  id: string;
  eventType: string;
  responseStatus: number;
  durationMs: number;
  createdAt: string;
  error?: string;
}

export const WebhookManagement: React.FC = () => {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [logs, setLogs] = useState<Record<string, WebhookLog[]>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [newWebhook, setNewWebhook] = useState({ url: '', eventTypes: [] as string[], description: '' });
  const [loading, setLoading] = useState(true);

  const availableEvents = [
    'lead.captured',
    'conversation.started',
    'conversation.ended',
    'sentiment.negative',
    'bot.created'
  ];

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    try {
      const res = await fetch('/api/webhooks');
      const data = await res.json();
      setWebhooks(data);
      // Fetch logs for each webhook
      data.forEach((w: Webhook) => fetchLogs(w.id));
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async (id: string) => {
    try {
      const res = await fetch(`/api/webhooks/${id}/logs`);
      const data = await res.json();
      setLogs(prev => ({ ...prev, [id]: data }));
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddWebhook = async () => {
    try {
      await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWebhook),
      });
      setShowAddModal(false);
      setNewWebhook({ url: '', eventTypes: [], description: '' });
      fetchWebhooks();
    } catch (e) {
      alert('Failed to add webhook');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return;
    await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
    fetchWebhooks();
  };

  const handleTest = async (id: string) => {
    await fetch(`/api/webhooks/${id}/test`, { method: 'POST' });
    alert('Test event triggered');
    setTimeout(() => fetchLogs(id), 2000);
  };

  const toggleEventType = (type: string) => {
    setNewWebhook(prev => ({
      ...prev,
      eventTypes: prev.eventTypes.includes(type)
        ? prev.eventTypes.filter(t => t !== type)
        : [...prev.eventTypes, type]
    }));
  };

  if (loading) return <div>Loading webhooks...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900">Webhooks</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} /> Add Endpoint
        </button>
      </div>

      <div className="grid gap-6">
        {webhooks.map(webhook => (
          <div key={webhook.id} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-lg">{webhook.description || 'Webhook Endpoint'}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${webhook.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                    {webhook.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <code className="text-sm bg-slate-100 px-2 py-1 rounded text-slate-600 block mb-2 w-fit">
                  {webhook.url}
                </code>
                <div className="flex gap-2 flex-wrap">
                  {webhook.eventTypes.map(type => (
                    <span key={type} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                      {type}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleTest(webhook.id)}
                  className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-colors"
                  title="Test Webhook"
                >
                  <Activity size={18} />
                </button>
                <button
                  onClick={() => handleDelete(webhook.id)}
                  className="p-2 text-slate-500 hover:text-red-600 hover:bg-slate-50 rounded-lg transition-colors"
                  title="Delete Webhook"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <h4 className="text-sm font-medium text-slate-700 mb-2">Recent Deliveries</h4>
              <div className="space-y-2">
                {logs[webhook.id]?.length ? logs[webhook.id].slice(0, 3).map(log => (
                  <div key={log.id} className="flex items-center justify-between text-sm bg-slate-50 p-2 rounded">
                    <div className="flex items-center gap-2">
                      {log.responseStatus >= 200 && log.responseStatus < 300 ? (
                        <CheckCircle size={14} className="text-green-500" />
                      ) : (
                        <AlertCircle size={14} className="text-red-500" />
                      )}
                      <span className="font-mono text-slate-600">{log.eventType}</span>
                    </div>
                    <div className="flex items-center gap-4 text-slate-500">
                      <span>{log.durationMs}ms</span>
                      <span className={`font-mono ${log.responseStatus >= 400 ? 'text-red-600' : 'text-green-600'}`}>
                        {log.responseStatus}
                      </span>
                      <span className="text-xs">{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-slate-400 italic">No recent activity</p>
                )}
              </div>
            </div>
          </div>
        ))}

        {webhooks.length === 0 && (
          <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
            <RefreshCw size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900">No Webhooks Configured</h3>
            <p className="text-slate-500 max-w-sm mx-auto mt-2">
              Add a webhook to receive real-time updates when events happen in your BuildMyBot account.
            </p>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Add Webhook Endpoint</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Endpoint URL</label>
                <input
                  type="url"
                  placeholder="https://api.your-app.com/webhook"
                  className="w-full p-2 border rounded-lg"
                  value={newWebhook.url}
                  onChange={e => setNewWebhook({ ...newWebhook, url: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Production Lead Sync"
                  className="w-full p-2 border rounded-lg"
                  value={newWebhook.description}
                  onChange={e => setNewWebhook({ ...newWebhook, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Events to Send</label>
                <div className="space-y-2 max-h-48 overflow-y-auto border p-2 rounded-lg">
                  {availableEvents.map(event => (
                    <label key={event} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={newWebhook.eventTypes.includes(event)}
                        onChange={() => toggleEventType(event)}
                        className="rounded text-blue-600"
                      />
                      <span className="text-sm font-mono text-slate-600">{event}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddWebhook}
                  disabled={!newWebhook.url || newWebhook.eventTypes.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Add Webhook
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
