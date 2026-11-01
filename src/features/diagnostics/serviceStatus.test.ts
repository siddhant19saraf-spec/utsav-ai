import { describe, expect, it, vi } from 'vitest';
import type { AiStatus } from '@/features/ai/contracts';
import { checkServices } from './serviceStatus';

type FetchArgs = Parameters<typeof fetch>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeFetchMock() {
  return vi.fn<(...args: FetchArgs) => Promise<Response>>();
}

function asFetch(mock: ReturnType<typeof makeFetchMock>): typeof fetch {
  return mock as unknown as typeof fetch;
}

function makeAiStatus(overrides: Partial<AiStatus> = {}): AiStatus {
  return {
    configured: false,
    providerName: null,
    model: null,
    message: 'AI planning is not configured.',
    limits: null,
    ...overrides,
  };
}

function routeFetch(
  routes: Record<string, () => Response | Promise<Response>>,
): ReturnType<typeof makeFetchMock> {
  const mock = makeFetchMock();
  mock.mockImplementation((input) => {
    const url = String(input);
    const route = routes[url];

    if (!route) {
      throw new Error(`Unexpected request: ${url}`);
    }

    return Promise.resolve(route());
  });
  return mock;
}

const fixedNow = () => new Date('2026-10-31T09:00:00.000Z');

