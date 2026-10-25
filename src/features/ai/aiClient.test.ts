import { describe, expect, it, vi } from 'vitest';
import { makeAiEnvelope, makeAiRequest } from '@/test/aiFixtures';
import { fetchAiStatus, requestAiPlan } from './aiClient';

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

describe('AI client', () => {
  it('rejects an invalid request locally without calling the server', async () => {
    const fetchMock = makeFetchMock();
    const result = await requestAiPlan(
      makeAiRequest({ message: 'hi' }),
      { fetchImpl: asFetch(fetchMock) },
    );

    expect(result).toMatchObject({ ok: false, code: 'invalid-request' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts a validated request and accepts a valid envelope', async () => {
    const fetchMock = makeFetchMock();
    const envelope = makeAiEnvelope();
    fetchMock.mockResolvedValue(jsonResponse(envelope));
    const result = await requestAiPlan(makeAiRequest(), {
      fetchImpl: asFetch(fetchMock),
    });

    expect(result).toEqual({ ok: true, data: envelope });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/ai/plan');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
      }),
    });
  });

  it('rejects a malformed or structurally incomplete envelope', async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValue(
      jsonResponse({ requestId: 'only-an-id', plan: { overview: 'incomplete' } }),
    );
    const result = await requestAiPlan(makeAiRequest(), {
      fetchImpl: asFetch(fetchMock),
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'invalid-provider-response',
    });
    expect(result.ok ? '' : result.message).toContain('Nothing was shown or applied');
  });

  it('surfaces safe server error details and retry timing', async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'rate-limited',
            message: 'Too many AI planning requests.',
            requestId: 'req-42',
            retryAfterSeconds: 30,
          },
        },
        429,
      ),
    );
    const result = await requestAiPlan(makeAiRequest(), {
      fetchImpl: asFetch(fetchMock),
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'rate-limited',
      message: 'Too many AI planning requests.',
      requestId: 'req-42',
      retryAfterSeconds: 30,
    });
  });

  it('falls back to safe codes when an error body is not JSON', async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValue(new Response('provider secret stack trace', { status: 401 }));
    const result = await requestAiPlan(makeAiRequest(), {
      fetchImpl: asFetch(fetchMock),
    });

    expect(result).toMatchObject({ ok: false, code: 'provider-auth' });
    expect(result.ok ? '' : result.message).not.toContain('stack trace');
  });

  it('reports network failures without exposing request contents', async () => {
    const fetchMock = makeFetchMock();
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const result = await requestAiPlan(makeAiRequest(), {
      fetchImpl: asFetch(fetchMock),
    });

    expect(result).toMatchObject({ ok: false, code: 'network' });
    expect(result.ok ? '' : result.message).toContain('AI API server could not be reached');
  });

  it('reports a client timeout', async () => {
    const fetchImpl = vi.fn(
      (...args: FetchArgs) =>
        new Promise<Response>((_resolve, reject) => {
          args[1]?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    const result = await requestAiPlan(makeAiRequest(), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 10,
    });

    expect(result).toMatchObject({ ok: false, code: 'timeout' });
    expect(result.ok ? '' : result.message).toContain('timed out');
  });

  it('reports cancellation separately from a network failure', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (...args: FetchArgs) =>
        new Promise<Response>((_resolve, reject) => {
          if (args[1]?.signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }

          args[1]?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    controller.abort();
    const result = await requestAiPlan(makeAiRequest(), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      signal: controller.signal,
    });

    expect(result).toMatchObject({ ok: false, code: 'network' });
    expect(result.ok ? '' : result.message).toContain('cancelled');
  });

  it('validates the status endpoint payload', async () => {
    const status = {
      configured: false,
      providerName: null,
      model: null,
      message: 'AI planning is not configured on the API server.',
      limits: {
        maxMessageCharacters: 2_000,
        maxRequestBytes: 96_000,
        timeoutMs: 20_000,
        rateLimitPerMinute: 10,
      },
    };
    const fetchMock = makeFetchMock();
    fetchMock.mockResolvedValue(jsonResponse(status));
    const result = await fetchAiStatus({ fetchImpl: asFetch(fetchMock) });

    expect(result).toEqual({ ok: true, data: status });

    fetchMock.mockResolvedValue(jsonResponse({ configured: 'yes' }));
    const invalid = await fetchAiStatus({ fetchImpl: asFetch(fetchMock) });
    expect(invalid).toMatchObject({ ok: false, code: 'server-error' });
  });
});
