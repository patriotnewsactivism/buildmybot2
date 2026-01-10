import { type Request, type Response, Router } from 'express';
import { authenticate, loadOrganizationContext } from '../middleware';
import { tenantIsolation } from '../middleware';
import { ChannelService } from '../services';

const router = Router();
const channelService = new ChannelService();

router.use(authenticate);
router.use(loadOrganizationContext);
router.use(tenantIsolation());

router.get('/available', async (req: Request, res: Response) => {
  try {
    const channels = await channelService.getAvailableChannels();
    res.json(channels);
  } catch (error) {
    console.error('Error fetching available channels:', error);
    res.status(500).json({ error: 'Failed to fetch available channels' });
  }
});

router.get('/status/:botId', async (req: Request, res: Response) => {
  try {
    const { botId } = req.params;
    const user = (req as any).user;
    const organization = (req as any).organization;
    const status = await channelService.getChannelStatus(
      botId,
      organization?.id,
      user?.id,
    );
    res.json(status);
  } catch (error: any) {
    console.error('Error fetching channel status:', error);
    if (error.message?.includes('Access denied')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to fetch channel status' });
  }
});

router.post('/deploy/:botId', async (req: Request, res: Response) => {
  try {
    const { botId } = req.params;
    const { channel, config } = req.body;
    const user = (req as any).user;
    const organization = (req as any).organization;

    if (!channel || !config) {
      return res.status(400).json({ error: 'Channel and config are required' });
    }

    const deployment = await channelService.deployToChannel(
      botId,
      channel,
      config,
      user.id,
      organization?.id,
    );

    res.status(201).json(deployment);
  } catch (error: any) {
    console.error('Error deploying channel:', error);
    if (error.message?.includes('Access denied')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to deploy channel' });
  }
});

router.post('/disable/:botId', async (req: Request, res: Response) => {
  try {
    const { botId } = req.params;
    const { channel } = req.body;
    const user = (req as any).user;
    const organization = (req as any).organization;

    if (!channel) {
      return res.status(400).json({ error: 'Channel is required' });
    }

    await channelService.disableChannel(
      botId,
      channel,
      user.id,
      organization?.id,
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error disabling channel:', error);
    if (error.message?.includes('Access denied')) {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to disable channel' });
  }
});

router.post('/test/:botId', async (req: Request, res: Response) => {
  try {
    const { botId } = req.params;
    const { channel } = req.body;
    const user = (req as any).user;
    const organization = (req as any).organization;

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
