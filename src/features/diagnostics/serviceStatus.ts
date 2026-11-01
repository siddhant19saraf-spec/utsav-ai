import { z } from 'zod';
import { fetchAiStatus } from '@/features/ai/aiClient';
import type { AiStatus } from '@/features/ai/contracts';

export type HealthProbe =
  | { readonly state: 'operational'; readonly checkedAt: string }
  | { readonly state: 'unavailable'; readonly checkedAt: string; readonly message: string }
  | {
      readonly state: 'error';
      readonly checkedAt: string;
      readonly status: number | null;
      readonly message: string;
    };

export type AiProviderProbe =
  | { readonly state: 'configured'; readonly checkedAt: string; readonly status: AiStatus }
  | {
      readonly state: 'configuration-required';
      readonly checkedAt: string;
      readonly status: AiStatus;
    }
  | { readonly state: 'unavailable'; readonly checkedAt: string; readonly message: string }
  | {
      readonly state: 'error';
      readonly checkedAt: string;
      readonly message: string;
      readonly requestId: string | null;
    };

export interface ServiceProbeResult {
  readonly health: HealthProbe;
  readonly ai: AiProviderProbe;
  readonly checkedAt: string;
}

export interface ServiceProbeOptions {
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
}

const DEFAULT_PROBE_TIMEOUT_MS = 4_000;
const healthSchema = z.object({ status: z.literal('ok') });
const staticDeploymentMessage =
  'The same-origin API did not respond (HTTP 404). This deployment serves the static app without the Node API server, so server health and AI planning are unavailable.';
const staticAppResponseMessage =
  'The same-origin API returned the app page instead of a health response. This deployment serves the static app without the Node API server, so server health and AI planning are unavailable.';

// A dev proxy or hosting gateway answers with these when the API process is not
// reachable, so the API server is unavailable rather than reporting a health error.
const gatewayUnavailableStatuses = new Set([502, 503, 504]);

function isHtmlResponse(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').includes('text/html');
}

async function probeHealth(
  options: ServiceProbeOptions,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  now: () => Date,
): Promise<HealthProbe> {
  const checkedAt = now().toISOString();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const external = options.signal;
  const forwardAbort = () => controller.abort();

  if (external) {
    if (external.aborted) {
      controller.abort();
    } else {
      external.addEventListener('abort', forwardAbort, { once: true });
    }
  }

  try {
    const response = await fetchImpl('/api/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          state: 'unavailable',
          checkedAt,
          message: staticDeploymentMessage,
        };
      }

      if (gatewayUnavailableStatuses.has(response.status)) {
        return {
          state: 'unavailable',
          checkedAt,
          message: `The same-origin API responded with HTTP ${response.status}, which indicates the API server is unavailable rather than reporting a health error.`,
        };
      }

      return {
        state: 'error',
        checkedAt,
        status: response.status,
        message: `The API health endpoint responded with HTTP ${response.status}.`,
      };
    }

    if (isHtmlResponse(response)) {
      return {
        state: 'unavailable',
        checkedAt,
        message: staticAppResponseMessage,
      };
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      return {
        state: 'error',
        checkedAt,
        status: response.status,
        message: 'The API health endpoint returned a response that was not valid JSON.',
      };
    }

    return healthSchema.safeParse(payload).success
      ? { state: 'operational', checkedAt }
      : {
          state: 'error',
          checkedAt,
          status: response.status,
          message: 'The API health endpoint returned an unexpected response.',
        };
  } catch {
    if (external?.aborted) {
      return {
        state: 'unavailable',
        checkedAt,
        message: 'The service check was cancelled.',
      };
    }

    if (timedOut) {
      return {
        state: 'unavailable',
        checkedAt,
        message: `The API health check did not respond within ${Math.round(
          timeoutMs / 1_000,
        )} seconds.`,
      };
    }

    return {
      state: 'unavailable',
      checkedAt,
      message: 'The same-origin API could not be reached from this browser.',
    };
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', forwardAbort);
  }
}

async function probeAiProvider(
  health: HealthProbe,
  options: ServiceProbeOptions,
  timeoutMs: number,
  now: () => Date,
): Promise<AiProviderProbe> {
  const checkedAt = now().toISOString();

  if (health.state !== 'operational') {
    return {
      state: 'unavailable',
      checkedAt,
      message:
        'The same-origin API is unavailable, so the AI provider cannot be reached from this deployment.',
    };
  }

  const response = await fetchAiStatus({
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    timeoutMs,
  });

  if (response.ok) {
    return response.data.configured
      ? { state: 'configured', checkedAt, status: response.data }
      : { state: 'configuration-required', checkedAt, status: response.data };
  }

  if (response.code === 'network' || response.code === 'timeout') {
    return { state: 'unavailable', checkedAt, message: response.message };
  }

  return {
    state: 'error',
    checkedAt,
    message: response.message,
    requestId: response.requestId,
  };
}

/**
 * Probes the same-origin health endpoint and, only if it responds, the AI
 * status endpoint. Needs no credentials, makes no provider request, and never
 * treats a loaded frontend as proof that the API is healthy.
 */
export async function checkServices(
  options: ServiceProbeOptions = {},
): Promise<ServiceProbeResult> {
  const now = options.now ?? (() => new Date());
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const health = await probeHealth(options, fetchImpl, timeoutMs, now);
  const ai = await probeAiProvider(health, options, timeoutMs, now);

  return { health, ai, checkedAt: now().toISOString() };
}
