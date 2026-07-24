/**
 * Covers the 2026-07-24 roster consolidation: System B's email-inbox
 * roster (Vera Cross et al.) now mirrors its work into ai_team_log under
 * the mapped System A role, so Marcus's daily executive summary reflects
 * email-handling activity too, instead of it living only in the
 * disconnected EmployeeLog table.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.SUPABASE_URL = 'https://fake-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SESSION_JWT_SECRET = 'test-session-secret';
process.env.INBOUND_EMAIL_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.SALES_AUTOMATION_DRY_RUN = 'true';
process.env.RESEND_API_KEY = undefined;

const gateway = await import('../../api/gateway.ts');
const handler = gateway.default;

function mockRes(): VercelResponse & { statusCode: number; body: any } {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as any,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

describe('POST /api/email/inbound — roster consolidation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mirrors support@ mail handling into ai_team_log under sam-support', async () => {
    const aiTeamLogInserts: any[] = [];
    const employeeLogInserts: any[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/rest/v1/AiEmployee')) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        if (u.includes('/rest/v1/users')) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        if (u.includes('/rest/v1/ai_team_log') && init?.method === 'POST') {
          aiTeamLogInserts.push(JSON.parse(String(init.body)));
          return Promise.resolve({ ok: true, json: async () => [{}] });
        }
        if (u.includes('/rest/v1/EmployeeLog') && init?.method === 'POST') {
          employeeLogInserts.push(JSON.parse(String(init.body)));
          return Promise.resolve({ ok: true, json: async () => [{}] });
        }
        if (u.includes('/chat/completions')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      reply: 'Thanks for reaching out — happy to help!',
                      escalate: false,
                      escalation_reason: '',
                      priority: 'normal',
                      notify: [],
                    }),
                  },
                },
              ],
            }),
          });
        }
        if (u.includes('/rest/v1/email_messages')) {
          return Promise.resolve({
            ok: true,
            json: async () => [{ id: 'msg-1' }],
          });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      }),
    );

    const req = {
      method: 'POST',
      url: '/api/email/inbound',
      headers: {
        'x-webhook-secret': 'test-webhook-secret',
        'content-type': 'application/json',
      },
      body: {
        to: 'support@buildmybot.app',
        from: 'customer@example.com',
        subject: 'How do I add a knowledge base?',
        text: 'How do I upload a PDF to my bot?',
      },
    } as unknown as VercelRequest;
    const res = mockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(aiTeamLogInserts.length).toBe(1);
    expect(aiTeamLogInserts[0].role_id).toBe('sam-support');
    expect(aiTeamLogInserts[0].role_name).toBe('Jack Miller');
    expect(aiTeamLogInserts[0].summary).toContain('[email]');
    // EmployeeLog keeps receiving rows too (historical audit trail, not dropped).
    expect(employeeLogInserts.length).toBe(1);
    expect(employeeLogInserts[0].employeeId).toBe('sam-support');
  });
});
