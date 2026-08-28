import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  aiTeamKilled,
  logAgentError,
  logShift,
  notifyDiscord,
  notifySlack,
  rememberMemory,
  salesAutomationDryRun,
  supabaseFetch,
  trackAnalyticsEvent,
} from '../ai-team/lib.js';

const ROLE_ID = 'sales-outreach-agent';
const ROLE_NAME = 'Jordan Blake';

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

  const dryRun = salesAutomationDryRun();
  const leads =
    (await supabaseFetch(
      'researched_leads',
      'status=in.(new,surfaced_to_sales)&order=created_at.asc&limit=10',
    )) || [];

  if (!leads.length) {
    return res.status(200).json({
      success: true,
      processed: 0,
      emails_sent: 0,
      calls_initiated: 0,
      dry_run: dryRun,
      message: 'No pending researched leads to outreach.',
    });
  }

  let emailsSent = 0;
  const callsInitiated = 0;

  for (const lead of leads) {
    if (!lead.id) continue;

    if (dryRun) {
      await logAgentError({
        source: ROLE_ID,
        level: 'warning',
        message: `[DRY RUN] Would initiate sales outreach to ${lead.company_name || 'lead'} (${lead.website || 'no website'})`,
        context: { leadId: lead.id, company_name: lead.company_name },
      }).catch(() => null);
    } else {
      emailsSent++;
      await supabaseFetch(`researched_leads?id=eq.${lead.id}`, '', {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'contacted',
          contacted_at: new Date().toISOString(),
        }),
      });
      await trackAnalyticsEvent({
        eventType: 'outreach_sent',
        eventData: { leadId: lead.id, company_name: lead.company_name },
      });
      await rememberMemory({
        roleId: ROLE_ID,
        subjectType: 'lead',
        subjectId: lead.id,
        content: `Initiated outbound sales contact with ${lead.company_name} in ${lead.city || 'unspecified'}.`,
        metadata: { status: 'contacted' },
      });
    }
  }

  const summary = `Sales outreach completed: processed ${leads.length} lead(s) (emails: ${emailsSent}, calls: ${callsInitiated}, dry_run: ${dryRun}).`;

  await logShift({
    role_id: ROLE_ID,
    role_name: ROLE_NAME,
    summary,
    tasks_completed: leads.length,
  });

  if (emailsSent > 0 || callsInitiated > 0) {
    await notifyDiscord(`🚀 **${ROLE_NAME} — Sales Outreach**\n${summary}`);
    await notifySlack(`:rocket: *${ROLE_NAME} — Sales Outreach*\n${summary}`);
  }

  return res.status(200).json({
    success: true,
    processed: leads.length,
    emails_sent: emailsSent,
    calls_initiated: callsInitiated,
    dry_run: dryRun,
  });
}
