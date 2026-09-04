/**
 * Twilio Voice Service — Real outbound/inbound call integration
 *
 * Extends (not duplicates) the existing buildmybot-voice-agent patterns.
 * Uses the Twilio SDK already in package.json.
 *
 * Outbound: agent-initiated calls to leads with a script/objective,
 *   transcribed, summarized into the lead's `notes` field.
 * Inbound: real number leads can call back, routed to an agent that
 *   reasons in real time.
 *
 * Every call is logged to the `leads` outreach fields and `call_logs` table.
 */

import { salesAutomationDryRun, trackAnalyticsEvent } from '../ai-team/lib.js';
import { recordMilestone } from '../growth/milestones.js';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://buildmybot.app';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SUPABASE_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY || '',
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY || ''}`,
  'Content-Type': 'application/json',
};

export function twilioConfigured(): boolean {
  return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER);
}

async function sbInsert(table: string, data: any) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    console.error(`[twilio] Supabase insert ${table} failed:`, resp.status);
    return null;
  }
  return resp.json();
}

async function sbUpdate(
  table: string,
  data: any,
  filters: Record<string, string>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    params.set(key, value);
  }
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { ...SUPABASE_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    console.error(`[twilio] Supabase update ${table} failed:`, resp.status);
    return null;
  }
  return resp.json();
}

async function sbSelect(
  table: string,
  select = '*',
  filters: Record<string, string> = {},
) {
  const params = new URLSearchParams({ select });
  for (const [key, value] of Object.entries(filters)) {
    params.set(key, value);
  }
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`;
  const resp = await fetch(url, { headers: SUPABASE_HEADERS });
  if (!resp.ok) return [];
  return resp.json();
}

/**
 * Initiate an outbound call to a lead.
 * Creates a Twilio call that connects to a TwiML webhook for the
 * AI conversation, then logs everything.
 */
