/**
 * AI Team Dashboard
 * Shows AI employees, their status, and activity logs.
 * Allows triggering tasks and running the daily shift.
 */

import {
  Activity,
  Mail,
  RefreshCw,
  Send,
  Zap,
  Clock,
  CheckCircle,
  XCircle,
  Loader,
  Users,
} from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE, safeParseJson } from '../../services/apiConfig';

interface AIEmployee {
  id: string;
  name: string;
  role: string;
  avatar: string;
  description: string | null;
  status: string;
  lastActiveAt: string | null;
  tasksCompleted: number;
  tasksToday: number;
  emailEnabled: boolean;
}

interface EmployeeLog {
  id: string;
  employeeId: string;
  employeeName: string | null;
  role: string | null;
  taskType: string;
  status: string;
  summary: string | null;
  createdAt: string;
  duration: number | null;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  busy: 'bg-amber-100 text-amber-700',
  paused: 'bg-gray-100 text-gray-500',
  off: 'bg-gray-100 text-gray-400',
};

const TASK_STATUS_ICONS: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="w-4 h-4 text-emerald-500" />,
  failed: <XCircle className="w-4 h-4 text-red-500" />,
  running: <Loader className="w-4 h-4 text-amber-500 animate-spin" />,
  pending: <Clock className="w-4 h-4 text-gray-400" />,
};

const TASK_LABELS: Record<string, string> = {
  email_response: 'Email Response',
  support_triage: 'Support Triage',
  health_check: 'Health Check',
  content_creation: 'Content Creation',
  daily_standup: 'Daily Standup',
  product_analysis: 'Product Analysis',
};

export const AITeamDashboard: React.FC<{ user: any }> = ({ user }) => {
  const [employees, setEmployees] = useState<AIEmployee[]>([]);
  const [logs, setLogs] = useState<EmployeeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningShift, setRunningShift] = useState(false);
  const [runningTask, setRunningTask] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [shiftResults, setShiftResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, logRes] = await Promise.all([
        fetch(`${API_BASE}/ai-employees`),
        fetch(`${API_BASE}/ai-employees/logs?limit=30`),
      ]);
      const empData = await safeParseJson<AIEmployee[]>(empRes);
      const logData = await safeParseJson<EmployeeLog[]>(logRes);
      if (empData) setEmployees(empData);
      if (logData) setLogs(logData);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runShift = async () => {
    setRunningShift(true);
    setShiftResults(null);
    try {
      const res = await fetch(`${API_BASE}/ai-employees/shift`, { method: 'POST' });
      const data = await safeParseJson<any>(res);
      if (data?.results) {
        setShiftResults(data.results);
      }
      fetchData(); // Refresh logs
    } catch (e: any) {
      setError(e.message);
    }
    setRunningShift(false);
  };

  const triggerTask = async (employeeId: string, taskType: string, data?: any) => {
    setRunningTask(`${employeeId}-${taskType}`);
    try {
      await fetch(`${API_BASE}/ai-employees/${employeeId}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskType, data }),
      });
      fetchData(); // Refresh logs
    } catch (e: any) {
      setError(e.message);
    }
    setRunningTask(null);
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-indigo-600" />
            AI Team
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Your autonomous workforce — they run the company while you focus on the big picture.
          </p>
        </div>
        <button
          onClick={runShift}
          disabled={runningShift}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {runningShift ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          {runningShift ? 'Running Shift...' : 'Run Daily Shift'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Employee Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {employees.map((emp) => (
          <div
            key={emp.id}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-2xl">
                  {emp.avatar}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{emp.name}</h3>
                  <p className="text-xs text-gray-500">{emp.role}</p>
                </div>
              </div>
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[emp.status] || STATUS_COLORS.off}`}
              >
                {emp.status}
              </span>
            </div>

            <p className="text-sm text-gray-600 mb-3 line-clamp-2">
              {emp.description}
            </p>

            <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                {emp.tasksCompleted} total
              </span>
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                {emp.tasksToday} today
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(emp.lastActiveAt)}
              </span>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2">
              {emp.id === 'sam-support' && (
                <>
                  <button
                    onClick={() => triggerTask(emp.id, 'support_triage')}
                    disabled={runningTask === `${emp.id}-support_triage`}
                    className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1 disabled:opacity-50"
                  >
                    {runningTask === `${emp.id}-support_triage` ? <Loader className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                    Triage Tickets
                  </button>
                </>
              )}
              {emp.id === 'eli-engineering' && (
                <button
                  onClick={() => triggerTask(emp.id, 'health_check')}
                  disabled={runningTask === `${emp.id}-health_check`}
                  className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1 disabled:opacity-50"
                >
                  {runningTask === `${emp.id}-health_check` ? <Loader className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                  Health Check
                </button>
              )}
              {emp.id === 'maya-marketing' && (
                <button
                  onClick={() => triggerTask(emp.id, 'content_creation')}
                  disabled={runningTask === `${emp.id}-content_creation`}
                  className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1 disabled:opacity-50"
                >
                  {runningTask === `${emp.id}-content_creation` ? <Loader className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  Create Content
                </button>
              )}
              {emp.id === 'oscar-operations' && (
                <button
                  onClick={() => triggerTask(emp.id, 'daily_standup')}
                  disabled={runningTask === `${emp.id}-daily_standup`}
                  className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1 disabled:opacity-50"
                >
                  {runningTask === `${emp.id}-daily_standup` ? <Loader className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                  Generate Standup
                </button>
              )}
              {emp.id === 'piper-product' && (
                <button
                  onClick={() => triggerTask(emp.id, 'product_analysis')}
                  disabled={runningTask === `${emp.id}-product_analysis`}
                  className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1 disabled:opacity-50"
                >
                  {runningTask === `${emp.id}-product_analysis` ? <Loader className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                  Analyze Feedback
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Shift Results */}
      {shiftResults && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Shift Results
          </h3>
          <div className="space-y-2">
            {shiftResults.map((r, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                {r.status === 'completed' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="font-medium">{r.employee}</span>
                <span className="text-gray-500">{r.task}</span>
                <span className={`text-xs ${r.status === 'completed' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Log */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" />
            Activity Log
          </h3>
          <button
            onClick={fetchData}
            className="text-gray-400 hover:text-gray-600"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {logs.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">
            No activity yet. Run a shift or trigger a task to see logs here.
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="mt-0.5">
                  {TASK_STATUS_ICONS[log.status] || <Clock className="w-4 h-4 text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">
                      {log.employeeName || 'Unknown'}
                    </span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-500">
                      {TASK_LABELS[log.taskType] || log.taskType}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 truncate mt-0.5">
                    {log.summary || 'No summary'}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                    <span>{formatTime(log.createdAt)}</span>
                    {log.duration && (
                      <span>{(log.duration / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
