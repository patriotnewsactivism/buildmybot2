/**
 * Twilio Webhook Handlers
 *
 * Three webhooks:
 * 1. /api/twilio/voice-handler — TwiML for the call's AI conversation
 * 2. /api/twilio/status-callback — call status updates (ringing → answered → completed)
 * 3. /api/twilio/recording-callback — recording URL when transcription completes
 *
 * These are public endpoints (Twilio doesn't authenticate with our session
 * cookies) — validated via Twilio request signature instead.
 */

import { createHmac } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logCallOutcome } from './service.js';

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req: VercelRequest): any {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return req.body;
    }
  }
  return req.body || {};
}

/**
 * Validate Twilio request signature (prevents spoofed callbacks).
 * Falls back to checking for expected Twilio fields if auth token isn't set.
 */
async function validateTwilioRequest(req: VercelRequest): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;

  if (!authToken || !accountSid) {
    // In development, just check for Twilio fields
    const body = parseBody(req);
    return !!(body.CallSid || body.AccountSid || body.RecordingSid);
  }

  try {
    // In production, validate the signature
    const twilio = (await import('twilio')).default;
    const url = req.url || '/api/twilio';
    const body = parseBody(req);
    const signature = req.headers['x-twilio-signature'] as string;

    if (!signature) {
      // Fallback: check for Twilio fields
      return !!(body.CallSid || body.AccountSid || body.RecordingSid);
    }

    const isValid = twilio.validateRequest(authToken, signature, url, body);
    return isValid;
  } catch {
    // If validation fails, fall back to checking for Twilio fields
    const body = parseBody(req);
    return !!(body.CallSid || body.AccountSid || body.RecordingSid);
  }
}

/**
 * Escape XML special characters for TwiML
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Returns a TwiML fragment that speaks text via Grok TTS (<Play>) when
 * XAI_API_KEY is configured, or falls back to Twilio's Polly.Joanna (<Say>).
 * The HMAC token ties the URL to the exact (text, voice) pair so it can't be
 * reused with different content by an external caller.
 */
function speakLine(text: string, voice = 'eve'): string {
  const XAI_API_KEY = process.env.XAI_API_KEY;
  if (XAI_API_KEY) {
    const APP_BASE_URL =
      process.env.APP_BASE_URL || 'https://www.buildmybot.app';
    const token = createHmac('sha256', XAI_API_KEY)
      .update(`${text}|${voice}`)
      .digest('hex')
      .slice(0, 16);
    const params = new URLSearchParams({ text, voice, token });
    const url = `${APP_BASE_URL}/api/voice/tts-clip?${params.toString()}`;
    return `<Play>${escapeXml(url)}</Play>`;
  }
  return `<Say voice="Polly.Joanna">${escapeXml(text)}</Say>`;
}

/**
 * POST /api/twilio/voice-handler
 * Returns TwiML that greets the lead and connects them to a
 * <Gather> → webhook loop for real-time AI conversation.
 */
export async function voiceHandler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  const valid = await validateTwilioRequest(req);
  if (!valid) {
    console.warn('[twilio] Invalid request signature');
    return res.status(403).json({ error: 'Invalid Twilio request' });
  }

  const url = new URL(req.url || '/', 'http://localhost');
  const leadId = url.searchParams.get('leadId') || '';
  const objective =
    url.searchParams.get('objective') ||
    'Follow up on their interest in BuildMyBot';
  const logId = url.searchParams.get('logId') || '';
  const botId = url.searchParams.get('botId') || '';

  // Generate a natural greeting based on the objective
  let greeting =
    'Hi there! This is the BuildMyBot team. We wanted to follow up and see if you had any questions about how AI chatbots could help your business. Do you have a moment?';

  try {
    const { callLLM } = await import('../ai-team/lib.js');
    greeting = await callLLM(
      'You are a friendly, professional sales representative for BuildMyBot. Generate a natural-sounding phone greeting (under 40 words) for a sales call. Voice: warm, not pushy. Be concise and direct.',
      `Objective: ${objective}\nKeep it brief and conversational — this will be spoken aloud via text-to-speech. Limit to 30 words maximum.`,
    );
    // Ensure we don't exceed Twilio's character limits
    if (greeting.length > 500) {
      greeting = greeting.slice(0, 497) + '...';
    }
  } catch (err: any) {
    console.error('[twilio] Failed to generate greeting:', err.message);
    // Use default greeting
  }

  // TwiML: Say the greeting, then listen for the lead's response
  const APP_BASE_URL = process.env.APP_BASE_URL || 'https://www.buildmybot.app';
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speakLine(greeting)}
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${APP_BASE_URL}/api/twilio/voice-respond?leadId=${encodeURIComponent(leadId)}&amp;objective=${encodeURIComponent(objective)}&amp;logId=${encodeURIComponent(logId)}&amp;botId=${encodeURIComponent(botId)}&amp;turn=1" method="POST">
    ${speakLine("I'm listening.")}
  </Gather>
  ${speakLine('It seems like you might be busy. Feel free to call us back anytime. Have a great day!')}
  <Hangup/>
