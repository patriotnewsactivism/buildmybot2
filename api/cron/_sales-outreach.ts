import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  aiTeamKilled,
  logAgentError,
  logShift,
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

  const preview = Array.isArray(req.query?.preview)
    ? req.query.preview[0]
    : req.query?.preview;

  if (salesAutomationDryRun() && preview !== '1') {
    return res.status(200).json({
      success: true,
      dry_run: true,
      skipped: true,
      message: 'Outbound sales outreach paused (dry-run mode).',
    });
  }

  try {
    const freshLeads =
      (await supabaseFetch(
        'researched_leads',
        'status=eq.new&order=created_at.desc&limit=10',
      )) || [];

    await logShift({
      role_id: 'sales-outreach',
      role_name: 'Jordan Blake',
      summary: `Reviewed ${freshLeads.length} new researched lead(s) for outreach pipeline.`,
      tasks_completed: freshLeads.length,
    });

    return res.status(200).json({
      success: true,
      role: 'sales-outreach',
      leads_reviewed: freshLeads.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    await logAgentError({
      source: 'cron/sales-outreach',
      message: `Sales outreach handler error: ${err.message}`,
    });
    return res.status(500).json({ success: false, error: err.message });
  }
}
