/**
 * Knowledge Base Manager Component Tests
 * Tests for Phase 3 enhanced file upload
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeBaseManager } from '../../../components/BotBuilder/KnowledgeBaseManager';
import type { BotDocument } from '../../../types';

// Mock dbService
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

  it('displays uploaded documents', () => {
    const onDocumentsChange = vi.fn();

    render(
      <KnowledgeBaseManager
        botId="bot-1"
        documents={mockDocuments}
        onDocumentsChange={onDocumentsChange}
      />,
    );

    expect(screen.getByText('test.pdf')).toBeInTheDocument();
    expect(screen.getByText('manual.docx')).toBeInTheDocument();
    expect(screen.getByText(/uploaded documents \(2\)/i)).toBeInTheDocument();
  });

  it('handles file upload', async () => {
    const { dbService } = await import('../../../services/dbService');
    const onDocumentsChange = vi.fn();
    const user = userEvent.setup();

    const mockFile = new File(['test content'], 'test.pdf', {
      type: 'application/pdf',
    });
    const mockUploadedDoc: BotDocument = {
      id: 'doc-3',
      botId: 'bot-1',
      fileName: 'test.pdf',
      fileType: 'pdf',
      fileSize: 1024,
      createdAt: new Date().toISOString(),
    };

    vi.mocked(dbService.uploadBotDocument).mockResolvedValue(mockUploadedDoc);

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
        expect(dbService.uploadBotDocument).toHaveBeenCalled();
      });

      // Wait for callback
      await waitFor(() => {
        expect(onDocumentsChange).toHaveBeenCalled();
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
        expect(screen.getByText(/not a supported format/i)).toBeInTheDocument();
      });
    }
  });

  it('validates file size (10MB limit)', async () => {
    const onDocumentsChange = vi.fn();
    const user = userEvent.setup();

    // Create a file larger than 10MB
    const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'large.pdf', {
      type: 'application/pdf',
    });

    // Mock File.size property
    Object.defineProperty(largeFile, 'size', {
      value: 11 * 1024 * 1024,
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
        expect(screen.getByText(/exceeds 10mb limit/i)).toBeInTheDocument();
      });
    }
  });

  it('handles document deletion', async () => {
    const { dbService } = await import('../../../services/dbService');
    const onDocumentsChange = vi.fn();
    const user = userEvent.setup();

    // Mock fetch for delete
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    render(
      <KnowledgeBaseManager
        botId="bot-1"
        documents={mockDocuments}
        onDocumentsChange={onDocumentsChange}
      />,
    );

    const deleteButtons = screen.getAllByTitle(/delete/i);
    if (deleteButtons[0]) {
      await user.click(deleteButtons[0]);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/bots/bot-1/documents/doc-1'),
          expect.objectContaining({ method: 'DELETE' }),
        );
      });
    }
  });
});