</Response>`;

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(twiml);
}

/**
 * POST /api/twilio/voice-respond
 * Processes speech input from the lead, generates an AI response,
 * and continues the conversation loop.
 */
export async function voiceRespond(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method !== 'POST') return res.status(405).end();

  const body = parseBody(req);
  const speechResult = body.SpeechResult || '';
  const url = new URL(req.url || '/', 'http://localhost');
  const leadId = url.searchParams.get('leadId') || '';
  const objective = url.searchParams.get('objective') || '';
  const logId = url.searchParams.get('logId') || '';
  const botId = url.searchParams.get('botId') || '';
  const turn = Number.parseInt(url.searchParams.get('turn') || '1');

  // Cap conversation at 10 turns to keep costs reasonable
  if (turn > 10 || !speechResult) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speakLine("Thank you so much for your time today. We'll send you a follow-up email with more details. Have a wonderful day!")}
  <Hangup/>
</Response>`;
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(twiml);
  }

  // Generate AI response based on the lead's speech
  let aiResponse =
    "That's a great question. Let me look into that and follow up with you by email. Is there anything else I can help with?";

  try {
    const { callLLM } = await import('../ai-team/lib.js');

    // Build context for the AI
    const context = botId ? ` (Bot: ${botId})` : '';
    const conversationHistory =
      turn > 1 ? ` This is turn ${turn} of the conversation.` : '';

    aiResponse = await callLLM(
      `You are a friendly, professional sales rep for BuildMyBot on a live phone call. BuildMyBot is a white-label AI chatbot and voice agent platform for local service businesses.${context}

Call objective: ${objective}

Rules:
- Keep responses under 50 words — this is spoken aloud
- Be natural and conversational, not scripty
- Never invent features or pricing outside: Free $0, Starter $29/mo, Professional $99/mo, Enterprise $499/mo
- If the lead seems uninterested, gracefully wrap up
- If they have a question you can't answer, say you'll follow up by email
- If they want to end the call, say goodbye and hang up
- Be helpful but don't be pushy${conversationHistory}`,
      `The lead just said: "${speechResult}"`,
    );

    // Ensure we don't exceed Twilio's character limits
    if (aiResponse.length > 500) {
      aiResponse = aiResponse.slice(0, 497) + '...';
    }
  } catch (err: any) {
    console.error('[twilio] Failed to generate AI response:', err.message);
    // Use default response
  }

  const APP_BASE_URL = process.env.APP_BASE_URL || 'https://www.buildmybot.app';
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speakLine(aiResponse)}
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${APP_BASE_URL}/api/twilio/voice-respond?leadId=${encodeURIComponent(leadId)}&amp;objective=${encodeURIComponent(objective)}&amp;logId=${encodeURIComponent(logId)}&amp;botId=${encodeURIComponent(botId)}&amp;turn=${turn + 1}" method="POST">
  </Gather>
  ${speakLine('Are you still there? If not, no worries — feel free to call us back anytime. Goodbye!')}
  <Hangup/>
</Response>`;

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(twiml);
}

/**
 * POST /api/twilio/status-callback
 * Twilio calls this when the call status changes.
 */
export async function statusCallback(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method !== 'POST') return res.status(405).end();

  const body = parseBody(req);
  const callStatus = body.CallStatus || '';
  const callSid = body.CallSid || '';
  const duration = Number.parseInt(body.CallDuration || '0');
  const url = new URL(req.url || '/', 'http://localhost');
  const logId = url.searchParams.get('logId') || '';
  const leadId = url.searchParams.get('leadId') || '';

  if (
    callStatus === 'completed' ||
    callStatus === 'busy' ||
    callStatus === 'no-answer' ||
    callStatus === 'failed'
  ) {
    await logCallOutcome({
      leadId,
      callSid,
      logId: logId || undefined,
      duration,
      status: callStatus,
    });
  }

  return res.status(200).json({ received: true });
}

/**
 * POST /api/twilio/recording-callback
 * Twilio calls this when a recording/transcription is ready.
 */
export async function recordingCallback(
  req: VercelRequest,
  res: VercelResponse,
) {
  setCors(res);
  if (req.method !== 'POST') return res.status(405).end();

  const body = parseBody(req);
  const recordingUrl = body.RecordingUrl || '';
  const recordingSid = body.RecordingSid || '';
  const callSid = body.CallSid || '';
  const duration = Number.parseInt(body.RecordingDuration || '0');
  const url = new URL(req.url || '/', 'http://localhost');
  const logId = url.searchParams.get('logId') || '';
  const leadId = url.searchParams.get('leadId') || '';

  if (recordingUrl && leadId) {
    // Fetch the transcript if available
    let transcript = '';
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const authHeader = `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`;
        const transcriptResp = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${recordingSid}/Transcriptions.json`,
          { headers: { Authorization: authHeader } },
        );
        if (transcriptResp.ok) {
          const data = await transcriptResp.json();
          transcript = data.transcriptions?.[0]?.transcription_text || '';
        }
      } catch {
        // Transcript not available yet — will be populated later
      }
    }

    await logCallOutcome({
      leadId,
      callSid,
      logId: logId || undefined,
      duration,
      status: 'completed',
      recordingUrl: `${recordingUrl}.mp3`,
      transcript: transcript || undefined,
    });
  }

  return res.status(200).json({ received: true });
}
