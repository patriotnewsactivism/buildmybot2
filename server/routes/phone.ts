import express from 'express';
import { twilioService } from '../services/TwilioService';
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { authenticate } from '../middleware';

const router = express.Router();

router.use(authenticate);

// Get available numbers
router.get('/available', async (req, res) => {
  try {
    const { areaCode, countryCode } = req.query;
    const numbers = await twilioService.listAvailableNumbers(
      areaCode as string,
      (countryCode as string) || 'US',
    );
    res.json(numbers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Purchase a number
router.post('/purchase', async (req, res) => {
  try {
    const { phoneNumber, friendlyName } = req.body;
    const userId = (req as any).user.id;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const sid = await twilioService.purchaseNumber(phoneNumber, friendlyName);

    // Update user's phone config
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const currentConfig = (user?.phoneConfig as any) || {};
    
    // Append or replace the phone number details
    // For now, we assume one number per user/agent, but this could be an array
    const newConfig = {
      ...currentConfig,
      twilioPhoneNumber: phoneNumber,
      twilioSid: sid,
      twilioPhoneStatus: 'active'
    };

    await db
      .update(users)
      .set({ phoneConfig: newConfig })
      .where(eq(users.id, userId));

    res.json({ success: true, sid, phoneNumber });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Release a number
router.post('/release', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const config = (user?.phoneConfig as any) || {};

    if (!config.twilioSid) {
      return res.status(400).json({ error: 'No phone number to release' });
    }

    await twilioService.releaseNumber(config.twilioSid);

    // Remove from config
    const { twilioPhoneNumber, twilioSid, twilioPhoneStatus, ...rest } = config;
    await db
      .update(users)
      .set({ phoneConfig: rest })
      .where(eq(users.id, userId));

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export { router as phoneRouter };
