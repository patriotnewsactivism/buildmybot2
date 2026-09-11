// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequest, ApiResponse } from '../../api/lib/http-types.js';

const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  auth: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('../../api/sms/store.js', async (original) => ({
  ...(await original<typeof import('../../api/sms/store.js')>()),
  db: mocks.db,
  authenticate: mocks.auth,
}));

import { CORPORATE } from '../../api/phone/corporate-config';
import handler from '../../api/phone/recording';

function mockRes() {
  const r = {
    code: 200,
    headers: {} as Record<string, string>,
    body: null as unknown,
    setHeader(k: string, v: string) {
      r.headers[k.toLowerCase()] = v;
      return r;
    },
    status(n: number) {
      r.code = n;
      return r;
    },
    json(b: unknown) {
      r.body = b;
      return r;
    },
    send(b: unknown) {
      r.body = b;
      return r;
    },
    end() {
      return r;
    },
  };
  return r;
}

function mockReq(url = '/api/phone/recording', method = 'GET') {
  return {
    url,
    method,
    headers: {},
  } as unknown as ApiRequest;
}

describe('GET /api/phone/recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    process.env.TELNYX_API_KEY = 'test-telnyx-key';
  });

  it('rejects non-GET requests with 405', async () => {
    const req = mockReq('/api/phone/recording', 'POST');
    const res = mockRes();
    await handler(req, res as unknown as ApiResponse);
    expect(res.code).toBe(405);
  });

  it('rejects missing callId/callSid with 400', async () => {
    mocks.auth.mockResolvedValue({ id: 'user-1' });
    const req = mockReq('/api/phone/recording', 'GET');
    const res = mockRes();
    await handler(req, res as unknown as ApiResponse);
    expect(res.code).toBe(400);
    expect(res.body).toEqual({
      error: 'Missing required callId or callSid query parameter',
    });
  });

  it('enforces tenant isolation and returns 403 for unauthorized users', async () => {
    mocks.auth.mockResolvedValue({ id: 'attacker', organizationId: 'org-bad' });
    mocks.db.mockResolvedValue([
      {
        id: '123',
        bot_id: 'bot-1',
        user_id: 'legit-user',
        organization_id: 'org-good',
        call_sid: 'sid-1',
        recording_url: 'https://storage.telnyx.com/recordings/test.mp3',
      },
    ]);

    const req = mockReq('/api/phone/recording?callId=123', 'GET');
    const res = mockRes();
    await handler(req, res as unknown as ApiResponse);
    expect(res.code).toBe(403);
  });

  it('redirects (302) to public S3 recording URLs for authorized user', async () => {
    mocks.auth.mockResolvedValue({ id: 'user-1' });
    mocks.db.mockResolvedValue([
      {
        id: '123',
        bot_id: 'bot-1',
        user_id: 'user-1',
        organization_id: null,
        call_sid: 'sid-1',
        recording_url: 'https://s3.amazonaws.com/telnyx-recordings/test.mp3',
      },
    ]);

    const req = mockReq('/api/phone/recording?callId=123', 'GET');
    const res = mockRes();
    await handler(req, res as unknown as ApiResponse);

    expect(res.code).toBe(302);
    expect(res.headers.location).toBe(
      'https://s3.amazonaws.com/telnyx-recordings/test.mp3',
    );
  });

  it('allows corporate owner to access corporate calls and proxies api.telnyx.com audio', async () => {
    mocks.auth.mockResolvedValue({ id: CORPORATE.ownerId, role: 'OWNER' });
    mocks.db.mockResolvedValue([
      {
        id: '456',
        bot_id: CORPORATE.botId,
        user_id: CORPORATE.ownerId,
        organization_id: null,
        call_sid: 'sid-corp',
        recording_url: 'https://api.telnyx.com/v2/recordings/rec-1/file',
      },
    ]);

    const fakeAudio = Buffer.from('fake-mp3-audio-bytes');
    const fakeArrayBuffer = fakeAudio.buffer.slice(
      fakeAudio.byteOffset,
      fakeAudio.byteOffset + fakeAudio.byteLength,
    );
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'audio/mpeg',
        'content-length': String(fakeAudio.length),
      }),
      arrayBuffer: async () => fakeArrayBuffer,
    });

    const req = mockReq('/api/phone/recording?callId=456', 'GET');
    const res = mockRes();
    await handler(req, res as unknown as ApiResponse);

    expect(res.headers['content-type']).toBe('audio/mpeg');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://api.telnyx.com/v2/recordings/rec-1/file',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-telnyx-key' },
      }),
    );
    expect(res.body).toEqual(fakeAudio);
  });
});
