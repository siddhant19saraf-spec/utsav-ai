import { createReadStream, statSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
} as const;

export interface StaticHandlerOptions {
  readonly root: string;
}

interface ResolvedStaticFile {
  readonly filePath: string;
  readonly useSpaFallback: boolean;
}

function sendText(
  response: ServerResponse,
  status: number,
  message: string,
): void {
  if (response.headersSent || response.writableEnded) {
    return;
  }

  response.writeHead(status, {
    ...BASE_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(message);
}

function contentType(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function cacheControl(filePath: string, useSpaFallback: boolean): string {
  if (useSpaFallback || extname(filePath).toLowerCase() === '.html') {
    return 'no-cache';
  }

  if (filePath.split(sep).join('/').includes('/assets/')) {
    return 'public, max-age=31536000, immutable';
  }

  return 'public, max-age=86400';
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

async function resolveRequestedFile(
  rootPath: string,
  pathname: string,
): Promise<ResolvedStaticFile | null> {
  let decoded: string;

  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decoded.includes('\0')) {
    return null;
  }

  const segments = decoded.replace(/\\/g, '/').split('/').filter(Boolean);

  if (segments.some((segment) => segment.startsWith('.'))) {
    return null;
  }

  const relativePath = segments.join('/');
  const candidate = resolve(rootPath, relativePath || 'index.html');

  if (candidate !== rootPath && !candidate.startsWith(`${rootPath}${sep}`)) {
    return null;
  }

  if (!relativePath) {
    return { filePath: candidate, useSpaFallback: false };
  }

  try {
    const candidateStat = await stat(candidate);

    if (candidateStat.isFile()) {
      return { filePath: candidate, useSpaFallback: false };
    }
  } catch {
    // A missing path without a file extension is treated as an SPA route below.
  }

  if (extname(segments.at(-1) ?? '') !== '') {
    return null;
  }

  return { filePath: resolve(rootPath, 'index.html'), useSpaFallback: true };
}

/**
 * Validates the built frontend once at startup so a misconfigured deployment
 * fails clearly instead of serving an API-only process.
 */
export function resolveStaticRoot(root: string): string {
  const rootPath = resolve(root);

  try {
    if (
      !statSync(rootPath).isDirectory() ||
      !statSync(resolve(rootPath, 'index.html')).isFile()
    ) {
      throw new Error('Static root is incomplete.');
    }
  } catch {
    throw new Error(
      'Static serving is enabled but the configured static directory does not contain index.html. Run "npm run build" before starting the server.',
    );
  }

  return rootPath;
}

export function createStaticHandler(
  options: StaticHandlerOptions,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const rootPath = resolve(options.root);

  return async (request, response) => {
    try {
      const method = request.method ?? 'GET';

      if (method !== 'GET' && method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        sendText(
          response,
          405,
          'This static server accepts GET and HEAD requests only.',
        );
        return;
      }

      let pathname: string;

      try {
        pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      } catch {
        sendText(response, 400, 'The request URL could not be read.');
        return;
      }

      const resolved = await resolveRequestedFile(rootPath, pathname);

      if (!resolved) {
        sendText(response, 404, 'Not found.');
        return;
      }

      let fileStat;

      try {
        fileStat = await stat(resolved.filePath);
      } catch (error) {
        if (errorCode(error) === 'ENOENT') {
          sendText(response, 404, 'Not found.');
        } else {
          sendText(response, 500, 'The static file could not be read.');
        }
        return;
      }

      if (!fileStat.isFile()) {
        sendText(response, 404, 'Not found.');
        return;
      }

      response.writeHead(200, {
        ...BASE_HEADERS,
        'Content-Type': contentType(resolved.filePath),
        'Content-Length': String(fileStat.size),
        'Cache-Control': cacheControl(
          resolved.filePath,
          resolved.useSpaFallback,
        ),
      });

      if (method === 'HEAD') {
        response.end();
        return;
      }

      await pipeline(createReadStream(resolved.filePath), response);
    } catch {
      if (!response.headersSent) {
        sendText(response, 500, 'The static file could not be served.');
      } else {
        response.destroy();
      }
    }
  };
}
