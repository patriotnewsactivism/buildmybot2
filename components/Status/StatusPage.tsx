import {
  AlertCircle,
  CheckCircle,
  Clock,
  Database,
  Globe,
  MessageSquare,
  Server,
  XCircle,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { SEO, SEOConfig } from '../SEO/SEO';

interface ServiceStatus {
  status: 'up' | 'down' | 'unknown';
  latency?: number;
  error?: string;
}

interface HealthData {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: ServiceStatus;
    stripe: ServiceStatus;
    openai: ServiceStatus;
    cartesia: ServiceStatus;
  };
}

export const StatusPage: React.FC = () => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seo = (
    <SEO
      title={SEOConfig.status.title}
      description={SEOConfig.status.description}
      keywords={SEOConfig.status.keywords}
      noindex
    />
  );

  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      setHealth(data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch system status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'up':
        return <CheckCircle className="text-green-500" size={24} />;
      case 'degraded':
        return <AlertCircle className="text-yellow-500" size={24} />;
      case 'unhealthy':
      case 'down':
        return <XCircle className="text-red-500" size={24} />;
      default:
        return <Clock className="text-slate-400" size={24} />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'All Systems Operational';
      case 'degraded':
        return 'Partial System Outage';
      case 'unhealthy':
        return 'Major System Outage';
      default:
        return 'Checking Status...';
    }
  };

  if (loading && !health) {
    return (
      <>
        {seo}
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900" />
        </div>
      </>
    );
  }

  return (
    <>
      {seo}
      <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-blue-900 rounded-2xl flex items-center justify-center shadow-xl">
                <Server className="text-white" size={32} />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              BuildMyBot Status
            </h1>
            <p className="text-slate-600">
              Real-time status of our services and infrastructure
            </p>
          </div>

          {/* Overall Status */}
          <div
            className={`rounded-xl p-6 mb-8 flex items-center gap-4 shadow-sm border ${
              health?.status === 'healthy'
                ? 'bg-green-50 border-green-200'
                : health?.status === 'degraded'
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-red-50 border-red-200'
            }`}
          >
            {getStatusIcon(health?.status || 'unknown')}
            <div>
              <h2
                className={`text-xl font-bold ${
                  health?.status === 'healthy'
                    ? 'text-green-900'
                    : health?.status === 'degraded'
                      ? 'text-yellow-900'
                      : 'text-red-900'
                }`}
              >
                {getStatusText(health?.status || 'unknown')}
              </h2>
              <p className="text-sm opacity-80">
                Last updated:{' '}
                {health
                  ? new Date(health.timestamp).toLocaleTimeString()
                  : 'Never'}
              </p>
            </div>
          </div>

          {/* Services Grid */}
          <div className="grid gap-4 mb-8">
            <ServiceCard
              name="Core Platform & Database"
              status={health?.services.database}
              icon={<Database size={20} />}
            />
            <ServiceCard
              name="AI Chat Services (OpenAI)"
              status={health?.services.openai}
              icon={<MessageSquare size={20} />}
            />
            <ServiceCard
              name="Voice Synthesis (Cartesia)"
              status={health?.services.cartesia}
              icon={<Globe size={20} />}
            />
            <ServiceCard
              name="Billing & Payments (Stripe)"
              status={health?.services.stripe}
              icon={<CheckCircle size={20} />}
            />
          </div>

          {/* Infrastructure Details */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-900 mb-4">
              System Information
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Uptime</span>
                <span className="font-mono">
                  {health ? Math.floor(health.uptime / 3600) : 0}h{' '}
                  {health ? Math.floor((health.uptime % 3600) / 60) : 0}m
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Version</span>
                <span className="font-mono">v{health?.version}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Environment</span>
                <span className="font-mono">Production</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Region</span>
                <span className="font-mono">Global Edge</span>
              </div>
            </div>
          </div>

          <div className="mt-12 text-center">
            <a
              href="/"
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              &larr; Back to BuildMyBot
            </a>
          </div>
        </div>
      </div>
    </>
  );
};

const ServiceCard: React.FC<{
  name: string;
  status?: ServiceStatus;
  icon: React.ReactNode;
}> = ({ name, status, icon }) => {
  const getStatusIcon = (s?: string) => {
    if (s === 'up')
      return <div className="w-2.5 h-2.5 bg-green-500 rounded-full" />;
    if (s === 'down')
      return <div className="w-2.5 h-2.5 bg-red-500 rounded-full" />;
    return <div className="w-2.5 h-2.5 bg-slate-300 rounded-full" />;
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-600">
          {icon}
        </div>
        <div>
          <h4 className="font-medium text-slate-900">{name}</h4>
          {status?.latency && (
            <p className="text-xs text-slate-500">
              Latency: {status.latency}ms
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium capitalize text-slate-600">
          {status?.status || 'unknown'}
        </span>
        {getStatusIcon(status?.status)}
      </div>
    </div>
  );
};
