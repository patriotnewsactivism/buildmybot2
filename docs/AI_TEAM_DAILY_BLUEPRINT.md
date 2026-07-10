# BuildMyBot AI Team — Daily Operating Blueprint

Org chart: **President (Don)** ← **Marcus (Manager)** ← Department Leads (Victoria, Derek, Hannah, Brianna) ← Individual Contributors (Sam, Eli, Maya, Oscar, Piper, Sales Agents 1-5, HR/Billing Associates)

Purpose: give every AI employee a repeatable, timed daily script so output is consistent instead of random/on-demand. All times are America/Chicago. Each block below can become a scheduled workflow (cron) that fires an `invoke_superagent_step` or backend function.

---

## Sam — Customer Support Agent
Reports to: Marcus (direct, no dept lead over support yet)
North star: first-response time + resolution rate

- **7:00a** — Pull overnight `support@` inbox + open tickets. Triage by urgency (bug/billing/question).
- **7:30a–11:30a** — Respond to all new tickets/emails within SLA (target: <2h response). Escalate anything technical to Eli, anything billing to Brianna.
- **12:00p** — Midday sweep: check for unanswered tickets aging past 4h, bump priority.
- **1:00p–4:30p** — Continue responding; log recurring issues/questions worth a FAQ or product fix (flag to Piper).
- **4:30p** — Send Marcus a 3-bullet summary: tickets handled, open/urgent items, anything on fire.

## Eli — Engineering Agent
Reports to: Marcus
North star: uptime + deploy health

- **7:00a** — Check bot health dashboard, error logs, and overnight deploy status.
- **8:00a** — Review any support tickets Sam escalated overnight; triage severity.
- **9:00a–12:00p** — Monitor active deployments, check GitHub issues/PRs needing review, flag [CRITICAL] anything breaking production.
- **1:00p–4:00p** — Deep-dive one recurring technical issue or tech-debt item; document findings.
- **4:30p** — Send Marcus a technical status summary (systems green/yellow/red, any critical flags).

## Maya — Marketing Agent
Reports to: Marcus
North star: content shipped + engagement

- **8:00a** — Review yesterday's post/campaign performance.
- **9:00a–11:00a** — Draft the day's content (social post, blog draft, or email copy) per the content calendar.
- **11:00a** — Send draft for a quick self-review pass against brand voice checklist.
- **1:00p–3:00p** — Batch-produce next day/week's content queue so nothing is same-day scrambled.
- **3:30p** — Check in with Derek/sales team on any case studies or wins worth turning into content.
- **4:30p** — Send Marcus a status: content published, content queued, any campaign ideas needing sign-off.

## Oscar — Operations Agent
Reports to: Marcus
North star: system-wide operational visibility

- **7:00a** — Pull usage stats, system health, and account metrics across the platform.
- **8:00a** — Run the "team standup" — pull a one-line status from Sam, Eli, Maya, Piper (via their EOD logs from the prior day) into one ops digest.
- **9:00a–12:00p** — Monitor for anomalies (usage spikes, failed jobs, integration errors) and flag owners.
- **1:00p–3:00p** — Update the ops dashboard / weekly trend tracking.
- **4:30p** — Send Marcus the daily ops digest (system health + team standup rollup).

## Piper — Product Agent
Reports to: Marcus
North star: roadmap clarity + feedback loop closed

- **8:00a** — Review new user feedback, support tickets flagged by Sam, and feature requests.
- **9:00a–11:00a** — Turn the week's feedback into 1-3 prioritized feature ideas or specs (user story + acceptance criteria).
- **1:00p–3:00p** — Update the product roadmap doc; note anything blocked or needing a decision.
- **3:30p** — Sync with Eli on technical feasibility of anything new on the roadmap.
- **4:30p** — Send Marcus a product status: what shipped, what's next, what needs a decision.

---

## Victoria — VP of Sales
Reports to: Marcus (and directly informs Don on major misses)
North star: pipeline health + team performance

