import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Lightbulb, RefreshCcw } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MetricData {
  timestamp: string;
  value: number;
}

interface BotHealthMetrics {
  responseTimeAvg: MetricData[];
  errorRate: MetricData[];
  userSatisfactionScore: MetricData[];
  knowledgeCoverage: MetricData[];
  healthScore: number;
  recommendations: string[];
}

const mockHealthData: BotHealthMetrics = {
  responseTimeAvg: [
    { timestamp: '2023-10-26T10:00:00Z', value: 150 },
    { timestamp: '2023-10-26T11:00:00Z', value: 160 },
    { timestamp: '2023-10-26T12:00:00Z', value: 145 },
    { timestamp: '2023-10-26T13:00:00Z', value: 170 },
    { timestamp: '2023-10-26T14:00:00Z', value: 155 },
    { timestamp: '2023-10-26T15:00:00Z', value: 180 },
    { timestamp: '2023-10-26T16:00:00Z', value: 165 },
  ],
  errorRate: [
    { timestamp: '2023-10-26T10:00:00Z', value: 0.02 },
    { timestamp: '2023-10-26T11:00:00Z', value: 0.03 },
    { timestamp: '2023-10-26T12:00:00Z', value: 0.01 },
    { timestamp: '2023-10-26T13:00:00Z', value: 0.04 },
    { timestamp: '2023-10-26T14:00:00Z', value: 0.025 },
    { timestamp: '2023-10-26T15:00:00Z', value: 0.05 },
    { timestamp: '2023-10-26T16:00:00Z', value: 0.03 },
  ],
  userSatisfactionScore: [
    { timestamp: '2023-10-26T10:00:00Z', value: 4.2 },
    { timestamp: '2023-10-26T11:00:00Z', value: 4.3 },
    { timestamp: '2023-10-26T12:00:00Z', value: 4.5 },
    { timestamp: '2023-10-26T13:00:00Z', value: 4.1 },
    { timestamp: '2023-10-26T14:00:00Z', value: 4.4 },
    { timestamp: '2023-10-26T15:00:00Z', value: 4.0 },
    { timestamp: '2023-10-26T16:00:00Z', value: 4.25 },
  ],
  knowledgeCoverage: [
    { timestamp: '2023-10-26T10:00:00Z', value: 0.85 },
    { timestamp: '2023-10-26T11:00:00Z', value: 0.86 },
    { timestamp: '2023-10-26T12:00:00Z', value: 0.87 },
    { timestamp: '2023-10-26T13:00:00Z', value: 0.84 },
    { timestamp: '2023-10-26T14:00:00Z', value: 0.88 },
    { timestamp: '2023-10-26T15:00:00Z', value: 0.83 },
    { timestamp: '2023-10-26T16:00:00Z', value: 0.875 },
  ],
  healthScore: 78,
  recommendations: [
    'Add missing FAQ for pricing questions to knowledge base.',
    'Review recent high error rate conversations for patterns.',
    'Optimize bot responses for common queries to reduce response time.',
    'Engage users with a satisfaction survey after critical interactions.',
  ],
};

