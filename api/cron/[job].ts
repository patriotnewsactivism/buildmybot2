import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pulseHandler } from './_pulse.js';
import { leadFollowupsHandler } from './_lead-followups.js';
import { allShiftsHandler } from './_all-shifts.js';

// Single dynamic route consolidating the 3 cron endpoints (pulse,
// lead-followups, all-shifts) into ONE Vercel Serverless Function instead
// of 3, to stay under the Hobby plan's 12-function cap.
//
// External URLs are unchanged: /api/cron/pulse, /api/cron/lead-followups,
// and /api/cron/all-shifts all resolve here via the [job] dynamic segment,
// and this just dispatches to the same handler logic that used to live at
// each of those file paths. Auth (Bearer CRON_SECRET) and all behavior is
// unchanged — each handler still does its own auth check internally.

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
    default:
      return res.status(404).json({ error: `Unknown cron job: ${job}` });
  }
}
