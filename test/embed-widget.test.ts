/**
 * Regression tests added 2026-08-31 after the embed widget was found broken in
 * production on the day of launch.
 *
 * Two independent bugs, both fatal:
 *
 * 1. The Bot Builder hands customers
 *      <script src="https://buildmybot.app/embed.js" data-bot-id="..." async></script>
 *    but embed.js read the bot id only from window.bmbConfig, so every copied
 *    snippet logged "No botId provided" and rendered nothing.
 *
 * 2. The iframe URL was built as `https://${domain}` where domain came from
 *    URL.origin or window.location.origin — both of which already include the
 *    scheme — producing "https://https://buildmybot.app/chat/...".
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const EMBED_JS = readFileSync(
  path.join(process.cwd(), 'public', 'embed.js'),
  'utf-8',
);

/** Install a script tag, run embed.js against it, return the created iframe. */
function runEmbed(attrs: Record<string, string>): HTMLIFrameElement | null {
  const script = document.createElement('script');
  for (const [k, v] of Object.entries(attrs)) script.setAttribute(k, v);
  document.head.appendChild(script);

  // jsdom leaves document.currentScript null when we eval by hand, which is
  // exactly the path the src-lookup fallback exists for.
  new Function(EMBED_JS)();

  return document.querySelector('iframe');
}

describe('embed.js', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    (window as unknown as { bmbConfig?: unknown }).bmbConfig = undefined;

    // jsdom ships no matchMedia; the widget uses it only to pick mobile
    // dimensions, which is irrelevant to the URL construction under test.
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  it('reads the bot id from data-bot-id, as the generated snippet supplies it', () => {
    const iframe = runEmbed({
      src: 'https://buildmybot.app/embed.js',
      'data-bot-id': 'bot-123',
    });
    expect(iframe).not.toBeNull();
    expect(iframe?.src).toBe('https://buildmybot.app/chat/bot-123?mode=embed');
  });

  it('does not double the scheme when the domain arrives as a full origin', () => {
    const iframe = runEmbed({
      src: 'https://buildmybot.app/embed.js',
      'data-bot-id': 'bot-123',
      'data-domain': 'https://cdn.example.com',
    });
    expect(iframe?.src).toBe('https://cdn.example.com/chat/bot-123?mode=embed');
    expect(iframe?.src).not.toContain('https://https://');
  });

  it('accepts a bare host for the domain', () => {
    const iframe = runEmbed({
      src: 'https://buildmybot.app/embed.js',
      'data-bot-id': 'bot-123',
      'data-domain': 'bots.acme.com',
    });
    expect(iframe?.src).toBe('https://bots.acme.com/chat/bot-123?mode=embed');
  });

  it('still honours the legacy window.bmbConfig form', () => {
    (window as unknown as { bmbConfig?: unknown }).bmbConfig = {
      botId: 'legacy-9',
      domain: 'buildmybot.app',
    };
    const iframe = runEmbed({ src: 'https://buildmybot.app/embed.js' });
    expect(iframe?.src).toBe('https://buildmybot.app/chat/legacy-9?mode=embed');
  });

  it('errors clearly and renders nothing without a bot id', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const iframe = runEmbed({ src: 'https://buildmybot.app/embed.js' });
    expect(iframe).toBeNull();
    expect(err).toHaveBeenCalledWith(expect.stringContaining('data-bot-id'));
    err.mockRestore();
  });
});
