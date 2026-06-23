import React, { useState, useEffect } from 'react';
import { MetricCard } from '../UI/MetricCard';
import { DataTable } from '../UI/DataTable';
import { Bot } from '../../shared/schema'; // Assuming Bot type is defined here
import { Gauge, LineChart, BarChart, TrendingUp, TrendingDown, Info } from 'lucide-react';

interface BenchmarkData {
  metric: string;
  yourBot: string | number;
  industryAverage: string | number;
  top25Percentile: string | number;
  gapAnalysis: string;
  suggestion: string;
}

interface PerformanceMetric {
  id: string;
  name: string;
  value: string | number;
  unit?: string;
  change?: number;
  description?: string;
}

const mockBenchmarkData: BenchmarkData[] = [
  {
    metric: 'Average Response Time (ms)',
    yourBot: '250',
    industryAverage: '300',
    top25Percentile: '180',
    gapAnalysis: 'Your bot is faster than average but slower than top performers.',
    suggestion: 'Optimize API calls and database queries. Consider caching frequently accessed data.'
  },
  {
    metric: 'Completion Rate (%)',
    yourBot: '85%',
    industryAverage: '80%',
    top25Percentile: '92%',
    gapAnalysis: 'Slightly above average, but room for improvement to reach top tier.',
    suggestion: 'Refine intent recognition, improve fallback mechanisms, and enhance knowledge base coverage.'
  },
  {
    metric: 'User Satisfaction Score (out of 5)',
    yourBot: '4.2',
    industryAverage: '3.9',
    top25Percentile: '4.5',
    gapAnalysis: 'Good performance, exceeding industry average.',
    suggestion: 'Continue monitoring user feedback. Explore advanced sentiment analysis for proactive issue detection.'
  },
  {
    metric: 'Lead Qualification Rate (%)',
    yourBot: '60%',
    industryAverage: '55%',
    top25Percentile: '70%',
    gapAnalysis: 'Solid performance, outperforming the average.',
    suggestion: 'A/B test different lead qualification questions and refine CRM integration for smoother handoffs.'
  },
  {
    metric: 'Error Rate (%)',
    yourBot: '1.5%',
    industryAverage: '3.0%',
    top25Percentile: '0.8%',
    gapAnalysis: 'Significantly better than average, but top bots have lower rates.',
    suggestion: 'Implement more robust error logging and monitoring. Conduct regular regression testing.'
  }
];

const mockPerformanceMetrics: PerformanceMetric[] = [
  {
    id: 'avg_response_time',
    name: 'Avg. Response Time',
    value: 250,
    unit: 'ms',
    change: -10,
    description: 'Average time taken for the bot to respond to a user query.'
  },
  {
    id: 'completion_rate',
    name: 'Completion Rate',
    value: 85,
    unit: '%',
    change: 5,
    description: 'Percentage of user interactions successfully completed by the bot.'
  },
  {
    id: 'user_satisfaction',
    name: 'User Satisfaction',
    value: 4.2,
    unit: '/5',
    change: 0.1,
    description: 'Average user satisfaction score based on feedback.'
  },
  {
    id: 'lead_qualification_rate',
    name: 'Lead Qual. Rate',
    value: 60,
    unit: '%',
    change: 2,
    description: 'Percentage of conversations resulting in a qualified lead.'
  },
  {
    id: 'error_rate',
    name: 'Error Rate',
    value: 1.5,
    unit: '%',
    change: -0.5,
    description: 'Percentage of interactions where the bot encountered an error.'
  },
  {
    id: 'escalation_rate',
    name: 'Escalation Rate',
    value: 10,
    unit: '%',
    change: -1,
    description: 'Percentage of interactions escalated to a human agent.'
  },
];

const BenchmarkDashboard: React.FC = () => {
  const [selectedBot, setSelectedBot] = useState<string>('all'); // Placeholder for bot selection
  const [loading, setLoading] = useState<boolean>(false);
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkData[]>(mockBenchmarkData);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetric[]>(mockPerformanceMetrics);

  // In a real application, you would fetch data based on selectedBot
  useEffect(() => {
    // Simulate API call
    setLoading(true);
    setTimeout(() => {
      // Fetch data for selectedBot
      setBenchmarkData(mockBenchmarkData);
      setPerformanceMetrics(mockPerformanceMetrics);
      setLoading(false);
    }, 500);
  }, [selectedBot]);

  const columns = [
    { header: 'Metric', accessorKey: 'metric' },
    { header: 'Your Bot', accessorKey: 'yourBot' },
    { header: 'Industry Average', accessorKey: 'industryAverage' },
    { header: 'Top 25% Percentile', accessorKey: 'top25Percentile' },
    { header: 'Gap Analysis', accessorKey: 'gapAnalysis' },
    { header: 'Suggestion', accessorKey: 'suggestion' },
  ];

  return (
    <div className="p-6 space-y-8 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold text-gray-900">Bot Performance Benchmarking</h1>
      <p className="text-gray-600">Compare your bot's performance against industry averages and top performers to identify areas for optimization.</p>

      {/* Bot Selector (Placeholder) */}
      <div className="flex items-center space-x-4">
        <label htmlFor="bot-select" className="text-gray-700 font-medium">Select Bot/Persona:</label>
        <select
          id="bot-select"
          className="block w-48 p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          value={selectedBot}
          onChange={(e) => setSelectedBot(e.target.value)}
        >
          <option value="all">All Bots / General Industry</option>
          <option value="city_government">City Government Persona</option>
          <option value="recruitment">Recruitment Persona</option>
          <option value="real_estate">Real Estate Persona</option>
          {/* Add more bot/persona options dynamically */}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">Loading benchmark data...</div>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-800">Key Performance Metrics</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {performanceMetrics.map((metric) => (
                <MetricCard
                  key={metric.id}
                  title={metric.name}
                  value={`${metric.value}${metric.unit || ''}`}
                  description={metric.description}
                  icon={metric.id.includes('time') ? <Gauge className="h-6 w-6 text-indigo-500" /> : metric.id.includes('rate') ? (metric.change && metric.change > 0 ? <TrendingUp className="h-6 w-6 text-green-500" /> : <TrendingDown className="h-6 w-6 text-red-500" />) : <Info className="h-6 w-6 text-blue-500" />}
                  change={metric.change ? `${metric.change > 0 ? '+' : ''}${metric.change}${metric.unit || ''}` : undefined}
                  changeType={metric.change ? (metric.change > 0 ? 'positive' : 'negative') : undefined}
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-800">Comparative Benchmarking</h2>
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <DataTable
                columns={columns}
                data={benchmarkData}
                // No pagination or search needed for this specific table, but can be added if data grows
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-800">Optimization Suggestions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {benchmarkData.map((item, index) => (
                <div key={index} className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">{item.metric}</h3>
                  <p className="text-gray-700 mb-2"><span className="font-medium">Gap Analysis:</span> {item.gapAnalysis}</p>
                  <p className="text-indigo-600 font-medium"><span className="font-medium text-gray-700">Suggestion:</span> {item.suggestion}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default BenchmarkDashboard;
