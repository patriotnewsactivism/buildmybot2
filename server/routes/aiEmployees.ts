/**
 * AI Employees API Routes
 * Endpoints for managing and interacting with AI employees.
 */

import { Router } from 'express';
import { aiEmployeeService } from '../services/AIEmployeeService';
import {
  authenticate,
  loadOrganizationContext,
  tenantIsolation,
} from '../middleware';

const router = Router();

// All routes require auth
router.use(authenticate, loadOrganizationContext, tenantIsolation());

// ─── GET /api/ai-employees — List all employees ─────────────
router.get('/', async (req: any, res) => {
  try {
    await aiEmployeeService.init();
    const employees = await aiEmployeeService.getEmployees();
    res.json(employees);
  } catch (error: any) {
    console.error('GET /api/ai-employees error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/ai-employees/logs — Recent activity logs ──────
router.get('/logs', async (req: any, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await aiEmployeeService.getLogs(limit);
    res.json(logs);
  } catch (error: any) {
    console.error('GET /api/ai-employees/logs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/ai-employees/:id/logs — Employee-specific logs ─
router.get('/:id/logs', async (req: any, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const logs = await aiEmployeeService.getEmployeeLogs(req.params.id, limit);
    res.json(logs);
  } catch (error: any) {
    console.error('GET /api/ai-employees/:id/logs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/ai-employees/shift — Run the daily shift ─────
router.post('/shift', async (req: any, res) => {
  try {
    await aiEmployeeService.init();
    const result = await aiEmployeeService.runDailyShift();
    res.json(result);
  } catch (error: any) {
    console.error('POST /api/ai-employees/shift error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/ai-employees/:id/task — Trigger a specific task ─
router.post('/:id/task', async (req: any, res) => {
  try {
    await aiEmployeeService.init();
    const { id } = req.params;
    const { taskType, data } = req.body;

    let result: any;
    switch (id) {
      case 'sam-support':
        if (taskType === 'email_response') {
          result = await aiEmployeeService.handleEmailResponse(data);
        } else if (taskType === 'support_triage') {
          result = await aiEmployeeService.triageSupportTickets();
        } else {
          return res.status(400).json({ error: `Unknown task type: ${taskType}` });
        }
        break;
      case 'eli-engineering':
        if (taskType === 'health_check') {
          result = await aiEmployeeService.checkSystemHealth();
        } else {
          return res.status(400).json({ error: `Unknown task type: ${taskType}` });
        }
        break;
      case 'maya-marketing':
        if (taskType === 'content_creation') {
          result = await aiEmployeeService.generateMarketingContent(data?.topic);
        } else {
          return res.status(400).json({ error: `Unknown task type: ${taskType}` });
        }
        break;
      case 'oscar-operations':
        if (taskType === 'daily_standup') {
          result = await aiEmployeeService.generateDailyStandup();
        } else {
          return res.status(400).json({ error: `Unknown task type: ${taskType}` });
        }
        break;
      case 'piper-product':
        if (taskType === 'product_analysis') {
          result = await aiEmployeeService.analyzeProductFeedback();
        } else {
          return res.status(400).json({ error: `Unknown task type: ${taskType}` });
        }
        break;
      default:
        return res.status(404).json({ error: `Unknown employee: ${id}` });
    }

    res.json({ success: true, result });
  } catch (error: any) {
    console.error('POST /api/ai-employees/:id/task error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── PATCH /api/ai-employees/:id — Update employee ──────────
router.patch('/:id', async (req: any, res) => {
  try {
    const { id } = req.params;
    const { status, instructions } = req.body;

    if (status) {
      await aiEmployeeService.updateEmployeeStatus(id, status);
    }
    if (instructions) {
      await aiEmployeeService.updateEmployeeInstructions(id, instructions);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('PATCH /api/ai-employees/:id error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/ai-employees/email — Sam responds to an email ─
router.post('/email', async (req: any, res) => {
  try {
    await aiEmployeeService.init();
    const { from, subject, body, to } = req.body;
    if (!from || !subject || !body) {
      return res.status(400).json({ error: 'from, subject, and body are required' });
    }
    const result = await aiEmployeeService.handleEmailResponse({ from, subject, body, to });
    res.json(result);
  } catch (error: any) {
    console.error('POST /api/ai-employees/email error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
