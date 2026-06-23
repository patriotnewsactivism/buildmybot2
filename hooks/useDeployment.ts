import { useState, useEffect, useCallback, useRef } from 'react';
import { ErrorRecoveryService } from '../server/services/ErrorRecoveryService';

// TypeScript interfaces for deployment system
export type ChannelType = 'web' | 'mobile' | 'api' | 'voice';
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
export type DeploymentStatus = 'idle' | 'deploying' | 'success' | 'failed' | 'rolled_back';

export interface DeploymentLog {
  id: string;
  channel: ChannelType;
  message: string;
  level: 'info' | 'warn' | 'error';
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface ChannelDeploymentState {
  channel: ChannelType;
  status: DeploymentStatus;
  progress: number; // 0-100
  logs: DeploymentLog[];
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DeploymentState {
  botId: string;
  channels: Record<ChannelType, ChannelDeploymentState>;
  overallStatus: DeploymentStatus;
  lastDeployedAt?: string;
  version?: string;
}

export interface WebSocketMessage {
  type: 'deployment_update' | 'deployment_log' | 'deployment_complete' | 'deployment_error' | 'connection_status';
  botId: string;
  channel?: ChannelType;
  status?: DeploymentStatus;
  progress?: number;
  message?: string;
  level?: 'info' | 'warn' | 'error';
  log?: DeploymentLog;
  error?: string;
  timestamp?: string;
}

export interface UseDeploymentOptions {
  botId: string;
  wsUrl?: string;
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

const DEFAULT_OPTIONS: Required<Omit<UseDeploymentOptions, 'botId'>> = {
  wsUrl: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/deployments`,
  autoConnect: true,
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
};

// Error pattern mapping for auto-diagnosis
const ERROR_PATTERNS: Record<string, { message: string; severity: 'critical' | 'warning' | 'info'; suggestion: string }> = {
  'ECONNREFUSED': {
    message: 'Connection refused by deployment server',
    severity: 'critical',
    suggestion: 'Ensure the deployment server is running and accessible. Check firewall settings and port availability.'
  },
  'ETIMEDOUT': {
    message: 'Deployment request timed out',
    severity: 'warning',
    suggestion: 'The deployment process is taking longer than expected. Check network connectivity and server load.'
  },
  'AUTH_FAILED': {
    message: 'Authentication failed for deployment',
    severity: 'critical',
    suggestion: 'Verify your API keys and authentication tokens. Re-authenticate if necessary.'
  },
  'BOT_NOT_FOUND': {
    message: 'Bot configuration not found',
    severity: 'critical',
    suggestion: 'The bot may have been deleted or the ID is invalid. Check the bot exists in your account.'
  },
  'VALIDATION_ERROR': {
    message: 'Bot configuration validation failed',
    severity: 'warning',
    suggestion: 'Review your bot configuration for missing or invalid fields. Use the ConfigValidator to check.'
  },
  'RATE_LIMIT': {
    message: 'Rate limit exceeded',
    severity: 'warning',
    suggestion: 'Too many deployment requests. Wait a few minutes before trying again.'
  },
  'INTERNAL_ERROR': {
    message: 'Internal server error during deployment',
    severity: 'critical',
    suggestion: 'A server-side error occurred. Contact support if the issue persists.'
  },
  'TIMEOUT': {
    message: 'Deployment process timed out',
    severity: 'warning',
    suggestion: 'The deployment took too long to complete. Check your bot configuration size and complexity.'
  },
  'NETWORK_ERROR': {
    message: 'Network error during deployment',
    severity: 'warning',
    suggestion: 'Check your internet connection and try again.'
  },
  'UNKNOWN': {
    message: 'An unknown error occurred',
    severity: 'warning',
    suggestion: 'An unexpected error occurred. Please try again or contact support.'
  }
};

function getInitialChannelState(channel: ChannelType): ChannelDeploymentState {
  return {
    channel,
    status: 'idle',
    progress: 0,
    logs: [],
  };
}

function getInitialState(botId: string): DeploymentState {
  return {
    botId,
    channels: {
      web: getInitialChannelState('web'),
      mobile: getInitialChannelState('mobile'),
      api: getInitialChannelState('api'),
      voice: getInitialChannelState('voice'),
    },
    overallStatus: 'idle',
  };
}

export function useDeployment(options: UseDeploymentOptions) {
  const {
    botId,
    wsUrl,
    autoConnect,
    reconnectInterval,
    maxReconnectAttempts,
  } = { ...DEFAULT_OPTIONS, ...options };

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [deploymentState, setDeploymentState] = useState<DeploymentState>(() => getInitialState(botId));
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const errorRecoveryRef = useRef(new ErrorRecoveryService());

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    
    cleanup();
    setConnectionStatus('connecting');
    setError(null);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
        
        // Subscribe to deployment updates for this bot
        ws.send(JSON.stringify({
          type: 'subscribe',
          botId,
        }));
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;
        
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (parseError) {
          console.error('Failed to parse WebSocket message:', parseError);
        }
      };

      ws.onclose = (event: CloseEvent) => {
        if (!mountedRef.current) return;
        
        setConnectionStatus('disconnected');
        
        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else {
          setError('Maximum reconnection attempts reached. Please refresh the page.');
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setConnectionStatus('error');
        setError('WebSocket connection error');
      };
    } catch (err) {
      if (!mountedRef.current) return;
      setConnectionStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to create WebSocket connection');
    }
  }, [botId, wsUrl, reconnectInterval, maxReconnectAttempts, cleanup]);

  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    setDeploymentState(prev => {
      const newState = { ...prev };
      
      switch (message.type) {
        case 'deployment_update':
          if (message.channel && message.status !== undefined) {
            const channelState = { ...newState.channels[message.channel] };
            channelState.status = message.status;
            if (message.progress !== undefined) {
              channelState.progress = message.progress;
            }
            if (message.timestamp && !channelState.startedAt) {
              channelState.startedAt = message.timestamp;
            }
            newState.channels[message.channel] = channelState;
            
            // Update overall status
            newState.overallStatus = calculateOverallStatus(newState.channels);
          }
          break;
          
        case 'deployment_log':
          if (message.channel && message.log) {
            const channelState = { ...newState.channels[message.channel] };
            channelState.logs = [...channelState.logs, message.log];
            newState.channels[message.channel] = channelState;
          }
          break;
          
        case 'deployment_complete':
          if (message.channel) {
            const channelState = { ...newState.channels[message.channel] };
            channelState.status = 'success';
            channelState.progress = 100;
            channelState.completedAt = message.timestamp || new Date().toISOString();
            newState.channels[message.channel] = channelState;
            newState.lastDeployedAt = message.timestamp || new Date().toISOString();
            newState.version = message.timestamp;
            
            // Update overall status
            newState.overallStatus = calculateOverallStatus(newState.channels);
          }
          break;
          
        case 'deployment_error':
          if (message.channel) {
            const channelState = { ...newState.channels[message.channel] };
            channelState.status = 'failed';
            channelState.error = message.error;
            channelState.completedAt = message.timestamp || new Date().toISOString();
            
            // Add error log
            const errorLog: DeploymentLog = {
              id: `error-${Date.now()}`,
              channel: message.channel,
              message: message.error || 'Deployment failed',
              level: 'error',
              timestamp: message.timestamp || new Date().toISOString(),
              details: { errorCode: message.error },
            };
            channelState.logs = [...channelState.logs, errorLog];
            
            newState.channels[message.channel] = channelState;
            
            // Update overall status
            newState.overallStatus = calculateOverallStatus(newState.channels);
          }
          break;
      }
      
      return newState;
    });
  }, []);

  const calculateOverallStatus = (channels: Record<ChannelType, ChannelDeploymentState>): DeploymentStatus => {
    const statuses = Object.values(channels).map(c => c.status);
    
    if (statuses.some(s => s === 'deploying')) return 'deploying';
    if (statuses.some(s => s === 'failed')) return 'failed';
    if (statuses.every(s => s === 'success' || s === 'idle')) {
      if (statuses.some(s => s === 'success')) return 'success';
      return 'idle';
    }
    return 'idle';
  };

  const diagnoseError = useCallback((errorMessage: string): { message: string; severity: string; suggestion: string } => {
    // Try to match known error patterns
    for (const [pattern, diagnosis] of Object.entries(ERROR_PATTERNS)) {
      if (errorMessage.includes(pattern) || errorMessage.toLowerCase().includes(pattern.toLowerCase())) {
        return diagnosis;
      }
    }
    
    // Try using ErrorRecoveryService for advanced diagnosis
    try {
      const recoveryResult = errorRecoveryRef.current.analyzeError(errorMessage);
      if (recoveryResult && recoveryResult.suggestion) {
        return {
          message: recoveryResult.message || 'Error detected',
          severity: recoveryResult.severity || 'warning',
          suggestion: recoveryResult.suggestion,
        };
      }
    } catch {
      // Fallback to default diagnosis
    }
    
    return ERROR_PATTERNS['UNKNOWN'];
  }, []);

  const deployChannel = useCallback(async (channel: ChannelType) => {
    if (!botId) {
      setError('No bot ID provided');
      return;
    }

    setDeploymentState(prev => {
      const newState = { ...prev };
      const channelState = { ...newState.channels[channel] };
      channelState.status = 'deploying';
      channelState.progress = 0;
      channelState.logs = [];
      channelState.error = undefined;
      channelState.startedAt = new Date().toISOString();
      newState.channels[channel] = channelState;
      newState.overallStatus = 'deploying';
      return newState;
    });

    try {
      const response = await fetch(`/api/bots/${botId}/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Deployment failed with status ${response.status}`);
      }

      const result = await response.json();
      
      // Add initial log
      setDeploymentState(prev => {
        const newState = { ...prev };
        const channelState = { ...newState.channels[channel] };
        channelState.logs = [{
          id: `init-${Date.now()}`,
          channel,
          message: `Deployment initiated for ${channel} channel`,
          level: 'info',
          timestamp: new Date().toISOString(),
        }];
        newState.channels[channel] = channelState;
        return newState;
      });

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown deployment error';
      const diagnosis = diagnoseError(errorMessage);
      
      setDeploymentState(prev => {
        const newState = { ...prev };
        const channelState = { ...newState.channels[channel] };
        channelState.status = 'failed';
        channelState.error = errorMessage;
        channelState.logs = [{
          id: `error-${Date.now()}`,
          channel,
          message: `${diagnosis.message}: ${errorMessage}`,
          level: 'error',
          timestamp: new Date().toISOString(),
          details: { diagnosis, errorCode: errorMessage },
        }];
        newState.channels[channel] = channelState;
        newState.overallStatus = 'failed';
        return newState;
      });
      
      setError(errorMessage);
      throw err;
    }
  }, [botId, diagnoseError]);

  const deployAll = useCallback(async () => {
    const channels: ChannelType[] = ['web', 'mobile', 'api', 'voice'];
    const results = await Promise.allSettled(channels.map(channel => deployChannel(channel)));
    
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      console.warn(`${failed.length} channel(s) failed to deploy`);
    }
    
    return results;
  }, [deployChannel]);

  const rollbackChannel = useCallback(async (channel: ChannelType) => {
    if (!botId) return;

    try {
      const response = await fetch(`/api/bots/${botId}/rollback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel }),
      });

      if (!response.ok) {
        throw new Error(`Rollback failed with status ${response.status}`);
      }

      setDeploymentState(prev => {
        const newState = { ...prev };
        const channelState = { ...newState.channels[channel] };
        channelState.status = 'rolled_back';
        channelState.logs = [...channelState.logs, {
          id: `rollback-${Date.now()}`,
          channel,
          message: `Rolled back ${channel} channel deployment`,
          level: 'info',
          timestamp: new Date().toISOString(),
        }];
        newState.channels[channel] = channelState;
        newState.overallStatus = calculateOverallStatus(newState.channels);
        return newState;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
    }
  }, [botId]);

  const getChannelLogs = useCallback((channel: ChannelType): DeploymentLog[] => {
    return deploymentState.channels[channel]?.logs || [];
  }, [deploymentState]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const resetDeployment = useCallback(() => {
    setDeploymentState(getInitialState(botId));
    setError(null);
  }, [botId]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [autoConnect, connect, cleanup]);

  return {
    // State
    connectionStatus,
    deploymentState,
    error,
    
    // Actions
    connect,
    disconnect: cleanup,
    deployChannel,
    deployAll,
    rollbackChannel,
    getChannelLogs,
    clearError,
    resetDeployment,
    diagnoseError,
    
    // Helpers
    isConnected: connectionStatus === 'connected',
    isDeploying: deploymentState.overallStatus === 'deploying',
    hasError: error !== null,
  };
}

export default useDeployment;