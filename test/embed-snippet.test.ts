import { describe, expect, it } from 'vitest';
import {
  buildEmbedSnippet,
  isEmbedScriptPath,
  normalizeEmbedOrigin,
} from '../shared/embed-snippet';

describe('buildEmbedSnippet', () => {
  it('matches the Bot Builder install line for a bare host', () => {
    expect(
      buildEmbedSnippet({ botId: 'bot-123', origin: 'buildmybot.app' }),
    ).toBe(
      '<script src="https://buildmybot.app/embed.js" data-bot-id="bot-123" async></script>',
    );
  });

  it('keeps an explicit origin, including local http hosts', () => {
    expect(
      buildEmbedSnippet({
        botId: 'bot-123',
        origin: 'http://localhost:3000',
      }),
    ).toBe(
      '<script src="http://localhost:3000/embed.js" data-bot-id="bot-123" async></script>',
    );
  });

  it('uses /embed.js rather than the legacy /widget.js path', () => {
    const snippet = buildEmbedSnippet({
      botId: 'bot-123',
      origin: 'https://www.buildmybot.app',
    });
    expect(snippet).toContain('/embed.js');
    expect(snippet).not.toContain('/widget.js');
    expect(snippet).toContain('data-bot-id="bot-123"');
  });

  it('drops a trailing slash and a path on the host', () => {
    expect(normalizeEmbedOrigin('https://bots.example.com/app/')).toBe(
      'https://bots.example.com',
    );
    expect(
      buildEmbedSnippet({
        botId: 'bot-1',
        origin: 'https://bots.example.com/app/',
      }),
    ).toBe(
      '<script src="https://bots.example.com/embed.js" data-bot-id="bot-1" async></script>',
    );
  });

  it('escapes bot ids so they cannot break out of the attribute', () => {
    expect(
      buildEmbedSnippet({ botId: 'a"b<c', origin: 'buildmybot.app' }),
    ).toContain('data-bot-id="a&quot;b&lt;c"');
  });

  it('treats /widget.js as the legacy alias of /embed.js', () => {
    expect(isEmbedScriptPath('/embed.js')).toBe(true);
    expect(isEmbedScriptPath('/widget.js')).toBe(true);
    expect(isEmbedScriptPath('/nope.js')).toBe(false);
  });
});
