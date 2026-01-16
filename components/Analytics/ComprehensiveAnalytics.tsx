import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  Calendar,
  Clock,
  Download,
  Filter,
  Globe,
  MessageSquare,
  MousePointer,
  PieChart,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface AnalyticsData {
  metrics: {
    totalConversations: number;
    uniqueVisitors: number;
    leadsGenerated: number;
    conversionRate: number;
    conversationGrowth: number;
    visitorGrowth: number;
    leadGrowth: number;
    conversionGrowth: number;
  };
  timeSeriesData: any[];
  leadsBySource: any[];
  sentimentData: any[];
  sessionDurationData: any[];
  topIntents: any[];
  peakHoursData: any[];
}

const StatCard: React.FC<{
  title: string;
  value: string;
  change: number;
  icon: React.ElementType;
  color: string;
  loading?: boolean;
}> = ({ title, value, change, icon: Icon, color, loading }) => {
  const isPositive = change >= 0;

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm animate-pulse">
        <div className="flex justify-between items-start mb-4">
          <div className="w-10 h-10 bg-slate-200 rounded-lg" />
          <div className="w-16 h-6 bg-slate-200 rounded-full" />
        </div>
        <div className="w-24 h-8 bg-slate-200 rounded mb-2" />
        <div className="w-32 h-4 bg-slate-200 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-300 relative overflow-hidden group">
      <div
        className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${color} opacity-[0.03] rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110`}
      />
      
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className={`p-3 rounded-lg bg-gradient-to-br ${color} text-white shadow-lg shadow-${color.split(' ')[1]}/30`}>
          <Icon size={20} />
        </div>
        <div
          className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-medium ${
            isPositive
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-rose-50 text-rose-700 border border-rose-100'
          }`}
        >
          {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          <span>{Math.abs(change)}%</span>
        </div>
      </div>
      
      <div className="relative z-10">
        <h3 className="text-3xl font-bold text-slate-900 mb-1 tracking-tight">{value}</h3>
        <p className="text-sm text-slate-500 font-medium">{title}</p>
      </div>
    </div>
  );
};

export const ComprehensiveAnalytics: React.FC = () => {
  const [dateRange, setDateRange] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90;
      const response = await fetch(`/api/admin/analytics/dashboard?days=${days}`);
      if (!response.ok) throw new Error('Failed to fetch analytics');
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error('Analytics fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span className="text-2xl">📊</span> Performance Overview
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Real-time insights across your entire ecosystem
          </p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex bg-slate-100 p-1 rounded-lg w-full md:w-auto">
            {['7d', '30d', '90d'].map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex-1 md:flex-none ${
                  dateRange === range
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {range === '30d' ? '30 Days' : range === '7d' ? '7 Days' : '3 Months'}
              </button>
            ))}
          </div>
          
          <button 
            onClick={fetchData}
            className="p-2 text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          
          <button className="p-2 text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors">
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard
          title="Total Conversations"
          value={data?.metrics.totalConversations.toLocaleString() || '0'}
          change={data?.metrics.conversationGrowth || 0}
          icon={MessageSquare}
          color="from-blue-500 to-indigo-600"
          loading={loading}
        />
        <StatCard
          title="Leads Generated"
          value={data?.metrics.leadsGenerated.toLocaleString() || '0'}
          change={data?.metrics.leadGrowth || 0}
          icon={Target}
          color="from-emerald-500 to-teal-600"
          loading={loading}
        />
        <StatCard
          title="Unique Visitors"
          value={data?.metrics.uniqueVisitors.toLocaleString() || '0'}
          change={data?.metrics.visitorGrowth || 0}
          icon={Users}
          color="from-violet-500 to-purple-600"
          loading={loading}
        />
        <StatCard
          title="Conversion Rate"
          value={`${data?.metrics.conversionRate}%`}
          change={data?.metrics.conversionGrowth || 0}
          icon={Zap}
          color="from-amber-500 to-orange-600"
          loading={loading}
        />
      </div>

      {/* Main Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Traffic & Conversion Trend */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp size={20} className="text-blue-500" />
                Growth Trends
              </h3>
              <p className="text-sm text-slate-500">Conversations vs Leads over time</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-blue-500" /> Conversations
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500" /> Leads
              </span>
            </div>
          </div>
          
          <div className="h-80 w-full">
            {loading ? (
              <div className="w-full h-full bg-slate-50 rounded-lg animate-pulse flex items-center justify-center">
                <BarChart2 className="text-slate-300 w-12 h-12" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.timeSeriesData || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: '#64748B' }} 
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: '#64748B' }} 
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="conversations" 
                    stroke="#3B82F6" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorConv)" 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="leads" 
                    stroke="#10B981" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorLeads)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Lead Sources Donut */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <PieChart size={20} className="text-violet-500" />
              Lead Sources
            </h3>
            <p className="text-sm text-slate-500">Top performing channels</p>
          </div>

          <div className="flex-1 min-h-[250px] relative">
            {loading ? (
              <div className="w-full h-full bg-slate-50 rounded-lg animate-pulse flex items-center justify-center">
                <PieChart className="text-slate-300 w-12 h-12" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={data?.leadsBySource || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="leads"
                    nameKey="source"
                  >
                    {(data?.leadsBySource || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </RechartsPieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Secondary Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Peak Hours Heatmap-ish */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Clock size={20} className="text-amber-500" />
            Activity Heatmap
          </h3>
          <div className="h-64">
            {loading ? (
              <div className="w-full h-full bg-slate-50 rounded-lg animate-pulse" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.peakHoursData.filter((_, i) => i % 7 === 0) || []}> {/* Simplified for demo */}
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Sentiment Analysis */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Activity size={20} className="text-rose-500" />
            Sentiment Analysis
          </h3>
          <div className="space-y-4">
             {(data?.sentimentData || []).map((item, index) => (
               <div key={index} className="space-y-2">
                 <div className="flex justify-between text-sm font-medium">
                   <span className="text-slate-700">{item.name}</span>
                   <span className="text-slate-900">{item.value}%</span>
                 </div>
                 <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                   <div 
                     className="h-full rounded-full transition-all duration-500 ease-out"
                     style={{ width: `${item.value}%`, backgroundColor: item.color }}
                   />
                 </div>
               </div>
             ))}
             {(!data?.sentimentData || data.sentimentData.length === 0) && !loading && (
               <div className="text-center py-8 text-slate-400">No sentiment data available</div>
             )}
          </div>
        </div>

        {/* Top Intents */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Target size={20} className="text-indigo-500" />
            Top User Intents
          </h3>
          <div className="space-y-3">
            {(data?.topIntents || []).slice(0, 5).map((intent, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </div>
                  <span className="font-medium text-slate-700">{intent.intent}</span>
                </div>
                <div className="flex items-center gap-2">
                   <span className="text-sm font-bold text-slate-900">{intent.percentage}%</span>
                   {intent.trend === 'up' && <ArrowUpRight size={14} className="text-emerald-500" />}
                   {intent.trend === 'down' && <ArrowDownRight size={14} className="text-rose-500" />}
                </div>
              </div>
            ))}
             {(!data?.topIntents || data.topIntents.length === 0) && !loading && (
               <div className="text-center py-8 text-slate-400">No intent data available</div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};
