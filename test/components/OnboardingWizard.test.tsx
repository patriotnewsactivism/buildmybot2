import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingWizard } from '../../components/Client/OnboardingWizard';

describe('OnboardingWizard', () => {
  it('should require required fields before progressing', () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);

    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/business name/i), {
      target: { value: 'Acme Dental' },
    });
    expect(nextButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/website url/i), {
      target: { value: 'https://acme.example' },
    });
    expect(nextButton).toBeEnabled();
  });

  it('should complete all onboarding steps and submit setup payload', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);

    render(
      <OnboardingWizard existingBotId="bot-123" onComplete={onComplete} />,
    );

    fireEvent.change(screen.getByLabelText(/business name/i), {
      target: { value: 'Acme Dental' },
    });
    fireEvent.change(screen.getByLabelText(/website url/i), {
      target: { value: 'https://acme.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.click(
      screen.getByRole('button', { name: /real estate lead assistant/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.change(screen.getByLabelText(/persona prompt/i), {
      target: { value: 'Be concise and empathetic.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.click(screen.getByLabelText(/enable voice receptionist/i));
    fireEvent.change(screen.getByLabelText(/human transfer number/i), {
      target: { value: '+1 555 123 4567' },
    });

    fireEvent.click(screen.getByRole('button', { name: /finish setup/i }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        businessName: 'Acme Dental',
        websiteUrl: 'https://acme.example',
        industryTemplate: 'Real Estate Lead Assistant',
        botPersona: 'Be concise and empathetic.',
        voiceEnabled: true,
        transferNumber: '+1 555 123 4567',
        embedCode:
          '<script src="http://localhost:3000/widget.js" data-bot-id="bot-123"></script>',
      }),
    );
  });

  it('should copy embed code in step 4', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<OnboardingWizard existingBotId="bot-copy" onComplete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/business name/i), {
      target: { value: 'Acme' },
    });
    fireEvent.change(screen.getByLabelText(/website url/i), {
      target: { value: 'https://acme.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.click(
      screen.getByRole('button', { name: /real estate lead assistant/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.change(screen.getByLabelText(/persona prompt/i), {
      target: { value: 'Be concise.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    fireEvent.click(screen.getByRole('button', { name: /copy embed code/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        '<script src="http://localhost:3000/widget.js" data-bot-id="bot-copy"></script>',
      );
    });
  });
});
