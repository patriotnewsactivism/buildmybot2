import { db } from '../db';
import { eq, and, desc } from 'drizzle-orm';
import { bots, deploymentLogs, NewDeploymentLog, DeploymentLog } from '../../shared/schema';
import { logger } from '../utils/logger';
import { errorRecoveryService, FailurePattern } from './ErrorRecoveryService';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { Server } from 'http';

export type DeploymentChannel = 'web' | 'mobile' | 'api' | 'voice';
export type DeploymentStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'rolled_back';

interface DeploymentState {
  botId: string;
  channels: Record<DeploymentChannel, DeploymentStatus>;
  overallStatus: DeploymentStatus;
  startedAt: Date;
  updatedAt: Date;
  logs: DeploymentLogEntry[];
}

interface DeploymentLogEntry {
  timestamp: Date;
  channel: DeploymentChannel;
  message: string;
  level: 'info' | 'warn' | 'error';
  metadata?: Record<string, any>;
}

interface WebSocketClient {
  ws: WebSocket;
  botId: string;
  organizationId: string;
}

class DeploymentService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocketClient[]> = new Map();
  private activeDeployments: Map<string, DeploymentState> = new Map();
  private static instance: DeploymentService;

  private constructor() {}

  static getInstance(): DeploymentService {
    if (!DeploymentService.instance) {
      DeploymentService.instance = new DeploymentService();
    }
    return DeploymentService.instance;
  }

  /**
   * Initialize WebSocket server for real-time deployment updates
   */
  initializeWebSocket(server: Server): void {
    if (this.wss) {
      logger.warn('WebSocket server already initialized');
      return;
    }

    this.wss = new WebSocketServer({ server, path: '/ws/deployments' });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const url = new URL(req.url || '', 'http://localhost');
      const botId = url.searchParams.get('botId');
      const organizationId = url.searchParams.get('organizationId');

      if (!botId || !organizationId) {
        ws.close(4000, 'Missing botId or organizationId');
        return;
      }

      const clientKey = `${organizationId}:${botId}`;
      const client: WebSocketClient = { ws, botId, organizationId };

      if (!this.clients.has(clientKey)) {
        this.clients.set(clientKey, []);
      }
      this.clients.get(clientKey)!.push(client);

      logger.info(`WebSocket client connected for bot ${botId} in organization ${organizationId}`);

      // Send current deployment state if exists
      const currentState = this.activeDeployments.get(botId);
      if (currentState) {
        this.sendToClient(ws, {
          type: 'deployment_state',
          data: currentState
        });
      }

      ws.on('close', () => {
        const clients = this.clients.get(clientKey);
        if (clients) {
          const index = clients.indexOf(client);
          if (index > -1) {
            clients.splice(index, 1);
          }
          if (clients.length === 0) {
            this.clients.delete(clientKey);
          }
        }
        logger.info(`WebSocket client disconnected for bot ${botId}`);
      });

      ws.on('error', (error) => {
        logger.error(`WebSocket error for bot ${botId}:`, error);
      });
    });

    logger.info('WebSocket server initialized for deployment updates');
  }

  /**
   * Send message to a specific WebSocket client
   */
  private sendToClient(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error('Error sending WebSocket message:', error);
      }
    }
  }

  /**
   * Broadcast deployment update to all connected clients for a specific bot
   */
  private broadcastDeploymentUpdate(botId: string, organizationId: string, update: any): void {
    const clientKey = `${organizationId}:${botId}`;
    const clients = this.clients.get(clientKey);
    
    if (clients) {
      const message = {
        type: 'deployment_update',
        data: update
      };
      
      clients.forEach(client => {
        this.sendToClient(client.ws, message);
      });
    }
  }

  /**
   * Trigger deployment for a bot across all channels
   */
  async deployBot(botId: string, userId: string, organizationId: string): Promise<DeploymentState> {
    logger.info(`Starting deployment for bot ${botId} in organization ${organizationId}`);

    const deploymentState: DeploymentState = {
      botId,
      channels: {
        web: 'pending',
        mobile: 'pending',
        api: 'pending',
        voice: 'pending'
      },
      overallStatus: 'in_progress',
      startedAt: new Date(),
      updatedAt: new Date(),
      logs: []
    };

    this.activeDeployments.set(botId, deploymentState);

    // Broadcast initial state
    this.broadcastDeploymentUpdate(botId, organizationId, deploymentState);

    // Deploy each channel in parallel
    const channelDeployments = Object.keys(deploymentState.channels).map(channel =>
      this.deployChannel(botId, organizationId, channel as DeploymentChannel, deploymentState)
    );

    try {
      await Promise.all(channelDeployments);
      
      // Check overall status
      const allSuccess = Object.values(deploymentState.channels).every(status => status === 'success');
      deploymentState.overallStatus = allSuccess ? 'success' : 'failed';
      deploymentState.updatedAt = new Date();

      // Store deployment history
      await this.storeDeploymentHistory(botId, organizationId, deploymentState);

      // Broadcast final state
      this.broadcastDeploymentUpdate(botId, organizationId, deploymentState);

      logger.info(`Deployment completed for bot ${botId} with status: ${deploymentState.overallStatus}`);
    } catch (error: any) {
      deploymentState.overallStatus = 'failed';
      deploymentState.updatedAt = new Date();
      deploymentState.logs.push({
        timestamp: new Date(),
        channel: 'api',
        message: `Deployment failed: ${error.message}`,
        level: 'error'
      });

      await this.storeDeploymentHistory(botId, organizationId, deploymentState);
      this.broadcastDeploymentUpdate(botId, organizationId, deploymentState);

      logger.error(`Deployment failed for bot ${botId}:`, error);
      throw error;
    }

    return deploymentState;
  }

  /**
   * Deploy a specific channel for a bot
   */
  private async deployChannel(
    botId: string,
    organizationId: string,
    channel: DeploymentChannel,
    deploymentState: DeploymentState
  ): Promise<void> {
    deploymentState.channels[channel] = 'in_progress';
    deploymentState.logs.push({
      timestamp: new Date(),
      channel,
      message: `Starting deployment for ${channel} channel`,
      level: 'info'
    });

    this.broadcastDeploymentUpdate(botId, organizationId, deploymentState);

    try {
      // Simulate deployment process with realistic delays
      await this.simulateChannelDeployment(channel);

      deploymentState.channels[channel] = 'success';
      deploymentState.logs.push({
        timestamp: new Date(),
        channel,
        message: `${channel} channel deployed successfully`,
        level: 'info'
      });

      this.broadcastDeploymentUpdate(botId, organizationId, deploymentState);
    } catch (error: any) {
      deploymentState.channels[channel] = 'failed';
      deploymentState.logs.push({
        timestamp: new Date(),
        channel,
        message: `${channel} channel deployment failed: ${error.message}`,
        level: 'error'
      });

      // Attempt auto-diagnosis using ErrorRecoveryService
      await this.autoDiagnoseFailure(botId, organizationId, channel, error.message);

      this.broadcastDeploymentUpdate(botId, organizationId, deploymentState);
      throw error;
    }
  }

  /**
   * Simulate channel deployment (replace with actual deployment logic)
   */
  private async simulateChannelDeployment(channel: DeploymentChannel): Promise<void> {
    const delays: Record<DeploymentChannel, number> = {
      web: 2000,
      mobile: 3000,
      api: 1500,
      voice: 4000
    };

    await new Promise(resolve => setTimeout(resolve, delays[channel]));

    // Simulate random failure for testing (10% chance)
    if (Math.random() < 0.1) {
      throw new Error(`Simulated ${channel} deployment failure`);
    }
  }

  /**
   * Auto-diagnose deployment failures using ErrorRecoveryService
   */
  private async autoDiagnoseFailure(
    botId: string,
    organizationId: string,
    channel: DeploymentChannel,
    errorMessage: string
  ): Promise<void> {
    try {
      const failurePattern = this.mapChannelToFailurePattern(channel);
      
      await errorRecoveryService.logRepairEvent({
        bot_id: botId,
        organization_id: organizationId,
        description: `Deployment failure on ${channel} channel: ${errorMessage}`,
        issue_type: failurePattern,
        metadata: {
          channel,
          errorMessage,
          deploymentTimestamp: new Date().toISOString()
        }
      });

      logger.info(`Auto-diagnosis logged for bot ${botId} on ${channel} channel`);
    } catch (error) {
      logger.error(`Failed to auto-diagnose deployment failure for bot ${botId}:`, error);
    }
  }

  /**
   * Map deployment channel to failure pattern
   */
  private mapChannelToFailurePattern(channel: DeploymentChannel): FailurePattern {
    const channelPatternMap: Record<DeploymentChannel, FailurePattern> = {
      web: 'BOT_CONFIG_INVALID',
      mobile: 'BOT_CONFIG_INVALID',
      api: 'API_KEY_INVALID',
      voice: 'VOICE_AGENT_OFFLINE'
    };

    return channelPatternMap[channel];
  }

  /**
   * Store deployment history in database
   */
  private async storeDeploymentHistory(
    botId: string,
    organizationId: string,
    deploymentState: DeploymentState
  ): Promise<void> {
    try {
      const deploymentLog: NewDeploymentLog = {
        id: `deploy_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        bot_id: botId,
        organization_id: organizationId,
        status: deploymentState.overallStatus,
        channels_status: deploymentState.channels,
        logs: deploymentState.logs,
        started_at: deploymentState.startedAt,
        completed_at: new Date(),
        created_at: new Date()
      };

      await db.insert(deploymentLogs).values(deploymentLog);
      logger.info(`Deployment history stored for bot ${botId}`);
    } catch (error) {
      logger.error(`Failed to store deployment history for bot ${botId}:`, error);
    }
  }

  /**
   * Get deployment status for a bot
   */
  async getDeploymentStatus(botId: string, organizationId: string): Promise<DeploymentState | null> {
    // Check active deployment first
    const activeDeployment = this.activeDeployments.get(botId);
    if (activeDeployment) {
      return activeDeployment;
    }

    // Fall back to database
    try {
      const [latestDeployment] = await db.select()
        .from(deploymentLogs)
        .where(and(
          eq(deploymentLogs.bot_id, botId),
          eq(deploymentLogs.organization_id, organizationId)
        ))
        .orderBy(desc(deploymentLogs.created_at))
        .limit(1);

      if (latestDeployment) {
        return {
          botId: latestDeployment.bot_id,
          channels: latestDeployment.channels_status as Record<DeploymentChannel, DeploymentStatus>,
          overallStatus: latestDeployment.status as DeploymentStatus,
          startedAt: latestDeployment.started_at,
          updatedAt: latestDeployment.completed_at || latestDeployment.created_at,
          logs: latestDeployment.logs as DeploymentLogEntry[]
        };
      }

      return null;
    } catch (error) {
      logger.error(`Failed to get deployment status for bot ${botId}:`, error);
      return null;
    }
  }

  /**
   * Get deployment history for a bot
   */
  async getDeploymentHistory(botId: string, organizationId: string): Promise<DeploymentLog[]> {
    try {
      return await db.select()
        .from(deploymentLogs)
        .where(and(
          eq(deploymentLogs.bot_id, botId),
          eq(deploymentLogs.organization_id, organizationId)
        ))
        .orderBy(desc(deploymentLogs.created_at))
        .limit(50);
    } catch (error) {
      logger.error(`Failed to get deployment history for bot ${botId}:`, error);
      return [];
    }
  }

  /**
   * Rollback a deployment
   */
  async rollbackDeployment(botId: string, organizationId: string): Promise<boolean> {
    try {
      const currentState = this.activeDeployments.get(botId);
      if (currentState) {
        currentState.overallStatus = 'rolled_back';
        currentState.updatedAt = new Date();
        currentState.logs.push({
          timestamp: new Date(),
          channel: 'api',
          message: 'Deployment rolled back',
          level: 'info'
        });

        this.broadcastDeploymentUpdate(botId, organizationId, currentState);
        await this.storeDeploymentHistory(botId, organizationId, currentState);
        this.activeDeployments.delete(botId);

        logger.info(`Deployment rolled back for bot ${botId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Failed to rollback deployment for bot ${botId}:`, error);
      return false;
    }
  }

  /**
   * Get all active deployments
   */
  getActiveDeployments(): Map<string, DeploymentState> {
    return this.activeDeployments;
  }

  /**
   * Clean up stale deployments (older than 30 minutes)
   */
  cleanupStaleDeployments(): void {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    for (const [botId, state] of this.activeDeployments.entries()) {
      if (state.startedAt < thirtyMinutesAgo) {
        this.activeDeployments.delete(botId);
        logger.info(`Cleaned up stale deployment for bot ${botId}`);
      }
    }
  }
}

// Export singleton instance
export const deploymentService = DeploymentService.getInstance();

// Run cleanup every 5 minutes
setInterval(() => {
  deploymentService.cleanupStaleDeployments();
}, 5 * 60 * 1000);