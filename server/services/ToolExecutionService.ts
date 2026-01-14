/**
 * Tool Execution Service
 * Enables agents to "do things" not just "say things"
 * Handles function calling, webhooks, API integrations
 */

import { and, desc, eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import {
  actionExecutionLog,
  botTools,
  toolDefinitions,
  type InsertActionExecutionLog,
  type InsertToolDefinition,
} from '../../shared/schema-agentic-os';
import { db } from '../db';
import { encrypt, decrypt } from '../utils/encryption';

export interface ToolExecutionContext {
  botId: string;
  conversationId: string;
  userId?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTimeMs: number;
}

export class ToolExecutionService {
  /**
   * Create a new tool definition
   */
  async createTool(
    organizationId: string,
    toolData: {
      name: string;
      description: string;
      category?: 'webhook' | 'database' | 'email' | 'document';
      config: any; // { method: 'POST', url: '...', headers: {...} }
      functionSchema: any; // OpenAI function calling schema
      requiresApproval?: boolean;
      approvalThreshold?: any;
      authType?: 'none' | 'api_key' | 'oauth2' | 'bearer';
      credentials?: string; // Will be encrypted
    }
  ) {
    const id = uuid();

    // Encrypt credentials if provided
    let encryptedCredentials: string | undefined;
    if (toolData.credentials) {
      encryptedCredentials = encrypt(toolData.credentials);
    }

    const [tool] = await db
      .insert(toolDefinitions)
      .values({
        id,
        organizationId,
        name: toolData.name,
        description: toolData.description,
        category: toolData.category || 'webhook',
        config: toolData.config,
        functionSchema: toolData.functionSchema,
        requiresApproval: toolData.requiresApproval || false,
        approvalThreshold: toolData.approvalThreshold,
        authType: toolData.authType || 'none',
        encryptedCredentials,
      })
      .returning();

    return tool;
  }

  /**
   * Assign tool to a bot
   */
  async assignToolToBot(botId: string, toolId: string, customConfig?: any) {
    const id = uuid();

    const [assignment] = await db
      .insert(botTools)
      .values({
        id,
        botId,
        toolId,
        customConfig,
      })
      .returning();

    return assignment;
  }

  /**
   * Get all tools available to a bot
   * Returns as OpenAI function calling schema
   */
  async getAvailableTools(botId: string) {
    const assignments = await db
      .select({
        tool: toolDefinitions,
        assignment: botTools,
      })
      .from(botTools)
      .innerJoin(toolDefinitions, eq(botTools.toolId, toolDefinitions.id))
      .where(
        and(
          eq(botTools.botId, botId),
          eq(botTools.enabled, true),
          eq(toolDefinitions.active, true)
        )
      );

    // Format for OpenAI function calling
    return assignments.map((a) => ({
      type: 'function',
      function: {
        name: a.tool.name,
        description: a.tool.description,
        parameters: a.tool.functionSchema,
      },
      _toolId: a.tool.id, // Internal tracking
      _requiresApproval: a.tool.requiresApproval,
    }));
  }

  /**
   * Execute a tool
   * Main entry point for AI-triggered actions
   */
  async executeTool(
    toolId: string,
    parameters: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    // Get tool definition
    const [tool] = await db
      .select()
      .from(toolDefinitions)
      .where(eq(toolDefinitions.id, toolId))
      .limit(1);

    if (!tool) {
      throw new Error(`Tool ${toolId} not found`);
    }

    // Create execution log entry
    const logId = uuid();
    await db.insert(actionExecutionLog).values({
      id: logId,
      botId: context.botId,
      conversationId: context.conversationId,
      toolId,
      status: 'pending',
      inputParameters: parameters,
      requiresApproval: tool.requiresApproval,
    });

    try {
      // Check if requires approval
      if (tool.requiresApproval) {
        // Check approval threshold
        const needsApproval = this.checkApprovalThreshold(
          parameters,
          tool.approvalThreshold
        );

        if (needsApproval) {
          // Mark as pending approval
          await this.updateExecutionStatus(logId, 'pending', {
            message: 'Awaiting human approval',
          });

          // TODO: Send notification to human supervisor
          return {
            success: false,
            error: 'Requires human approval',
            executionTimeMs: Date.now() - startTime,
          };
        }
      }

      // Mark as executing
      await this.updateExecutionStatus(logId, 'executing');

      // Execute based on category
      let result: any;
      switch (tool.category) {
        case 'webhook':
          result = await this.executeWebhook(tool, parameters);
          break;
        case 'email':
          result = await this.executeEmail(tool, parameters);
          break;
        case 'database':
          result = await this.executeDatabase(tool, parameters);
          break;
        default:
          throw new Error(`Tool category ${tool.category} not implemented`);
      }

      // Mark as success
      const executionTimeMs = Date.now() - startTime;
      await this.updateExecutionStatus(logId, 'success', {
        outputData: result,
        completedAt: new Date(),
        durationMs: executionTimeMs,
      });

      // Update tool stats
      await this.updateToolStats(toolId, executionTimeMs);

      return {
        success: true,
        data: result,
        executionTimeMs,
      };
    } catch (error: any) {
      // Mark as failed
      await this.updateExecutionStatus(logId, 'failed', {
        errorMessage: error.message,
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      });

      return {
        success: false,
        error: error.message,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute webhook tool
   */
  private async executeWebhook(
    tool: typeof toolDefinitions.$inferSelect,
    parameters: Record<string, any>
  ) {
    const { method, url, headers: configHeaders } = tool.config as any;

    // Merge parameters into URL (for path params)
    let finalUrl = url;
    Object.keys(parameters).forEach((key) => {
      finalUrl = finalUrl.replace(`{${key}}`, encodeURIComponent(parameters[key]));
    });

    // Build headers
    const headers: Record<string, string> = { ...configHeaders };

    // Add auth if configured
    if (tool.authType === 'api_key' && tool.encryptedCredentials) {
      const apiKey = decrypt(tool.encryptedCredentials);
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (tool.authType === 'bearer' && tool.encryptedCredentials) {
      const token = decrypt(tool.encryptedCredentials);
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Execute request
    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(parameters);
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(finalUrl, fetchOptions);

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
    }

    // Parse response
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return await response.json();
    } else {
      return await response.text();
    }
  }

  /**
   * Execute email tool
   */
  private async executeEmail(
    tool: typeof toolDefinitions.$inferSelect,
    parameters: Record<string, any>
  ) {
    // TODO: Integrate with email service (SendGrid, SES, etc.)
    console.log('Email tool execution:', parameters);
    return { sent: true, messageId: uuid() };
  }

  /**
   * Execute database tool
   */
  private async executeDatabase(
    tool: typeof toolDefinitions.$inferSelect,
    parameters: Record<string, any>
  ) {
    // TODO: Implement safe database operations
    // IMPORTANT: Validate SQL to prevent injection
    console.log('Database tool execution:', parameters);
    return { rowsAffected: 1 };
  }

  /**
   * Check if execution needs human approval
   */
  private checkApprovalThreshold(
    parameters: Record<string, any>,
    threshold: any
  ): boolean {
    if (!threshold) return true;

    // Example: { amount: 100, currency: 'USD' }
    if (threshold.amount && parameters.amount) {
      return parameters.amount > threshold.amount;
    }

    // Default: require approval
    return true;
  }

  /**
   * Approve a pending action
   */
  async approveAction(executionId: string, userId: string) {
    const [execution] = await db
      .select()
      .from(actionExecutionLog)
      .where(eq(actionExecutionLog.id, executionId))
      .limit(1);

    if (!execution) {
      throw new Error('Execution not found');
    }

    if (execution.status !== 'pending') {
      throw new Error('Execution not pending approval');
    }

    // Mark as approved
    await db
      .update(actionExecutionLog)
      .set({
        status: 'approved',
        approvedBy: userId,
        approvedAt: new Date(),
      })
      .where(eq(actionExecutionLog.id, executionId));

    // Re-execute the tool
    return this.executeTool(
      execution.toolId!,
      execution.inputParameters as Record<string, any>,
      {
        botId: execution.botId!,
        conversationId: execution.conversationId!,
      }
    );
  }

  /**
   * Update execution status
   */
  private async updateExecutionStatus(
    executionId: string,
    status: string,
    updates?: Partial<InsertActionExecutionLog>
  ) {
    await db
      .update(actionExecutionLog)
      .set({
        status,
        ...updates,
      })
      .where(eq(actionExecutionLog.id, executionId));
  }

  /**
   * Update tool execution statistics
   */
  private async updateToolStats(toolId: string, executionTimeMs: number) {
    const [tool] = await db
      .select()
      .from(toolDefinitions)
      .where(eq(toolDefinitions.id, toolId))
      .limit(1);

    if (!tool) return;

    const newCount = (tool.executionCount || 0) + 1;
    const currentAvg = tool.averageExecutionTimeMs || 0;
    const newAvg = Math.round(
      (currentAvg * (newCount - 1) + executionTimeMs) / newCount
    );

    await db
      .update(toolDefinitions)
      .set({
        executionCount: newCount,
        lastExecutedAt: new Date(),
        averageExecutionTimeMs: newAvg,
        updatedAt: new Date(),
      })
      .where(eq(toolDefinitions.id, toolId));
  }

  /**
   * Get execution history for a bot
   */
  async getExecutionHistory(botId: string, limit = 50) {
    return db
      .select({
        execution: actionExecutionLog,
        tool: toolDefinitions,
      })
      .from(actionExecutionLog)
      .leftJoin(toolDefinitions, eq(actionExecutionLog.toolId, toolDefinitions.id))
      .where(eq(actionExecutionLog.botId, botId))
      .orderBy(desc(actionExecutionLog.createdAt))
      .limit(limit);
  }

  /**
   * Get pending approvals for an organization
   */
  async getPendingApprovals(organizationId: string) {
    return db
      .select({
        execution: actionExecutionLog,
        tool: toolDefinitions,
      })
      .from(actionExecutionLog)
      .innerJoin(toolDefinitions, eq(actionExecutionLog.toolId, toolDefinitions.id))
      .where(
        and(
          eq(toolDefinitions.organizationId, organizationId),
          eq(actionExecutionLog.status, 'pending')
        )
      )
      .orderBy(desc(actionExecutionLog.createdAt));
  }
}

export const toolExecutionService = new ToolExecutionService();
