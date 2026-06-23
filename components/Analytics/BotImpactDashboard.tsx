import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { CalendarDays, Smile, Frown, Meh, Lightbulb, TrendingUp, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/apiConfig';

interface CompletionRateData {
  date: string;
  completionRate: number;
}

interface SentimentData {
  sentiment: 'positive' | 'negative' | 'neutral';
  count: number;
}

interface KnowledgeGapData {
  question: string;
  count: number;
}

interface BotPerformanceData {
  completionRates: CompletionRateData[];
  sentimentDistribution: SentimentData[];
  knowledgeGaps: KnowledgeGapData[];
  hasData: boolean;
}

const COLORS = ['#82ca9d', '#ffc658', '#8884d8']; // Green for positive, Yellow for neutral, Purple for negative

const BotImpactDashboard: React.FC = () => {
  const [botId, setBotId] = useState<string | null>(null); // In a real app, this would come from context or props

  // Mock botId for demonstration. Replace with actual bot selection logic.
  useEffect(() => {
    // For demonstration, assume a botId is available or selected
    setBotId('bot-123'); 
  }, []);

  const { data, isLoading, isError, error } = useQuery<BotPerformanceData, Error>(
    ['botPerformance', botId],
    async () => {
      if (!botId) return { hasData: false, completionRates: [], sentimentDistribution: [], knowledgeGaps: [] };
      const response = await api.get(`/analytics/bot-performance/${botId}`);
      return response.data;
    },
    { enabled: !!botId, staleTime: 5 * 60 * 1000 } // Cache data for 5 minutes
  );

  const renderSentimentLegend = (value: string) => {
    switch (value) {
      case 'positive': return <span className="text-green-500">Positive</span>;
      case 'negative': return <span className="text-red-500">Negative</span>;
      case 'neutral': return <span className="text-yellow-500">Neutral</span>;
      default: return <span>{value}</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        <Skeleton className="h-[300px] w-full" />
        <Skeleton className="h-[300px] w-full" />
        <Skeleton className="h-[300px] w-full" />
        <Skeleton className="h-[300px] w-full md:col-span-2 lg:col-span-3" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive" className="m-4">
        <Frown className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Failed to load bot analytics: {error?.message || 'Unknown error'}</AlertDescription>
      </Alert>
    );
  }

  if (!data?.hasData) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-gray-50 dark:bg-gray-900 rounded-lg shadow-inner m-4 min-h-[400px]">
        <BarChart3 className="h-16 w-16 text-gray-400 mb-4" />
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-2">No Analytics Data Yet</h2>
        <p className="text-gray-600 dark:text-gray-400 text-center mb-6 max-w-md">
          It looks like your bot hasn't generated enough conversation data to display analytics. Start engaging with your customers to unlock powerful insights!
        </p>
        <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
          Enable Analytics (Coming Soon)
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Bot Impact Dashboard</h1>
      <p className="text-gray-600 dark:text-gray-400">Gain insights into your bot's performance and identify areas for improvement.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Completion Rate Timeline */}
        <Card className="md:col-span-2 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-blue-500" /> Conversation Completion Rate</CardTitle>
            <CardDescription>Trend of successful conversation completions over time.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.completionRates} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis dataKey="date" stroke="#888" tickFormatter={(tick) => new Date(tick).toLocaleDateString()} />
                <YAxis stroke="#888" domain={[0, 100]} tickFormatter={(tick) => `${tick}%`} />
                <Tooltip formatter={(value: number) => [`${value.toFixed(2)}%`, 'Completion Rate']} />
                <Line type="monotone" dataKey="completionRate" stroke="#82ca9d" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Sentiment Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Smile className="h-5 w-5 text-yellow-500" /> User Sentiment Distribution</CardTitle>
            <CardDescription>Breakdown of user sentiment during conversations.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.sentimentDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {data.sentimentDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, name: string) => [`${value} conversations`, renderSentimentLegend(name)]} />
                <Legend formatter={renderSentimentLegend} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Knowledge Gap Heatmap (List for now, actual heatmap is complex) */}
        <Card className="md:col-span-full lg:col-span-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-purple-500" /> Top Knowledge Gaps</CardTitle>
            <CardDescription>Frequently asked questions your bot couldn't answer effectively.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.knowledgeGaps.length > 0 ? (
              <ul className="space-y-2">
                {data.knowledgeGaps.slice(0, 5).map((gap, index) => (
                  <li key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-md">
                    <span className="text-gray-800 dark:text-gray-200 font-medium">{gap.question}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">Asked {gap.count} times</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">No significant knowledge gaps detected yet. Keep training your bot!</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BotImpactDashboard;
