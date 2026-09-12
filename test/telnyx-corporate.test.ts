// @vitest-environment node
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  answer: vi.fn(),
  speak: vi.fn(),
  hangup: vi.fn(),
  startRecording: vi.fn().mockResolvedValue({ recordingId: 'corp-rec' }),
  startMediaStream: vi.fn().mockResolvedValue(undefined),
  telnyx: vi.fn(),
  db: vi.fn(),
  auth: vi.fn(),
}));
vi.mock('../api/lib/telephony-provider.js', () => ({
  answerCall: mocks.answer,
  speakText: mocks.speak,
  hangupCall: mocks.hangup,
  startRecording: mocks.startRecording,
  startMediaStream: mocks.startMediaStream,
  telnyxRequest: mocks.telnyx,
}));
vi.mock('../api/sms/store.js', async (original) => ({
  ...(await original<typeof import('../api/sms/store.js')>()),
  db: mocks.db,
  authenticate: mocks.auth,
}));
vi.mock('../api/phone/corporate-sms.js', () => ({
  receiveCorporateSms: vi.fn(),
}));
import corporate, { handleCorporateAnswered } from '../api/phone/corporate';
import { CORPORATE } from '../api/phone/corporate-config';
import { corporateStatus } from '../api/phone/corporate-setup';
import inbound from '../api/phone/tenant-telnyx';
function response() {
  const r = {
    code: 200,
    body: null as unknown,
    setHeader: vi.fn(),
    status(n: number) {
      r.code = n;
      return r;
    },
    json(b: unknown) {
      r.body = b;
      return r;
    },
  };
  return r;
}
function request(path: string, body: unknown = {}, method = 'POST') {
  return { url: path, method, headers: {}, body } as never;
}
beforeEach(() => {
  vi.clearAllMocks();
  corporateStatus.voiceConfigured = true;
  process.env.TELNYX_CONNECTION_ID = 'test-connection';
  process.env.TELNYX_API_KEY = 'test-telnyx-key';
  mocks.auth.mockResolvedValue({ id: CORPORATE.ownerId, role: 'OWNER' });
});
describe('corporate outbound approvals', () => {
  it('rejects another admin without dialing or reading calls', async () => {
    mocks.auth.mockResolvedValue({ id: 'another-owner', role: 'OWNER' });
    const res = response();
    await corporate(request('/api/corporate-phone/calls'), res as never);
    expect(res.code).toBe(403);
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.telnyx).not.toHaveBeenCalled();
  });
  it('creates a request without dialing', async () => {
    mocks.db.mockResolvedValue([{ id: 5 }]);
    const res = response();
    await corporate(
      request('/api/corporate-phone/calls', {
        phone: '+12025550123',
        objective: 'Requested demonstration',
      }),
      res as never,
    );
    expect(res.code).toBe(201);
    expect(mocks.db.mock.calls[0][2].status).toBe('awaiting_approval');
    expect(mocks.telnyx).not.toHaveBeenCalled();
  });
  it('requires exact destination approval', async () => {
    mocks.db.mockResolvedValue([
      {
        id: 5,
        called_number: '+12025550123',
        metadata: {},
        created_at: new Date().toISOString(),
      },
    ]);
    const res = response();
    await corporate(
      request('/api/corporate-phone/calls/5/approve', {
        confirmPhone: '+12025550999',
      }),
      res as never,
    );
    expect(res.code).toBe(400);
    expect(mocks.telnyx).not.toHaveBeenCalled();
  });
  it('only dials after winning the atomic approval claim', async () => {
    mocks.db
      .mockResolvedValueOnce([
        {
          id: 5,
          called_number: '+12025550123',
          metadata: { objective: 'Demo' },
          created_at: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce([]);
    const res = response();
    await corporate(
      request('/api/corporate-phone/calls/5/approve', {
        confirmPhone: '+12025550123',
      }),
      res as never,
    );
    expect(res.code).toBe(409);
    expect(mocks.telnyx).not.toHaveBeenCalled();
  });
  it('holds ambiguous dispatch without a second provider attempt', async () => {
    mocks.db
      .mockResolvedValueOnce([
        {
          id: 5,
          called_number: '+12025550123',
          metadata: { objective: 'Demo' },
          created_at: new Date().toISOString(),
        },
      ])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([]);
    mocks.telnyx.mockRejectedValueOnce(new Error('timeout'));
    const res = response();
    await corporate(
      request('/api/corporate-phone/calls/5/approve', {
        confirmPhone: '+12025550123',
      }),
      res as never,
    );
    expect(res.code).toBe(502);
    expect(mocks.telnyx).toHaveBeenCalledTimes(1);
    expect(mocks.db.mock.calls[2][2].status).toBe('dispatch_unknown');
  });
  it('does not connect an outbound answered event with an invalid nonce', async () => {
    mocks.db.mockResolvedValue([
      {
        id: 5,
        called_number: '+12025550123',
        metadata: { nonce: 'real', approvedBy: CORPORATE.ownerId },
      },
    ]);
    await handleCorporateAnswered({
      from: CORPORATE.number,
      to: '+12025550123',
      client_state: Buffer.from(
        JSON.stringify({ corporateLogId: 5, nonce: 'forged' }),
      ).toString('base64'),
    });
    expect(mocks.telnyx).not.toHaveBeenCalled();
    expect(mocks.startRecording).not.toHaveBeenCalled();
  });
  it('connects valid answered outbound call and starts dual-channel recording', async () => {
    mocks.db
      .mockResolvedValueOnce([
        {
          id: 5,
          called_number: '+12025550123',
          metadata: { nonce: 'valid-nonce', approvedBy: CORPORATE.ownerId },
        },
      ])
      .mockResolvedValueOnce([{ id: 5 }]);
    mocks.telnyx.mockResolvedValue({ data: {} });

    await handleCorporateAnswered({
      call_control_id: 'call-out-1',
      from: CORPORATE.number,
      to: '+12025550123',
      client_state: Buffer.from(
        JSON.stringify({ corporateLogId: 5, nonce: 'valid-nonce' }),
      ).toString('base64'),
    });

    expect(mocks.startMediaStream).toHaveBeenCalledWith(
      expect.objectContaining({
        callControlId: 'call-out-1',
        bidirectional: true,
      }),
    );
    expect(mocks.startRecording).toHaveBeenCalledWith(
      'call-out-1',
      expect.objectContaining({
        format: 'mp3',
        channels: 'dual',
        playBeep: false,
      }),
    );
  });
});
