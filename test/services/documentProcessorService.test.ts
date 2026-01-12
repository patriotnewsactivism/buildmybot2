import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.fn();

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      responses: {
        create: createMock,
      },
    })),
  };
});

vi.mock('pdf-parse', () => {
  return {
    default: vi.fn(),
  };
});

let DocumentProcessorService: typeof import('../../server/services/DocumentProcessorService').DocumentProcessorService;

describe('DocumentProcessorService OCR', () => {
  beforeAll(async () => {
    ({ DocumentProcessorService } = await import(
      '../../server/services/DocumentProcessorService'
    ));
  });

  beforeEach(() => {
    createMock.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  it('uses the responses API for PDF OCR', async () => {
    createMock.mockResolvedValue({
      output_text: 'Extracted PDF text',
    });

    const buffer = Buffer.from('%PDF-1.4 test content');
    const result = await DocumentProcessorService.extractTextWithOCR(
      buffer,
      'application/pdf',
      'sample.pdf',
    );

    expect(result).toBe('Extracted PDF text');
    expect(createMock).toHaveBeenCalledTimes(1);

    const request = createMock.mock.calls[0][0];
    expect(request.model).toBe('gpt-4o');
    expect(request.input[0].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'input_text' }),
        expect.objectContaining({ type: 'input_file' }),
      ]),
    );
  });

  it('throws when PDF OCR returns empty output', async () => {
    createMock.mockResolvedValue({
      output_text: '',
    });

    const buffer = Buffer.from('%PDF-1.4 test content');

    await expect(
      DocumentProcessorService.extractTextFromPdfWithOCR(
        buffer,
        'sample.pdf',
        'test-key',
        'https://api.openai.com/v1',
      ),
    ).rejects.toThrow('OCR returned empty text.');
  });
});
