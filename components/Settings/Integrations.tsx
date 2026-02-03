import { CheckCircle, Plug, Plus, Trash2, XCircle } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { API_BASE } from '../../services/apiConfig';

interface Provider {
  id: string;
  name: string;
}

interface Integration {
  id: string;
  provider: string;
  isActive: boolean;
  createdAt: string;
}

export const Integrations: React.FC = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [apiKey, setApiKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [provRes, intRes] = await Promise.all([
        fetch(`${API_BASE}/integrations/providers`, { credentials: 'include' }),
        fetch(`${API_BASE}/integrations`, { credentials: 'include' }),
      ]);

      if (provRes.ok) setProviders(await provRes.json());
      if (intRes.ok) setIntegrations(await intRes.json());
    } catch (error) {
      console.error('Failed to load integrations', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/integrations/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          providerId: selectedProvider,
          config: { accessToken: apiKey },
        }),
      });

      if (!res.ok) throw new Error('Connection failed');

      await fetchData();
      setShowModal(false);
      setApiKey('');
      setMessage({
        type: 'success',
        text: 'Integration connected successfully!',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Failed to connect. Check your credentials.',
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    if (!confirm('Are you sure you want to disconnect this integration?'))
      return;
    try {
      await fetch(`${API_BASE}/integrations/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ providerId }),
      });
      await fetchData();
      setMessage({ type: 'success', text: 'Integration disconnected.' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to disconnect.' });
    }
  };

  const isConnected = (providerId: string) => {
    return integrations.some((i) => i.provider === providerId && i.isActive);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Plug /> Integrations
      </h2>

      {message && (
        <div
          className={`p-4 mb-6 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
        >
          {message.type === 'success' ? (
            <CheckCircle size={20} />
          ) : (
            <XCircle size={20} />
          )}
          {message.text}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className="bg-white border rounded-xl p-6 shadow-sm flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div
                className={`w-12 h-12 rounded-lg flex items-center justify-center ${isConnected(provider.id) ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}
              >
                <Plug size={24} />
              </div>
              <div>
                <h3 className="font-bold text-lg">{provider.name}</h3>
                <p className="text-sm text-slate-500">
                  {isConnected(provider.id) ? 'Connected' : 'Not connected'}
                </p>
              </div>
            </div>

            {isConnected(provider.id) ? (
              <button
                onClick={() => handleDisconnect(provider.id)}
                className="px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium flex items-center gap-2"
              >
                <Trash2 size={16} /> Disconnect
              </button>
            ) : (
              <button
                onClick={() => {
                  setSelectedProvider(provider.id);
                  setShowModal(true);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
              >
                <Plus size={16} /> Connect
              </button>
            )}
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-bold text-xl mb-4">
              Connect {providers.find((p) => p.id === selectedProvider)?.name}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Access Token / API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Paste your key here..."
                />
              </div>

              <div className="flex gap-2 justify-end mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConnect}
                  disabled={!apiKey || connecting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {connecting ? 'Connecting...' : 'Connect Integration'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
