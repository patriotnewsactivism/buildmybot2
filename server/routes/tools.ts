/**
 * Tool Execution Routes
 * API endpoints for managing and executing bot tools/actions
 */

import { and, count, desc, eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import {
  actionExecutionLog,
  botTools,
  toolDefinitions,
} from '../../shared/schema-agentic-os';
import { db } from '../db';
import { toolExecutionService } from '../services/ToolExecutionService';

const router = Router();

/**
 * GET /api/tools
 * Get all tools for a bot or organization
 */
router.get('/', async (req: any, res) => {
  try {
    const organizationId = req.org?.id;
    const botId = req.query.botId;
    const activeOnly = req.query.active === 'true';

    if (!organizationId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get all tool definitions for the organization
    const toolsQuery = db
      .select()
      .from(toolDefinitions)
      .where(eq(toolDefinitions.organizationId, organizationId));

    const tools = await toolsQuery;

    // If botId specified, filter to assigned tools
    if (botId) {
      const assignments = await db
        .select({ toolId: botTools.toolId, enabled: botTools.enabled })
        .from(botTools)
        .where(eq(botTools.botId, botId));

      const assignedToolIds = new Set(assignments.map((a) => a.toolId));
      const enabledToolIds = new Set(
        assignments.filter((a) => a.enabled).map((a) => a.toolId),
      );

      const filteredTools = tools.filter((t) => {
        if (!assignedToolIds.has(t.id)) return false;
        if (activeOnly && !enabledToolIds.has(t.id)) return false;
        return true;
      });

      return res.json({ tools: filteredTools });
    }

    res.json({ tools });
  } catch (error) {
    console.error('Tools fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch tools' });
  }
});

/**
 * GET /api/tools/stats
 * Get tool statistics for a bot
 */
router.get('/stats', async (req: any, res) => {
  try {
    const organizationId = req.org?.id;
    const botId = req.query.botId;

    if (!organizationId || !botId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get total tools for org
    const [totalResult] = await db
      .select({ count: count() })
      .from(toolDefinitions)
      .where(eq(toolDefinitions.organizationId, organizationId));

    // Get enabled tools for bot
    const [enabledResult] = await db
      .select({ count: count() })
      .from(botTools)
      .where(and(eq(botTools.botId, botId), eq(botTools.enabled, true)));

    // Get pending approvals
    const [pendingResult] = await db
      .select({ count: count() })
      .from(actionExecutionLog)
      .where(
        and(
          eq(actionExecutionLog.botId, botId),
          eq(actionExecutionLog.status, 'pending'),
        ),
      );

    // Get executions today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [executionsResult] = await db
      .select({ count: count() })
      .from(actionExecutionLog)
      .where(
        and(
          eq(actionExecutionLog.botId, botId),
          sql`${actionExecutionLog.createdAt} >= ${today}`,
        ),
      );

    res.json({
      stats: {
        totalTools: totalResult?.count || 0,
        enabledTools: enabledResult?.count || 0,
        pendingApprovals: pendingResult?.count || 0,
        executionsToday: executionsResult?.count || 0,
      },
    });
  } catch (error) {
    console.error('Stats fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/tools/:id
 * Get a specific tool
 */
router.get('/:id', async (req: any, res) => {
  try {
    const organizationId = req.org?.id;
    if (!organizationId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const [tool] = await db
      .select()
      .from(toolDefinitions)
      .where(
        and(
          eq(toolDefinitions.id, req.params.id),
          eq(toolDefinitions.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    res.json({ tool });
  } catch (error) {
    console.error('Tool fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch tool' });
  }
});

/**
 * POST /api/tools
 * Create a new tool
 */
router.post('/', async (req: any, res) => {
  try {
    const organizationId = req.org?.id;
    if (!organizationId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const {
      name,
      description,
      category,
      config,
      functionSchema,
      requiresApproval,
      approvalThreshold,
      authType,
      credentials,
      botId,
    } = req.body;

    const tool = await toolExecutionService.createTool(organizationId, {
      name,
      description,
      category,
      config,
      functionSchema,
      requiresApproval,
      approvalThreshold,
      authType,
      credentials,
    });

    // If botId provided, assign tool to bot
    if (botId) {
      await toolExecutionService.assignToolToBot(botId, tool.id);
    }

    res.json({ tool });
  } catch (error) {
    console.error('Tool creation error:', error);
    res.status(500).json({ error: 'Failed to create tool' });
  }
});

/**
 * PUT /api/tools/:id
 * Update a tool
 */
router.put('/:id', async (req: any, res) => {
  try {
    const organizationId = req.org?.id;
    if (!organizationId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const {
      name,
      description,
      category,
      config,
      functionSchema,
      requiresApproval,
      approvalThreshold,
      authType,
      credentials,
    } = req.body;

    // Verify ownership
    const [existing] = await db
      .select()
      .from(toolDefinitions)
      .where(
        and(
          eq(toolDefinitions.id, req.params.id),
          eq(toolDefinitions.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    const { encrypt } = await import('../utils/encryption');

    const updateData: any = {
      name,
      description,
      category,
      config,
      functionSchema,
      requiresApproval,
      approvalThreshold,
      authType,
      updatedAt: new Date(),
    };

    // Only update credentials if provided
    if (credentials) {
      updateData.encryptedCredentials = encrypt(credentials);
    }

    await db
      .update(toolDefinitions)
      .set(updateData)
      .where(eq(toolDefinitions.id, req.params.id));

    res.json({ success: true });
  } catch (error) {
    console.error('Tool update error:', error);
    res.status(500).json({ error: 'Failed to update tool' });
  }
});

/**
 * DELETE /api/tools/:id
 * Delete a tool
 */
router.delete('/:id', async (req: any, res) => {
  try {
    const organizationId = req.org?.id;
    if (!organizationId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify ownership
    const [existing] = await db
      .select()
      .from(toolDefinitions)
      .where(
        and(
          eq(toolDefinitions.id, req.params.id),
          eq(toolDefinitions.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    await db
      .delete(toolDefinitions)
      .where(eq(toolDefinitions.id, req.params.id));

    res.json({ success: true });
  } catch (error) {
    console.error('Tool deletion error:', error);
    res.status(500).json({ error: 'Failed to delete tool' });
  }
});

/**
 * POST /api/tools/:id/toggle
 * Toggle tool active status for a bot
 */
router.post('/:id/toggle', async (req: any, res) => {
  try {
    const organizationId = req.org?.id;
    if (!organizationId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { active } = req.body;

    // Find bot-tool assignment
    const [assignment] = await db
      .select()
      .from(botTools)
      .where(eq(botTools.toolId, req.params.id))
      .limit(1);

    if (!assignment) {
      return res.status(404).json({ error: 'Tool assignment not found' });
    }

    await db
      .update(botTools)
      .set({ enabled: active, updatedAt: new Date() })
      .where(eq(botTools.id, assignment.id));

    res.json({ success: true });
  } catch (error) {
    console.error('Tool toggle error:', error);
    res.status(500).json({ error: 'Failed to toggle tool' });
  }
});

/**
 * POST /api/tools/execute
 * Execute a tool (for testing)
 */
router.post('/execute', async (req: any, res) => {
  try {
    const { toolId, parameters, context } = req.body;

    const result = await toolExecutionService.executeTool(
      toolId,
      parameters,
      context,
    );

    res.json(result);
  } catch (error: any) {
    console.error('Tool execution error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute tool',
    });
  }
});

/**
 * GET /api/tools/pending
 * Get pending approval actions for a bot
 */
router.get('/pending', async (req: any, res) => {
  try {
    const botId = req.query.botId;

    if (!botId) {
      return res.status(400).json({ error: 'Bot ID required' });
    }

    const pending = await db
      .select({
        execution: actionExecutionLog,
        tool: toolDefinitions,
      })
      .from(actionExecutionLog)
      .leftJoin(
        toolDefinitions,
        eq(actionExecutionLog.toolId, toolDefinitions.id),
      )
      .where(
        and(
          eq(actionExecutionLog.botId, botId),
          eq(actionExecutionLog.status, 'pending'),
        ),
      )
      .orderBy(desc(actionExecutionLog.createdAt));

    const actions = pending.map((p) => ({
      id: p.execution.id,
      toolName: p.tool?.name || 'Unknown Tool',
      inputParameters: p.execution.inputParameters,
      status: p.execution.status,
      createdAt: p.execution.createdAt,
      conversationId: p.execution.conversationId,
    }));

    res.json({ actions });
  } catch (error) {
    console.error('Pending actions fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch pending actions' });
  }
});

/**
 * POST /api/tools/approve/:id
 * Approve or reject a pending action
 */
router.post('/approve/:id', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { approved } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (approved) {
      // Approve and execute
      const result = await toolExecutionService.approveAction(
        req.params.id,
        userId,
      );
      res.json({ success: true, result });
    } else {
      // Reject
      await db
        .update(actionExecutionLog)
        .set({
          status: 'rejected',
          approvedBy: userId,
          approvedAt: new Date(),
        })
        .where(eq(actionExecutionLog.id, req.params.id));

      res.json({ success: true });
    }
  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({ error: 'Failed to process approval' });
  }
});

export default router;
