import {
  type VoiceTeam,
  createDefaultVoiceTeam,
  voiceTeamSchema,
} from '../../shared/voice-team.js';

export interface VoiceTeamRecord {
  config: VoiceTeam;
  revision: number;
}
export class VoiceTeamStoreError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function teamRequest(
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new VoiceTeamStoreError(503, 'Voice Team storage is unavailable.');
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    signal: AbortSignal.timeout(5000),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    if (response.status === 409)
      throw new VoiceTeamStoreError(
        409,
        'This team was changed elsewhere. Reload it before saving.',
      );
    if (detail.code === '42P01' || detail.code === 'PGRST205')
      throw new VoiceTeamStoreError(
        503,
        'Voice Team storage needs its database migration.',
      );
    throw new VoiceTeamStoreError(503, 'Voice Team storage is unavailable.');
  }
  return response.json();
}
export async function loadVoiceTeam(
  botId: string,
  organizationId: string | null,
  userId: string | null,
): Promise<VoiceTeamRecord> {
  const params = new URLSearchParams({
    bot_id: `eq.${botId}`,
    user_id: `eq.${userId || ''}`,
    organization_id: organizationId ? `eq.${organizationId}` : 'is.null',
    select: 'config,revision',
    limit: '1',
  });
  const rows = (await teamRequest(
    `voice_teams?${params}`,
  )) as VoiceTeamRecord[];
  if (!rows.length) return { config: createDefaultVoiceTeam(), revision: 0 };
  return {
    config: voiceTeamSchema.parse(rows[0].config),
    revision: rows[0].revision,
  };
}
