-- Standalone voice/phone-agent plan, purchasable independent of the main
-- chatbot plan tier (see constants.ts VOICE_PLANS) — a Free/Starter/
-- Professional customer can add voice on its own; Executive/Enterprise get
-- phone minutes bundled already via PLANS[...].phoneMinutes, and combining
-- both (a standalone voice plan on top of a bundled-minutes chatbot plan)
-- is intentionally allowed, not mutually exclusive.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS voice_plan text;