export async function initiateOutboundCall(opts: {
  leadId: string;
  phoneNumber: string;
  objective: string;
  agentRoleId: string;
  agentName: string;
  /** Grok voice id for the call (defaults to 'eve'). */
  voiceId?: string;
}): Promise<{
  success: boolean;
  callSid?: string;
  error?: string;
}> {
  if (!twilioConfigured()) {
    return {
      success: false,
      error:
        'Twilio not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)',
    };
  }

  // Belt-and-suspenders: even if a caller forgets to check this upstream,
  // initiateOutboundCall never dials out while dry-run is active.
  if (salesAutomationDryRun()) {
    console.warn(
      `[twilio][DRY RUN] Would call ${opts.phoneNumber} for lead ${opts.leadId} (objective: ${opts.objective})`,
    );
    return { success: false, error: 'dry_run' };
  }

  try {
    const Twilio = (await import('twilio')).default;
    const client = new Twilio(TWILIO_ACCOUNT_SID!, TWILIO_AUTH_TOKEN!);

    // Create a call log record BEFORE the call so we have a reference
    const logRow = await sbInsert('call_logs', {
      voice_agent_id: opts.agentRoleId,
      bot_id: 'sales-outreach',
      user_id: opts.agentRoleId,
      provider: 'twilio',
      direction: 'outbound',
      caller_number: TWILIO_PHONE_NUMBER,
      called_number: opts.phoneNumber,
      status: 'initiating',
      lead_id: opts.leadId,
      metadata: {
        objective: opts.objective,
        agent_name: opts.agentName,
      },
      started_at: new Date().toISOString(),
    });
    const logId = logRow?.[0]?.id;

    // Initiate the call via Twilio
    const call = await client.calls.create({
      to: opts.phoneNumber,
      from: TWILIO_PHONE_NUMBER!,
      url: `${APP_BASE_URL}/api/twilio/voice-handler?leadId=${encodeURIComponent(opts.leadId)}&objective=${encodeURIComponent(opts.objective)}&logId=${logId || ''}&voice=${encodeURIComponent(opts.voiceId || 'eve')}`,
      statusCallback: `${APP_BASE_URL}/api/twilio/status-callback?logId=${logId || ''}&leadId=${encodeURIComponent(opts.leadId)}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      record: true,
      recordingStatusCallback: `${APP_BASE_URL}/api/twilio/recording-callback?logId=${logId || ''}&leadId=${encodeURIComponent(opts.leadId)}`,
      recordingStatusCallbackEvent: ['completed'],
      timeout: 30,
    });

    // Update the log with the call SID
    if (logId) {
      await sbUpdate(
        'call_logs',
        {
          call_sid: call.sid,
          status: 'initiated',
        },
        { id: `eq.${logId}` },
      );
    }

    // Update the lead's outreach tracking
    await sbUpdate(
      'leads',
      {
        last_contacted_at: new Date().toISOString(),
        contact_method: 'call',
        contact_count: null, // Will be incremented by a trigger or the status callback
        last_ai_action_at: new Date().toISOString(),
      },
      { id: `eq.${opts.leadId}` },
    );

    return { success: true, callSid: call.sid };
  } catch (err: any) {
    console.error('[twilio] outbound call failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Generate a call summary from a transcript using the LLM.
 */
export async function summarizeTranscript(transcript: string): Promise<string> {
  const { callLLM } = await import('../ai-team/lib.js');
  try {
    return await callLLM(
      'You are summarizing a sales call transcript for BuildMyBot. Extract: 1) Key topics discussed, 2) Lead interest level (hot/warm/cold), 3) Next steps agreed, 4) Any objections raised. Be concise (under 200 words).',
      `Transcript:\n${transcript.slice(0, 8000)}`,
    );
  } catch {
    return 'Transcript summary unavailable (LLM call failed).';
  }
}

/**
 * Log a completed call's outcome to the lead's notes and the call_logs table.
 */
export async function logCallOutcome(opts: {
  leadId: string;
  callSid: string;
  logId?: string;
  duration: number;
  status: string;
  recordingUrl?: string;
  transcript?: string;
}): Promise<void> {
  const summary = opts.transcript
    ? await summarizeTranscript(opts.transcript)
    : `Call ${opts.status} (${opts.duration}s). No transcript available.`;

  const now = new Date().toISOString();

  // First-value tracking: a call that was actually answered and lasted
  // long enough to be a real conversation. 'completed' alone isn't enough —
  // Twilio reports a 1-second voicemail hangup as completed too.
  if (opts.status === 'completed' && opts.duration > 5 && opts.logId) {
    try {
      const logRows = await sbSelect('call_logs', 'user_id,bot_id,organization_id', {
        id: `eq.${opts.logId}`,
      });
      const log = logRows?.[0];
      if (log?.user_id) {
        await recordMilestone({
          milestone: 'first_answered_call',
          userId: log.user_id,
          organizationId: log.organization_id ?? null,
          botId: log.bot_id ?? null,
          metadata: { callSid: opts.callSid, duration: opts.duration },
        });
      }
    } catch (err) {
      console.error('[milestones] first_answered_call failed:', err);
    }
  }

  // Update call_logs
  if (opts.logId) {
    await sbUpdate(
      'call_logs',
      {
        status: opts.status,
        duration: opts.duration,
        recording_url: opts.recordingUrl || null,
        transcript: opts.transcript ? { text: opts.transcript } : null,
        summary,
        ended_at: now,
      },
      { id: `eq.${opts.logId}` },
    );
  }

  // Update lead with notes
  const leadRows = await sbSelect('leads', 'notes,contact_count', {
    id: `eq.${opts.leadId}`,
  });
  const lead = leadRows?.[0];
  const existingNotes = lead?.notes || '';
  const currentCount = lead?.contact_count || 0;

  const newNote = `[${now.slice(0, 16)}] CALL (${opts.status}, ${opts.duration}s): ${summary}`;
  const updatedNotes = existingNotes
    ? `${existingNotes}\n\n${newNote}`
    : newNote;

  await sbUpdate(
    'leads',
    {
      notes: updatedNotes.slice(0, 10000),
      contact_count: currentCount + 1,
      call_transcript_url: opts.recordingUrl || null,
      ai_notes: summary.slice(0, 1000),
    },
    { id: `eq.${opts.leadId}` },
  );

  // Write to agent memory for future recall
  try {
    const { rememberMemory } = await import('../ai-team/lib.js');
    await rememberMemory({
      roleId: 'sales-outreach-agent',
      subjectType: 'lead',
      subjectId: opts.leadId,
      content: `Outbound call completed (${opts.status}, ${opts.duration}s): ${summary}`,
      metadata: { call_sid: opts.callSid, duration: opts.duration },
    });
  } catch {
    // Memory write is non-blocking
  }

  if (opts.status === 'completed') {
    await trackAnalyticsEvent({
      eventType: 'call_completed',
      eventData: { leadId: opts.leadId, duration: opts.duration },
    });
  }
}