describe('service status probes', () => {
  it('reports healthy API and configured AI after real responses', async () => {
    const fetchMock = routeFetch({
      '/api/health': () => jsonResponse({ status: 'ok' }),
      '/api/ai/status': () =>
        jsonResponse(
          makeAiStatus({
            configured: true,
            providerName: 'Test Provider',
            model: 'test-model',
          }),
        ),
    });

    const result = await checkServices({ fetchImpl: asFetch(fetchMock), now: fixedNow });

    expect(result.health).toEqual({
      state: 'operational',
      checkedAt: '2026-10-31T09:00:00.000Z',
    });
    expect(result.ai).toMatchObject({
      state: 'configured',
      status: { providerName: 'Test Provider', model: 'test-model' },
    });
    expect(result.checkedAt).toBe('2026-10-31T09:00:00.000Z');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/health');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  });

  it('treats a missing health endpoint as a static deployment without probing AI', async () => {
    const fetchMock = routeFetch({
      '/api/health': () => jsonResponse({ error: 'not found' }, 404),
    });

    const result = await checkServices({ fetchImpl: asFetch(fetchMock), now: fixedNow });

    expect(result.health.state).toBe('unavailable');
    expect(result.health.state === 'unavailable' && result.health.message).toMatch(
      /static app without the Node API server/i,
    );
    expect(result.ai.state).toBe('unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats a gateway 502 from an unreachable API server as unavailable', async () => {
    const fetchMock = routeFetch({
      '/api/health': () => jsonResponse({ error: 'bad gateway' }, 502),
    });

    const result = await checkServices({ fetchImpl: asFetch(fetchMock), now: fixedNow });

    expect(result.health.state).toBe('unavailable');
    expect(result.health.state === 'unavailable' && result.health.message).toMatch(
      /HTTP 502.*API server is unavailable/i,
    );
    expect(result.ai.state).toBe('unavailable');
  });

  it('treats a 503 and 504 response as unavailable', async () => {
    for (const status of [503, 504]) {
      const fetchMock = routeFetch({
        '/api/health': () => jsonResponse({ error: 'unavailable' }, status),
      });

      const result = await checkServices({ fetchImpl: asFetch(fetchMock), now: fixedNow });

      expect(result.health.state).toBe('unavailable');
      expect(result.health.state === 'unavailable' && result.health.message).toMatch(
        new RegExp(`HTTP ${status}`),
      );
      expect(result.ai.state).toBe('unavailable');
    }
  });

  it('reports an error when the API itself returns an internal error', async () => {
    const fetchMock = routeFetch({
      '/api/health': () => jsonResponse({ error: 'boom' }, 500),
    });

    const result = await checkServices({ fetchImpl: asFetch(fetchMock), now: fixedNow });

    expect(result.health).toMatchObject({ state: 'error', status: 500 });
    expect(result.health.state === 'error' && result.health.message).toMatch(/HTTP 500/);
    expect(result.ai.state).toBe('unavailable');
  });

  it('reports an error when the health payload is not JSON', async () => {
    const fetchMock = routeFetch({
      '/api/health': () => new Response('not-json', { status: 200 }),
    });

    const result = await checkServices({ fetchImpl: asFetch(fetchMock), now: fixedNow });

    expect(result.health).toMatchObject({ state: 'error', status: 200 });
    expect(result.health.state === 'error' && result.health.message).toMatch(
      /not valid JSON/i,
    );
  });

  it('treats an SPA fallback page as a static deployment', async () => {
    const fetchMock = routeFetch({
      '/api/health': () =>
        new Response('<!doctype html><title>App</title>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
    });

    const result = await checkServices({ fetchImpl: asFetch(fetchMock), now: fixedNow });

    expect(result.health.state).toBe('unavailable');
    expect(result.health.state === 'unavailable' && result.health.message).toMatch(
      /returned the app page instead of a health response/i,
    );
    expect(result.ai.state).toBe('unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports an error when the health payload has an unexpected shape', async () => {
    const fetchMock = routeFetch({
      '/api/health': () => jsonResponse({ status: 'degraded' }),
    });

    const result = await checkServices({ fetchImpl: asFetch(fetchMock), now: fixedNow });

    expect(result.health.state).toBe('error');
    expect(result.health.state === 'error' && result.health.message).toMatch(
      /unexpected response/i,
    );
  });

  it('reports the API as unavailable when the network request fails', async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const result = await checkServices({ fetchImpl: asFetch(fetchMock), now: fixedNow });

    expect(result.health.state).toBe('unavailable');
    expect(result.health.state === 'unavailable' && result.health.message).toMatch(
      /could not be reached/i,
    );
    expect(result.ai.state).toBe('unavailable');
  });

  it('reports the API as unavailable when the check times out', async () => {
    vi.useFakeTimers();

    try {
      const fetchMock = makeFetchMock();
      fetchMock.mockImplementation((_input, init) => {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;

          if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }

          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });

      const pending = checkServices({
        fetchImpl: asFetch(fetchMock),
        timeoutMs: 1_000,
        now: fixedNow,
      });

      await vi.advanceTimersByTimeAsync(1_000);
      const result = await pending;

      expect(result.health.state).toBe('unavailable');
      expect(result.health.state === 'unavailable' && result.health.message).toMatch(
        /did not respond within 1 seconds/i,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a cancelled check when the caller aborts first', async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockImplementation((_input, init) =>
      init?.signal?.aborted
        ? Promise.reject(new DOMException('Aborted', 'AbortError'))
        : new Promise<Response>(() => {}),
    );
    const controller = new AbortController();
    controller.abort();

    const result = await checkServices({
      fetchImpl: asFetch(fetchMock),
      signal: controller.signal,
      now: fixedNow,
    });

    expect(result.health.state).toBe('unavailable');
    expect(result.health.state === 'unavailable' && result.health.message).toBe(
      'The service check was cancelled.',
    );
  });

  it('reports configuration required when the server has no provider', async () => {
    const fetchMock = routeFetch({
      '/api/health': () => jsonResponse({ status: 'ok' }),
      '/api/ai/status': () => jsonResponse(makeAiStatus()),
    });

    const result = await checkServices({ fetchImpl: asFetch(fetchMock), now: fixedNow });

    expect(result.ai).toMatchObject({ state: 'configuration-required' });
  });

  it('reports an AI error with the server request ID', async () => {
    const fetchMock = routeFetch({
      '/api/health': () => jsonResponse({ status: 'ok' }),
      '/api/ai/status': () =>
        jsonResponse(
          {
            error: {
              code: 'rate-limited',
              message: 'Too many AI requests were sent.',
              requestId: 'req-rate-1',
              retryAfterSeconds: 30,
            },
          },
          429,
        ),
    });

    const result = await checkServices({ fetchImpl: asFetch(fetchMock), now: fixedNow });

    expect(result.ai).toMatchObject({
      state: 'error',
      requestId: 'req-rate-1',
      message: 'Too many AI requests were sent.',
    });
  });

  it('reports the AI provider as unavailable on a network failure', async () => {
    let call = 0;
    const fetchMock = makeFetchMock();
    fetchMock.mockImplementation(() => {
      call += 1;

      return call === 1
        ? Promise.resolve(jsonResponse({ status: 'ok' }))
        : Promise.reject(new TypeError('fetch failed'));
    });

    const result = await checkServices({ fetchImpl: asFetch(fetchMock), now: fixedNow });

    expect(result.health.state).toBe('operational');
    expect(result.ai.state).toBe('unavailable');
    expect(result.ai.state === 'unavailable' && result.ai.message).toMatch(
      /could not be reached/i,
    );
  });

  it('reports an AI error when the status payload is malformed', async () => {
    const fetchMock = routeFetch({
      '/api/health': () => jsonResponse({ status: 'ok' }),
      '/api/ai/status': () => jsonResponse({ configured: 'yes' }),
    });

    const result = await checkServices({ fetchImpl: asFetch(fetchMock), now: fixedNow });

    expect(result.ai.state).toBe('error');
    expect(result.ai.state === 'error' && result.ai.requestId).toBeNull();
  });
});
