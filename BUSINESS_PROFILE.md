# BUSINESS_PROFILE.md — BuildMyBot
**Authoritative ground-truth document. All external-facing agents (Sales, Marketing, Support) MUST reference this before any outreach, content, or customer communication. Last updated: 2026-08-02.**

---

## 1. Product

**Name:** BuildMyBot
**URL:** https://www.buildmybot.app
**Repository:** github.com/patriotnewsactivism/buildmybot2
**API Health:** https://www.buildmybot.app/api/health (live, v2.0.0)

**What it is:** An AI phone assistant that helps local businesses answer inbound calls so they don't miss inquiries.

**Current stage:** DEMO / WAITLIST. The product is deployed and the API is healthy, but it is NOT commercially available. No one can purchase it.

---

## 2. What We Can Say (Approved Claims)

- "AI phone assistant that helps answer inbound calls so you don't miss inquiries."
- "We're inviting a small group of [industry] firms to an early demo."
- "No cost to join the demo waitlist."
- "We're not taking payments right now."

## 3. What We CANNOT Say (Prohibited Claims)

- ❌ Any specific feature list (integrations, HIPAA compliance, CRM sync, etc.)
- ❌ Any pricing, commission tiers, or subscription plans (Bronze/Silver/Gold/Platinum are WITHHELD)
- ❌ Any claim that the product is purchasable or commercially available
- ❌ Any claim about outbound calling capabilities (Vapi is wired but NOT approved for live use)
- ❌ Any claim about email/SMS outreach capabilities (NOT wired — all sends are dry-run)
- ❌ Any compliance claims (HIPAA, SOC2, etc.)
- ❌ Any integration claims (Salesforce, HubSpot, etc.)

## 4. Target Market (Approved Verticals)

| Vertical | Status | Notes |
|----------|--------|-------|
| Real estate brokerages | ✅ Active | TX priority; AZ/NV done (52 leads) |
| Property management | ✅ Active | Bundled with real estate outreach |
| Insurance agencies | ✅ Active | GA/AL done (36 leads) |
| Dental practices | ⏳ Queued | CA sweep pending |
| Med spas | ⏳ Queued | CA sweep pending |
| HVAC / Plumbing | ⏳ Queued | TX sweep pending |
| Personal injury / family law attorneys | ⏳ Queued | FL sweep pending |
| Construction companies | ✅ Active | Rotation 2 complete (16 leads) |
| Automotive businesses | ✅ Active | Rotation 2 complete (20 leads) |
| Landscaping companies | ✅ Active | Rotation 2 complete (20 leads) |
| Medical / clinics | 🚫 HOLD | HIPAA hold — do not target until compliance is confirmed |
| National enterprise (Compass, RE/MAX, KW, eXp) | 🚫 HOLD | Unrealistic cold targets |

## 5. Infrastructure Status (Honest)

| Capability | Status | Detail |
|------------|--------|--------|
| Product API | ✅ Live | buildmybot.app, HTTP 200, v2.0.0 |
| Inbound call handling | ✅ Deployed | Core product function |
| Outbound email/SMS | ❌ NOT WIRED | All sends are dry-run. No prospect has ever received an email from us. |
| Outbound calling (Vapi) | ⚠️ Wired, NOT APPROVED | Pending Don's ruling (escalation 2d73613c) |
| Payments (Stripe) | ❌ Test-mode only | No live subscriptions. Nothing is purchasable. |
| CRM integration | ❌ Not configured | CRM_WEBHOOK_URL not set |
| Lead research pipeline | ✅ Active | 185+ leads researched, 7 call-ready with verified phones |

## 6. Outreach Positioning (Mandatory Script)

All outreach — email, call, or content — must use this positioning:

> "We're inviting a small group of [industry] firms to an early demo of an AI phone assistant. There's no cost to join the demo waitlist, and we're not taking payments right now."

If asked what it does: "It's an AI assistant that can help answer inbound calls so you don't miss inquiries — but I'd rather show you in a short demo than describe it."

If asked about cost: "There's no cost to join the demo waitlist; we're not taking payments right now."

If asked about HIPAA, payments, integrations, or any specific capability: "I don't want to overpromise — that's exactly the kind of question the demo is for."

## 7. Escalation Triggers

Escalate to Don (human) before:
- Any live outbound call (Vapi approval required)
- Any live email/SMS send (infrastructure not wired)
- Any pricing discussion beyond "no cost for demo waitlist"
- Any medical/HIPAA vertical engagement
- Any enterprise or national-brand outreach

## 8. Document Control

- This file is the SINGLE SOURCE OF TRUTH for external-facing claims.
- If this file conflicts with any other document, THIS FILE WINS.
- Updates require COO authorship + engineering commit via PR.
- Next review: when outbound email or calling goes live (whichever comes first).
