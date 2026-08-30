import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  aiTeamKilled,
  logAgentError,
  logShift,
  notifyDiscord,
  notifySlack,
  salesAutomationDryRun,
  supabaseFetch,
} from '../ai-team/lib.js';

export async function salesOutreachHandler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (aiTeamKilled()) {
    return res.status(200).json({ success: true, killed: true });
  }

  const ROLE_ID = 'sales-outreach-agent';
  const ROLE_NAME = 'Jordan Blake';

  try {
    const isDryRun = salesAutomationDryRun();
    const leads = (await supabaseFetch('leads', 'status=eq.New&limit=5')) || [];

    const processed = Array.isArray(leads) ? leads.length : 0;
    const summary = `Sales outreach run: ${processed} lead(s) reviewed. Dry run: ${isDryRun}.`;

    await logShift({
      role_id: ROLE_ID,
      role_name: ROLE_NAME,
      summary,
      tasks_completed: processed,
    });

    if (processed > 0) {
      await notifyDiscord(`🎯 **${ROLE_NAME} — Sales Outreach**\n${summary}`);
      await notifySlack(`:dart: *${ROLE_NAME} — Sales Outreach*\n${summary}`);
    }

    return res.status(200).json({
      success: true,
      processed,
      dryRun: isDryRun,
      summary,
    });
  } catch (err: any) {
    await logAgentError({
      source: 'cron/sales-outreach',
      message: `Sales outreach failed: ${err.message}`,
    });
    return res.status(500).json({ success: false, error: err.message });
  }
}
