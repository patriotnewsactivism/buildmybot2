import type { VercelRequest, VercelResponse } from '@vercel/node';
import { allShiftsHandler } from './_all-shifts.js';
import { leadFollowupsHandler } from './_lead-followups.js';
import { pulseHandler } from './_pulse.js';
import { salesOutreachHandler } from './_sales-outreach.js';

// Single dynamic route consolidating the cron endpoints into ONE Vercel
// Serverless Function to stay under the Hobby plan's 12-function cap.
//
// Endpoints:
//   /api/cron/pulse          — 10-min heartbeat (overdue leads, stale errors, internal mail)
//   /api/cron/lead-followups — 48h follow-up worker (reasoning loop per lead)
//   /api/cron/all-shifts     — AI team shifts (per-role or all-at-once)
//   /api/cron/sales-outreach — Sales agent: pick up researched leads, initiate outreach
//
// Auth: Bearer CRON_SECRET — each handler does its own auth check internally.

export const maxDuration = 300;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { job } = req.query;

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
