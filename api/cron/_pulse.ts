import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  aiTeamKilled,
  logAgentError,
  supabaseFetch,
} from '../ai-team/lib.js';

export async function pulseHandler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (aiTeamKilled()) {
    return res.status(200).json({ success: true, killed: true });
  }

  try {
    const unreadMessages =
      (await supabaseFetch(
        'agent_messages',
        'status=eq.sent&order=created_at.asc&limit=10',
      )) || [];

    const openErrors =
      (await supabaseFetch(
        'error_logs',
        'status=eq.open&order=created_at.asc&limit=10',
      )) || [];

    return res.status(200).json({
      success: true,
      heartbeat: 'ok',
      unread_messages_count: unreadMessages.length,
      open_errors_count: openErrors.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    await logAgentError({
      source: 'cron/pulse',
      message: `Pulse heartbeat failed: ${err.message}`,
    });
    return res.status(500).json({ success: false, error: err.message });
  }
}
