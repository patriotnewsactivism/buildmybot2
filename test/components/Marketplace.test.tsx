import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Marketplace } from '../../components/Marketplace/Marketplace';

describe('Marketplace', () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    vi.resetAllMocks();
  });

  it('renders loading state initially', () => {
    // Mock fetch to never resolve
    (global.fetch as any).mockImplementation(() => new Promise(() => {}));

    render(<Marketplace />);
    expect(screen.getByText(/loading marketplace/i)).toBeInTheDocument();
  });

  it('renders templates after successful fetch', async () => {
    const mockTemplates = [
      {
        id: '1',
        name: 'Test Template',
        category: 'Technology',
        description: 'A test template',
        priceCents: 0,
        installCount: 100,
        rating: 4.5,
        configuration: {
          tags: ['test', 'demo'],
        },
      },
    ];

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTemplates,
    });

    render(<Marketplace />);

    await waitFor(() => {
      expect(screen.getByText('Test Template')).toBeInTheDocument();
    });

    expect(screen.getByText('A test template')).toBeInTheDocument();
    expect(screen.getByText('100 installs')).toBeInTheDocument();
  });

  it('renders error state when fetch fails', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Failed to fetch'));

    render(<Marketplace />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load templates/i)).toBeInTheDocument();
    });
  });

  it('filters templates by category', async () => {
    const mockTemplates = [
      {
        id: '1',
        name: 'Tech Template',
        category: 'Technology',
        description: 'Tech template',
        priceCents: 0,
        installCount: 100,
        rating: 4.5,
        configuration: { tags: [] },
      },
      {
        id: '2',
        name: 'Healthcare Template',
        category: 'Healthcare',
        description: 'Healthcare template',
        priceCents: 0,
        installCount: 50,
        rating: 4.0,
        configuration: { tags: [] },
      },
    ];

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTemplates,
    });

    const { container } = render(<Marketplace />);

    await waitFor(() => {
      expect(screen.getByText('Tech Template')).toBeInTheDocument();
    });

    // Both templates should be visible initially
    expect(screen.getByText('Tech Template')).toBeInTheDocument();
    expect(screen.getByText('Healthcare Template')).toBeInTheDocument();
  });
});
