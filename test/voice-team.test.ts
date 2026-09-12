import { describe, expect, it } from 'vitest';
import {
  VOICE_BILLING_KNOWLEDGE,
  VOICE_PARTNER_KNOWLEDGE,
  VOICE_RECRUITING_KNOWLEDGE,
  VOICE_SALES_KNOWLEDGE,
  departmentKnowledge,
} from '../shared/voice-department-knowledge';
import {
  createDefaultVoiceTeam,
  destinationDepartment,
  handoffContextText,
  voiceTeamSchema,
} from '../shared/voice-team';
describe('Voice Team constraints', () => {
  it('requires seven distinct names, roles and provider-supported voices', () => {
    const team = createDefaultVoiceTeam();
    expect(voiceTeamSchema.safeParse(team).success).toBe(true);
    team.sales.voice.voiceId = team.receptionist.voice.voiceId;
    const result = voiceTeamSchema.safeParse(team);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].message).toContain('Receptionist');
    team.sales.voice.voiceId = 'Puck';
    team.sales.name = 'Avery';
    expect(voiceTeamSchema.safeParse(team).success).toBe(false);

    const voiceIds = Object.values(createDefaultVoiceTeam()).map(
      (a) => a.voice.voiceId,
    );
    expect(new Set(voiceIds).size).toBe(7);
    expect(voiceIds).toEqual([
      'Aoede',
      'Puck',
      'Kore',
      'Charon',
      'Zephyr',
      'Orus',
      'Leda',
    ]);
  });
  it('rejects invalid providers, missing roles and role impersonation', () => {
    const team = createDefaultVoiceTeam();
    expect(
      voiceTeamSchema.safeParse({ ...team, manager: undefined }).success,
    ).toBe(false);
    expect(
      voiceTeamSchema.safeParse({ ...team, recruiting: undefined }).success,
    ).toBe(false);
    expect(
      voiceTeamSchema.safeParse({ ...team, partner: undefined }).success,
    ).toBe(false);
    expect(
      voiceTeamSchema.safeParse({ ...team, billing: undefined }).success,
    ).toBe(false);
    expect(
      voiceTeamSchema.safeParse({
        ...team,
        sales: { ...team.sales, department: 'receptionist' },
      }).success,
    ).toBe(false);
    expect(
      voiceTeamSchema.safeParse({
        ...team,
        recruiting: { ...team.recruiting, department: 'partner' },
      }).success,
    ).toBe(false);
    expect(
      voiceTeamSchema.safeParse({
        ...team,
        sales: { ...team.sales, voice: { provider: 'vapi', voiceId: 'Puck' } },
      }).success,
    ).toBe(false);
  });
  it('keeps legacy admin routing and routes career and partner aliases', () => {
    expect(destinationDepartment('admin')).toBe('manager');
    expect(destinationDepartment('careers')).toBe('recruiting');
    expect(destinationDepartment('hr')).toBe('recruiting');
    expect(destinationDepartment('recruitment')).toBe('recruiting');
    expect(destinationDepartment('sales_recruiting')).toBe('recruiting');
    expect(destinationDepartment('recruiting')).toBe('recruiting');
    expect(destinationDepartment('partner')).toBe('partner');
    expect(destinationDepartment('partnerships')).toBe('partner');
    expect(destinationDepartment('white_label')).toBe('partner');
    expect(destinationDepartment('reseller')).toBe('partner');
    expect(destinationDepartment('billing')).toBe('billing');
    expect(destinationDepartment('accounting')).toBe('billing');
    expect(destinationDepartment('invoices')).toBe('billing');
    expect(destinationDepartment('customer_care')).toBe('support');
    expect(destinationDepartment('unknown')).toBeNull();
  });
  it('bounds shared context and preserves the most recent conversation', () => {
    const transcript = Array.from({ length: 100 }, (_, i) => ({
      role: 'caller' as const,
      text: `${i}: ${'x'.repeat(1000)}`,
      at: 'now',
    }));
    const serialized = handoffContextText({
      callerNumber: '+12025550123',
      callerName: 'Jordan',
      company: 'Acme',
      summary: 'Needs help',
      transcript,
    });
    const shared = JSON.parse(serialized);
    expect(shared.callerName).toBe('Jordan');
    expect(shared.transcript.at(-1).text).toContain('99:');
    expect(serialized.length).toBeLessThan(15000);
    expect(shared.voice).toBeUndefined();
    expect(shared.persona).toBeUndefined();
  });
  it('never discloses AI identity in default staff names or openings', () => {
    const team = createDefaultVoiceTeam();
    const blob = JSON.stringify(team).toLowerCase();
    for (const needle of [
      'ai receptionist',
      'ai sales',
      'ai support',
      'ai customer',
      'virtual assistant',
      "i'm an ai",
      'i am an ai',
    ]) {
      expect(blob).not.toContain(needle);
    }
    expect(team.receptionist.name).toMatch(/Avery/);
    expect(team.sales.name).toMatch(/Marcus/);
    expect(team.support.name).toMatch(/Sophie/);
    expect(team.manager.name).toMatch(/Daniel/);
    expect(team.recruiting.name).toMatch(/Jordan/);
    expect(team.partner.name).toMatch(/Julian/);
    expect(team.billing.name).toMatch(/Helen/);

    // Verify recruiting talking points
    expect(team.recruiting.persona).toContain('recurring commissions');
    expect(team.recruiting.persona).toContain('20%');
    expect(team.recruiting.persona).toContain('50%');
    expect(team.recruiting.persona).toContain('Partner');

    // Verify partner talking points
    expect(team.partner.persona).toContain('$499/month');
    expect(team.partner.persona).toContain('white-label');
    expect(team.partner.persona).toContain('national sales force');
    expect(team.partner.persona).toContain('1 or 2 bot sales');
  });
  it('generates dynamic time-of-day greetings for Avery in receptionist role', async () => {
    const { getTimeOfDayGreeting, getReceptionistGreeting } = await import(
      '../shared/voice-team'
    );
    // Morning: 09:00 Central (14:00 UTC)
    const morning = new Date('2026-09-11T14:00:00Z');
    expect(getTimeOfDayGreeting(morning, 'America/Chicago')).toBe(
      'Good morning',
    );
    expect(getReceptionistGreeting(morning, 'America/Chicago')).toBe(
      'Good morning, thank you for calling BuildMyBot, my name is Avery how can I help you.',
    );

    // Afternoon: 14:00 Central (19:00 UTC)
    const afternoon = new Date('2026-09-11T19:00:00Z');
    expect(getTimeOfDayGreeting(afternoon, 'America/Chicago')).toBe(
      'Good afternoon',
    );
    expect(getReceptionistGreeting(afternoon, 'America/Chicago')).toBe(
      'Good afternoon, thank you for calling BuildMyBot, my name is Avery how can I help you.',
    );

    // Evening: 19:00 Central (00:00 UTC next day)
    const evening = new Date('2026-09-12T00:00:00Z');
    expect(getTimeOfDayGreeting(evening, 'America/Chicago')).toBe(
      'Good evening',
    );
    expect(getReceptionistGreeting(evening, 'America/Chicago')).toBe(
      'Good evening, thank you for calling BuildMyBot, my name is Avery how can I help you.',
    );
  });

  it('exposes fully flushed recruiting, partner, sales, and billing knowledge', () => {
    expect(departmentKnowledge('recruiting')).toBe(VOICE_RECRUITING_KNOWLEDGE);
    expect(departmentKnowledge('partner')).toBe(VOICE_PARTNER_KNOWLEDGE);
    expect(departmentKnowledge('sales')).toBe(VOICE_SALES_KNOWLEDGE);
    expect(departmentKnowledge('billing')).toBe(VOICE_BILLING_KNOWLEDGE);
    expect(VOICE_RECRUITING_KNOWLEDGE).toContain('Bronze');
    expect(VOICE_RECRUITING_KNOWLEDGE).toContain('buildmybot.app/reseller');
    expect(VOICE_RECRUITING_KNOWLEDGE).toContain('careers@buildmybot.app');
    expect(VOICE_RECRUITING_KNOWLEDGE).toContain('commission-only');
    expect(VOICE_PARTNER_KNOWLEDGE).toContain('$499');
    expect(VOICE_PARTNER_KNOWLEDGE).toContain('white-label');
    expect(VOICE_PARTNER_KNOWLEDGE).toContain('buildmybot.app/partners');
    expect(VOICE_PARTNER_KNOWLEDGE).toContain('50%');
  });
});
