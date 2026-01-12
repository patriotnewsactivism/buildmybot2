import { type Response, Router } from 'express';
import {
  authenticate,
  loadOrganizationContext,
  tenantIsolation,
  type AuthRequest,
} from '../middleware';
import { ChannelService } from '../services';

const router = Router();
const channelService = new ChannelService();

router.use(authenticate);
router.use(loadOrganizationContext);
router.use(tenantIsolation());

router.get('/available', async (_req: AuthRequest, res: Response) => {
  try {
    const channels = await channelService.getAvailableChannels();
    res.json(channels);
  } catch (error) {
    console.error('Error fetching available channels:', error);
    res.status(500).json({ error: 'Failed to fetch available channels' });
  }
});

router.get('/status/:botId', async (req: AuthRequest, res: Response) => {
  try {
    const { botId } = req.params;
    const user = req.user;
    const organization = req.organization;
    const status = await channelService.getChannelStatus(
      botId,
      organization?.id,
      user?.id,
    );
    res.json(status);
  } catch (error: unknown) {
    console.error('Error fetching channel status:', error);
    if (error instanceof Error && error.message.includes('Access denied')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to fetch channel status' });
  }
});

router.post('/deploy/:botId', async (req: AuthRequest, res: Response) => {
  try {
    const { botId } = req.params;
    const { channel, config } = req.body;
    const user = req.user;
    const organization = req.organization;

    if (!channel || !config) {
      return res.status(400).json({ error: 'Channel and config are required' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const deployment = await channelService.deployToChannel(
      botId,
      channel,
      config,
      user.id,
      organization?.id,
    );

    res.status(201).json(deployment);
  } catch (error: unknown) {
    console.error('Error deploying channel:', error);
    if (error instanceof Error && error.message.includes('Access denied')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to deploy channel' });
  }
});

router.post('/disable/:botId', async (req: AuthRequest, res: Response) => {
  try {
    const { botId } = req.params;
    const { channel } = req.body;
    const user = req.user;
    const organization = req.organization;

    if (!channel) {
      return res.status(400).json({ error: 'Channel is required' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    await channelService.disableChannel(
      botId,
      channel,
      user.id,
      organization?.id,
    );
    res.json({ success: true });
  } catch (error: unknown) {
    console.error('Error disabling channel:', error);
    if (error instanceof Error && error.message.includes('Access denied')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to disable channel' });
  }
});

router.post('/test/:botId', async (req: AuthRequest, res: Response) => {
  try {
    const { botId } = req.params;
    const { channel } = req.body;
    const user = req.user;
    const organization = req.organization;

    if (!channel) {
      return res.status(400).json({ error: 'Channel is required' });
    }

    const result = await channelService.testChannel(
      botId,
      channel,
      organization?.id,
      user?.id,
    );
    res.json(result);
  } catch (error) {
    console.error('Error testing channel:', error);
    res.status(500).json({ error: 'Failed to test channel' });
  }
});

export default router;
