/**
 * Canonical chat-widget install snippet.
 *
 * Onboarding and Bot Builder both call `buildEmbedSnippet` so the script
 * path, `data-bot-id` attribute, and `async` flag cannot drift. `/widget.js`
 * is a legacy alias served by the API; new snippets always use `/embed.js`.
 */

export const EMBED_SCRIPT_PATH = '/embed.js';
export const LEGACY_WIDGET_SCRIPT_PATH = '/widget.js';

const DEFAULT_EMBED_ORIGIN = 'https://buildmybot.app';

export function isEmbedScriptPath(pathname: string): boolean {
  return (
    pathname === EMBED_SCRIPT_PATH || pathname === LEGACY_WIDGET_SCRIPT_PATH
  );
}

/** Bare host or full origin, reduced to `scheme://host[:port]`. */
export function normalizeEmbedOrigin(originOrHost: string): string {
  const trimmed = originOrHost.trim();
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/+/, '')}`;

  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return DEFAULT_EMBED_ORIGIN;
    }
    return url.origin;
  } catch {
    return DEFAULT_EMBED_ORIGIN;
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildEmbedSnippet(input: {
  botId: string;
  /** Full origin (`https://buildmybot.app`) or bare host (`buildmybot.app`). */
  origin: string;
}): string {
  const origin = normalizeEmbedOrigin(input.origin);
  const botId = escapeHtmlAttribute(input.botId);
  return `<script src="${origin}${EMBED_SCRIPT_PATH}" data-bot-id="${botId}" async></script>`;
}
