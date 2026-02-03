import {
  AlertCircle,
  CheckCircle,
  Code,
  Globe,
  Lock,
  Mail,
  Plus,
  Save,
  Shield,
  Trash2,
  Webhook,
  X,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

interface WebhookDesignerProps {
  botId: string;
  toolId: string | null;
  onSave: () => void;
  onCancel: () => void;
}

interface Header {
  key: string;
  value: string;
}

interface Parameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  description: string;
  required: boolean;
}

interface ToolForm {
  name: string;
  description: string;
  category: 'webhook' | 'database' | 'email' | 'document';
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  headers: Header[];
  authType: 'none' | 'api_key' | 'bearer' | 'oauth2';
  credentials: string;
  requiresApproval: boolean;
  approvalThreshold: { amount?: number; currency?: string };
  parameters: Parameter[];
}

const defaultForm: ToolForm = {
  name: '',
  description: '',
  category: 'webhook',
  method: 'POST',
  url: '',
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  authType: 'none',
  credentials: '',
  requiresApproval: false,
  approvalThreshold: {},
  parameters: [],
};

export const WebhookDesigner: React.FC<WebhookDesignerProps> = ({
  botId,
  toolId,
  onSave,
  onCancel,
}) => {
  const [form, setForm] = useState<ToolForm>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const fetchTool = useCallback(async () => {
    if (!toolId) {
      setForm(defaultForm);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/tools/${toolId}`);
      if (!response.ok) throw new Error('Failed to fetch tool');

      const data = await response.json();
      setForm({
        name: data.tool.name,
        description: data.tool.description,
        category: data.tool.category,
        method: data.tool.config.method || 'POST',
        url: data.tool.config.url || '',
        headers: data.tool.config.headers
          ? Object.entries(data.tool.config.headers).map(([key, value]) => ({
              key,
              value: value as string,
            }))
          : [{ key: 'Content-Type', value: 'application/json' }],
        authType: data.tool.authType || 'none',
        credentials: '', // Never populate credentials from server
        requiresApproval: data.tool.requiresApproval || false,
        approvalThreshold: data.tool.approvalThreshold || {},
        parameters: data.tool.functionSchema?.properties
          ? Object.entries(data.tool.functionSchema.properties).map(
              ([name, spec]: [string, any]) => ({
                name,
                type: spec.type || 'string',
                description: spec.description || '',
                required:
                  data.tool.functionSchema.required?.includes(name) || false,
              }),
            )
          : [],
      });
    } catch (err) {
      console.error('Error fetching tool:', err);
    } finally {
      setLoading(false);
    }
  }, [toolId]);

  useEffect(() => {
    fetchTool();
  }, [fetchTool]);

  const validate = (): boolean => {
    const newErrors: string[] = [];

    if (!form.name.trim()) newErrors.push('Tool name is required');
    if (!form.description.trim()) newErrors.push('Description is required');
    if (!form.url.trim()) newErrors.push('URL is required');
    if (form.parameters.length === 0)
      newErrors.push('At least one parameter is required');

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const headersObj = form.headers.reduce(
        (acc, { key, value }) => ({ ...acc, [key]: value }),
        {},
      );

      const functionSchema = {
        type: 'object',
        properties: form.parameters.reduce(
          (acc, param) => ({
            ...acc,
            [param.name]: {
              type: param.type,
              description: param.description,
            },
          }),
          {},
        ),
        required: form.parameters.filter((p) => p.required).map((p) => p.name),
      };

      const payload = {
        name: form.name,
        description: form.description,
        category: form.category,
        config: {
          method: form.method,
          url: form.url,
          headers: headersObj,
        },
        functionSchema,
        requiresApproval: form.requiresApproval,
        approvalThreshold: form.approvalThreshold,
        authType: form.authType,
        credentials: form.credentials || undefined,
      };

      const url = toolId ? `/api/tools/${toolId}` : '/api/tools';
      const method = toolId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, botId }),
      });

      if (!response.ok) throw new Error('Failed to save tool');

      onSave();
    } catch (err) {
      console.error('Save error:', err);
      alert('Failed to save tool. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const addHeader = () => {
    setForm((prev) => ({
      ...prev,
      headers: [...prev.headers, { key: '', value: '' }],
    }));
  };

  const updateHeader = (
    index: number,
    field: 'key' | 'value',
    value: string,
  ) => {
    setForm((prev) => ({
      ...prev,
      headers: prev.headers.map((h, i) =>
        i === index ? { ...h, [field]: value } : h,
      ),
    }));
  };

  const removeHeader = (index: number) => {
    setForm((prev) => ({
      ...prev,
      headers: prev.headers.filter((_, i) => i !== index),
    }));
  };

  const addParameter = () => {
    setForm((prev) => ({
      ...prev,
      parameters: [
        ...prev.parameters,
        { name: '', type: 'string', description: '', required: false },
      ],
    }));
  };

  const updateParameter = (
    index: number,
    field: keyof Parameter,
    value: any,
  ) => {
    setForm((prev) => ({
      ...prev,
      parameters: prev.parameters.map((p, i) =>
        i === index ? { ...p, [field]: value } : p,
      ),
    }));
  };

  const removeParameter = (index: number) => {
    setForm((prev) => ({
      ...prev,
      parameters: prev.parameters.filter((_, i) => i !== index),
    }));
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-sm text-slate-500">Loading tool...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {toolId ? 'Edit Tool' : 'Create New Tool'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Configure webhook or API integration
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <X size={20} className="text-slate-600" />
        </button>
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start space-x-2">
            <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
            <div>
              <p className="text-sm font-medium text-red-900">
                Please fix the following errors:
              </p>
              <ul className="mt-2 list-disc list-inside text-sm text-red-700">
                {errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Info */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center space-x-2">
            <Webhook size={20} className="text-purple-600" />
            <span>Basic Information</span>
          </h3>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Tool Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Create Ticket, Send Email"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="What does this tool do?"
              rows={3}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Category
            </label>
            <select
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value as any })
              }
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="webhook">Webhook / API</option>
              <option value="email">Email</option>
              <option value="database">Database</option>
              <option value="document">Document</option>
            </select>
          </div>
        </div>

        {/* HTTP Configuration */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center space-x-2">
            <Globe size={20} className="text-blue-600" />
            <span>HTTP Configuration</span>
          </h3>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Method
            </label>
            <select
              value={form.method}
              onChange={(e) =>
                setForm({ ...form, method: e.target.value as any })
              }
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              URL
            </label>
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://api.example.com/endpoint"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              Use {'{parameterName}'} for dynamic values
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">
                Headers
              </label>
              <button
                type="button"
                onClick={addHeader}
                className="text-xs text-purple-600 hover:text-purple-700 flex items-center space-x-1"
              >
                <Plus size={14} />
                <span>Add</span>
              </button>
            </div>
            <div className="space-y-2">
              {form.headers.map((header, i) => (
                <div key={i} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={header.key}
                    onChange={(e) => updateHeader(i, 'key', e.target.value)}
                    placeholder="Header name"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    value={header.value}
                    onChange={(e) => updateHeader(i, 'value', e.target.value)}
                    placeholder="Header value"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeHeader(i)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} className="text-red-600" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Authentication */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center space-x-2">
          <Lock size={20} className="text-emerald-600" />
          <span>Authentication</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Auth Type
            </label>
            <select
              value={form.authType}
              onChange={(e) =>
                setForm({ ...form, authType: e.target.value as any })
              }
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="none">None</option>
              <option value="api_key">API Key</option>
              <option value="bearer">Bearer Token</option>
              <option value="oauth2">OAuth 2.0</option>
            </select>
          </div>

          {form.authType !== 'none' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Credentials
              </label>
              <input
                type="password"
                value={form.credentials}
                onChange={(e) =>
                  setForm({ ...form, credentials: e.target.value })
                }
                placeholder="API key or token"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-slate-500 mt-1">
                Stored encrypted with AES-256-GCM
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Parameters */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center space-x-2">
            <Code size={20} className="text-blue-600" />
            <span>Function Parameters</span>
          </h3>
          <button
            type="button"
            onClick={addParameter}
            className="px-3 py-1.5 bg-purple-100 text-purple-700 text-sm rounded-lg hover:bg-purple-200 flex items-center space-x-1"
          >
            <Plus size={14} />
            <span>Add Parameter</span>
          </button>
        </div>

        <div className="space-y-3">
          {form.parameters.map((param, i) => (
            <div
              key={i}
              className="grid grid-cols-12 gap-2 p-3 bg-slate-50 rounded-lg"
            >
              <input
                type="text"
                value={param.name}
                onChange={(e) => updateParameter(i, 'name', e.target.value)}
                placeholder="name"
                className="col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <select
                value={param.type}
                onChange={(e) => updateParameter(i, 'type', e.target.value)}
                className="col-span-2 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="object">object</option>
              </select>
              <input
                type="text"
                value={param.description}
                onChange={(e) =>
                  updateParameter(i, 'description', e.target.value)
                }
                placeholder="Description"
                className="col-span-5 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <label className="col-span-1 flex items-center justify-center space-x-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={param.required}
                  onChange={(e) =>
                    updateParameter(i, 'required', e.target.checked)
                  }
                  className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-xs text-slate-600">Req</span>
              </label>
              <button
                type="button"
                onClick={() => removeParameter(i)}
                className="col-span-1 p-2 hover:bg-red-100 rounded-lg transition-colors"
              >
                <Trash2 size={16} className="text-red-600" />
              </button>
            </div>
          ))}

          {form.parameters.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <Code size={32} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">No parameters defined yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Approval Settings */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center space-x-2">
          <Shield size={20} className="text-orange-600" />
          <span>Human-in-the-Loop</span>
        </h3>

        <label className="flex items-center space-x-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.requiresApproval}
            onChange={(e) =>
              setForm({ ...form, requiresApproval: e.target.checked })
            }
            className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
          />
          <div>
            <span className="text-sm font-medium text-slate-900">
              Require Human Approval
            </span>
            <p className="text-xs text-slate-500">
              High-stakes actions must be approved before execution
            </p>
          </div>
        </label>

        {form.requiresApproval && (
          <div className="pl-7 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-slate-700 mb-1">
                  Approval Threshold (Amount)
                </label>
                <input
                  type="number"
                  value={form.approvalThreshold.amount || ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      approvalThreshold: {
                        ...form.approvalThreshold,
                        amount: Number.parseFloat(e.target.value) || undefined,
                      },
                    })
                  }
                  placeholder="100"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-1">
                  Currency
                </label>
                <input
                  type="text"
                  value={form.approvalThreshold.currency || ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      approvalThreshold: {
                        ...form.approvalThreshold,
                        currency: e.target.value || undefined,
                      },
                    })
                  }
                  placeholder="USD"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Actions exceeding this threshold will require approval
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 flex items-center space-x-2"
        >
          <Save size={18} />
          <span>{saving ? 'Saving...' : 'Save Tool'}</span>
        </button>
      </div>
    </div>
  );
};
