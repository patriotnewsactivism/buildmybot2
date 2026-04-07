import {
  AlertCircle,
  CheckCircle,
  Play,
  RefreshCw,
  XCircle,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { buildApiUrl } from '../../../services/apiConfig';

interface TestExecutionPanelProps {
  botId: string;
  onStatsUpdate: () => void;
}

interface Tool {
  id: string;
  name: string;
  category: string;
  functionSchema: any;
}

export const TestExecutionPanel: React.FC<TestExecutionPanelProps> = ({
  botId,
  onStatsUpdate,
}) => {
  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedToolId, setSelectedToolId] = useState<string>('');
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTools = useCallback(async () => {
    try {
      const response = await fetch(`/api/tools?botId=${botId}&active=true`);
      if (!response.ok) throw new Error('Failed to fetch tools');

      const data = await response.json();
      setTools(data.tools || []);
      if (data.tools.length > 0) {
        setSelectedToolId(data.tools[0].id);
      }
    } catch (err) {
      console.error('Error fetching tools:', err);
      setTools([]);
    }
  }, [botId]);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  const selectedTool = tools.find((t) => t.id === selectedToolId);

  const handleExecute = async () => {
    if (!selectedToolId) return;

    setExecuting(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch(buildApiUrl('/tools/execute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolId: selectedToolId,
          parameters,
          context: {
            botId,
            conversationId: 'test-execution',
          },
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || 'Execution failed');
      }

      onStatsUpdate();
    } catch (err: any) {
      setError(err.message || 'Failed to execute tool');
    } finally {
      setExecuting(false);
    }
  };

  const renderParameterInput = (name: string, spec: any) => {
    const value = parameters[name] || '';

    switch (spec.type) {
      case 'boolean':
        return (
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value}
              onChange={(e) =>
                setParameters({ ...parameters, [name]: e.target.checked })
              }
              className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm text-slate-700">
              {spec.description || name}
            </span>
          </label>
        );
      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) =>
              setParameters({
                ...parameters,
                [name]: Number.parseFloat(e.target.value) || 0,
              })
            }
            placeholder={spec.description || name}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        );
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) =>
              setParameters({ ...parameters, [name]: e.target.value })
            }
            placeholder={spec.description || name}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        );
    }
  };

  if (tools.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <Zap size={48} className="mx-auto mb-4 text-slate-300" />
        <h3 className="text-lg font-semibold text-slate-900 mb-2">
          No Tools Available
        </h3>
        <p className="text-sm text-slate-500">
          Create and enable tools before testing execution
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          Test Tool Execution
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Test your tools with sample parameters
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Test Configuration
            </h3>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Select Tool
              </label>
              <select
                value={selectedToolId}
                onChange={(e) => {
                  setSelectedToolId(e.target.value);
                  setParameters({});
                  setResult(null);
                  setError(null);
                }}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                {tools.map((tool) => (
                  <option key={tool.id} value={tool.id}>
                    {tool.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedTool?.functionSchema?.properties && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                  Parameters
                </label>
                {Object.entries(selectedTool.functionSchema.properties).map(
                  ([name, spec]: [string, any]) => (
                    <div key={name}>
                      <label className="block text-xs text-slate-600 mb-1">
                        {name}
                        {selectedTool.functionSchema.required?.includes(
                          name,
                        ) && <span className="text-red-600 ml-1">*</span>}
                      </label>
                      {renderParameterInput(name, spec)}
                    </div>
                  ),
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleExecute}
              disabled={executing}
              className="w-full px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {executing ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Executing...</span>
                </>
              ) : (
                <>
                  <Play size={18} />
                  <span>Execute Tool</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Result Panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Execution Result
            </h3>

            {!result && !error && (
              <div className="text-center py-12 text-slate-400">
                <Zap size={48} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">No execution yet</p>
              </div>
            )}

            {result && (
              <div className="space-y-3">
                <div className="flex items-start space-x-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle
                    className="text-green-600 flex-shrink-0"
                    size={20}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-900">
                      Execution Successful
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      Completed in {result.executionTimeMs}ms
                    </p>
                  </div>
                </div>

                {result.data && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Response Data
                    </label>
                    <pre className="p-4 bg-slate-900 text-green-400 rounded-lg text-xs overflow-x-auto">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="flex items-start space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <XCircle className="text-red-600 flex-shrink-0" size={20} />
                <div>
                  <p className="text-sm font-medium text-red-900">
                    Execution Failed
                  </p>
                  <p className="text-xs text-red-700 mt-1">{error}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
