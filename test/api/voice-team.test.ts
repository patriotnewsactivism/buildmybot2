// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  db: vi.fn(),
  request: vi.fn(),
  load: vi.fn(),
  preview: vi.fn(),
}));
vi.mock('../../api/sms/store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/sms/store.js')>()),
  authenticate: mocks.authenticate,
  db: mocks.db,
}));
vi.mock('../../api/voice/team-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/voice/team-store.js')>()),
  teamRequest: mocks.request,
  loadVoiceTeam: mocks.load,
}));
vi.mock('../../api/voice/team-preview.js', () => ({
  generateTeamPreview: mocks.preview,
}));
import { SmsError } from '../../api/sms/store';
import handler from '../../api/voice/team';
import { createDefaultVoiceTeam } from '../../shared/voice-team';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue({
    id: 'owner1',
    organizationId: 'org1',
    role: 'OWNER',
  });
  mocks.db.mockResolvedValue([
    { id: 'bot1', user_id: 'owner1', organization_id: 'org1' },
  ]);
  mocks.load.mockResolvedValue({
    config: createDefaultVoiceTeam(),
    revision: 0,
  });
  mocks.request.mockResolvedValue([{ bot_id: 'bot1' }]);
});
async function request(
  method: string,
  body?: unknown,
  url = '/api/voice/team?botId=bot1',
) {
  const res = {
    code: 200,
    body: undefined as unknown,
    setHeader: vi.fn(),
    status(code: number) {
      this.code = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      return this;
    },
  };
  await handler({ method, url, headers: {}, body } as never, res as never);
  return res;
}
it('requires authentication and never queries a bot for an anonymous request', async () => {
  mocks.authenticate.mockRejectedValue(
    new SmsError(401, 'Authentication required'),
  );
  expect((await request('GET')).code).toBe(401);
  expect(mocks.db).not.toHaveBeenCalled();
});
it('scopes ownership with both the live user and organization', async () => {
  expect((await request('GET')).code).toBe(200);
  expect(decodeURIComponent(mocks.db.mock.calls[0][0])).toContain(
    'user_id=eq.owner1',
  );
  expect(decodeURIComponent(mocks.db.mock.calls[0][0])).toContain(
    'organization_id=eq.org1',
  );
  mocks.db.mockResolvedValue([]);
  expect(
    (await request('PUT', { config: createDefaultVoiceTeam(), revision: 0 }))
      .code,
  ).toBe(404);
  expect(mocks.request).not.toHaveBeenCalled();
});
it('rejects duplicate voices before persistence', async () => {
  const config = createDefaultVoiceTeam();
  config.sales.voice.voiceId = 'Aoede';
  expect((await request('PUT', { config, revision: 0 })).code).toBe(400);
  expect(mocks.request).not.toHaveBeenCalled();
});
it('atomically saves a whole team with an optimistic revision check', async () => {
  const config = createDefaultVoiceTeam();
  expect((await request('PUT', { config, revision: 3 })).body).toEqual({
    config,
    revision: 4,
  });
  expect(decodeURIComponent(mocks.request.mock.calls[0][0])).toContain(
    'revision=eq.3',
  );
  expect(JSON.parse(mocks.request.mock.calls[0][1].body).revision).toBe(4);
  mocks.request.mockResolvedValue([]);
  expect((await request('PUT', { config, revision: 3 })).code).toBe(409);
});
it('does not invoke preview billing for another tenant', async () => {
  mocks.db.mockResolvedValue([]);
  expect(
    (
      await request(
        'POST',
        createDefaultVoiceTeam().sales,
        '/api/voice/team/preview?botId=other',
      )
    ).code,
  ).toBe(404);
  expect(mocks.preview).not.toHaveBeenCalled();
});
