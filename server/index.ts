import { pathToFileURL } from 'node:url';
import { createAppServer } from './app.ts';
import { readServerConfig, publicAiStatus } from './config.ts';
import { createOpenAiCompatibleProvider } from './provider.ts';
import { createAiService } from './service.ts';
import { resolveStaticRoot } from './static.ts';

export function startServer(): void {
  const config = readServerConfig(process.env);
  const status = publicAiStatus(config);
  let staticRoot: string | null = null;

  if (config.serveStatic) {
    try {
      staticRoot = resolveStaticRoot(config.staticDir);
    } catch (error) {
      console.error(
        `[app] ${
          error instanceof Error
            ? error.message
            : 'Static frontend validation failed.'
        }`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const provider =
    config.configured && config.provider.apiKey && config.provider.model
      ? createOpenAiCompatibleProvider({
          apiKey: config.provider.apiKey,
          baseUrl: config.provider.baseUrl,
          model: config.provider.model,
          name: config.provider.name,
        })
      : null;
  const service = provider
    ? createAiService({
        provider,
        timeoutMs: config.provider.timeoutMs,
        maxOutputTokens: config.provider.maxOutputTokens,
      })
    : null;
  const server = createAppServer({
    config,
    service,
    providerName: provider?.name ?? null,
    model: provider?.model ?? null,
    staticRoot,
  });

  server.listen(config.port, config.host, () => {
    console.info(
      `[app] Listening on http://${config.host}:${config.port}. Static frontend: ${
        staticRoot ? 'enabled' : 'disabled'
      }. ${
        status.configured
          ? `AI provider: ${status.providerName}; model: ${status.model}.`
          : 'No AI provider is configured; the app and deterministic outline remain available.'
      }`,
    );

    if (config.configurationErrors.length > 0) {
      console.warn(
        `[app] Configuration notes: ${config.configurationErrors.join(' ')}`,
      );
    }
  });

  server.on('error', (error) => {
    console.error(`[app] Server error: ${error.name}.`);
    process.exitCode = 1;
  });

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const entryPoint = process.argv[1];

if (entryPoint && pathToFileURL(entryPoint).href === import.meta.url) {
  startServer();
}
