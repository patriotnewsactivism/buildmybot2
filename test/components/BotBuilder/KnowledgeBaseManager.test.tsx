/**
 * Knowledge Base Manager Component Tests
 * Tests for Phase 3 enhanced file upload
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeBaseManager } from '../../../components/BotBuilder/KnowledgeBaseManager';
import type { BotDocument } from '../../../types';

// Mock dbService (still needed for imports even if unused in some tests)
vi.mock('../../../services/dbService', () => ({
  dbService: {
    uploadBotDocument: vi.fn(),
    deleteBotDocument: vi.fn().mockResolvedValue(true),
  },
}));

const mockDocuments: BotDocument[] = [
  {
    id: 'doc-1',
    botId: 'bot-1',
    fileName: 'test.pdf',
    fileType: 'pdf',
    fileSize: 1024 * 1024, // 1MB
    createdAt: new Date().toISOString(),
  },
  {
    id: 'doc-2',
    botId: 'bot-1',
    fileName: 'manual.docx',
    fileType: 'docx',
    fileSize: 512 * 1024, // 512KB
    createdAt: new Date().toISOString(),
  },
];

describe('KnowledgeBaseManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock global fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sources: [], stats: { sources: 0, chunks: 0, totalTokens: 0 } }),
    });
  });

  it('renders upload zone for existing bot', async () => {
    const onDocumentsChange = vi.fn();

    render(
      <KnowledgeBaseManager
        botId="bot-1"
        documents={[]}
        onDocumentsChange={onDocumentsChange}
      />,
    );

    await waitFor(() => {
        expect(screen.getByText(/drop files here/i)).toBeInTheDocument();
        expect(screen.getByText(/click to upload/i)).toBeInTheDocument();
    });
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

  it('displays uploaded documents', async () => {
    const onDocumentsChange = vi.fn();
    
    // Mock sources that match our documents
    const mockSources = [
      { id: 'src-1', sourceName: 'test.pdf', sourceType: 'document', status: 'completed', chunkCount: 1 },
      { id: 'src-2', sourceName: 'manual.docx', sourceType: 'document', status: 'completed', chunkCount: 1 }
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sources: mockSources, stats: {} }),
    });

    render(
      <KnowledgeBaseManager
        botId="bot-1"
        documents={mockDocuments}
        onDocumentsChange={onDocumentsChange}
      />,
    );

    await waitFor(() => {
        expect(screen.getByText(/test\.pdf/i)).toBeInTheDocument();
        expect(screen.getByText(/manual\.docx/i)).toBeInTheDocument();
    });
  });

  it('handles file upload', async () => {
    const onDocumentsChange = vi.fn();
    const user = userEvent.setup();

    const mockFile = new File(['test content'], 'test.pdf', {
      type: 'application/pdf',
    });

    // Mock upload fetch response sequence
    global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ sources: [], stats: {} }) }) // Initial load
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) }) // Upload
        .mockResolvedValueOnce({ ok: true, json: async () => ({ sources: [{ id: 'src-new', sourceName: 'test.pdf', status: 'completed' }], stats: {} }) }); // Refresh

    const { container } = render(
      <KnowledgeBaseManager
        botId="bot-1"
        documents={[]}
        onDocumentsChange={onDocumentsChange}
      />,
    );

    const fileInput = container.querySelector('input[type="file"]');

    if (fileInput) {
      // Use fireEvent for reliability with hidden inputs in jsdom
      fireEvent.change(fileInput, { target: { files: [mockFile] } });

      await waitFor(() => {
        // Verify fetch was called with upload URL
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/knowledge/upload/bot-1'),
            expect.objectContaining({ method: 'POST' })
        );
      });
    } else {
        throw new Error('File input not found');
    }
  });

  it('validates file size (20MB limit)', async () => {
    const onDocumentsChange = vi.fn();
    const user = userEvent.setup();

    // Create a file larger than 20MB
    const largeFile = new File([''], 'large.pdf', { type: 'application/pdf' });
    Object.defineProperty(largeFile, 'size', { value: 21 * 1024 * 1024 });

    const { container } = render(
      <KnowledgeBaseManager
        botId="bot-1"
        documents={[]}
        onDocumentsChange={onDocumentsChange}
      />,
    );

    const fileInput = container.querySelector('input[type="file"]');

    if (fileInput) {
      fireEvent.change(fileInput, { target: { files: [largeFile] } });

      await waitFor(() => {
        expect(screen.getByText(/exceeds 20MB limit/i)).toBeInTheDocument();
      });
    }
  });

  it('handles document deletion', async () => {
    const onDocumentsChange = vi.fn();
    const user = userEvent.setup();

    const mockSources = [
      { id: 'src-1', sourceName: 'test.pdf', sourceType: 'document', status: 'completed' }
    ];

    global.fetch = vi.fn().mockImplementation((url, options) => {
        if (url.includes('/knowledge/sources/') && options?.method === 'DELETE') {
             return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        if (url.includes('/knowledge/sources/')) {
             return Promise.resolve({ ok: true, json: async () => ({ sources: mockSources, stats: {} }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(
      <KnowledgeBaseManager
        botId="bot-1"
        documents={mockDocuments}
        onDocumentsChange={onDocumentsChange}
      />,
    );

    await waitFor(() => expect(screen.getByText(/test\.pdf/i)).toBeInTheDocument());

    const deleteButtons = screen.getAllByTitle(/delete/i);
    if (deleteButtons[0]) {
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/knowledge/sources/src-1'),
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    }
  });
});