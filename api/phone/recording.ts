import { z } from 'zod';
import type { ApiRequest, ApiResponse } from '../lib/http-types.js';
import { SmsError, authenticate, db, filter } from '../sms/store.js';
import { CORPORATE } from './corporate-config.js';

interface CallLogRow {
  id: number | string;
  bot_id: string | null;
  user_id: string | null;
  organization_id: string | null;
  call_sid: string;
  recording_url: string | null;
}

export default async function phoneRecordingHandler(
  req: ApiRequest,
  res: ApiResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    const user = await authenticate(req);
    const url = new URL(req.url || '/', 'https://buildmybot.app');
    const callId = url.searchParams.get('callId') || url.searchParams.get('id');
    const callSid =
      url.searchParams.get('callSid') || url.searchParams.get('sid');

    if (!callId && !callSid) {
      return res
        .status(400)
        .json({ error: 'Missing required callId or callSid query parameter' });
    }

    const queryFilters: Record<string, string> = {
      select: 'id,bot_id,user_id,organization_id,call_sid,recording_url',
      limit: '1',
    };
    if (callId) {
      queryFilters.id = `eq.${callId}`;
    } else if (callSid) {
      queryFilters.call_sid = `eq.${callSid}`;
    }

    const rows = await db<CallLogRow[]>(`call_logs?${filter(queryFilters)}`);
    const call = rows?.[0];
    if (!call) {
      return res.status(404).json({ error: 'Call record not found' });
    }

    // Tenant isolation verification
    const isCorporateOwner =
      call.bot_id === CORPORATE.botId && user.id === CORPORATE.ownerId;
    const isDirectOwner = call.user_id != null && call.user_id === user.id;
    const isOrgMember =
      call.organization_id != null &&
      user.organizationId != null &&
      call.organization_id === user.organizationId;

    if (!isCorporateOwner && !isDirectOwner && !isOrgMember) {
      throw new SmsError(403, 'Unauthorized to access this call recording');
    }

    if (!call.recording_url) {
      return res
        .status(404)
        .json({ error: 'No recording available for this call' });
    }

    const recordingUrl = call.recording_url;

    // If it's a pre-signed or public URL, redirect directly
    if (
      recordingUrl.startsWith('https://') &&
      !recordingUrl.includes('api.telnyx.com')
    ) {
      res.setHeader('Location', recordingUrl);
      return res.status(302).end();
    }

    // Otherwise proxy via Telnyx authenticated API
    const telnyxKey = process.env.TELNYX_API_KEY;
    if (!telnyxKey) {
      return res
        .status(503)
        .json({ error: 'Telephony provider credentials not configured' });
    }

    const telnyxRes = await fetch(recordingUrl, {
      headers: {
        Authorization: `Bearer ${telnyxKey}`,
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!telnyxRes.ok) {
      console.error(
        `[phone-recording] Telnyx recording fetch failed: ${telnyxRes.status} ${telnyxRes.statusText}`,
      );
      return res
        .status(telnyxRes.status === 404 ? 404 : 502)
        .json({ error: 'Failed to retrieve recording from provider' });
    }

    const contentType =
      telnyxRes.headers.get('content-type') ||
      (recordingUrl.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg');
    const contentLength = telnyxRes.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const arrayBuffer = await telnyxRes.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    if (error instanceof SmsError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[phone-recording] Error streaming call recording:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
