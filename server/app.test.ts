import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from './app.ts';
import { readServerConfig } from './config.ts';
import { resolveStaticRoot } from './static.ts';

const servers: Server[] = [];
const roots: string[] = [];
const indexHtml =
  '<!doctype html><html lang="en"><body><div id="root">SPA shell</div></body></html>';

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        }),
    ),
  );
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function makeStaticFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'utsav-static-'));
  roots.push(root);

  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'index.html'), indexHtml);
  await writeFile(join(root, 'assets', 'index-test.js'), 'console.log("asset");');
  await writeFile(
    join(root, 'favicon.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  );
  await writeFile(join(root, '.env'), 'SHOULD_NOT_BE_SERVED=1');
  return root;
}

async function startApp(staticRoot: string | null): Promise<string> {
  const server = createAppServer({
    config: readServerConfig({}),
    service: null,
    staticRoot,
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  servers.push(server);

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Expected the app server to bind a TCP port.');
  }

  return `http://127.0.0.1:${address.port}`;
}

describe('production app server', () => {
  it('serves the SPA shell, nested routes, assets, and HEAD requests', async () => {
    const baseUrl = await startApp(await makeStaticFixture());

    const home = await fetch(`${baseUrl}/`);
    const nested = await fetch(`${baseUrl}/rescue?event=sample`);
    const asset = await fetch(`${baseUrl}/assets/index-test.js`);
    const head = await fetch(`${baseUrl}/settings`, { method: 'HEAD' });

    expect(home.status).toBe(200);
    expect(await home.text()).toContain('SPA shell');
    expect(home.headers.get('content-type')).toContain('text/html');
    expect(home.headers.get('cache-control')).toBe('no-cache');
    expect(home.headers.get('x-content-type-options')).toBe('nosniff');
    expect(home.headers.get('x-frame-options')).toBe('DENY');

    expect(nested.status).toBe(200);
    expect(await nested.text()).toContain('SPA shell');
    expect(nested.headers.get('cache-control')).toBe('no-cache');

    expect(asset.status).toBe(200);
    expect(await asset.text()).toContain('console.log("asset")');
    expect(asset.headers.get('content-type')).toContain('text/javascript');
    expect(asset.headers.get('cache-control')).toContain('immutable');

    expect(head.status).toBe(200);
    expect(head.headers.get('content-type')).toContain('text/html');
    expect(await head.text()).toBe('');
  });

  it('rejects missing assets, dotfiles, traversal attempts, and unsupported methods', async () => {
    const baseUrl = await startApp(await makeStaticFixture());

    const missingAsset = await fetch(`${baseUrl}/assets/missing.js`);
    const missingTopLevelFile = await fetch(`${baseUrl}/missing.js`);
    const dotfile = await fetch(`${baseUrl}/.env`);
    const traversal = await fetch(
      `${baseUrl}/%2e%2e%2fserver%2fconfig.ts`,
    );
    const wrongMethod = await fetch(`${baseUrl}/events`, { method: 'POST' });

    expect(missingAsset.status).toBe(404);
    expect(missingTopLevelFile.status).toBe(404);
    expect(dotfile.status).toBe(404);
    expect(await dotfile.text()).not.toContain('SHOULD_NOT_BE_SERVED');
    expect(traversal.status).toBe(404);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get('allow')).toBe('GET, HEAD');
  });

  it('keeps /api routes on the JSON API when static serving is enabled', async () => {
    const baseUrl = await startApp(await makeStaticFixture());

    const health = await fetch(`${baseUrl}/api/health`);
    const unknown = await fetch(`${baseUrl}/api/not-a-route`);
    const status = await fetch(`${baseUrl}/api/ai/status`);

    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    expect(health.headers.get('access-control-allow-origin')).toBeNull();

    expect(unknown.status).toBe(404);
    expect(unknown.headers.get('content-type')).toContain('application/json');
    expect(await unknown.text()).not.toContain('SPA shell');

    expect(status.status).toBe(200);
    expect(status.headers.get('content-type')).toContain('application/json');
  });

  it('validates the built frontend before serving it', async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), 'utsav-empty-'));
    roots.push(emptyRoot);

    expect(() => resolveStaticRoot(emptyRoot)).toThrow(/index\.html/);
  });
});
