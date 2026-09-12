/**
 * Speakable department knowledge for Deepgram voice handoffs.
 * Facts must stay aligned with constants.ts / careers + partner landing copy.
 * Keep identity/style in voice-team personas; put durable Q&A facts here.
 */

export const VOICE_RECRUITING_KNOWLEDGE = `Sales Agent careers knowledge (speak accurately; never invent rates or guaranteed income):
Role: BuildMyBot is hiring commission-only remote Sales Agents — not salaried or in-office roles right now. Agents own the full sales cycle for AI chatbot / voice products that businesses buy on monthly plans.
Commission tiers on active client accounts (recurring monthly residuals):
- Bronze: 0–49 accounts → 20%
- Silver: 50–149 → 30%
- Gold: 150–250 → 40%
- Platinum: 251+ → 50%
One-time services commission is typically 25% regardless of tier. Addon commissions match the agent's current tier. Annual upsells can carry a small bonus when published.
Residual framing (illustrative, not a promise): depending on the plan sold, residuals often land roughly in the $50–$250+ per closed client per month range; actual payouts depend on the client's plan and active status. Never guarantee earnings.
Progression: strong agents can grow into full Partner status (see partner program) as book of business scales.
What we provide: partner dashboard, marketing materials, referral tracking, turnkey demo bots, and tier perks (co-branded pages, strategy calls, dedicated manager at higher tiers).
Fit: self-starters with consultative sales mindset, clear follow-up discipline; SaaS or digital-services experience is a plus. Remote and flexible.
Next steps: direct serious candidates to sign up at buildmybot.app/reseller, or email careers@buildmybot.app for onboarding details. Collect name, background, target market, and earning goals before ending.
Objections:
- "Is this a real job / W2?" → Commission-only independent sales role focused on residuals; be clear it is not a salaried W2 hire.
- "Do you train me?" → We provide materials, demos, and dashboard tools; success still depends on their outbound and follow-up.
- "When do I get paid?" → Residuals on active subscribed accounts on the published commission schedule — do not invent payout dates if unsure; offer to follow up in writing.
Route agency white-label / $499 Partner Access / building a sub-agent force to Julian (partner). Route product pricing for a business buying bots for itself to Marcus (sales).`;

export const VOICE_PARTNER_KNOWLEDGE = `Partner Program & white-label knowledge (speak accurately; never invent fees or ROI guarantees):
Offer: Partner Access is $499 per month (billed every 30 days, net 30). It grants immediate partner economics: 50% revenue split on new accounts created after enrollment. Existing accounts keep their prior commission rate. Partners can skip climbing the sales-agent tier ladder for new-book economics.
White-label: optional — run under your own brand, custom domain, logo, and white-label dashboard, or keep the BuildMyBot brand. Partners can build a national / multi-rep sales motion with client bot deployment and flexible client pricing within program rules.
Simple economics talk track (illustrative, not a guarantee): closing about 1–2 bot sales per month can cover the $499 fee and leave net recurring margin, especially with high retention — emphasize residuals and retention, never promise specific client volume.
Who it is for: agency owners, consultants, lead-gen firms, and sales leaders who want recurring software revenue without building the platform.
Value props: new MRR without engineering, fast demos, you keep the client relationship, we run infrastructure.
Onboarding checklist (high level): confirm brand + domain, upload logo/colors, configure lead capture, launch one flagship bot, install and test, add a first client pilot.
Sales motion to coach: pick a niche → discover lead-capture gaps → demo → low-risk pilot → review in 7–14 days → convert and expand.
Packaging guidance for their clients: keep 2–3 packages (Starter / Growth / Pro-style) priced on outcomes, not feature laundry lists.
Signup: buildmybot.app/partners. Offer a partner onboarding session for serious fits. Collect name, company, current client base, and whether they want white-label vs BuildMyBot-branded.
Objections:
- "We already use a chatbot." → BuildMyBot can replace or complement with lead capture + follow-up; offer a short pilot.
- "We're not technical." → No-code setup; we handle the hard infrastructure.
- "We need proof." → Suggest a short pilot and review real results before a long commitment.
- Fee sticker shock → Walk the cover-the-fee math with 1–2 sales and residual retention; do not invent case-study numbers not in your brief.
Route individual employment / becoming a solo sales agent to Jordan (recruiting). Route an end business that just wants to buy a bot for itself to Marcus (sales).`;

export function departmentKnowledge(
  department: 'receptionist' | 'sales' | 'support' | 'manager' | 'recruiting' | 'partner',
): string {
  if (department === 'recruiting') return VOICE_RECRUITING_KNOWLEDGE;
  if (department === 'partner') return VOICE_PARTNER_KNOWLEDGE;
  return '';
}
