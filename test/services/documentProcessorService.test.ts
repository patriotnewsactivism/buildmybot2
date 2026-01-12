import { describe, expect, it, vi } from 'vitest';
import { DocumentProcessorService } from '../../server/services/DocumentProcessorService';

describe('DocumentProcessorService', () => {
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
    vi.restoreAllMocks();
  });
});