const BotHealthDashboard: React.FC = () => {
  const [botId, setBotId] = useState<string>('bot-123');
  const [healthData, setHealthData] = useState<BotHealthMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealthData = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      // In a real application, this would be an API call
      // const response = await fetch(`/api/bot-health/${id}`);
      // if (!response.ok) throw new Error('Failed to fetch bot health data');
      // const data = await response.json();
      // setHealthData(data);

      // Using mock data for now
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API call
      setHealthData(mockHealthData);

      if (mockHealthData.healthScore < 70) {
        // Simulate email alert trigger
        console.warn(`Bot ${id} health score dropped below 70! Current score: ${mockHealthData.healthScore}`);
        // In a real app: trigger actual email alert via API
      }

    } catch (err) {
      setError('Failed to load bot health data. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealthData(botId);
  }, [botId, fetchHealthData]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '24', minute: '2-digit' });
  };

  const healthScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const pieChartData = healthData ? [
    { name: 'Response Accuracy', value: 40 },
    { name: 'Response Time', value: 25 },
    { name: 'Error Rate', value: 20 },
    { name: 'User Feedback', value: 15 },
  ] : [];

  const COLORS = ['#82ca9d', '#8884d8', '#ffc658', '#ff7300'];

  if (loading) {
    return <div className="p-4 text-center text-gray-500">Loading bot health data...</div>;
  }

  if (error) {
    return <div className="p-4 text-center text-red-500">Error: {error}</div>;
  }

  if (!healthData) {
    return <div className="p-4 text-center text-gray-500">No health data available for this bot.</div>;
  }

  return (
    <ScrollArea className="h-full w-full p-4 md:p-6 lg:p-8">
      <div className="max-w-full mx-auto space-y-6 pb-4">
        <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-gray-50">Bot Health Dashboard</h1>

        <div className="flex flex-col sm:flex-row items-center justify-between mb-6 space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <label htmlFor="bot-select" className="sr-only">Select Bot</label>
            <Select value={botId} onValueChange={setBotId}>
              <SelectTrigger id="bot-select" className="w-full sm:w-[180px] h-11">
                <SelectValue placeholder="Select a bot" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bot-123">Customer Support Bot</SelectItem>
                <SelectItem value="bot-456">Lead Generation Bot</SelectItem>
                <SelectItem value="bot-789">HR Assistant Bot</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => fetchHealthData(botId)} className="h-11 px-4 py-2 text-base">
              <RefreshCcw className="h-5 w-5 mr-2" /> Refresh
            </Button>
          </div>
          <div className="flex items-center space-x-4 w-full sm:w-auto justify-end">
            <div className="text-lg font-semibold">Overall Health Score:</div>
            <div className={`text-3xl font-bold ${healthScoreColor(healthData.healthScore)}`}>
              {healthData.healthScore}
            </div>
            <Progress value={healthData.healthScore} className="w-24 h-3" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="col-span-1 md:col-span-2 lg:col-span-1">
            <CardHeader>
              <CardTitle>Health Score Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="h-[250px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="col-span-1 md:col-span-2 lg:col-span-2">
            <CardHeader>
              <CardTitle>Actionable Recommendations</CardTitle>
            </CardHeader>
            <CardContent className="h-[250px]">
              <ScrollArea className="h-full pr-4">
                <ul className="space-y-3">
                  {healthData.recommendations.length > 0 ? (
                    healthData.recommendations.map((rec, index) => (
                      <li key={index} className="flex items-start text-gray-700 dark:text-gray-300">
                        <Lightbulb className="h-5 w-5 text-blue-500 mr-3 mt-1 flex-shrink-0" />
                        <span>{rec}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-gray-500 flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                      All good! No immediate recommendations.
                    </li>
                  )}
                </ul>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Response Time Trends (ms)</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={healthData.responseTimeAvg}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} />
                  <YAxis />
                  <Tooltip labelFormatter={formatTimestamp} />
                  <Legend />
                  <Line type="monotone" dataKey="value" stroke="#8884d8" name="Avg Response Time" activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Error Rate (%)</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={healthData.errorRate}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} />
                  <YAxis tickFormatter={(value) => `${(value * 100).toFixed(1)}%`} />
                  <Tooltip labelFormatter={formatTimestamp} formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, 'Error Rate']} />
                  <Legend />
                  <Bar dataKey="value" fill="#ef4444" name="Error Rate" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>User Satisfaction Score (1-5)</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={healthData.userSatisfactionScore}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} />
                  <YAxis domain={[1, 5]} />
                  <Tooltip labelFormatter={formatTimestamp} />
                  <Legend />
                  <Line type="monotone" dataKey="value" stroke="#22c55e" name="Satisfaction Score" activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Knowledge Coverage (%)</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={healthData.knowledgeCoverage}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} />
                  <YAxis tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} />
                  <Tooltip labelFormatter={formatTimestamp} formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, 'Knowledge Coverage']} />
                  <Legend />
                  <Line type="monotone" dataKey="value" stroke="#3b82f6" name="Knowledge Coverage" activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </ScrollArea>
  );
};

export default BotHealthDashboard;
