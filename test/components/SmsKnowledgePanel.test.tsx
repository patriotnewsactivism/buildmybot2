import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SmsKnowledgePanel } from '../../components/SmsMarketing/SmsKnowledgePanel';

describe('SmsKnowledgePanel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'PATCH' || init?.method === 'POST') {
          return { ok: true, json: async () => ({}) };
        }
        if (url.includes('/sms/account')) {
          return {
            ok: true,
            json: async () => ({
              account: {
                business_name: 'Acme',
                timezone: 'America/Chicago',
                ai_enabled: false,
                knowledge_base_id: null,
                quiet_start: 9,
                quiet_end: 20,
              },
            }),
          };
        }
        if (url.includes('/sms/knowledge/')) {
          return {
            ok: true,
            json: async () => ({
              review: {
                version: { id: 'v1', status: 'review' },
                facts: [],
                conflicts: [],
                missing: [],
              },
            }),
          };
        }
        if (url.includes('/sms/knowledge')) {
          return {
            ok: true,
            json: async () => ({
              bases: [
                {
                  id: '11111111-1111-1111-1111-111111111111',
                  name: 'Acme site',
                  published_version_id: null,
                },
              ],
              bots: [
                {
                  id: '22222222-2222-2222-2222-222222222222',
                  name: 'Acme bot',
                },
              ],
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists knowledge bases and can enable AI replies', async () => {
    render(<SmsKnowledgePanel businessName="Acme" />);

    await waitFor(() => {
      expect(
        screen.getByRole('combobox', { name: /knowledge base/i }),
      ).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByRole('combobox', { name: /knowledge base/i }),
      {
        target: { value: '11111111-1111-1111-1111-111111111111' },
      },
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /ai replies from published knowledge/i,
      }),
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
  });
});
