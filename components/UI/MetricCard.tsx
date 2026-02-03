import type { LucideIcon } from 'lucide-react';
import type React from 'react';

type MetricVariant = 'savings' | 'efficiency' | 'volume' | 'revenue';

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  variant?: MetricVariant;
  change?: {
    value: number;
    trend: 'up' | 'down';
    period?: string;
  };
  subtext?: string;
  onClick?: () => void;
  loading?: boolean;
  status?: string;
}

const variantStyles: Record<
  MetricVariant,
  {
    border: string;
    iconBg: string;
    iconColor: string;
    valueColor: string;
  }
> = {
  savings: {
    border: 'border-green-200',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    valueColor: 'text-green-600',
  },
  efficiency: {
    border: 'border-blue-200',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    valueColor: 'text-blue-600',
  },
  volume: {
    border: 'border-slate-200',
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600',
    valueColor: 'text-slate-900',
  },
  revenue: {
    border: 'border-purple-200',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    valueColor: 'text-purple-600',
  },
};

export const MetricCard: React.FC<MetricCardProps> = ({
  icon: Icon,
  label,
  value,
  variant = 'volume',
  change,
  subtext,
  onClick,
  loading = false,
}) => {
  const styles = variantStyles[variant];

  return (
    <div
      className={`bg-white rounded-lg border ${styles.border} p-6 shadow-sm hover:shadow-md transition-shadow duration-200 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-10 w-10 bg-slate-200 rounded-lg" />
          <div className="h-8 bg-slate-200 rounded w-24" />
          <div className="h-4 bg-slate-200 rounded w-32" />
        </div>
      ) : (
        <>
          {/* Icon */}
          <div
            className={`${styles.iconBg} w-10 h-10 rounded-lg flex items-center justify-center mb-4`}
          >
            <Icon className={styles.iconColor} size={20} />
          </div>

          {/* Value */}
          <div className={`text-3xl font-bold ${styles.valueColor} mb-1`}>
            {value}
          </div>

          {/* Label */}
          <div className="text-sm font-medium text-slate-600 mb-2">{label}</div>

          {/* Change Indicator */}
          {change && (
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-semibold ${
                  change.trend === 'up' ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {change.trend === 'up' ? '↑' : '↓'} {Math.abs(change.value)}%
              </span>
              {change.period && (
                <span className="text-xs text-slate-400">
                  vs {change.period}
                </span>
              )}
            </div>
          )}

          {/* Subtext */}
          {subtext && (
            <div className="text-xs text-slate-500 mt-2">{subtext}</div>
          )}
        </>
      )}
    </div>
  );
};
