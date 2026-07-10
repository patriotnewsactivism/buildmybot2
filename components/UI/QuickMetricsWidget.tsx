import {
  AlertCircle,
  DollarSign,
  MessageSquare,
  Target,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';
import { HudMetric } from './HudMetric';

interface QuickMetrics {
  totalConversations: number;
  totalLeads: number;
  conversionRate: number;
  estimatedValue: number;
  conversationGrowth?: number;
  leadGrowth?: number;
}

interface QuickMetricsWidgetProps {
  averageLeadValue?: number;
  totalConversations?: number;
  totalLeads?: number;
  conversionRate?: number;
  estimatedValue?: number;
  loading?: boolean;
  error?: string | null;
}

export const QuickMetricsWidget: React.FC<QuickMetricsWidgetProps> = ({
  averageLeadValue = 100,
  totalConversations: propTotalConversations,
  totalLeads: propTotalLeads,
  conversionRate: propConversionRate,
  estimatedValue: propEstimatedValue,
  loading: propLoading = false,
  error: propError = null,
}) => {
  const [metrics, setMetrics] = useState<QuickMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If props are provided, use them directly and skip API call
    if (
      propTotalConversations !== undefined &&
      propTotalLeads !== undefined &&
      propConversionRate !== undefined &&
      propEstimatedValue !== undefined
    ) {
      setMetrics({
        totalConversations: propTotalConversations,
        totalLeads: propTotalLeads,
        conversionRate: propConversionRate,
        estimatedValue: propEstimatedValue,
      });
      setLoading(false);
      setError(propError);
      return;
    }

    const fetchMetrics = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(buildApiUrl('/analytics/quick-metrics'));
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to fetch quick metrics');
        }
        const data: QuickMetrics = await response.json();
        setMetrics(data);
      } catch (err) {
        console.error('Error fetching quick metrics:', err);
        setError(
          err instanceof Error ? err.message : 'An unknown error occurred',
        );
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [
    propTotalConversations,
    propTotalLeads,
    propConversionRate,
    propEstimatedValue,
    propError,
  ]);

  const currentLoading = propLoading || loading;
  const currentError = propError || error;
  const currentMetrics = metrics || {
    totalConversations: 0,
    totalLeads: 0,
    conversionRate: 0,
    estimatedValue: 0,
  };

  const formatValue = (value: number | undefined, prefix = '', suffix = '') => {
    if (value === undefined || currentLoading) return '...';
    return `${prefix}${value.toLocaleString()}${suffix}`;
  };

  const formatPercentage = (value: number | undefined) => {
    if (value === undefined || currentLoading) return '...';
    return `${value.toFixed(2)}%`;
  };

  const renderMetric = (
    Icon: LucideIcon,
    title: string,
    value: string,
    growth?: number,
  ) => (
    <HudMetric
      icon={Icon}
      label={title}
      value={value}
      loading={currentLoading}
      accent="cyan"
      trend={
        growth !== undefined && growth !== null
          ? {
              value: `${Math.abs(growth).toFixed(2)}%`,
              direction: growth >= 0 ? 'up' : 'down',
            }
          : undefined
      }
    />
  );

  if (currentError) {
    return (
      <div className="col-span-full flex items-center justify-center gap-2 border border-accent-red/40 bg-accent-red/10 p-3 text-xs text-accent-red">
        <AlertCircle className="h-4 w-4" />
        <p>Error loading quick metrics: {currentError}</p>
      </div>
    );
  }

  return (
    <>
      {renderMetric(
        MessageSquare,
        'Total Conversations',
        formatValue(currentMetrics.totalConversations),
        currentMetrics.conversationGrowth,
      )}
      {renderMetric(
        Users,
        'Total Leads',
        formatValue(currentMetrics.totalLeads),
        currentMetrics.leadGrowth,
      )}
      {renderMetric(
        Target,
        'Conversion Rate',
        formatPercentage(currentMetrics.conversionRate),
      )}
      {renderMetric(
        DollarSign,
        'Estimated Value',
        formatValue(currentMetrics.estimatedValue, '$'),
      )}
    </>
  );
};
