import {
  aiApiErrorSchema,
  aiPlanEnvelopeSchema,
  aiPlanRequestSchema,
  aiStatusSchema,
  formatSchemaIssues,
  type AiApiErrorBody,
  type AiErrorCode,
  type AiPlanEnvelope,
  type AiPlanRequest,
  type AiStatus,
} from './contracts';

export type AiClientFailureCode = AiErrorCode | 'network';

export interface AiClientFailure {
  readonly ok: false;
  readonly code: AiClientFailureCode;
  readonly message: string;
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;
}

export type AiClientResult<T> =
  | { readonly ok: true; readonly data: T }
  | AiClientFailure;

interface ClientOptions {
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

const DEFAULT_CLIENT_TIMEOUT_MS = 35_000;

function clientFailure(
  code: AiClientFailureCode,
  message: string,
  requestId: string | null = null,
  retryAfterSeconds: number | null = null,
): AiClientFailure {
  return { ok: false, code, message, requestId, retryAfterSeconds };
}

function timeoutSignal(
  timeoutMs: number,
  external: AbortSignal | undefined,
): {
  readonly signal: AbortSignal;
  readonly timedOut: () => boolean;
  readonly cleanup: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  if (external) {
    if (external.aborted) {
      controller.abort();
    } else {
      external.addEventListener('abort', abort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', abort);
    },
  };
}

function networkMessage(): string {
  return 'The AI API server could not be reached. Your saved planning data is unchanged. Check that the API server is available or use the deterministic local outline.';
}

async function readErrorBody(response: Response): Promise<AiApiErrorBody | null> {
  try {
    const payload: unknown = await response.json();
    const parsed = aiApiErrorSchema.safeParse(payload);

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function statusFallback(status: number): AiClientFailure {
  if (status === 401 || status === 403) {
    return clientFailure(
      'provider-auth',
      'The AI API server could not authenticate the provider request. Nothing was changed.',
    );
  }

  if (status === 429) {
    return clientFailure(
      'rate-limited',
      'Too many AI requests were sent. Wait before trying again. Nothing was changed.',
    );
  }

  return clientFailure(
    'server-error',
    'The AI API server could not complete the request safely. Nothing was changed. Try again or use the deterministic local outline.',
  );
}

export async function fetchAiStatus(
  options: ClientOptions = {},
): Promise<AiClientResult<AiStatus>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = timeoutSignal(
    options.timeoutMs ?? DEFAULT_CLIENT_TIMEOUT_MS,
    options.signal,
  );

  try {
    const response = await fetchImpl('/api/ai/status', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: timeout.signal,
    });

    if (!response.ok) {
      const body = await readErrorBody(response);

      return body
        ? clientFailure(
            body.error.code,
            body.error.message,
            body.error.requestId,
            body.error.retryAfterSeconds,
          )
        : statusFallback(response.status);
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      return clientFailure(
        'invalid-provider-response',
        'The AI API server returned a status response that was not valid JSON.',
      );
    }

    const parsed = aiStatusSchema.safeParse(payload);

    return parsed.success
      ? { ok: true, data: parsed.data }
      : clientFailure(
          'server-error',
          'The AI API server returned an unexpected status response. AI planning may be misconfigured.',
        );
  } catch {
    if (timeout.timedOut()) {
      return clientFailure(
        'timeout',
        'The AI API server did not respond in time. Check that the API server is available and try again.',
      );
    }

    if (options.signal?.aborted) {
      return clientFailure('network', 'The AI status request was cancelled.');
    }

    return clientFailure('network', networkMessage());
  } finally {
    timeout.cleanup();
  }
}

export async function requestAiPlan(
  request: AiPlanRequest,
  options: ClientOptions = {},
): Promise<AiClientResult<AiPlanEnvelope>> {
  const requestValidation = aiPlanRequestSchema.safeParse(request);

  if (!requestValidation.success) {
    return clientFailure(
      'invalid-request',
      `The AI request is invalid. ${formatSchemaIssues(
        requestValidation.error,
      )} Nothing was sent.`,
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = timeoutSignal(
    options.timeoutMs ?? DEFAULT_CLIENT_TIMEOUT_MS,
    options.signal,
  );

  try {
    const response = await fetchImpl('/api/ai/plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(requestValidation.data),
      signal: timeout.signal,
    });

    if (!response.ok) {
      const body = await readErrorBody(response);

      return body
        ? clientFailure(
            body.error.code,
            body.error.message,
            body.error.requestId,
            body.error.retryAfterSeconds,
          )
        : statusFallback(response.status);
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      return clientFailure(
        'invalid-provider-response',
        'The AI API server returned a response that was not valid JSON. Nothing was shown or applied.',
      );
    }

    const parsed = aiPlanEnvelopeSchema.safeParse(payload);

    if (!parsed.success) {
      return clientFailure(
        'invalid-provider-response',
        `The AI response did not match the supported plan format. ${formatSchemaIssues(
          parsed.error,
        )} Nothing was shown or applied.`,
      );
    }

    return { ok: true, data: parsed.data };
  } catch {
    if (timeout.timedOut()) {
      return clientFailure(
        'timeout',
        'The AI request timed out. Your saved planning data is unchanged. Try again or use the deterministic local outline.',
      );
    }

    if (options.signal?.aborted) {
      return clientFailure(
        'network',
        'The AI request was cancelled. Your saved planning data is unchanged.',
      );
    }

    return clientFailure('network', networkMessage());
  } finally {
    timeout.cleanup();
  }
}
