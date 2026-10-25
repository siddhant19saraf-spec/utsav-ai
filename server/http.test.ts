import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import {
  aiApiErrorSchema,
  aiPlanEnvelopeSchema,
  aiStatusSchema,
  type AiPlan,
  type AiPlanRequest,
} from '../src/features/ai/contracts.ts';
import { makeAiPlan, makeAiRequest } from '../src/test/aiFixtures.ts';
import { readServerConfig } from './config.ts';
import { createApiServer, type ApiLogger } from './http.ts';
import { createRateLimiter } from './rateLimit.ts';
import { ProviderError } from './provider.ts';
import { AiServiceError, type AiService } from './service.ts';

const testCredential = 'fixture-http-credential';
const providerBaseUrl = 'https://provider.example.test/v1';
const configuredEnv = {
  AI_PROVIDER_API_KEY: testCredential,
  AI_MODEL: 'test-model',
  AI_PROVIDER_NAME: 'Test Provider',
  AI_BASE_URL: providerBaseUrl,
};

const servers: Server[] = [];

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
});

function makeService(plan: AiPlan = makeAiPlan()): AiService {
  return {
    async generatePlan() {
      return plan;
    },
  };
}

function makeMemoryLogger(): {
  info: string[];
  error: string[];
  logger: ApiLogger;
} {
  const info: string[] = [];
  const error: string[] = [];

  return {
    info,
    error,
    logger: {
      info(message) {
        info.push(message);
      },
      error(message) {
        error.push(message);
      },
    },
  };
}

