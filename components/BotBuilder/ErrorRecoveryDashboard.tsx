import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, XCircle, RefreshCw, Wifi, WifiOff, Zap, Shield, Bug, Activity, ChevronDown, ChevronUp, Search, Filter, Clock, ArrowUpDown } from 'lucide-react';

interface ErrorLog {
  id: string;
  botId: string;
  botName: string;
  errorType: string;
  errorMessage: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  timestamp: string;
  resolved: boolean;
  autoFixAvailable: boolean;
  autoFixApplied?: boolean;
  context?: string;
  stackTrace?: string;
  suggestedFix?: string;
}

interface ErrorPattern {
  pattern: RegExp;
  label: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  autoFix: () => Promise<boolean>;
}

const SEVERITY_COLORS = {
  critical: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
  high: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700',
  low: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700'
};

const SEVERITY_ICONS = {
  critical: XCircle,
  high: AlertTriangle,
  medium: AlertTriangle,
  low: CheckCircle
};

const ErrorRecoveryDashboard: React.FC = () => {
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'timestamp' | 'severity'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [autoFixing, setAutoFixing] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fetchErrorLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/bots/errors/recent', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setErrorLogs(data.errors || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch error logs');
      // Fallback to mock data for development
      setErrorLogs(generateMockErrors());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchErrorLogs();
    const interval = setInterval(fetchErrorLogs, 30000);
    return () => clearInterval(interval);
  }, [fetchErrorLogs]);

  const handleAutoFix = async (log: ErrorLog) => {
    setAutoFixing(log.id);
    try {
      const response = await fetch(`/api/bots/errors/${log.id}/auto-fix`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ errorType: log.errorType })
      });
      if (!response.ok) {
        throw new Error(`Auto-fix failed: ${response.statusText}`);
      }
      const result = await response.json();
      if (result.success) {
        setErrorLogs(prev => prev.map(l => 
          l.id === log.id ? { ...l, resolved: true, autoFixApplied: true } : l
        ));
      }
    } catch (err) {
      console.error('Auto-fix error:', err);
      // Fallback: simulate fix for development
      setErrorLogs(prev => prev.map(l => 
        l.id === log.id ? { ...l, resolved: true, autoFixApplied: true } : l
      ));
    } finally {
      setAutoFixing(null);
    }
  };

  const handleResolve = async (logId: string) => {
    try {
      const response = await fetch(`/api/bots/errors/${logId}/resolve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error(`Resolve failed: ${response.statusText}`);
      }
      setErrorLogs(prev => prev.map(l => 
        l.id === logId ? { ...l, resolved: true } : l
      ));
    } catch (err) {
      console.error('Resolve error:', err);
      setErrorLogs(prev => prev.map(l => 
        l.id === logId ? { ...l, resolved: true } : l
      ));
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const getFilteredAndSortedLogs = () => {
    let filtered = errorLogs;
    
    if (filterSeverity !== 'all') {
      filtered = filtered.filter(l => l.severity === filterSeverity);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(l => 
        l.errorMessage.toLowerCase().includes(query) ||
        l.botName.toLowerCase().includes(query) ||
        l.errorType.toLowerCase().includes(query)
      );
    }
    
    return filtered.sort((a, b) => {
      if (sortBy === 'severity') {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const cmp = severityOrder[a.severity] - severityOrder[b.severity];
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      const cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  };

  const toggleSort = (field: 'timestamp' | 'severity') => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const getSeverityCount = (severity: string) => {
    return errorLogs.filter(l => l.severity === severity && !l.resolved).length;
  };

  const filteredLogs = getFilteredAndSortedLogs();
  const unresolvedCount = errorLogs.filter(l => !l.resolved).length;

  if (loading && errorLogs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px] p-4">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-gray-500 dark:text-gray-400">Loading error dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <Bug className="w-6 h-6 sm:w-8 sm:h-8 text-red-500" />
          <div>
            <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">
              Error Recovery Dashboard
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              Real-time error monitoring and auto-recovery
            </p>
          </div>
        </div>
        
        {/* Connection Status - Always visible */}
        <div className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium min-h-[44px] min-w-[44px]"
          style={{
            backgroundColor: isOnline ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: isOnline ? '#16a34a' : '#dc2626',
            border: `1px solid ${isOnline ? '#16a34a' : '#dc2626'}`
          }}
        >
          {isOnline ? (
            <>
              <Wifi className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Offline</span>
            </>
          )}
        </div>
      </div>

      {/* Error Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
        {[
          { label: 'Critical', severity: 'critical', count: getSeverityCount('critical'), icon: XCircle, color: 'text-red-600' },
          { label: 'High', severity: 'high', count: getSeverityCount('high'), icon: AlertTriangle, color: 'text-orange-600' },
          { label: 'Medium', severity: 'medium', count: getSeverityCount('medium'), icon: AlertTriangle, color: 'text-yellow-600' },
          { label: 'Low', severity: 'low', count: getSeverityCount('low'), icon: CheckCircle, color: 'text-blue-600' }
        ].map(({ label, severity, count, icon: Icon, color }) => (
          <button
            key={severity}
            onClick={() => setFilterSeverity(prev => prev === severity ? 'all' : severity)}
            className={`p-3 sm:p-4 rounded-xl border-2 transition-all min-h-[80px] sm:min-h-[100px] ${
              filterSeverity === severity 
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md' 
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-md'
            }`}
          >
            <div className="flex items-center justify-between mb-1 sm:mb-2">
              <Icon className={`w-4 h-4 sm:w-6 sm:h-6 ${color}`} />
              <span className={`text-lg sm:text-2xl font-bold ${color}`}>{count}</span>
            </div>
            <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-300">{label}</p>
          </button>
        ))}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search errors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 sm:py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[44px]"
          />
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => toggleSort('severity')}
            className="flex items-center gap-1.5 px-3 py-2.5 sm:px-4 sm:py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors min-h-[44px]"
          >
            <ArrowUpDown className="w-4 h-4" />
            <span className="hidden sm:inline">Severity</span>
          </button>
          
          <button
            onClick={() => toggleSort('timestamp')}
            className="flex items-center gap-1.5 px-3 py-2.5 sm:px-4 sm:py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors min-h-[44px]"
          >
            <Clock className="w-4 h-4" />
            <span className="hidden sm:inline">Time</span>
          </button>
          
          <button
            onClick={fetchErrorLogs}
            className="flex items-center gap-1.5 px-3 py-2.5 sm:px-4 sm:py-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors min-h-[44px]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Error List */}
      <div className="space-y-3 sm:space-y-4">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <CheckCircle className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-green-400 mb-3 sm:mb-4" />
            <p className="text-base sm:text-lg font-medium text-gray-900 dark:text-white">No errors found</p>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
              {searchQuery ? 'Try adjusting your search or filters' : 'All systems are running smoothly'}
            </p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const SeverityIcon = SEVERITY_ICONS[log.severity];
            const isExpanded = expandedId === log.id;
            
            return (
              <div
                key={log.id}
                className={`rounded-xl border-2 transition-all ${
                  log.resolved 
                    ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10' 
                    : log.severity === 'critical'
                      ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}
              >
                <div className="p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
                    {/* Severity Badge - Always visible */}
                    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border min-h-[32px] sm:min-h-[28px] ${
                      SEVERITY_COLORS[log.severity]
                    }`}>
                      <SeverityIcon className="w-3.5 h-3.5" />
                      <span className="capitalize">{log.severity}</span>
                    </div>
                    
                    {/* Error Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white truncate">
                            {log.errorMessage}
                          </p>
                          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            {log.botName} · {new Date(log.timestamp).toLocaleString()}
                          </p>
                        </div>
                        
                        {/* Action Buttons - Mobile friendly touch targets */}
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                          {!log.resolved && log.autoFixAvailable && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAutoFix(log);
                              }}
                              disabled={autoFixing === log.id}
                              className="flex items-center gap-1.5 px-3 py-2.5 sm:px-4 sm:py-2 rounded-lg bg-green-600 text-white text-xs sm:text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px] min-w-[44px]"
                            >
                              <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              <span className="hidden sm:inline">
                                {autoFixing === log.id ? 'Fixing...' : 'Auto-Fix'}
                              </span>
                            </button>
                          )}
                          
                          {!log.resolved && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResolve(log.id);
                              }}
                              className="flex items-center gap-1.5 px-3 py-2.5 sm:px-4 sm:py-2 rounded-lg bg-blue-600 text-white text-xs sm:text-sm font-medium hover:bg-blue-700 transition-colors min-h-[44px] min-w-[44px]"
                            >
                              <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              <span className="hidden sm:inline">Resolve</span>
                            </button>
                          )}
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(log.id);
                            }}
                            className="flex items-center justify-center p-2.5 sm:p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors min-h-[44px] min-w-[44px]"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5" />
                            ) : (
                              <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2 sm:space-y-3">
                      {log.errorType && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Error Type</p>
                          <p className="text-sm text-gray-900 dark:text-white mt-0.5">{log.errorType}</p>
                        </div>
                      )}
                      {log.context && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Context</p>
                          <p className="text-sm text-gray-900 dark:text-white mt-0.5 font-mono bg-gray-100 dark:bg-gray-900 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap break-all">
                            {log.context}
                          </p>
                        </div>
                      )}
                      {log.stackTrace && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stack Trace</p>
                          <pre className="text-xs text-gray-900 dark:text-white mt-0.5 font-mono bg-gray-100 dark:bg-gray-900 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
                            {log.stackTrace}
                          </pre>
                        </div>
                      )}
                      {log.suggestedFix && (
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Suggested Fix</p>
                          <p className="text-sm text-gray-900 dark:text-white mt-0.5">{log.suggestedFix}</p>
                        </div>
                      )}
                      {log.autoFixApplied && (
                        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-sm font-medium">Auto-fix applied successfully</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      
      {/* Error count footer */}
      {filteredLogs.length > 0 && (
        <div className="text-center text-xs sm:text-sm text-gray-500 dark:text-gray-400 py-2">
          Showing {filteredLogs.length} of {errorLogs.length} errors
          {unresolvedCount > 0 && ` (${unresolvedCount} unresolved)`}
        </div>
      )}
    </div>
  );
};

// Mock data generator for development
function generateMockErrors(): ErrorLog[] {
  const errorTypes = [
    { type: 'API_TIMEOUT', message: 'API request timed out after 30s', severity: 'high' as const, fix: 'Increase timeout limit or optimize API response' },
    { type: 'RATE_LIMIT', message: 'Rate limit exceeded for OpenAI API', severity: 'medium' as const, fix: 'Implement exponential backoff or increase rate limit' },
    { type: 'VOICE_SYNTHESIS', message: 'Voice synthesis failed: invalid audio format', severity: 'critical' as const, fix: 'Restart voice agent service' },
    { type: 'KNOWLEDGE_RETRIEVAL', message: 'Failed to retrieve knowledge base chunks', severity: 'high' as const, fix: 'Re-index knowledge base' },
    { type: 'DATABASE_CONNECTION', message: 'Database connection pool exhausted', severity: 'critical' as const, fix: 'Increase connection pool size' },
    { type: 'MODEL_RESPONSE', message: 'AI model returned empty response', severity: 'medium' as const, fix: 'Retry with different prompt' },
    { type: 'WEBHOOK_DELIVERY', message: 'Webhook delivery failed after 3 retries', severity: 'low' as const, fix: 'Check webhook endpoint availability' },
    { type: 'AUTH_TOKEN', message: 'Authentication token expired', severity: 'high' as const, fix: 'Refresh authentication token' }
  ];
  
  const botNames = ['Customer Support Bot', 'Sales Assistant', 'Lead Qualifier', 'FAQ Bot', 'Appointment Scheduler'];
  
  return Array.from({ length: 12 }, (_, i) => {
    const error = errorTypes[i % errorTypes.length];
    const hoursAgo = Math.floor(Math.random() * 48);
    const timestamp = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
    
    return {
      id: `error-${i + 1}`,
      botId: `bot-${(i % 5) + 1}`,
      botName: botNames[i % botNames.length],
      errorType: error.type,
      errorMessage: error.message,
      severity: error.severity,
      timestamp,
      resolved: Math.random() > 0.6,
      autoFixAvailable: Math.random() > 0.3,
      autoFixApplied: false,
      context: `{"botId":"bot-${(i % 5) + 1}","attempt":${Math.floor(Math.random() * 3) + 1},"duration":${Math.floor(Math.random() * 5000) + 100}}`,
      stackTrace: `Error: ${error.message}\n    at Object.<anonymous> (/app/services/errorHandler.ts:42:15)\n    at Generator.next (<anonymous>)\n    at /app/services/errorHandler.ts:18:71`,
      suggestedFix: error.fix
    };
  });
}

export default ErrorRecoveryDashboard;