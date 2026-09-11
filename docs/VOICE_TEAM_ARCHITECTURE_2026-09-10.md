# Production Voice Team Architecture

Status: production baseline as of 2026-09-10.

BuildMyBot models Receptionist, Sales, Support, Manager, Recruiting, and Partner as distinct realtime voice agents. They are not one assistant changing prompts.

## Non-negotiable identity boundary

Every AI-to-AI handoff must change all of the following together:

- agent role and stable agent identifier;
- voice ID;
- persona/system prompt;
- speaking style and behavioral policy;
- opening/transfer acknowledgement behavior.

Conversation context may follow the caller, but the receiving agent must establish a new audible identity. Reusing a single voice across different departments is a production regression.

## Call topology

```text
Inbound call
    |
    v
Receptionist (Avery / Aoede / front-desk persona)
    |-- sales intent --------------> Sales (Marcus Hale / Puck / sales persona)
    |-- support intent ------------> Support (Sophie Reyes / Kore / support persona)
    |-- sales careers/recruiting --> Recruiting (Jordan Reed / Zephyr / sales agent division)
    |-- partner/white-label -------> Partner (Julian Vance / Orus / $499 partner program)
    `-- escalation ----------------> Manager (Daniel Okonkwo / Charon / manager persona)
```

The context envelope should preserve caller identity, authenticated tenant, conversation/call ID, concise transcript/history, facts already collected, current intent, tool results, promises/commitments, safety/compliance flags, and transfer reason. It must not preserve the outgoing agent's voice/persona as authoritative state.

## Production implementation

The merged implementation entered `main` through PR #110, merge commit `2c13fce5334027f79e78ae7b5178a720403c8654`.

Primary components include:

- `shared/voice-team.ts` for shared voice-team definitions and model configuration;
- `api/voice/team.ts` for voice-team API behavior;
- `api/voice/team-preview.ts` for Gemini Live previews using the same configured voice identity as production calls;
- `api/gateway.ts` routes `/api/voice/team`, `/api/voice/team/bots`, and `/api/voice/team/preview`;
- corporate phone integration exposes the configured voice-team bot to the production phone path;
- UI surfaces allow operators to inspect/configure the distinct team rather than treating voice as a single global persona.

Gemini Live remains the realtime conversational voice engine. Telnyx is the preferred telephony/SMS platform for current provisioning work; legacy Twilio-compatible paths may still exist during migration and must not be removed without an end-to-end replacement test.

## Handoff contract

A handoff should be an explicit state transition, not a prompt mutation.

1. Classify transfer destination.
2. Build a bounded context envelope.
3. End or detach the outgoing agent session cleanly.
4. Instantiate the destination agent with its own voice/persona/style configuration.
5. Give a short transfer acknowledgement that sounds like a new person taking over.
6. Continue from the shared facts without forcing the caller to repeat information.
7. Persist both agent identities and the handoff event in call telemetry.

## Acceptance criteria

A release passes voice-team acceptance only when:

- callers can clearly distinguish each department (Receptionist, Sales, Support, Manager, Recruiting, Partner) by sound;
- each agent exhibits role-specific behavior instead of merely a renamed prompt;
- context survives transfer without persona leakage;
- the receiving agent does not replay the full conversation or ask for facts already captured;
- transfers can occur more than once in a call without corrupting context;
- manager escalation cannot accidentally route back to the same audible persona;
- preview audio matches the configured production voice identity;
- failures have a deterministic fallback/transfer policy and never silently collapse all roles into one voice.

## Engineering rule for future agents

Do not simplify the voice system into a single agent with dynamic role prompts. Any refactor that merges voice IDs, persona prompts, or role-specific opening behavior across these four production roles requires an explicit product decision and new end-to-end evidence.

## Release verification

The current merged release was automatically deployed by Railway from `main`. Deployment `cd866ecf-e184-40a6-843d-f7397b3069e1` built successfully and started the BuildMyBot server on port 8080.

For every future voice-team change, verify the exact Git SHA on the production origin, execute the relevant tests, confirm the public health endpoint, then place a real or sandbox inbound call and exercise at least Receptionist -> Sales, Receptionist -> Support, and an escalation -> Manager path.