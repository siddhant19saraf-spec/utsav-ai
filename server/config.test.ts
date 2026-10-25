import { describe, expect, it } from 'vitest';
import { publicAiStatus, readServerConfig } from './config.ts';

const secret = 'sk-test-super-secret-value';

function configuredEnv(): Record<string, string> {
  return {
    AI_PROVIDER_API_KEY: secret,
    AI_MODEL: 'test-model',
    AI_PROVIDER_NAME: 'Test Provider',
    AI_BASE_URL: 'https://provider.example.test/v1',
  };
}

describe('server configuration', () => {
  it('stays usable without credentials and never fabricates a provider', () => {
    const config = readServerConfig({});

    expect(config.configured).toBe(false);
    expect(config.provider.apiKey).toBeNull();
    expect(config.provider.model).toBeNull();
    expect(config.configurationErrors).toEqual([]);

    const status = publicAiStatus(config);
    expect(status.configured).toBe(false);
    expect(status.providerName).toBeNull();
    expect(status.model).toBeNull();
    expect(status.message).toContain('AI_PROVIDER_API_KEY');
    expect(status.message).toContain('AI_MODEL');
    expect(status.message).toContain('deterministic local outline');
  });

  it('requires a model when an API key is present', () => {
    const config = readServerConfig({ AI_PROVIDER_API_KEY: secret });

    expect(config.configured).toBe(false);
    expect(config.configurationErrors).toEqual([
      'AI_MODEL is required when AI_PROVIDER_API_KEY is set.',
    ]);
    expect(config.configurationErrors.join(' ')).not.toContain(secret);
  });

  it('reports configured provider metadata without exposing the key or base URL', () => {
    const config = readServerConfig(configuredEnv());

    expect(config.configured).toBe(true);
    expect(config.provider.apiKey).toBe(secret);

    const status = publicAiStatus(config);
    const serialized = JSON.stringify(status);

    expect(status.configured).toBe(true);
    expect(status.providerName).toBe('Test Provider');
    expect(status.model).toBe('test-model');
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('provider.example.test');
    expect(serialized).not.toContain('https://');
  });

  it('rejects invalid limits and unsafe configuration without echoing values', () => {
    const config = readServerConfig({
      ...configuredEnv(),
      AI_REQUEST_TIMEOUT_MS: 'secret-value',
      AI_RATE_LIMIT_MAX: '0',
      AI_MAX_REQUEST_BYTES: '10',
      AI_BASE_URL: 'ftp://provider.example.test',
      AI_SERVER_PORT: '99999',
    });

    expect(config.configured).toBe(false);
    expect(config.configurationErrors.length).toBeGreaterThanOrEqual(5);
    expect(config.configurationErrors.join(' ')).toContain('AI_REQUEST_TIMEOUT_MS');
    expect(config.configurationErrors.join(' ')).toContain('AI_BASE_URL');
    expect(config.configurationErrors.join(' ')).not.toContain('secret-value');
    expect(config.configurationErrors.join(' ')).not.toContain(secret);

    const status = publicAiStatus(config);
    expect(status.configured).toBe(false);
    expect(status.message).toContain('invalid');
    expect(JSON.stringify(status)).not.toContain(secret);
  });

  it('uses bounded defaults for unset numeric settings', () => {
    const config = readServerConfig(configuredEnv());

    expect(config.port).toBe(8787);
    expect(config.maxRequestBytes).toBe(96_000);
    expect(config.rateLimit).toEqual({ maxRequests: 10, windowMs: 60_000 });
    expect(config.provider.timeoutMs).toBe(20_000);
    expect(config.provider.maxOutputTokens).toBe(1_800);
    expect(config.host).toBe('127.0.0.1');
    expect(config.serveStatic).toBe(false);
    expect(config.staticDir).toBe('dist');
  });

  it('accepts a platform-provided PORT while keeping AI_SERVER_PORT authoritative', () => {
    const platformConfig = readServerConfig({
      ...configuredEnv(),
      PORT: '10000',
    });
    const explicitConfig = readServerConfig({
      ...configuredEnv(),
      PORT: '10000',
      AI_SERVER_PORT: '8788',
    });

    expect(platformConfig.port).toBe(10_000);
    expect(explicitConfig.port).toBe(8_788);
  });

  it('validates optional static-serving settings without enabling them by default', () => {
    const enabled = readServerConfig({
      ...configuredEnv(),
      SERVE_STATIC: 'true',
      STATIC_DIR: 'build',
    });
    const invalid = readServerConfig({
      ...configuredEnv(),
      SERVE_STATIC: 'yes',
    });

    expect(enabled.serveStatic).toBe(true);
    expect(enabled.staticDir).toBe('build');
    expect(enabled.configured).toBe(true);
    expect(invalid.serveStatic).toBe(false);
    expect(invalid.configured).toBe(false);
    expect(invalid.configurationErrors).toEqual([
      'SERVE_STATIC must be true or false.',
    ]);
  });
});
