import { describe, expect, it, vi } from 'vitest';
import {
  createOpenAiCompatibleProvider,
  ProviderError,
  type AiProviderRequest,
  type FetchLike,
} from './provider.ts';

const secret = 'sk-test-provider-secret';

const request: AiProviderRequest = {
  system: 'System prompt',
  user: 'User prompt',
  timeoutMs: 5_000,
  maxOutputTokens: 900,
};

function makeProvider(fetchImpl: FetchLike) {
  return createOpenAiCompatibleProvider({
    apiKey: secret,
    baseUrl: 'https://provider.example.test/v1',
    model: 'test-model',
    name: 'Test Provider',
    fetchImpl,
  });
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function providerPayload(content: unknown) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content,
        },
      },
    ],
  };
}

async function captureProviderError(
  fetchImpl: FetchLike,
): Promise<ProviderError> {
  try {
    await makeProvider(fetchImpl).generate(request);
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderError);
    return error as ProviderError;
  }

  throw new Error('Expected the provider to fail.');
}

describe('OpenAI-compatible provider adapter', () => {
  it('sends one bounded authenticated request and returns the message content', async () => {
    const fetchMock = vi.fn<FetchLike>(async () =>
      jsonResponse(providerPayload('  {"overview":"Ready"}  ')),
    );
    const provider = makeProvider(fetchMock);
    const result = await provider.generate(request);

    expect(result).toEqual({
      content: '{"overview":"Ready"}',
      model: 'test-model',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0];

    expect(call).toBeDefined();

    if (!call) {
      throw new Error('Expected the provider to call fetch.');
    }

    const [url, init] = call;
    expect(url).toBe('https://provider.example.test/v1/chat/completions');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    });

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'test-model',
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps a timeout or aborted request to a safe timeout error', async () => {
    const timeoutError = await captureProviderError(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    const abortError = await captureProviderError(async () => {
      throw new DOMException('The operation was aborted.', 'AbortError');
    });

    expect(timeoutError.code).toBe('timeout');
    expect(abortError.code).toBe('timeout');
    expect(timeoutError.message).toContain('did not respond');
    expect(timeoutError.message).not.toContain(secret);
  });

  it('maps network failures to unavailable without leaking connection details', async () => {
    const error = await captureProviderError(async () => {
      throw new TypeError('connect ECONNREFUSED provider.example.test');
    });

    expect(error.code).toBe('unavailable');
    expect(error.message).toContain('could not be reached');
    expect(error.message).not.toContain('ECONNREFUSED');
    expect(error.message).not.toContain('provider.example.test');
  });

  it('maps rejected credentials to an authentication error', async () => {
    for (const status of [401, 403]) {
      const error = await captureProviderError(async () =>
        jsonResponse({ error: { message: `bad key ${secret}` } }, status),
      );

      expect(error.code).toBe('auth');
      expect(error.message).toContain('rejected the server credentials');
      expect(error.message).not.toContain(secret);
    }
  });

  it('maps provider rate limiting and preserves a valid retry delay only', async () => {
    const withDelay = await captureProviderError(async () =>
      jsonResponse({ error: 'slow down' }, 429, { 'Retry-After': '45' }),
    );
    const withoutDelay = await captureProviderError(async () =>
      jsonResponse({ error: 'slow down' }, 429, { 'Retry-After': 'soon' }),
    );

    expect(withDelay.code).toBe('rate-limited');
    expect(withDelay.retryAfterSeconds).toBe(45);
    expect(withoutDelay.retryAfterSeconds).toBeNull();
    expect(withDelay.message).not.toContain(secret);
  });

  it('maps server failures to unavailable and other rejections to provider-error', async () => {
    const unavailable = await captureProviderError(async () =>
      jsonResponse({ error: 'internal ${secret}' }, 500),
    );
    const rejected = await captureProviderError(async () =>
      jsonResponse({ error: `invalid model ${secret}` }, 400),
    );

    expect(unavailable.code).toBe('unavailable');
    expect(unavailable.message).toContain('temporarily unavailable');
    expect(rejected.code).toBe('provider-error');
    expect(rejected.message).toContain('rejected the request');
    expect(`${unavailable.message} ${rejected.message}`).not.toContain(secret);
  });

  it('rejects non-JSON bodies and missing message content', async () => {
    const malformed = await captureProviderError(
      async () => new Response('<html>secret</html>', { status: 200 }),
    );
    const emptyChoices = await captureProviderError(async () =>
      jsonResponse({ choices: [] }),
    );
    const blankContent = await captureProviderError(async () =>
      jsonResponse(providerPayload('   ')),
    );

    expect(malformed.code).toBe('invalid-response');
    expect(malformed.message).toContain('not valid JSON');
    expect(emptyChoices.code).toBe('invalid-response');
    expect(blankContent.code).toBe('invalid-response');
    expect(blankContent.message).toContain('no usable message content');
    expect(malformed.message).not.toContain('<html>');
  });
});
