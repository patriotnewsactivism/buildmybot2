import { describe, expect, it } from 'vitest';
import {
  createDefaultVoiceTeam,
  destinationDepartment,
  handoffContextText,
  voiceTeamSchema,
} from '../shared/voice-team';
describe('Voice Team constraints', () => {
  it('requires four distinct names, roles and provider-supported voices', () => {
    const team = createDefaultVoiceTeam();
    expect(voiceTeamSchema.safeParse(team).success).toBe(true);
    team.sales.voice.voiceId = team.receptionist.voice.voiceId;
    const result = voiceTeamSchema.safeParse(team);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].message).toContain('Receptionist');
    team.sales.voice.voiceId = 'Puck';
    team.sales.name = 'Ava Brooks';
    expect(voiceTeamSchema.safeParse(team).success).toBe(false);
  });
  it('rejects invalid providers, missing roles and role impersonation', () => {
    const team = createDefaultVoiceTeam();
    expect(
      voiceTeamSchema.safeParse({ ...team, manager: undefined }).success,
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
        sales: { ...team.sales, voice: { provider: 'vapi', voiceId: 'Puck' } },
      }).success,
    ).toBe(false);
  });
  it('keeps legacy admin routing compatible with Manager', () => {
    expect(destinationDepartment('admin')).toBe('manager');
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
    expect(team.receptionist.name).toMatch(/Ava/);
    expect(team.sales.name).toMatch(/Marcus/);
    expect(team.support.name).toMatch(/Sophie/);
    expect(team.manager.name).toMatch(/Daniel/);
  });
});
