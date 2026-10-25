export type ProviderFailureCode =
  | 'timeout'
  | 'auth'
  | 'rate-limited'
  | 'unavailable'
  | 'invalid-response'
  | 'provider-error';

export class ProviderError extends Error {
  readonly code: ProviderFailureCode;
  readonly retryAfterSeconds: number | null;

  constructor(
    code: ProviderFailureCode,
    message: string,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface AiProviderRequest {
  readonly system: string;
  readonly user: string;
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
}

export interface AiProviderResult {
  readonly content: string;
  readonly model: string;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  generate(request: AiProviderRequest): Promise<AiProviderResult>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface OpenAiCompatibleProviderOptions {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly name: string;
  readonly fetchImpl?: FetchLike;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRetryAfter(response: Response): number | null {
  const header = response.headers.get('retry-after');

  if (!header) {
    return null;
  }

  const seconds = Number(header.trim());
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

function extractContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  const first = payload.choices[0];

  if (!isRecord(first) || !isRecord(first.message)) {
    return null;
  }

  const content = first.message.content;
  return typeof content === 'string' && content.trim() ? content.trim() : null;
}

function statusError(status: number, response: Response): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError(
      'auth',
      'The AI provider rejected the server credentials.',
    );
  }

  if (status === 429) {
    return new ProviderError(
      'rate-limited',
      'The AI provider is temporarily rate limiting requests.',
      readRetryAfter(response),
    );
  }

  if (status >= 500) {
    return new ProviderError(
      'unavailable',
      'The AI provider is temporarily unavailable.',
    );
  }

  return new ProviderError(
    'provider-error',
    'The AI provider rejected the request. Check the server model and provider configuration.',
  );
}

function isTimeoutError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const name = (error as { readonly name?: unknown }).name;

  return name === 'TimeoutError' || name === 'AbortError';
}

/**
 * Adapter for OpenAI-compatible Chat Completions APIs. It uses one attempt per
 * request, a bounded timeout, and a bounded output token limit. Provider
 * response bodies and credentials are never logged or returned to the client.
 */
export function createOpenAiCompatibleProvider(
  options: OpenAiCompatibleProviderOptions,
): AiProvider {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    name: options.name,
    model: options.model,

    async generate(request: AiProviderRequest): Promise<AiProviderResult> {
      let response: Response;

      try {
        response = await fetchImpl(`${options.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model: options.model,
            temperature: 0.2,
            max_tokens: request.maxOutputTokens,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content: request.user },
            ],
          }),
          signal: AbortSignal.timeout(request.timeoutMs),
        });
      } catch (error) {
        if (isTimeoutError(error)) {
          throw new ProviderError(
            'timeout',
            'The AI provider did not respond before the request timeout.',
          );
        }

        throw new ProviderError(
          'unavailable',
          'The AI provider could not be reached from the API server.',
        );
      }

      if (!response.ok) {
        throw statusError(response.status, response);
      }

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        throw new ProviderError(
          'invalid-response',
          'The AI provider returned a response that was not valid JSON.',
        );
      }

      const content = extractContent(payload);

      if (!content) {
        throw new ProviderError(
          'invalid-response',
          'The AI provider returned no usable message content.',
        );
      }

      return { content, model: options.model };
    },
  };
}
