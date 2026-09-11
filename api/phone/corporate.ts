import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  hangupCall,
  startRecording,
  telnyxRequest,
} from '../lib/telephony-provider.js';
import { SmsError, authenticate, db, filter } from '../sms/store.js';
import {
  CORPORATE,
  corporateMediaUrl,
  corporateOrigin,
} from './corporate-config.js';
import { corporateStatus } from './corporate-setup.js';
import { createTelnyxStreamToken } from './tenant-telnyx-token.js';
interface CallRequest {
  id: number;
  called_number: string;
  status: string;
  created_at: string;
  metadata: {
    objective: string;
    nonce?: string;
    approvedBy?: string;
    approvedAt?: string;
  };
}
const scope = {
  user_id: `eq.${CORPORATE.ownerId}`,
  bot_id: `eq.${CORPORATE.botId}`,
  direction: 'eq.outbound',
  provider: 'eq.telnyx',
};
export default async function corporatePhoneHandler(
  req: ApiRequest,
  res: ApiResponse,
) {
  try {
    const path = new URL(req.url || '/', 'https://buildmybot.app').pathname;
    res.setHeader('Cache-Control', 'no-store');
    if (path === '/api/corporate-phone' && req.method === 'GET')
      return res.json(corporateStatus);
    const user = await authenticate(req);
    if (user.id !== CORPORATE.ownerId || user.role !== 'OWNER')
      throw new SmsError(403, 'Only the corporate owner may approve calls');
    if (path === '/api/corporate-phone/voice-team-bot' && req.method === 'GET')
      return res.json({ botId: CORPORATE.botId });
    const origin = req.headers.origin;
    if (
      origin &&
      ![
        'https://buildmybot.app',
        'https://www.buildmybot.app',
        corporateOrigin(),
      ].includes(origin)
    )
      throw new SmsError(403, 'Origin not allowed');
    if (path === '/api/corporate-phone/calls') {
      if (req.method === 'GET')
        return res.json(
          await db(
            `call_logs?${filter({ ...scope, select: 'id,called_number,status,metadata,created_at,recording_url', order: 'created_at.desc', limit: '30' })}`,
          ),
        );
      if (req.method === 'POST') {
        const input = z
          .object({
            phone: z.string().regex(/^\+1[2-9]\d{9}$/),
            objective: z.string().trim().min(5).max(1200),
          })
          .parse(req.body);
        if (input.phone === CORPORATE.number)
          throw new SmsError(400, 'Cannot call the corporate line itself');
        return res.status(201).json(
          await db('call_logs', 'POST', {
            user_id: user.id,
            bot_id: CORPORATE.botId,
            voice_agent_id: CORPORATE.agentId,
            direction: 'outbound',
            provider: 'telnyx',
            caller_number: CORPORATE.number,
            called_number: input.phone,
            status: 'awaiting_approval',
            metadata: { objective: input.objective, requestedBy: user.id },
          }),
        );
      }
    }
    const match = path.match(
      /^\/api\/corporate-phone\/calls\/(\d+)\/(approve|reject)$/,
    );
    if (!match || req.method !== 'POST')
      throw new SmsError(405, 'Method not allowed');
    const [row] = await db<CallRequest[]>(
      `call_logs?${filter({ ...scope, id: `eq.${match[1]}`, status: 'eq.awaiting_approval' })}`,
    );
    if (!row) throw new SmsError(409, 'Call already handled or not found');
    if (match[2] === 'reject') {
      const changed = await db<CallRequest[]>(
        `call_logs?${filter({ ...scope, id: `eq.${row.id}`, status: 'eq.awaiting_approval' })}`,
        'PATCH',
        { status: 'rejected', ended_at: new Date().toISOString() },
      );
      if (!changed.length) throw new SmsError(409, 'Call already handled');
      return res.json({ rejected: true });
    }
    if (req.body?.confirmPhone !== row.called_number)
      throw new SmsError(400, 'Confirm the exact destination number');
    if (!corporateStatus.voiceConfigured || !process.env.TELNYX_CONNECTION_ID)
      throw new SmsError(503, 'Corporate voice connection unavailable');
    if (Date.now() - new Date(row.created_at).getTime() > 86400000)
      throw new SmsError(409, 'Request expired; create a new request');
    const nonce = randomUUID();
    // Atomic claim consumes approval before provider I/O; no automatic redial.
    const claimed = await db<CallRequest[]>(
      `call_logs?${filter({ ...scope, id: `eq.${row.id}`, status: 'eq.awaiting_approval' })}`,
      'PATCH',
      {
        status: 'dispatching',
        metadata: {
          ...row.metadata,
          nonce,
          approvedBy: user.id,
          approvedAt: new Date().toISOString(),
        },
      },
    );
    if (!claimed.length) throw new SmsError(409, 'Approval already consumed');
    try {
      const result = await telnyxRequest<{ data: { call_control_id: string } }>(
        '/calls',
        {
          method: 'POST',
          body: JSON.stringify({
            connection_id: process.env.TELNYX_CONNECTION_ID,
            from: CORPORATE.number,
            to: row.called_number,
            webhook_url: `${corporateOrigin()}/api/phone/activation/telnyx/webhook`,
            client_state: Buffer.from(
              JSON.stringify({ corporateLogId: row.id, nonce }),
            ).toString('base64'),
            command_id: nonce,
            timeout_secs: 30,
            time_limit_secs: 600,
          }),
        },
      );
      await db(
        `call_logs?${filter({ ...scope, id: `eq.${row.id}`, status: 'eq.dispatching' })}`,
        'PATCH',
        { call_sid: result.data.call_control_id },
      );
      return res.json({ success: true, callId: row.id });
    } catch {
      await db(
        `call_logs?${filter({ ...scope, id: `eq.${row.id}`, status: 'eq.dispatching' })}`,
        'PATCH',
        { status: 'dispatch_unknown' },
      );
      throw new SmsError(
        502,
        'Call dispatch requires review; approval will not be retried',
      );
    }
  } catch (error) {
    const status =
      error instanceof SmsError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : 503;
    return res.status(status).json({
      error:
        error instanceof SmsError
          ? error.message
          : 'Unable to process corporate phone request',
    });
  }
}
// Only invoked downstream of Telnyx Ed25519 webhook verification.
export async function handleCorporateAnswered(
  payload: Record<string, unknown>,
) {
  let state: { corporateLogId?: number; nonce?: string };
  try {
    state = JSON.parse(
      Buffer.from(String(payload.client_state || ''), 'base64').toString(),
    );
  } catch {
    return;
  }
  if (
    !state.corporateLogId ||
    !state.nonce ||
    payload.from !== CORPORATE.number
  )
    return;
  const [row] = await db<CallRequest[]>(
    `call_logs?${filter({ ...scope, id: `eq.${state.corporateLogId}`, status: 'eq.dispatching' })}`,
  );
  if (
    !row ||
    row.metadata.nonce !== state.nonce ||
    row.called_number !== payload.to ||
    !row.metadata.approvedBy
  )
    return;
  const callId = String(payload.call_control_id || '');
  if (!callId) return;
  const claimed = await db<CallRequest[]>(
    `call_logs?${filter({ ...scope, id: `eq.${row.id}`, status: 'eq.dispatching' })}`,
    'PATCH',
    {
      status: 'in-progress',
      call_sid: callId,
      started_at: new Date().toISOString(),
    },
  );
  if (!claimed.length) return;
  try {
    const clientState = createTelnyxStreamToken({
      callControlId: callId,
      botId: CORPORATE.botId,
      logId: String(row.id),
    });
    await telnyxRequest(
      `/calls/${encodeURIComponent(callId)}/actions/client_state_update`,
      { method: 'PUT', body: JSON.stringify({ client_state: clientState }) },
    );
    await telnyxRequest(
      `/calls/${encodeURIComponent(callId)}/actions/streaming_start`,
      {
        method: 'POST',
        body: JSON.stringify({
          stream_url: corporateMediaUrl(),
          stream_track: 'inbound_track',
          stream_bidirectional_mode: 'rtp',
          stream_bidirectional_codec: 'PCMU',
          stream_bidirectional_sampling_rate: 8000,
        }),
      },
    );
    try {
      await startRecording(callId, {
        format: 'mp3',
        channels: 'dual',
        playBeep: false,
      });
    } catch (recErr) {
      console.warn(
        `[corporate] Could not start recording for ${callId}:`,
        recErr instanceof Error ? recErr.message : recErr,
      );
    }
  } catch {
    await hangupCall(callId);
    await db(`call_logs?${filter({ ...scope, id: `eq.${row.id}` })}`, 'PATCH', {
      status: 'failed',
      ended_at: new Date().toISOString(),
    });
  }
}
