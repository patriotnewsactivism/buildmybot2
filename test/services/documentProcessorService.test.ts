import { describe, expect, it, vi, afterEach } from 'vitest';
import { DocumentProcessorService } from '../../server/services/DocumentProcessorService';

// Mock the database to avoid stack overflow or connection attempts during tests
vi.mock('../../server/db', () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
  },
}));

describe('DocumentProcessorService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns OCR text from PDF uploads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'file_123' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ output_text: 'Extracted PDF text' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

    const originalKey = process.env.OPENAI_API_KEY;
    const originalFetch = global.fetch;
    process.env.OPENAI_API_KEY = 'test-key';
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await DocumentProcessorService.extractTextFromPdfWithOCR(
      Buffer.from('pdf'),
      'sample.pdf',
    );

    expect(result).toBe('Extracted PDF text');
    expect(fetchMock).toHaveBeenCalledTimes(3);

    process.env.OPENAI_API_KEY = originalKey;
    global.fetch = originalFetch;
  });
});