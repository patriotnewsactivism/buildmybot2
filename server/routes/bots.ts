import { Router } from 'express';
import { BotService } from '../services/BotService';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';
import { BotDeploymentStatus } from '../../shared/types';

const router = Router();
const botService = new BotService();

// Schema for bot deployment request
const deployBotSchema = z.object({
  params: z.object({
    botId: z.string().uuid(),
  }),
});

// Deploy a bot
router.post(
  '/bots/:botId/deploy',
  authenticateToken,
  validateRequest(deployBotSchema),
  async (req, res) => {
    try {
      const { botId } = req.params;
      const userId = req.user!.id; // Authenticated user ID
      const organizationId = req.user!.organizationId; // Authenticated user's organization ID

      if (!organizationId) {
        return res.status(400).json({ message: 'Organization ID is required for bot deployment.' });
      }

      // Simulate environment validation
      const isValidEnvironment = await botService.validateDeploymentEnvironment(organizationId);
      if (!isValidEnvironment) {
        return res.status(400).json({ message: 'Deployment environment not properly configured. Please check your settings.' });
      }

      const bot = await botService.deployBot(botId, userId, organizationId);
      res.status(200).json({ message: 'Bot deployment initiated successfully.', bot });
    } catch (error: any) {
      console.error('Error deploying bot:', error);
      // Log the error with more details if available
      await botService.recordDeploymentAttempt(
        req.params.botId,
        req.user!.id,
        req.user!.organizationId,
        BotDeploymentStatus.FAILED,
        error.message || 'Unknown deployment error'
      );
      res.status(500).json({ message: error.message || 'Failed to deploy bot.' });
    }
  }
);

// Get bot deployment status
router.get(
  '/bots/:botId/deployment-status',
  authenticateToken,
  async (req, res) => {
    try {
      const { botId } = req.params;
      const organizationId = req.user!.organizationId; // Authenticated user's organization ID

      if (!organizationId) {
        return res.status(400).json({ message: 'Organization ID is required.' });
      }

      const status = await botService.getDeploymentStatus(botId, organizationId);
      res.status(200).json(status);
    } catch (error: any) {
      console.error('Error fetching deployment status:', error);
      res.status(500).json({ message: error.message || 'Failed to fetch deployment status.' });
    }
  }
);

// New endpoint for real-time polling of bot status
router.get(
  '/bots/:botId/status',
  authenticateToken,
  async (req, res) => {
    try {
      const { botId } = req.params;
      const organizationId = req.user!.organizationId;

      if (!organizationId) {
        return res.status(400).json({ message: 'Organization ID is required.' });
      }

      const status = await botService.getRealtimeDeploymentStatus(botId, organizationId);
      res.status(200).json(status);
    } catch (error: any) {
      console.error('Error fetching real-time bot status:', error);
      res.status(500).json({ message: error.message || 'Failed to fetch real-time bot status.' });
    }
  }
);

// Get bot deployment history
router.get(
  '/bots/:botId/deployment-history',
  authenticateToken,
  async (req, res) => {
    try {
      const { botId } = req.params;
      const organizationId = req.user!.organizationId; // Authenticated user's organization ID

      if (!organizationId) {
        return res.status(400).json({ message: 'Organization ID is required.' });
      }

      const history = await botService.getDeploymentHistory(botId, organizationId);
      res.status(200).json(history);
    } catch (error: any) {
      console.error('Error fetching deployment history:', error);
      res.status(500).json({ message: error.message || 'Failed to fetch deployment history.' });
    }
  }
);

export default router;
