# Corporate sales and support phone

BuildMyBot's corporate Telnyx number is **+1 346 646 0065**. It belongs to the existing corporate bot and owner, not to a customer provisioning default. Railway is its webhook/media origin.

## Inbound calls

The Telnyx Call Control application points to:

`https://buildmybot2-web-production.up.railway.app/api/phone/activation/telnyx/webhook`

The media endpoint is `/api/voice/telnyx-media`. Telnyx webhook signatures and signed call state must bind media to a verified saved call and bot before the realtime AI session starts.

Deepgram Voice Agent handles realtime audio by default. `/api/voice/telnyx-media` bridges Telnyx Call Control bidirectional PCMU/8 kHz to Deepgram (`wss://agent.deepgram.com/v1/agent/converse`) using native mulaw both ways, Welcome→Settings→SettingsApplied gating, inbound-track filtering, 20 ms outbound pacing, connect ringback until first TTS, and `{event:"clear"}` barge-in. Set `VOICE_ENGINE=gemini` to fall back to Gemini Live on the same WebSocket.

Department transfers stay on one Deepgram socket but **must** change Flux voice, prompt, and opening via `UpdateSpeak` / `UpdatePrompt` / `InjectAgentMessage` plus hold music. Collapsing Receptionist/Sales/Support/Manager into one audible person is a production regression.

The bridge must buffer early caller audio until setup completes, exclude outbound echo, support barge-in/interruption, and clear stale playback when the caller interrupts. Telephone audio quality is constrained by the PSTN codec and may sound narrower than a browser demo. Answer/streaming always forces `stream_codec: PCMU` and bidirectional PCMU/8000 so the WebSocket stream does not inherit a mismatched negotiated call codec.

### Pickup realism and media stability

Corporate inbound calls greet upon carrier connection as **Avery** with a dynamic time-of-day greeting (*"Good morning / afternoon / evening, thank you for calling BuildMyBot, my name is Avery how can I help you."*). A short ringback plays until Deepgram's greeting audio arrives so pickup is not dead air.

Media-path hardening in `api/voice/deepgram-agent.ts` (in-repo only):

- Native PCMU/8 kHz in both directions (no 24 kHz resample)
- WebSocket keepalive pings on the Telnyx media socket
- Half-duplex mute during TTS plus a 500 ms hangover so earpiece echo is not transcribed
- One outbound PCMU frame every 20 ms
- Outbound PCMU backlog cap to limit latency after TTS bursts

### Department transfer realism

After the receptionist completes intake (name, contact, interest) and verbally acknowledges hold, mid-call `route_department` handoffs play **7.5 seconds** (7–8s) of continuous soft hold music (`generateHoldMusicMuLaw`) before the destination agent greets with shared caller context. Destination audio is suppressed until that hold finishes so the new agent does not talk over the tone.

No carrier account or production DB migration changes are required for this behavior. Ensure `DEEPGRAM_API_KEY` and `VOICE_ENGINE=deepgram` are set on the corporate Railway service. Keep `GEMINI_API_KEY` only as the explicit `VOICE_ENGINE=gemini` fallback.

## Distinct AI departments

The corporate phone follows the same production voice-team contract as customer phone agents.

Receptionist, Sales, Support, Manager, Recruiting, and Partner are **distinct staff personas** (never disclose that they are AI on the call). Routing is not implemented by changing the prompt on one persistent audible persona.

A successful handoff must:

1. preserve a bounded caller/call context envelope;
2. start the destination agent with its own voice ID;
3. apply the destination persona/system prompt;
4. apply the destination speaking style and role policy;
5. use destination-specific opening/transfer acknowledgement behavior;
6. prevent the outgoing agent from continuing to speak or execute tools after transfer completion;
7. log source/destination agent and voice identity in call telemetry.

The caller should audibly perceive a new person taking over while not having to repeat already-known facts.

Default roles are configured through the voice-team model rather than hard-wiring corporate AI employee identities into the call router. Human-transfer requests remain human-transfer/follow-up requests; the AI Manager is an escalation persona, not a grant of additional account, billing, contractual, or security privileges.

Caller ID is never authorization to inspect a customer's private account.

## Outbound approval

Open **AI Team → Corporate sales phone** while signed in to the corporate owner account. Create a request with the exact destination and call purpose. Nothing dials until the owner approves that specific request.

Approval must remain scoped to the exact corporate owner, exact destination, and bounded validity window. An ambiguous provider failure must be reconciled against provider call records rather than blindly retried. No cron job, demo route, or autonomous agent may silently convert a pending call into an approved outbound call.

Approved sales calls should start in the Sales agent identity, not the Receptionist identity, unless product routing explicitly requires otherwise.

## SMS and demos

The landing page and `/demo` may display the corporate calling link when routing is configured. SMS demos must remain subject to carrier assignment, consent, messaging-profile, and launch-gate requirements.

The corporate SMS webhook uses the signed `/api/sms/webhooks` route, records inbound messages in the corporate SMS inbox and CRM, honors STOP/START, and must not infer marketing consent or paid entitlements from an inbound message alone.

Ambiguous send outcomes must not trigger unbounded automatic retries. Provider acceptance is not proof of handset delivery; real send/receive verification remains required.

## Deployment settings

Set only on the corporate Railway service where applicable:

- `CORPORATE_PHONE_CONNECT=true` — reconcile the existing number and webhook assignment at startup; do not purchase a number as a side effect.
- `CORPORATE_VOICE_PROBE=true` — bounded Gemini audio/configuration probe; does not place a phone call or send SMS.
- `CORPORATE_SMS_ENABLED` — keep false until carrier/compliance requirements are satisfied.
- `CORPORATE_PHONE_API_ORIGIN` — optional override of the documented Railway origin.

`GET /api/corporate-phone` must expose only non-secret readiness/status fields. Owner call requests remain under `/api/corporate-phone/calls`. No provider credentials may be returned to the browser.

Voice-team persistence may depend on the additive `voice_teams` database migration. The production migration-baseline hold remains authoritative; do not bypass it with an uncontrolled `supabase db push`.

## Acceptance checks

Before declaring the corporate voice team end-to-end accepted:

1. verify the exact Git SHA through the public health route;
2. confirm Railway is serving the intended release;
3. call the corporate number;
4. speak during/after the Receptionist greeting and confirm barge-in behavior;
5. transfer Receptionist -> Sales and confirm a clearly different voice/persona;
6. transfer to Support and confirm another distinct voice/persona while preserving context;
7. escalate to Manager and confirm a fourth identity;
8. verify the caller is not forced to repeat already-captured facts;
9. verify call telemetry records all transitions and voice identities;
10. confirm no stale/source agent audio leaks after each transfer.

Do not initiate outbound test calls without the owner's per-call approval.

## Related documentation

- `docs/VOICE_TEAM_ARCHITECTURE_2026-09-10.md`
- `docs/AI_VOICE_TEAM.md`
- `DEPLOYMENT.md`
- `AGENTS.md`
