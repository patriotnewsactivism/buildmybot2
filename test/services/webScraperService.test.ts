import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebScraperService } from '../../server/services/WebScraperService';

describe('WebScraperService helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('normalizes URLs by removing hashes and trailing slashes', () => {
    const normalized = WebScraperService.normalizeUrl(
      'https://example.com/path/#section',
    );
    expect(normalized).toBe('https://example.com/path');
  });

  it('extracts links from plain text and markdown', () => {
    const text =
      'See https://example.com and [docs](https://example.com/docs).';
    const links = WebScraperService.extractLinksFromText(text);
    expect(links).toEqual(
      expect.arrayContaining([
        'https://example.com',
        'https://example.com/docs',
      ]),
    );
  });

  it('parses sitemap links from XML', () => {
    const xml = `
      <urlset>
        <url><loc>https://example.com/page</loc></url>
        <url><loc>https://example.com/other</loc></url>
      </urlset>
    `;
    const links = WebScraperService.parseSitemapLinks(xml);
    expect(links).toEqual(
      expect.arrayContaining([
        'https://example.com/page',
        'https://example.com/other',
      ]),
    );
  });

  it('fetches reader text when available', async () => {
    const mockResponse = {
      ok: true,
      text: async () => 'Reader text   with  spacing',
    };

    vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response);

    const text = await WebScraperService.fetchReaderText(
      'https://example.com',
    );
    expect(text).toBe('Reader text with spacing');
  });

  it('filters sitemap links to same hostname', async () => {
    const xml = `
      <urlset>
        <url><loc>https://example.com/allowed</loc></url>
        <url><loc>https://other.com/blocked</loc></url>
      </urlset>
    `;

    const mockResponse = {
      ok: true,
      text: async () => xml,
    };

    vi.mocked(global.fetch).mockResolvedValue(mockResponse as Response);

    const links = await WebScraperService.fetchSitemapLinks(
      new URL('https://example.com'),
    );

    expect(links).toEqual(['https://example.com/allowed']);
  });
});
