import { Router, Request, Response } from 'express';
import { db } from '../db';
import { repairLogs } from '../../shared/schema-monitoring';
import { ErrorRecoveryService } from '../services/ErrorRecoveryService';
import { eq, desc, and, like, sql } from 'drizzle-orm';

const router = Router();

// GET /api/admin/repair-logs - Fetch all repair logs with optional filtering
router.get('/repair-logs', async (req: Request, res: Response) => {
  try {
    const { issue_type, status, bot_id, sort_by, sort_order, limit, offset } = req.query;
    
    const conditions = [];
    
    if (issue_type) {
      conditions.push(eq(repairLogs.issueType, issue_type as string));
    }
    if (status) {
      conditions.push(eq(repairLogs.status, status as string));
    }
    if (bot_id) {
      conditions.push(eq(repairLogs.botId, parseInt(bot_id as string, 10)));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    // Determine sort column and direction
    const sortColumn = sort_by === 'issue_type' ? repairLogs.issueType :
                       sort_by === 'status' ? repairLogs.status :
                       sort_by === 'bot_id' ? repairLogs.botId :
                       repairLogs.createdAt;
    
    const orderByClause = sort_order === 'asc' ? asc(sortColumn) : desc(sortColumn);
    
    const logs = await db.select()
      .from(repairLogs)
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(limit ? parseInt(limit as string, 10) : 100)
      .offset(offset ? parseInt(offset as string, 10) : 0);
    
    // Get counts for summary
    const totalCount = await db.select({ count: sql<number>`count(*)` })
      .from(repairLogs)
      .where(whereClause)
      .then(result => Number(result[0]?.count || 0));
    
    const resolvedCount = await db.select({ count: sql<number>`count(*)` })
      .from(repairLogs)
      .where(and(eq(repairLogs.status, 'resolved'), ...conditions))
      .then(result => Number(result[0]?.count || 0));
    
    const pendingCount = await db.select({ count: sql<number>`count(*)` })
      .from(repairLogs)
      .where(and(eq(repairLogs.status, 'pending'), ...conditions))
      .then(result => Number(result[0]?.count || 0));
    
    const autoFixableCount = await db.select({ count: sql<number>`count(*)` })
      .from(repairLogs)
      .where(and(eq(repairLogs.autoFixable, true), ...conditions))
      .then(result => Number(result[0]?.count || 0));
    
    res.json({
      logs,
      summary: {
        total: totalCount,
        resolved: resolvedCount,
        pending: pendingCount,
        autoFixable: autoFixableCount,
      },
      lastChecked: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching repair logs:', error);
    res.status(500).json({ error: 'Failed to fetch repair logs' });
  }
});

// POST /api/admin/repair-logs/:id/fix - Attempt to fix a specific repair log
router.post('/repair-logs/:id/fix', async (req: Request, res: Response) => {
  try {
    const logId = parseInt(req.params.id, 10);
    if (isNaN(logId)) {
      return res.status(400).json({ error: 'Invalid repair log ID' });
    }

    const errorRecoveryService = new ErrorRecoveryService();
    const result = await errorRecoveryService.attemptFix(logId);
    
    res.json(result);
  } catch (error) {
    console.error('Error attempting fix:', error);
    res.status(500).json({ error: 'Failed to attempt fix' });
  }
});

// GET /api/admin/repair-logs/:id - Get a single repair log by ID
router.get('/repair-logs/:id', async (req: Request, res: Response) => {
  try {
    const logId = parseInt(req.params.id, 10);
    if (isNaN(logId)) {
      return res.status(400).json({ error: 'Invalid repair log ID' });
    }

    const [log] = await db.select()
      .from(repairLogs)
      .where(eq(repairLogs.id, logId))
      .limit(1);

    if (!log) {
      return res.status(404).json({ error: 'Repair log not found' });
    }

    res.json(log);
  } catch (error) {
    console.error('Error fetching repair log:', error);
    res.status(500).json({ error: 'Failed to fetch repair log' });
  }
});

export default router;