import path from 'node:path';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import {
  EMBED_SCRIPT_PATH,
  LEGACY_WIDGET_SCRIPT_PATH,
  isEmbedScriptPath,
} from '../../shared/embed-snippet.js';

/**
 * Extensions that must never fall through to the SPA HTML document.
 * A missing bundle or widget script has to 404; serving index.html with
 * 200 text/html makes the browser refuse the file (nosniff) and the widget
 * never appears.
 */
const STATIC_ASSET_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.map',
  '.json',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.ico',
  '.avif',
  '.bmp',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.txt',
  '.xml',
  '.webmanifest',
  '.pdf',
  '.mp3',
  '.mp4',
  '.webm',
  '.ogg',
  '.wasm',
  '.gz',
  '.br',
  '.html',
  '.htm',
]);

export function isStaticAssetPath(pathname: string): boolean {
  const withoutQuery = pathname.split('?')[0]?.split('#')[0] ?? pathname;
  const trimmed = withoutQuery.replace(/\/+$/, '');
  const base = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return false;
  return STATIC_ASSET_EXTENSIONS.has(base.slice(dot).toLowerCase());
}

function sendMissing(res: Response) {
  res.status(404).type('text/plain').send('Not found');
}

/**
 * Vite `dist/` plus the legacy `/widget.js` alias.
 *
 * `/widget.js` is registered before `express.static` so pasted snippets keep
 * loading `embed.js` even if a file of that name is added later.
 */
export function attachFrontend(app: Express, distDir: string): void {
  const embedFile = path.join(distDir, EMBED_SCRIPT_PATH.slice(1));
  const indexFile = path.join(distDir, 'index.html');

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isEmbedScriptPath(req.path)) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
    next();
  });

  app.get(LEGACY_WIDGET_SCRIPT_PATH, (_req: Request, res: Response) => {
    res.sendFile(embedFile, (err: Error | null) => {
      if (!err || res.headersSent) return;
      sendMissing(res);
    });
  });

  app.use(
    express.static(distDir, {
      setHeaders(res, filePath) {
        if (filePath.endsWith(`${path.sep}embed.js`)) {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }
      },
    }),
  );

  app.get('/{*splat}', (req: Request, res: Response) => {
    if (isStaticAssetPath(req.path)) {
      sendMissing(res);
      return;
    }
    res.sendFile(indexFile);
  });
}