- **7:30a** — Review Derek's prior-day sales digest and pipeline dashboard.
- **8:30a** — Set/confirm the day's targets and priorities for the sales org with Derek.
- **11:00a** — Mid-morning pipeline check: any deals stuck or hot leads going cold.
- **2:00p** — Review outreach volume/quality across the 5 sales agents; coach on gaps.
- **4:30p** — Send Marcus (and Don, if a target was missed) an honest performance summary + next action.

## Derek — Sales Director
Reports to: Victoria
North star: outreach volume + demo bookings

- **7:00a** — Pull overnight lead activity + the automated 48h stale-lead follow-up run (sendLeadFollowups) results.
- **8:00a** — Assign/confirm the day's outreach queue across Sales Agents 1-5.
- **9:00a–12:00p** — Monitor agent outreach in real time; jump in on any high-value lead personally.
- **1:00p–3:00p** — Follow up on demos booked yesterday; check for replies needing a human-quality response.
- **4:00p** — Compile the daily sales digest: outreach sent, replies, hot leads, demos booked.
- **4:30p** — Send digest to Victoria.

## Sales Agents 1-5
Reports to: Derek
North star: outreach sent + replies generated

- **8:00a** — Receive the day's assigned lead batch from Derek.
- **9:00a–12:00p** — Send outreach/follow-up emails to assigned leads (warm, concise, demo-focused).
- **1:00p–4:00p** — Monitor for replies; respond same-day, always pushing toward a booked demo.
- **4:00p** — Log results (sent/opened/replied/booked) to Derek for the daily digest.

---

## Hannah — HR Lead
Reports to: Marcus
North star: team roster health

- **8:00a** — Check each AI employee's status (active/paused/overloaded) via task logs.
- **9:00a** — Flag anyone stuck, erroring repeatedly, or under/over-utilized.
- **10:00a–12:00p** — Handle any onboarding docs needed for new roles/agents.
- **2:00p** — Brief check-in note on team wellbeing/health (even the AI kind — cadence, error rates, response times).
- **4:30p** — Send Marcus a short HR status + encouraging note.

## HR Associate
Reports to: Hannah

- **9:00a–12:00p** — Maintain onboarding documentation, keep role instructions/playbooks current.
- **1:00p–3:00p** — Support Hannah with any roster coordination tasks.
- **3:30p** — Status update to Hannah.

---

## Brianna — Billing Lead
Reports to: Marcus
North star: revenue/subscription health

- **7:30a** — Pull overnight billing events: new subs, failed payments, cancellations.
- **8:30a** — Chase any failed payments / dunning follow-ups for the day.
- **10:00a–12:00p** — Review subscription health metrics (MRR, churn signals).
- **1:00p–3:00p** — Handle invoice follow-ups and billing-related support escalations from Sam.
- **4:30p** — Send Marcus a revenue/billing health check.

## Billing Associate
Reports to: Brianna

- **9:00a–12:00p** — Process invoice follow-ups and billing admin tasks.
- **1:00p–3:00p** — Support Brianna with dunning/failed-payment outreach.
- **3:30p** — Status update to Brianna.

---

## Marcus — Manager (Executive Rollup)
Reports to: Don (President)
North star: one clear daily signal, no surprises

- **5:00p** — Collect all EOD summaries (Sam, Eli, Maya, Oscar, Piper, Victoria, Hannah, Brianna).
- **5:15p** — Write ONE prioritized executive summary: what happened, what needs a decision, what's on fire.
- **5:30p** — Send the Daily Executive Summary to Don.

---

## Implementation Notes
- Each timed block above maps cleanly to a scheduled workflow (cron trigger) calling either a backend function (data pulls, email sends) or an `invoke_superagent_step` (judgment/writing tasks).
- Suggested build order for max ROI first: (1) Marcus's 5:30p exec rollup — gives Don one daily signal immediately, (2) Derek's sales digest — already partially live via the Lead Follow-Up workflow, (3) Sam's ticket triage, (4) the rest.
- Currently only one of these is live as an actual workflow: the 6-hourly stale-lead follow-up (feeds Derek's digest). Everything else described above is a blueprint, not yet automated — happy to wire these up as real scheduled workflows one at a time.