async function startTestServer(
  options: {
    configured?: boolean;
    env?: Record<string, string>;
    service?: AiService | null;
    logger?: ApiLogger;
    rateLimiter?: ReturnType<typeof createRateLimiter>;
    createRequestId?: () => string;
  } = {},
): Promise<string> {
  const env = {
    ...(options.configured === false ? {} : configuredEnv),
    ...options.env,
  };
  const config = readServerConfig(env);
  const server = createApiServer({
    config,
    service:
      options.service === undefined ? makeService() : options.service,
    providerName: 'Test Provider',
    model: 'test-model',
    ...(options.logger ? { logger: options.logger } : {}),
    ...(options.rateLimiter ? { rateLimiter: options.rateLimiter } : {}),
    ...(options.createRequestId
      ? { createRequestId: options.createRequestId }
      : {}),
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  servers.push(server);

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Expected the test server to bind a TCP port.');
  }

  return `http://127.0.0.1:${address.port}`;
}

function postJson(
  baseUrl: string,
  body: unknown,
  contentType = 'application/json',
): Promise<Response> {
  return fetch(`${baseUrl}/api/ai/plan`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function readError(response: Response) {
  const parsed = aiApiErrorSchema.safeParse(await response.json());

  if (!parsed.success) {
    throw new Error('Expected the API to return a safe, validated error body.');
  }

  return parsed.data.error;
}

describe('AI HTTP API boundary', () => {
  it('exposes a lightweight health endpoint without AI configuration', async () => {
    const baseUrl = await startTestServer({ configured: false });
    const response = await fetch(`${baseUrl}/api/health`);
    const wrongMethod = await fetch(`${baseUrl}/api/health`, {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(wrongMethod.status).toBe(405);
    expect((await readError(wrongMethod)).code).toBe('method-not-allowed');
  });

  it('reports an unconfigured provider without exposing secrets', async () => {
    const baseUrl = await startTestServer({ configured: false });
    const response = await fetch(`${baseUrl}/api/ai/status`);
    const parsed = aiStatusSchema.safeParse(await response.json());

    expect(response.status).toBe(200);
    expect(parsed.success).toBe(true);

    if (!parsed.success) {
      throw new Error('Expected a valid status payload.');
    }

    expect(parsed.data.configured).toBe(false);
    expect(parsed.data.providerName).toBeNull();
    expect(parsed.data.model).toBeNull();
    expect(parsed.data.message).toContain('AI_PROVIDER_API_KEY');
    expect(JSON.stringify(parsed.data)).not.toContain(testCredential);
  });

  it('reports configured metadata, safe headers, and no provider connection details', async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/ai/status`);
    const text = await response.text();
    const parsed = aiStatusSchema.safeParse(JSON.parse(text) as unknown);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(parsed.success).toBe(true);

    if (!parsed.success) {
      throw new Error('Expected a valid status payload.');
    }

    expect(parsed.data.configured).toBe(true);
    expect(parsed.data.providerName).toBe('Test Provider');
    expect(parsed.data.model).toBe('test-model');
    expect(text).not.toContain(testCredential);
    expect(text).not.toContain('provider.example.test');
  });

  it('validates a request and returns a request-id envelope with no CORS grant', async () => {
    const calls: AiPlanRequest[] = [];
    const service: AiService = {
      async generatePlan(request) {
        calls.push(request);
        return makeAiPlan();
      },
    };
    const baseUrl = await startTestServer({
      service,
      createRequestId: () => 'req-http-1',
    });
    const response = await postJson(
      baseUrl,
      makeAiRequest(),
      'application/json; charset=utf-8',
    );
    const parsed = aiPlanEnvelopeSchema.safeParse(
      (await response.json()) as unknown,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe('req-http-1');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(parsed.success).toBe(true);

    if (!parsed.success) {
      throw new Error('Expected a valid plan envelope.');
    }

    expect(parsed.data).toMatchObject({
      requestId: 'req-http-1',
      source: 'provider',
      provider: { name: 'Test Provider', model: 'test-model' },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.event?.name).toBe('Test Celebration');
    expect(calls[0]?.message).toContain('Plan a wedding');
  });

  it('refuses to call a provider when the server is not configured', async () => {
    let calls = 0;
    const baseUrl = await startTestServer({
      configured: false,
      service: {
        async generatePlan() {
          calls += 1;
          return makeAiPlan();
        },
      },
    });
    const response = await postJson(baseUrl, makeAiRequest());
    const error = await readError(response);

    expect(response.status).toBe(503);
    expect(error).toMatchObject({ code: 'not-configured' });
    expect(error.message).toContain('deterministic local outline');
    expect(calls).toBe(0);
  });

  it('returns 405 for wrong methods and 404 for unknown routes', async () => {
    const baseUrl = await startTestServer();

    const wrongPlanMethod = await fetch(`${baseUrl}/api/ai/plan`);
    const wrongStatusMethod = await fetch(`${baseUrl}/api/ai/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const missingRoute = await fetch(`${baseUrl}/api/ai/unknown`);

    expect(wrongPlanMethod.status).toBe(405);
    expect((await readError(wrongPlanMethod)).code).toBe('method-not-allowed');
    expect(wrongStatusMethod.status).toBe(405);
    expect((await readError(wrongStatusMethod)).code).toBe(
      'method-not-allowed',
    );
    expect(missingRoute.status).toBe(404);
    expect((await readError(missingRoute)).code).toBe('not-found');
  });

  it('rejects non-JSON content types and malformed request bodies', async () => {
    let calls = 0;
    const baseUrl = await startTestServer({
      service: {
        async generatePlan() {
          calls += 1;
          return makeAiPlan();
        },
      },
    });

    const wrongType = await postJson(baseUrl, makeAiRequest(), 'text/plain');
    const malformed = await postJson(baseUrl, '{"mode":');
    const invalidSchema = await postJson(
      baseUrl,
      makeAiRequest({ message: 'hi' }),
    );

    expect(wrongType.status).toBe(415);
    expect((await readError(wrongType)).code).toBe(
      'unsupported-media-type',
    );
    expect(malformed.status).toBe(400);
    expect((await readError(malformed)).code).toBe('invalid-request');
    expect(invalidSchema.status).toBe(400);
    expect((await readError(invalidSchema)).code).toBe('invalid-request');
    expect(calls).toBe(0);
  });

  it('enforces the configured request byte limit before calling the provider', async () => {
    let calls = 0;
    const baseUrl = await startTestServer({
      env: { AI_MAX_REQUEST_BYTES: '1024' },
      service: {
        async generatePlan() {
          calls += 1;
          return makeAiPlan();
        },
      },
    });
    const oversized = {
      ...makeAiRequest(),
      message: 'x'.repeat(3_000),
    };
    const response = await postJson(baseUrl, oversized);
    const error = await readError(response);

    expect(response.status).toBe(413);
    expect(error.code).toBe('request-too-large');
    expect(error.message).toContain('Nothing was changed');
    expect(calls).toBe(0);
  });

  it('enforces its own request rate limit with a retry delay', async () => {
    let calls = 0;
    const rateLimiter = createRateLimiter({
      maxRequests: 1,
      windowMs: 60_000,
      now: () => 1_000,
    });
    const baseUrl = await startTestServer({
      rateLimiter,
      service: {
        async generatePlan() {
          calls += 1;
          return makeAiPlan();
        },
      },
    });

    const first = await postJson(baseUrl, makeAiRequest());
    const second = await postJson(baseUrl, makeAiRequest());
    const error = await readError(second);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get('retry-after')).toBe('60');
    expect(error).toMatchObject({
      code: 'rate-limited',
      retryAfterSeconds: 60,
    });
    expect(calls).toBe(1);
  });

  it('maps provider failures to safe status codes and messages', async () => {
    const cases = [
      {
        failure: new ProviderError('timeout', 'internal secret detail'),
        status: 504,
        code: 'timeout',
      },
      {
        failure: new ProviderError('auth', 'internal secret detail'),
        status: 502,
        code: 'provider-auth',
      },
      {
        failure: new ProviderError('rate-limited', 'internal secret detail', 20),
        status: 503,
        code: 'provider-rate-limited',
        retryAfter: '20',
      },
      {
        failure: new ProviderError('unavailable', 'internal secret detail'),
        status: 503,
        code: 'provider-unavailable',
      },
      {
        failure: new ProviderError('invalid-response', 'internal secret detail'),
        status: 502,
        code: 'invalid-provider-response',
      },
      {
        failure: new ProviderError('provider-error', 'internal secret detail'),
        status: 502,
        code: 'provider-error',
      },
    ];

    for (const entry of cases) {
      const baseUrl = await startTestServer({
        service: {
          async generatePlan() {
            throw entry.failure;
          },
        },
      });
      const response = await postJson(baseUrl, makeAiRequest());
      const error = await readError(response);

      expect(response.status).toBe(entry.status);
      expect(error.code).toBe(entry.code);
      expect(error.retryAfterSeconds).toBe(
        entry.retryAfter ? Number(entry.retryAfter) : null,
      );
      expect(error.message).not.toContain('internal secret detail');
      expect(response.headers.get('retry-after')).toBe(
        entry.retryAfter ?? null,
      );
    }
  });

  it('maps invalid provider output to a safe 502 response', async () => {
    const baseUrl = await startTestServer({
      service: {
        async generatePlan() {
          throw new AiServiceError(
            'invalid-provider-response',
            'The AI response did not match the required planning format.',
          );
        },
      },
    });
    const response = await postJson(baseUrl, makeAiRequest());
    const error = await readError(response);

    expect(response.status).toBe(502);
    expect(error.code).toBe('invalid-provider-response');
    expect(error.message).toContain('required planning format');
  });

  it('handles unexpected failures safely and logs only safe request metadata', async () => {
    const memory = makeMemoryLogger();
    const baseUrl = await startTestServer({
      logger: memory.logger,
      createRequestId: () => 'req-safe-1',
      service: {
        async generatePlan() {
          throw new Error('internal payload with provider-private-value');
        },
      },
    });
    const response = await postJson(baseUrl, makeAiRequest());
    const error = await readError(response);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(response.status).toBe(500);
    expect(error.code).toBe('server-error');
    expect(error.message).not.toContain('provider-private-value');
    expect(memory.error.join(' ')).toContain('request=req-safe-1');
    expect(memory.error.join(' ')).toContain('error=Error');
    expect(memory.error.join(' ')).not.toContain('internal payload');
    expect(memory.info.join(' ')).toContain('route=plan');
    expect(memory.info.join(' ')).toContain('method=POST');
    expect(memory.info.join(' ')).toContain('status=500');
    expect(memory.info.join(' ')).not.toContain('Test Celebration');
  });

  it('logs a successful request without logging the event or message content', async () => {
    const memory = makeMemoryLogger();
    const baseUrl = await startTestServer({
      logger: memory.logger,
      createRequestId: () => 'req-safe-2',
    });
    const response = await postJson(baseUrl, makeAiRequest());

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(response.status).toBe(200);
    expect(memory.info.join(' ')).toContain('request=req-safe-2');
    expect(memory.info.join(' ')).toContain('status=200');
    expect(memory.info.join(' ')).not.toContain('Test Celebration');
    expect(memory.info.join(' ')).not.toContain('Plan a wedding');
    expect(memory.info.join(' ')).not.toContain(testCredential);
  });
});
