import {
  DollarSign,
  MessageSquare,
  Target,
  TrendingUp,
  Users,
  Loader,
  AlertCircle,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';

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
    if (propTotalConversations !== undefined && propTotalLeads !== undefined && propConversionRate !== undefined && propEstimatedValue !== undefined) {
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
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [propTotalConversations, propTotalLeads, propConversionRate, propEstimatedValue, propError]);

  const currentLoading = propLoading || loading;
  const currentError = propError || error;
  const currentMetrics = metrics || { totalConversations: 0, totalLeads: 0, conversionRate: 0, estimatedValue: 0 };

  const formatValue = (value: number | undefined, prefix = '', suffix = '') => {
    if (value === undefined || currentLoading) return '...';
    return `${prefix}${value.toLocaleString()}${suffix}`;
  };

  const formatPercentage = (value: number | undefined) => {
    if (value === undefined || currentLoading) return '...';
    return `${value.toFixed(2)}%`;
  };

  const renderMetric = (Icon: React.ElementType, title: string, value: string, growth?: number) => (
    <div className="rounded-lg bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <Icon className="h-6 w-6 text-blue-500" />
        <span className="text-2xl font-bold text-gray-800">{value}</span>
      </div>
      <h3 className="mt-3 text-lg font-medium text-gray-700">{title}</h3>
      {growth !== undefined && growth !== null && (
        <div className={`mt-1 flex items-center text-sm ${growth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {growth >= 0 ? <TrendingUp className="mr-1 h-4 w-4" /> : <TrendingUp className="mr-1 h-4 w-4 rotate-180" />}
          {Math.abs(growth).toFixed(2)}% {growth >= 0 ? 'increase' : 'decrease'}
        </div>
      )}
    </div>
  );

  if (currentError) {
    return (
      <div className="col-span-full flex items-center justify-center rounded-lg bg-red-100 p-5 text-red-700 shadow-sm">
        <AlertCircle className="mr-2 h-5 w-5" />
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
