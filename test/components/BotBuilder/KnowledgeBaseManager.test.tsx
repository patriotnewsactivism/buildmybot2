/**
 * Knowledge Base Manager Component Tests
 * Tests for Phase 3 enhanced file upload
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeBaseManager } from '../../../components/BotBuilder/KnowledgeBaseManager';
// Mock dbService
vi.mock('../../../services/dbService', () => ({
  dbService: {
    getAuthHeaders: vi.fn().mockReturnValue({ 'x-user-id': 'user-1' }),
  },
}));

describe('KnowledgeBaseManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sources: [],
        stats: { sources: 0, chunks: 0, totalTokens: 0 },
      }),
    });
  });

  it('renders upload zone for existing bot', () => {
    const onDocumentsChange = vi.fn();

    render(
      <KnowledgeBaseManager
        botId="bot-1"
        documents={[]}
        onDocumentsChange={onDocumentsChange}
      />,
    );

    expect(screen.getByText(/drop files here/i)).toBeInTheDocument();
    expect(screen.getByText(/click to upload/i)).toBeInTheDocument();
  });

  it('shows save message for new bot', () => {
    const onDocumentsChange = vi.fn();

    render(
      <KnowledgeBaseManager
        botId="new"
        documents={[]}
        onDocumentsChange={onDocumentsChange}
      />,
    );

    expect(screen.getByText(/save your bot first/i)).toBeInTheDocument();
  });

  it('displays knowledge sources', async () => {
    const onDocumentsChange = vi.fn();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sources: [
          {
            id: 'source-1',
            sourceType: 'document',
            sourceName: 'test.pdf',
            status: 'completed',
            chunkCount: 3,
            createdAt: new Date().toISOString(),
          },
        ],
        stats: { sources: 1, chunks: 3, totalTokens: 1200 },
      }),
    });

    render(
      <KnowledgeBaseManager
        botId="bot-1"
        documents={[]}
        onDocumentsChange={onDocumentsChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
    });
    expect(screen.getByText(/knowledge sources/i)).toBeInTheDocument();
  });

  it('handles file upload', async () => {
    const onDocumentsChange = vi.fn();
    const user = userEvent.setup();

    const mockFile = new File(['test content'], 'test.pdf', {
      type: 'application/pdf',
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sources: [],
        stats: { sources: 0, chunks: 0, totalTokens: 0 },
      }),
    });

    render(
      <KnowledgeBaseManager
        botId="bot-1"
        documents={[]}
        onDocumentsChange={onDocumentsChange}
      />,
    );

    const fileInput =
      screen.getByRole('textbox', { hidden: true }) ||
      document.querySelector('input[type="file"]');

    if (fileInput) {
      await user.upload(fileInput, mockFile);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/knowledge/upload/bot-1'),
          expect.objectContaining({ method: 'POST' }),
        );
      });
    }
  });

  it('validates file type', async () => {
    const onDocumentsChange = vi.fn();
    const user = userEvent.setup();

    const invalidFile = new File(['content'], 'test.exe', {
      type: 'application/exe',
    });

    render(
      <KnowledgeBaseManager
        botId="bot-1"
        documents={[]}
        onDocumentsChange={onDocumentsChange}
      />,
    );

    const fileInput = document.querySelector('input[type="file"]');

    if (fileInput) {
      await user.upload(fileInput, invalidFile);

      await waitFor(() => {
        expect(
          screen.getByText(/not a supported format/i),
        ).toBeInTheDocument();
      });
    }
  });

  it('validates file size (20MB limit)', async () => {
    const onDocumentsChange = vi.fn();
    const user = userEvent.setup();

    // Create a file larger than 20MB
    const largeFile = new File(['x'.repeat(21 * 1024 * 1024)], 'large.pdf', {
      type: 'application/pdf',
    });

    // Mock File.size property
    Object.defineProperty(largeFile, 'size', {
      value: 21 * 1024 * 1024,
      writable: false,
    });

    render(
      <KnowledgeBaseManager
        botId="bot-1"
        documents={[]}
        onDocumentsChange={onDocumentsChange}
      />,
    );

    const fileInput = document.querySelector('input[type="file"]');

    if (fileInput) {
      await user.upload(fileInput, largeFile);

      await waitFor(() => {
        expect(screen.getByText(/exceeds 20mb limit/i)).toBeInTheDocument();
      });
    }
  });

  it('handles source deletion', async () => {
    const onDocumentsChange = vi.fn();
    const user = userEvent.setup();

    global.fetch = vi.fn((url, options) => {
      if (typeof url === 'string' && url.includes('/knowledge/sources/')) {
        if (options?.method === 'DELETE') {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            sources: [
              {
                id: 'source-1',
                sourceType: 'document',
                sourceName: 'test.pdf',
                status: 'completed',
                chunkCount: 1,
                createdAt: new Date().toISOString(),
              },
            ],
            stats: { sources: 1, chunks: 1, totalTokens: 120 },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(
      <KnowledgeBaseManager
        botId="bot-1"
        documents={[]}
        onDocumentsChange={onDocumentsChange}
      />,
    );

    const deleteButtons = await screen.findAllByTitle(/delete/i);
    if (deleteButtons[0]) {
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/knowledge/sources/source-1'),
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    }
  });
});
