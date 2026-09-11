import { z } from 'zod';
import {
  LIVE_VOICES,
  voiceAgentSchema,
  voiceTeamSchema,
} from '../../shared/voice-team.js';
import type { ApiRequest, ApiResponse } from '../lib/http-types.js';
import { CORPORATE } from '../phone/corporate-config.js';
import { SmsError, authenticate, db, filter } from '../sms/store.js';
import { generateTeamPreview } from './team-preview.js';
import {
  VoiceTeamStoreError,
  loadVoiceTeam,
  teamRequest,
} from './team-store.js';

const previewLimits = new Map<
  string,
  { count: number; reset: number; busy: boolean }
>();
interface BotRow {
  id: string;
  user_id: string;
  organization_id: string | null;
}
export default async function voiceTeamHandler(
  req: ApiRequest,
  res: ApiResponse,
) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const user = await authenticate(req);
    const url = new URL(req.url || '/', 'https://buildmybot.app');
    if (url.pathname === '/api/voice/team/bots' && req.method === 'GET') {
      const bots = await db<Array<{ id: string; name: string }>>(
        `bots?${filter({ user_id: `eq.${user.id}`, organization_id: user.organizationId ? `eq.${user.organizationId}` : 'is.null', deleted_at: 'is.null', select: 'id,name', order: 'name.asc', limit: '500' })}`,
      );
      return res.json(bots);
    }
    const botId = z
      .string()
      .min(1)
      .max(200)
      .parse(url.searchParams.get('botId'));
    if (req.method !== 'GET') {
      const origin = req.headers.origin;
      const allowed = [
        'https://buildmybot.app',
        'https://www.buildmybot.app',
        process.env.APP_BASE_URL,
      ].filter(Boolean);
      if (origin && !allowed.includes(origin))
        throw new SmsError(403, 'Origin not allowed');
    }
    // Resolve ownership from live data, never from the request or team document.
    const corporateOwner =
      botId === CORPORATE.botId && user.id === CORPORATE.ownerId;
    const [bot] = await db<BotRow[]>(
      `bots?${filter({ id: `eq.${botId}`, user_id: `eq.${corporateOwner ? CORPORATE.ownerId : user.id}`, ...(corporateOwner ? {} : { organization_id: user.organizationId ? `eq.${user.organizationId}` : 'is.null' }), select: 'id,user_id,organization_id', limit: '1' })}`,
    );
    if (!bot) throw new SmsError(404, 'Voice bot not found');
    if (url.pathname === '/api/voice/team/preview' && req.method === 'POST') {
      const agent = voiceAgentSchema.parse(req.body);
      const now = Date.now();
      for (const [id, item] of previewLimits)
        if (item.reset < now && !item.busy) previewLimits.delete(id);
      const limit = previewLimits.get(user.id) || {
        count: 0,
        reset: now + 60_000,
        busy: false,
      };
      if (limit.busy || limit.count >= 8)
        throw new SmsError(429, 'Please wait before previewing another voice.');
      limit.count++;
      limit.busy = true;
      previewLimits.set(user.id, limit);
      try {
        const audio = await generateTeamPreview(agent);
        res.setHeader('Content-Type', 'audio/wav');
        return res.send(audio);
      } finally {
        limit.busy = false;
      }
    }
    if (url.pathname !== '/api/voice/team')
      throw new SmsError(404, 'Not found');
    if (req.method === 'GET')
      return res.json({
        ...(await loadVoiceTeam(bot.id, bot.organization_id, bot.user_id)),
        voices: LIVE_VOICES,
      });
    if (req.method !== 'PUT') throw new SmsError(405, 'Method not allowed');
    const input = z
      .object({ config: voiceTeamSchema, revision: z.number().int().min(0) })
      .strict()
      .parse(req.body);
    const now = new Date().toISOString();
    const scope = {
      bot_id: `eq.${bot.id}`,
      user_id: `eq.${bot.user_id}`,
      organization_id: bot.organization_id
        ? `eq.${bot.organization_id}`
        : 'is.null',
      revision: `eq.${input.revision}`,
    };
    const rows = (await teamRequest(
      input.revision === 0 ? 'voice_teams' : `voice_teams?${filter(scope)}`,
      {
        method: input.revision === 0 ? 'POST' : 'PATCH',
        body: JSON.stringify({
          config: input.config,
          revision: input.revision + 1,
          updated_at: now,
          updated_by: user.id,
          ...(input.revision === 0
            ? {
                bot_id: bot.id,
                organization_id: bot.organization_id,
                user_id: bot.user_id,
              }
            : {}),
        }),
      },
    )) as unknown[];
    if (!rows.length)
      throw new SmsError(
        409,
        'This team was changed elsewhere. Reload it before saving.',
      );
    return res.json({ config: input.config, revision: input.revision + 1 });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: error.issues[0]?.message || 'Invalid Voice Team',
        issues: error.issues,
      });
    if (error instanceof SmsError || error instanceof VoiceTeamStoreError)
      return res.status(error.status).json({ error: error.message });
    return res.status(503).json({
      error: 'Voice Team is temporarily unavailable. Please try again.',
    });
  }
}
