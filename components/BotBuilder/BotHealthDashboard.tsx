import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import { AlertCircle, CheckCircle, Lightbulb, RefreshCcw } from 'lucide-react';

// Simple UI components to replace missing shadcn-ui imports
const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'sm' | 'md' | 'lg' }> = ({
  children,
  className = '',
  size = 'md',
  ...props
}) => {
  const sizeClasses = size === 'sm' ? 'px-3 py-1.5 text-sm' : size === 'lg' ? 'px-6 py-3 text-lg' : 'px-4 py-2';
  return (
    <button
      className={`inline-flex items-center justify-center font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${sizeClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`} {...props}>
    {children}
  </div>
);

const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`flex flex-col space-y-1.5 p-6 ${className}`} {...props}>
    {children}
  </div>
);

const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ children, className = '', ...props }) => (
  <h3 className={`text-2xl font-semibold leading-none tracking-tight text-gray-900 ${className}`} {...props}>
    {children}
  </h3>
);

const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`p-6 pt-0 ${className}`} {...props}>
    {children}
  </div>
);

const Progress: React.FC<{ value: number; className?: string }> = ({ value, className = '' }) => (
  <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${className}`}>
    <div className="bg-green-500 h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
  </div>
);

const ScrollArea: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`overflow-y-auto ${className}`} {...props}>
    {children}
  </div>
);

const Select: React.FC<{ value: string; onValueChange: (val: string) => void; children: React.ReactNode }> = ({ value, onValueChange, children }) => {
  return (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className="border border-gray-300 bg-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-[180px] h-11"
    >
      {children}
    </select>
  );
};

const SelectTrigger: React.FC<any> = () => null;
const SelectValue: React.FC<any> = () => null;
const SelectContent: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;
const SelectItem: React.FC<{ value: string; children: React.ReactNode }> = ({ value, children }) => (
  <option value={value}>{children}</option>
);

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
    { timestamp: '2023-10-26T16:00:00Z', value: 4.3 },
  ],
  knowledgeCoverage: [
    { timestamp: '2023-10-26T10:00:00Z', value: 75 },
    { timestamp: '2023-10-26T11:00:00Z', value: 75 },
    { timestamp: '2023-10-26T12:00:00Z', value: 78 },
    { timestamp: '2023-10-26T13:00:00Z', value: 78 },
    { timestamp: '2023-10-26T14:00:00Z', value: 80 },
    { timestamp: '2023-10-26T15:00:00Z', value: 82 },
    { timestamp: '2023-10-26T16:00:00Z', value: 85 },
  ],
  healthScore: 88,
  recommendations: [
    'Add documentation about the new billing features to improve knowledge coverage.',
    'Optimize the DB queries related to user profile loading to reduce avg response time.',
    'Increase training data for greeting intent to reduce occasional classification errors.',
  ],
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

const BotHealthDashboard: React.FC = () => {
  const [botId, setBotId] = useState<string>('bot-123');
  const [healthData, setHealthData] = useState<BotHealthMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealthData = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      // In a real application, you would fetch this from an API
      // const response = await fetch(`/api/bots/${id}/health`);
      // const data = await response.json();
      // setHealthData(data);
      
      // Simulating network delay
      await new Promise((resolve) => setTimeout(resolve, 500));
      setHealthData(mockHealthData);
    } catch (err) {
      setError('Failed to fetch health data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealthData(botId);
  }, [botId, fetchHealthData]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const healthScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const pieChartData = healthData ? [
    { name: 'Response Accuracy', value: 40 },
    { name: 'uptime', value: 30 },
    { name: 'Speed', value: 20 },
    { name: 'Safety', value: 10 },
  ] : [];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <RefreshCcw className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-lg font-medium text-gray-700">Loading Bot Health...</span>
      </div>
    );
  }

  if (error || !healthData) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-4 text-center">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <h2 className="mt-4 text-2xl font-bold text-gray-900">Error</h2>
        <p className="mt-2 text-gray-600 max-w-md">{error || 'Unable to load health metrics.'}</p>
        <Button onClick={() => fetchHealthData(botId)} className="mt-6 bg-blue-600 hover:bg-blue-700 text-white">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full w-full p-4 md:p-6 lg:p-8">
      <div className="flex flex-col space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Bot Health & Diagnostics</h1>
            <p className="text-gray-500">Monitor uptime, API latency, and intent diagnostics for your bot.</p>
          </div>
          <div className="flex items-center space-x-4">
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
            <Button onClick={() => fetchHealthData(botId)} size="sm" className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-300">
              <RefreshCcw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Top Cards: Health Score & Recommendations */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="col-span-1 flex flex-col items-center justify-center p-6 bg-gray-50/50">
            <CardHeader className="p-0">
              <CardTitle className="text-center text-sm font-medium text-gray-500 uppercase tracking-wider">Overall Health Score</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center p-0 mt-4">
              <span className={`text-6xl font-extrabold tracking-tight ${healthScoreColor(healthData.healthScore)}`}>
                {healthData.healthScore}%
              </span>
              <div className="flex items-center mt-3 text-sm text-gray-600">
                <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                <span>Healthy - Operational</span>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-1 md:col-span-2 p-6 flex flex-col">
            <CardHeader className="p-0">
              <CardTitle className="flex items-center text-lg font-semibold text-gray-900">
                <Lightbulb className="h-5 w-5 text-yellow-500 mr-2" />
                Diagnostic Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 mt-4 flex-1">
              <ScrollArea className="h-full pr-4">
                <ul className="space-y-3">
                  {healthData.recommendations.map((recommendation, index) => (
                    <li key={index} className="flex items-start space-x-3 text-sm text-gray-700 bg-blue-50/30 p-3 rounded-md border border-blue-50">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-600">
                        {index + 1}
                      </span>
                      <span>{recommendation}</span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Charts: Response Time & Error Rates */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-lg font-semibold text-gray-900">Average Response Time</CardTitle>
              <p className="text-sm text-gray-500">Monitor latency in milliseconds.</p>
            </CardHeader>
            <CardContent className="p-0 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={healthData.responseTimeAvg}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} />
                  <YAxis label={{ value: 'ms', angle: -90, position: 'insideLeft' }} />
                  <Tooltip labelFormatter={(label) => new Date(label).toLocaleString()} />
                  <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="p-6">
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-lg font-semibold text-gray-900">Error Rate</CardTitle>
              <p className="text-sm text-gray-500">Uptime & unhandled exceptions diagnostics.</p>
            </CardHeader>
            <CardContent className="p-0 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={healthData.errorRate}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} />
                  <YAxis label={{ value: 'rate', angle: -90, position: 'insideLeft' }} />
                  <Tooltip labelFormatter={(label) => new Date(label).toLocaleString()} />
                  <Line type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={2} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Charts: Satisfaction & Coverage */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6">
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-lg font-semibold text-gray-900">User Satisfaction & Knowledge Coverage</CardTitle>
              <p className="text-sm text-gray-500">Correlation of bot performance and knowledge base coverage.</p>
            </CardHeader>
            <CardContent className="p-0 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={healthData.userSatisfactionScore}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} />
                  <YAxis yAxisId="left" orientation="left" stroke="#10b981" />
                  <YAxis yAxisId="right" orientation="right" stroke="#8b5cf6" />
                  <Tooltip labelFormatter={(label) => new Date(label).toLocaleString()} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="value" name="Satisfaction (1-5)" fill="#10b981" />
                  {/* Mapping the second line to another database to simulate correlation */}
                  <Bar yAxisId="right" data={healthData.knowledgeCoverage} dataKey="value" name="Coverage (%)" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="col-span-1 p-6 flex flex-col">
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-lg font-semibold text-gray-900">Diagnosis Weights</CardTitle>
              <p className="text-sm text-gray-500">Impact factor of elements on the current health score.</p>
            </CardHeader>
            <CardContent className="p-0 h-[300px] flex items-center justify-center">
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
        </div>
      </div>
    </ScrollArea>
  );
};

export default BotHealthDashboard;