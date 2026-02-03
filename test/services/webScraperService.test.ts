import { describe, expect, it, vi } from 'vitest';
import { WebScraperService } from '../../server/services/WebScraperService';

// Mock the database to avoid stack overflow or connection attempts during tests
vi.mock('../../server/db', () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  },
}));

describe('WebScraperService', () => {
  it('extracts readable text while stripping non-content tags', () => {
    const html = `
      <html>
        <head><title>Test</title></head>
        <body>
          <header>Header</header>
          <nav>Nav</nav>
          <script>console.log('ignore');</script>
          <main>
            <h1>Title</h1>
            <p>First paragraph.</p>
          </main>
          <footer>Footer</footer>
        </body>
      </html>
    `;

    const text = WebScraperService.extractText(html);

    expect(text).toContain('Title');
    expect(text).toContain('First paragraph.');
    expect(text).not.toContain('Header');
    expect(text).not.toContain('Nav');
  });

  it('filters non-navigable links', () => {
    const html = `
      <a href="https://example.com/page">Page</a>
      <a href="#anchor">Anchor</a>
      <a href="mailto:test@example.com">Email</a>
      <a href="tel:123">Call</a>
      <a href="/about">About</a>
    `;

    const links = WebScraperService.extractLinks(html, 'https://example.com');

    expect(links).toEqual(['https://example.com/page', '/about']);
  });
});
