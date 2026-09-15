import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SmsMarketing } from '../../components/SmsMarketing/SmsMarketing';

describe('SmsMarketing connected onboarding', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/sms/register')) {
          return {
            ok: true,
            json: async () => ({
              registered: false,
              status: 'not_registered',
              paid: false,
              knowledgeBaseId: null,
            }),
          };
        }
        if (url.includes('/sms/programs')) {
          return { ok: true, json: async () => [] };
        }
        if (url.includes('/sms/account')) {
          return {
            ok: true,
            json: async () => ({
              account: {
                business_name: '',
                timezone: 'America/Chicago',
                ai_enabled: false,
                knowledge_base_id: null,
                quiet_start: 9,
                quiet_end: 20,
              },
              launchEnabled: true,
            }),
          };
        }
        if (url.includes('/sms/knowledge')) {
          return { ok: true, json: async () => ({ bases: [], bots: [] }) };
        }
        return { ok: true, json: async () => ({}) };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a program draft from a campaign idea before payment', async () => {
    render(
      <MemoryRouter>
        <SmsMarketing />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /a sign starts it/i }),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /customize this draft/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/save draft/i)).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue(/gift-card drawing/i)).toBeInTheDocument();
  });
});
