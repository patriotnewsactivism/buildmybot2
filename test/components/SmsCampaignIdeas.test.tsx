import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SmsCampaignIdeas } from '../../components/SmsMarketing/SmsCampaignIdeas';

describe('SmsCampaignIdeas', () => {
  it('walks a simulated thread and seeds a draft', () => {
    const onUseTemplate = vi.fn();
    render(<SmsCampaignIdeas onUseTemplate={onUseTemplate} />);

    expect(
      screen.getByRole('heading', {
        name: /a sign starts it/i,
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /coffee shops/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /see what happens next/i }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /customize this draft/i }),
    );

    expect(onUseTemplate).toHaveBeenCalledTimes(1);
    expect(onUseTemplate.mock.calls[0][0]).toMatchObject({
      status: 'draft',
      kind: 'keyword',
    });
  });
});
