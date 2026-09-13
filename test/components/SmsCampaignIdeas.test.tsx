import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SmsCampaignIdeas } from '../../components/SmsMarketing/SmsCampaignIdeas';
import { CAMPAIGN_IDEAS } from '../../shared/sms-campaign-ideas';

describe('SmsCampaignIdeas', () => {
  it('walks through a simulated customer conversation without sending texts', () => {
    render(<SmsCampaignIdeas />);
    expect(screen.getByText(/seeing is believing/i)).toBeInTheDocument();
    expect(
      screen.getByText(/no texts are sent/i),
    ).toBeInTheDocument();
    for (const idea of CAMPAIGN_IDEAS) {
      expect(screen.getByRole('button', { name: idea.audience })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: /see what happens next/i }));
    expect(screen.getByText(/your entry is recorded/i)).toBeInTheDocument();
  });

  it('hands a draft template to the programs form', () => {
    const onUseTemplate = vi.fn();
    render(<SmsCampaignIdeas onUseTemplate={onUseTemplate} />);
    fireEvent.click(screen.getByRole('button', { name: /coffee shops/i }));
    fireEvent.click(screen.getByRole('button', { name: /customize this draft/i }));
    expect(onUseTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'keyword',
        keyword: 'COFFEE',
        status: 'draft',
      }),
    );
  });
});
