import type { LucideIcon } from 'lucide-react';
import type React from 'react';

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: string;
  status?: 'healthy' | 'warning' | 'critical';
  loading?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  icon: Icon,
  label,
  value,
  trend,
  status = 'healthy',
  loading = false,
}) => {
  const statusColors = {
    healthy: 'text-green-600 bg-green-50 border-green-200',
    warning: 'text-orange-600 bg-orange-50 border-orange-200',
    critical: 'text-red-600 bg-red-50 border-red-200',
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 animate-pulse">
        <div className="h-12 bg-slate-200 rounded mb-2" />
        <div className="h-6 bg-slate-200 rounded w-1/2" />
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border p-6 ${statusColors[status]}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon
          className={`${status === 'healthy' ? 'text-slate-600' : ''}`}
          size={24}
        />
        {trend && (
          <span
            className={`text-sm font-medium ${trend.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}
          >
            {trend}
          </span>
        )}
      </div>
      <div className="text-3xl font-bold text-slate-900 mb-1">{value}</div>
      <div className="text-sm text-slate-600">{label}</div>
    </div>
  );
};
