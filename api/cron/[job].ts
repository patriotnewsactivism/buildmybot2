import type { VercelRequest, VercelResponse } from '@vercel/node';
import { aiTeamKilled, getAiTeamSchemaReadiness } from '../ai-team/lib.js';
import { allShiftsHandler } from './_all-shifts.js';
import { leadFollowupsHandler } from './_lead-followups.js';
import { pulseHandler } from './_pulse.js';
import { salesOutreachHandler } from './_sales-outreach.js';
import { smsOverageHandler } from './_sms-overage.js';

// Single dynamic route consolidating the cron endpoints into ONE Vercel
// Serverless Function to stay under the Hobby plan's 12-function cap.
//
// Endpoints:
//   /api/cron/pulse          — 10-min heartbeat (overdue leads, stale errors, internal mail)
//   /api/cron/lead-followups — 48h follow-up worker (reasoning loop per lead)
//   /api/cron/all-shifts     — AI team shifts (per-role or all-at-once)
//   /api/cron/sales-outreach — Sales agent: pick up researched leads, initiate outreach
//   /api/cron/sms-overage    — SMS Marketing overage reconciliation (billing only,
//                              NOT an AI Team job — bypasses the AI Team gates below)
//
// Auth: Bearer CRON_SECRET — each handler does its own auth check internally.

export const maxDuration = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { job } = req.query;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // sms-overage is SMS billing reconciliation, a totally separate subsystem
  // from the AI Team roles below -- it must not be coupled to the AI Team
  // kill switch or schema-readiness gate.
  if (job === 'sms-overage') {
    return smsOverageHandler(req, res);
  }

  if (aiTeamKilled()) {
    return res.status(200).json({ success: true, killed: true });
  }

  const schema = await getAiTeamSchemaReadiness();
  if (!schema.ready) {
    console.error(
      `[cron/${String(job)}] schema_not_ready: ${schema.missing.join(', ')}`,
    );
    return res.status(503).json({
      success: false,
      error: 'schema_not_ready',
      missing: schema.missing,
      checked_at: schema.checkedAt,
    });
  }

  switch (job) {
    case 'pulse':
      return pulseHandler(req, res);
    case 'lead-followups':
      return leadFollowupsHandler(req, res);
    case 'all-shifts':
      return allShiftsHandler(req, res);
    case 'sales-outreach':
      return salesOutreachHandler(req, res);
    default:
      return res.status(404).json({ error: `Unknown cron job: ${job}` });
  }
}
