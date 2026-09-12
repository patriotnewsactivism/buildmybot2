import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DigitalSignageShowcase,
  SMS_SIGN_SAMPLES,
} from '../../components/SmsMarketing/DigitalSignageShowcase';

describe('DigitalSignageShowcase', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ smsReady: false }),
      }),
    );
  });

  it('renders the four sample posters and the monthly studio benefit', () => {
    render(
      <MemoryRouter>
        <DigitalSignageShowcase />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/three originals, every month/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/as long as they remain a client/i),
    ).toBeInTheDocument();
    for (const sign of SMS_SIGN_SAMPLES) {
      expect(screen.getByAltText(sign.alt)).toBeInTheDocument();
      expect(screen.getByText(sign.businessName)).toBeInTheDocument();
    }
  });

  it('opens a lightbox when a poster is selected', () => {
    render(
      <MemoryRouter>
        <DigitalSignageShowcase variant="mosaic" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByAltText(SMS_SIGN_SAMPLES[0].alt));
    expect(
      screen.getByRole('dialog', { name: /urban bloom boutique/i }),
    ).toBeInTheDocument();
  });
});
