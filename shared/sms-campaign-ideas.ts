import type { SmsProgram } from './sms';

export interface CampaignIdea {
  id: string;
  title: string;
  audience: string;
  image: string;
  keyword: string;
  goal: string;
  placement: string;
  followUp: string;
  measure: string;
  steps: Array<{ from: 'customer' | 'business'; text: string }>;
  draft: Partial<SmsProgram>;
}

/** Demonstrations only. Offers must be edited and approved by the business. */
export const CAMPAIGN_IDEAS: CampaignIdea[] = [
  {
    id: 'boutique', title: 'Turn browsing into repeat visits', audience: 'Boutiques',
    image: '/sms-signs/urban-bloom-boutique.jpg', keyword: 'BLOOM',
    goal: 'A gift-card drawing gives shoppers a reason to start a conversation.',
    placement: 'Window display, fitting-room mirror, shopping bag insert.',
    followUp: 'Ask separately whether entrants want new-arrival alerts. Create a new contest for each drawing period.',
    measure: 'Eligible entries, separate marketing opt-ins, return visits and redemptions.',
    steps: [
      { from: 'customer', text: 'BLOOM' },
      { from: 'business', text: 'Urban Bloom: your entry is recorded for this drawing. No purchase necessary. See eligibility, closing date and rules on our entry page. HELP for help; STOP to stop.' },
      { from: 'business', text: 'Want new-arrival offers too? Choose the separate, optional marketing opt-in on our signup page. Entering does not subscribe you to promotions.' },
    ],
    draft: { name: 'Gift-card drawing', kind: 'contest', keyword: 'BLOOM', status: 'draft', text: '{{business}}: your entry is recorded. See our official rules and closing date on the entry page. HELP for help; STOP to stop.', prize: '', eligibility: '', winnerCount: 1, winnerText: '{{business}}: you have been selected in our drawing. Reply here for the approved prize-claim instructions. STOP to stop.' },
  },
  {
    id: 'coffee', title: 'Make the first cup a habit', audience: 'Coffee shops',
    image: '/sms-signs/main-street-coffee.jpg', keyword: 'COFFEE',
    goal: 'An approved welcome reward starts a local VIP club.',
    placement: 'Order counter, takeaway cup sleeve, receipt and table tent.',
    followUp: 'Send an opt-in-only midweek special during a quiet period. Offer a separate birthday club signup.',
    measure: 'Welcome-offer redemptions and repeat purchases within 30 days.',
    steps: [
      { from: 'customer', text: 'COFFEE' },
      { from: 'business', text: 'Main Street Coffee: welcome! Show this example reward at the counter after the team confirms the offer terms. Reply STOP to stop; HELP for help.' },
      { from: 'customer', text: 'What time do you close?' },
      { from: 'business', text: 'With AI replies enabled, your published business hours supply the answer. If hours are missing, the question goes to your team.' },
    ],
    draft: { name: 'Coffee club welcome', kind: 'keyword', keyword: 'COFFEE', status: 'draft', text: '{{business}}: thanks for joining our coffee club. Reply here to ask about our current welcome offer. HELP for help; STOP to stop.' },
  },
  {
    id: 'medspa', title: 'Turn interest into a consultation', audience: 'Med spas',
    image: '/sms-signs/glow-med-spa.jpg', keyword: 'GLOW',
    goal: 'A business-approved first-visit offer opens a conversation about booking.',
    placement: 'Reception, social story, website signup and partner salon.',
    followUp: 'Share the published booking link. Request separate reminder consent, then schedule reminders 24 hours and 2 hours before the appointment.',
    measure: 'Consultations booked, attended appointments and offer redemptions.',
    steps: [
      { from: 'customer', text: 'GLOW' },
      { from: 'business', text: 'Glow: thanks for your interest! Our team can confirm the first-visit offer and help you book. HELP for help; STOP to stop.' },
      { from: 'customer', text: 'Can someone call me?' },
      { from: 'business', text: 'A team member takes over the conversation. With a connected voice subscription, customers can also call the same business number.' },
    ],
    draft: { name: 'First-visit enquiry', kind: 'keyword', keyword: 'GLOW', status: 'draft', text: '{{business}}: thanks for your interest in a first visit. Reply here for booking help and current offer terms. HELP for help; STOP to stop.' },
  },
  {
    id: 'pizza', title: 'Fill a slower dinner service', audience: 'Restaurants',
    image: '/sms-signs/bella-slice-pizza.jpg', keyword: 'PIZZA',
    goal: 'A welcome appetizer introduces the club; timely offers bring guests back.',
    placement: 'Takeout box, menu, counter sign and delivery insert.',
    followUp: 'Send one relevant, consented dinner offer before the rush. Invite members to a birthday club for an annual greeting.',
    measure: 'Redemptions, average order value and visits on the promoted day.',
    steps: [
      { from: 'customer', text: 'PIZZA' },
      { from: 'business', text: 'Bella Slice: welcome to the club! Ask our team for the current appetizer offer and terms. HELP for help; STOP to stop.' },
      { from: 'customer', text: 'STOP' },
      { from: 'business', text: 'You have unsubscribed. Promotional texts and automated follow-ups stop.' },
    ],
    draft: { name: 'Pizza club welcome', kind: 'keyword', keyword: 'PIZZA', status: 'draft', text: '{{business}}: welcome to our pizza club! Reply here for our current welcome offer and terms. HELP for help; STOP to stop.' },
  },
];

export function campaignDraft(idea: CampaignIdea): Partial<SmsProgram> {
  // Do not copy the poster number, fictional reward, audience or activation state.
  return { ...idea.draft, status: 'draft', steps: [], audienceTags: [] };
}
