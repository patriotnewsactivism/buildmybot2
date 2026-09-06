import type { VercelRequest, VercelResponse } from '@vercel/node';
import { reconcileOverages } from '../sms/billing.js';

// SMS Marketing overage reconciliation. Finds ended sms_billing_periods rows
// with unbilled overage, creates the Stripe invoice for that overage, and
// (as of 2026-09-06) records partner/reseller commission on it via
// applySmsOverageCommissionSafeguard. Structurally a no-op until a real
// paying SMS Marketing customer accrues real overage -- safe to run on a
// real schedule from day one, unlike the AI-Team jobs in this same router
// which send real outbound comms to real leads that already exist.
export const maxDuration = 60;

export async function smsOverageHandler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }
  try {
    const result = await reconcileOverages();
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('[cron/sms-overage]', error?.message);
    return res.status(500).json({ success: false, error: error?.message || 'unknown error' });
  }
}
