# Corporate sales and support phone

BuildMyBot's Telnyx number is **+1 346 646 0065**. It belongs to the existing
corporate bot and owner, not to a customer provisioning default. Railway is
its webhook/media origin. No Twilio credentials are used on this path.

## Inbound calls

The Telnyx Call Control application points to
`https://buildmybot2-web-production.up.railway.app/api/phone/activation/telnyx/webhook`.
The media endpoint is `/api/voice/telnyx-media`. Ed25519 signatures validate
webhooks; a signed client state binds media to a saved call and bot. The call
log must include the required `voice_agent_id`, otherwise Gemini cannot start.

Gemini 3.1 Flash Live Preview handles audio. Its initial prompt uses
`realtimeInput.text`, not the older `clientContent` turn format. The bridge
buffers early caller audio until setup completes, excludes outbound echo,
uses automatic activity interruption, and clears both local and Telnyx audio
queues on barge-in. The current PSTN codec is PCMU at 8 kHz; telephone audio
quality remains narrower than the browser demo. Calls are bounded to 10 minutes.

The receptionist routes through `route_department` to Vera Cross (AI sales),
Sam Rivera (AI support), or Alex Morgan (AI administration). The ongoing Gemini
conversation keeps its context, receives the department's instructions, and
records the destination and summary in call metadata and the AI team log.
These are AI department handoffs, not claims that a human or external phone
extension joined. Human requests are captured for owner follow-up. Caller ID
is never authorization to inspect a customer's private account.

## Outbound approval

Open **AI Team → Corporate sales phone** while signed in to the corporate
owner account. Create a request with the exact destination and call purpose.
Nothing dials until **Approve and call [number]** is clicked. Reject discards
the request. Approval is restricted to the exact corporate OWNER, expires
after 24 hours, and is atomically consumed before Telnyx is contacted.
An ambiguous provider failure is held as `dispatch_unknown`; never retry it
without reconciling the provider's call records. No cron or public demo can
approve a call. The existing sales dry-run setting remains unchanged.

## SMS and demos

The landing page and `/demo` display the corporate calling link when routing
is configured. A labeled SMS example remains available while carrier activation
is pending. The live Text DEMO link requires verified carrier assignment plus
`CORPORATE_SMS_ENABLED=true`. A configured messaging profile alone is not proof
of deliverability. No brand/campaign registration or phone purchase is performed.

The corporate SMS webhook uses the existing signed `/api/sms/webhooks` route,
records inbound messages in the corporate SMS inbox and CRM, honors STOP/START,
and never grants marketing consent or paid customer entitlements. Replies are
limited to customer-initiated conversations (10 inbound messages per contact/hour,
100 total/day). Ambiguous send outcomes are held without automatic retries.
Other tenants continue through the existing SMS handler. Delivery acceptance
is not proof of delivery; a real send/receive test is still required.

## Deployment settings

Set only on the corporate Railway service:

- `CORPORATE_PHONE_CONNECT=true`: reconcile this existing number and webhook
  assignment at startup with existing Telnyx credentials; no number purchase.
- `CORPORATE_VOICE_PROBE=true`: bounded Gemini audio generation check at startup;
  does not place a phone call or send SMS.
- `CORPORATE_SMS_ENABLED`: default false until carrier assignment is approved.
- `CORPORATE_PHONE_API_ORIGIN`: optional override of the documented Railway origin.

`GET /api/corporate-phone` exposes only number and readiness flags. Owner call
requests live under `/api/corporate-phone/calls`. No credentials are returned.
No migrations are required. The production migration-baseline hold remains.

## Acceptance checks

Verify exact GitHub SHA through public `/api/health`. Check the startup Gemini
probe and `/api/corporate-phone`. Have a caller ring the number, speak during
the greeting, ask a buying question, and then ask an existing-service question.
Confirm two-way audio, interruption cutoff, routing metadata, and saved transcript.
Do not initiate an outbound test call without the owner's per-call approval.
