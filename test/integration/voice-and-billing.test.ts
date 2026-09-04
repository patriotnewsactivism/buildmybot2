import { describe, expect, it } from 'vitest';
import { WalletManager } from '../../api/billing/wallet-metering';
import { RagIngestionQueue } from '../../api/rag/vector-ingestion';
import {
  getVoiceGatewayTwiML,
  validateTwilioSignature,
} from '../../api/voice/twilio-inbound';

describe('Twilio Webhook & Voice Gateway Routing', () => {
  const token = 'sample_twilio_auth_token';
  const url = 'https://example.com/api/voice/twilio-inbound';

  it('rejects invalid HMAC signatures', () => {
    const isValid = validateTwilioSignature(token, 'invalid_signature', url, {
      CallSid: 'CA123',
    });
    expect(isValid).toBe(false);
  });

  it('generates valid TwiML for Cartesia / ElevenLabs streaming websocket', () => {
    const twiml = getVoiceGatewayTwiML(
      { provider: 'cartesia', voiceId: 'sonic-1' },
      'Hello world',
    );
    expect(twiml).toContain('<Say voice="Polly.Amy">Hello world</Say>');
    expect(twiml).toContain(
      '<Stream url="wss://api.cartesia.ai/tts/websocket">',
    );
    expect(twiml).toContain('name="provider" value="cartesia"');
  });
});

describe('Sub-account Wallet Metering & Invoice Generation', () => {
  it('atomically deducts balance and prevents race conditions / double spends via idempotency', async () => {
    WalletManager.reset();
    WalletManager.setBalance('sub-1', 5000);

    const first = await WalletManager.deductBalance({
      agencyId: 'agency-1',
      subAccountId: 'sub-1',
      amountCents: 1500,
      idempotencyKey: 'tx-100',
      description: 'AI Call 1',
    });
    expect(first.success).toBe(true);
    expect(first.remainingBalanceCents).toBe(3500);

    // Idempotent retry
    const duplicate = await WalletManager.deductBalance({
      agencyId: 'agency-1',
      subAccountId: 'sub-1',
      amountCents: 1500,
      idempotencyKey: 'tx-100',
      description: 'AI Call 1',
    });
    expect(duplicate.success).toBe(true);
    expect(duplicate.remainingBalanceCents).toBe(3500);
  });

  it('rejects deductions exceeding wallet balance', async () => {
    WalletManager.reset();
    WalletManager.setBalance('sub-2', 500);

    const res = await WalletManager.deductBalance({
      agencyId: 'agency-1',
      subAccountId: 'sub-2',
      amountCents: 1000,
      idempotencyKey: 'tx-200',
      description: 'AI Call',
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Insufficient wallet balance');
  });

  it('generates monthly invoice record with tenant isolation', async () => {
    const inv = await WalletManager.generateMonthlyInvoice(
      'agency-alpha',
      'sub-123',
      '2026-07',
      4500,
    );
    expect(inv.invoiceId).toBe('inv_agency-alpha_sub-123_2026-07');
    expect(inv.totalAmountCents).toBe(4500);
  });
});

describe('pgvector RAG Chunking & Ingestion Safety', () => {
  it('chunks documents with bounded sliding window and overlap', () => {
    const sample = 'A'.repeat(2000);
    const chunks = RagIngestionQueue.chunkStreamText(sample, 800, 100);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks[0].length).toBe(800);
  });

  it('rejects payloads exceeding the 10MB memory limit', async () => {
    const oversized = 'A'.repeat(RagIngestionQueue.MAX_FILE_SIZE_BYTES + 1);
    const res = await RagIngestionQueue.processIngestJob(
      {
        id: 'job-1',
        botId: 'bot-1',
        sourceType: 'pdf',
        sourceUrl: 'https://test.com/doc.pdf',
        maxChunkSize: 800,
      },
      oversized,
    );
    expect(res.status).toBe('failed');
    expect(res.error).toContain('10MB');
  });
});
