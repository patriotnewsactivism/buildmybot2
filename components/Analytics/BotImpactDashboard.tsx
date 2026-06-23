import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { CalendarDays, Smile, Frown, Meh, Lightbulb, TrendingUp, BarChart3 } from 'lucide-react';
import { buildApiUrl } from '../../services/apiConfig';

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

const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ children, className = '', ...props }) => (
  <p className={`text-sm text-gray-500 ${className}`} {...props}>
    {children}
  </p>
);

const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, className = '', ...props }) => (
  <div className={`p-6 pt-0 ${className}`} {...props}>
    {children}
  </div>
);

const Skeleton: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...props }) => (
  <div className={`animate-pulse rounded bg-gray-200 ${className}`} {...props} />
);

const Alert: React.FC<React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'destructive' }> = ({
  children,
  className = '',
  variant = 'default',
  ...props
}) => {
  const variantClasses = variant === 'destructive' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-gray-50 border-gray-200 text-gray-800';
  return (
    <div className={`relative w-full rounded-lg border p-4 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-7 ${variantClasses} ${className}`} {...props}>
      {children}
    </div>
  );
};

const AlertTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ children, className = '', ...props }) => (
  <h5 className={`mb-1 font-medium leading-none tracking-tight ${className}`} {...props}>
    {children}
  </h5>
);

const AlertDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({ children, className = '', ...props }) => (
  <div className={`text-sm [&_p]:leading-relaxed ${className}`} {...props}>
    {children}
  </div>
);

// Custom simple useQuery stub to avoid external react-query dependency
function useQuery<T, E = Error>(
  queryKey: any[],
  queryFn: () => Promise<T>,
  options?: { enabled?: boolean; staleTime?: number }
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<E | null>(null);

  const enabled = options?.enabled !== false;

  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;
    const fetchData = async () => {
      setIsLoading(true);
      setIsError(false);
      try {
        const result = await queryFn();
        if (isMounted) {
          setData(result);
        }
      } catch (err) {
        if (isMounted) {
          setIsError(true);
          setError(err as E);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [enabled, JSON.stringify(queryKey)]);

  return { data, isLoading, isError, error };
}

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
      const response = await fetch(buildApiUrl(`/analytics/bot-performance/${botId}`));
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
    { enabled: !!botId }
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
                  {data.sentimentDistribution.map((entry: SentimentData, index: number) => (
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
                {data.knowledgeGaps.slice(0, 5).map((gap: KnowledgeGapData, index: number) => (
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