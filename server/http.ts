import { randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import {
  aiPlanEnvelopeSchema,
  aiPlanRequestSchema,
  formatSchemaIssues,
  type AiApiErrorBody,
  type AiErrorCode,
  type AiPlanEnvelope,
  type AiPlanRequest,
} from '../src/features/ai/contracts.ts';
import { publicAiStatus, type AiServerConfig } from './config.ts';
import { createRateLimiter, type RateLimiter } from './rateLimit.ts';
import { ProviderError } from './provider.ts';
import { AiServiceError, type AiService } from './service.ts';

export interface ApiLogger {
  info(message: string): void;
  error(message: string): void;
}

const consoleLogger: ApiLogger = {
  info(message: string) {
    console.info(message);
  },
  error(message: string) {
    console.error(message);
  },
};

export interface ApiHandlerOptions {
  readonly config: AiServerConfig;
  readonly service: AiService | null;
  readonly providerName?: string | null;
  readonly model?: string | null;
  readonly rateLimiter?: RateLimiter;
  readonly logger?: ApiLogger;
  readonly now?: () => Date;
  readonly createRequestId?: () => string;
  readonly requestTimeoutMs?: number;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
} as const;

function routeName(path: string): 'health' | 'plan' | 'status' | 'other' {
  if (path === '/api/health') {
    return 'health';
  }

  if (path === '/api/ai/plan') {
    return 'plan';
  }

  if (path === '/api/ai/status') {
    return 'status';
  }

  return 'other';
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Readonly<Record<string, string>> = {},
): void {
  if (response.headersSent || response.writableEnded) {
    return;
  }

  const payload = JSON.stringify(body);

  response.writeHead(status, {
    ...JSON_HEADERS,
    'Content-Length': String(Buffer.byteLength(payload)),
    ...extraHeaders,
  });
  response.end(payload);
}

function sendError(
  response: ServerResponse,
  status: number,
  code: AiErrorCode,
  message: string,
  requestId: string | null,
  retryAfterSeconds: number | null = null,
): void {
  const body: AiApiErrorBody = {
    error: { code, message, requestId, retryAfterSeconds },
  };

  sendJson(
    response,
    status,
    body,
    retryAfterSeconds
      ? { 'Retry-After': String(retryAfterSeconds) }
      : {},
  );
}

function isJsonContentType(value: string | string[] | undefined): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  return value.split(';')[0]?.trim().toLowerCase() === 'application/json';
}

type BodyReadResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: 'too-large' | 'unreadable' };

/**
 * Reads the request body with a hard byte budget. Once the limit is crossed the
 * bytes are discarded rather than accumulated, so an oversized request cannot
 * consume unbounded memory. The request timeout in the handler bounds slow
 * uploads.
 */
function readJsonBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<BodyReadResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    let settled = false;

    const finish = (result: BodyReadResult) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    };

    request.on('data', (chunk: Buffer) => {
      size += chunk.length;

      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }

      chunks.push(chunk);
    });

    request.on('end', () => {
      finish(
        tooLarge
          ? { ok: false, reason: 'too-large' }
          : { ok: true, text: Buffer.concat(chunks).toString('utf8') },
      );
    });

    request.on('error', () => finish({ ok: false, reason: 'unreadable' }));
  });
}

function providerFailure(
  error: ProviderError,
): {
  readonly status: number;
  readonly code: AiErrorCode;
  readonly message: string;
  readonly retryAfterSeconds: number | null;
} {
  switch (error.code) {
    case 'timeout':
      return {
        status: 504,
        code: 'timeout',
        message:
          'The AI provider did not respond before the server timeout. Nothing was changed. Try again or use the deterministic local outline.',
        retryAfterSeconds: null,
      };
    case 'auth':
      return {
        status: 502,
        code: 'provider-auth',
        message:
          'The API server could not authenticate with the AI provider. Check the server-side credentials. Nothing was changed.',
        retryAfterSeconds: null,
      };
    case 'rate-limited':
      return {
        status: 503,
        code: 'provider-rate-limited',
        message:
          'The AI provider is temporarily rate limiting requests. Nothing was changed. Try again shortly or use the deterministic local outline.',
        retryAfterSeconds: error.retryAfterSeconds,
      };
    case 'unavailable':
      return {
        status: 503,
        code: 'provider-unavailable',
        message:
          'The AI provider is temporarily unavailable. Your saved planning data is unchanged. Try again later or use the deterministic local outline.',
        retryAfterSeconds: null,
      };
    case 'invalid-response':
      return {
        status: 502,
        code: 'invalid-provider-response',
        message:
          'The AI provider returned a response that could not be validated. Nothing was shown or applied. Try again or use the deterministic local outline.',
        retryAfterSeconds: null,
      };
    case 'provider-error':
      return {
        status: 502,
        code: 'provider-error',
        message:
          'The AI provider rejected the request. Nothing was changed. Check the server provider configuration or use the deterministic local outline.',
        retryAfterSeconds: null,
      };
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

export function createApiHandler(
  options: ApiHandlerOptions,
): (request: IncomingMessage, response: ServerResponse) => void {
  const logger = options.logger ?? consoleLogger;
  const now = options.now ?? (() => new Date());
  const createRequestId = options.createRequestId ?? (() => randomUUID());
  const rateLimiter =
    options.rateLimiter ??
    createRateLimiter({
      maxRequests: options.config.rateLimit.maxRequests,
      windowMs: options.config.rateLimit.windowMs,
    });
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  const status = publicAiStatus(options.config);

  return (request: IncomingMessage, response: ServerResponse) => {
    const method = request.method ?? 'GET';
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    const requestId = createRequestId();
    const startedAt = Date.now();

    response.setHeader('X-Request-Id', requestId);
    request.setTimeout(requestTimeoutMs, () => request.destroy());

    response.on('finish', () => {
      logger.info(
        `[ai-api] route=${routeName(path)} method=${method} status=${response.statusCode} durationMs=${Date.now() - startedAt} request=${requestId}`,
      );
    });

    void (async () => {
      try {
        if (path === '/api/health') {
          if (method !== 'GET') {
            sendError(
              response,
              405,
              'method-not-allowed',
              'This endpoint accepts GET requests only.',
              requestId,
            );
            return;
          }

          sendJson(response, 200, { status: 'ok' });
          return;
        }

        if (path === '/api/ai/status') {
          if (method !== 'GET') {
            sendError(
              response,
              405,
              'method-not-allowed',
              'This endpoint accepts GET requests only.',
              requestId,
            );
            return;
          }

          sendJson(response, 200, status);
          return;
        }

        if (path !== '/api/ai/plan') {
          sendError(
            response,
            404,
            'not-found',
            'The requested API route does not exist.',
            requestId,
          );
          return;
        }

        if (method !== 'POST') {
          sendError(
            response,
            405,
            'method-not-allowed',
            'This endpoint accepts POST requests only.',
            requestId,
          );
          return;
        }

        const decision = rateLimiter.check(
          request.socket.remoteAddress ?? 'unknown',
        );

        if (!decision.allowed) {
          sendError(
            response,
            429,
            'rate-limited',
            `Too many AI planning requests. Wait ${decision.retryAfterSeconds} seconds before trying again. Nothing was changed.`,
            requestId,
            decision.retryAfterSeconds,
          );
          return;
        }

        if (!status.configured || !options.service) {
          sendError(
            response,
            503,
            'not-configured',
            status.message,
            requestId,
          );
          return;
        }

        if (!isJsonContentType(request.headers['content-type'])) {
          request.resume();
          sendError(
            response,
            415,
            'unsupported-media-type',
            'Send the AI planning request as application/json.',
            requestId,
          );
          return;
        }

        const declaredLength = Number(request.headers['content-length']);

        if (
          Number.isFinite(declaredLength) &&
          declaredLength > options.config.maxRequestBytes
        ) {
          request.resume();
          sendError(
            response,
            413,
            'request-too-large',
            'The AI planning request is too large. Shorten the request and try again. Nothing was changed.',
            requestId,
          );
          return;
        }

        const body = await readJsonBody(
          request,
          options.config.maxRequestBytes,
        );

        if (!body.ok) {
          if (body.reason === 'too-large') {
            sendError(
              response,
              413,
              'request-too-large',
              'The AI planning request is too large. Shorten the request and try again. Nothing was changed.',
              requestId,
            );
            return;
          }

          sendError(
            response,
            400,
            'invalid-request',
            'The AI planning request could not be read. Nothing was changed.',
            requestId,
          );
          return;
        }

        let decoded: unknown;

        try {
          decoded = JSON.parse(body.text);
        } catch {
          sendError(
            response,
            400,
            'invalid-request',
            'The AI planning request is not valid JSON. Nothing was changed.',
            requestId,
          );
          return;
        }

        const parsedRequest = aiPlanRequestSchema.safeParse(decoded);

        if (!parsedRequest.success) {
          sendError(
            response,
            400,
            'invalid-request',
            `The AI planning request is invalid. ${formatSchemaIssues(
              parsedRequest.error,
            )} Nothing was changed.`,
            requestId,
          );
          return;
        }

        const plan = await options.service.generatePlan(
          parsedRequest.data as AiPlanRequest,
        );
        const envelope: AiPlanEnvelope = {
          requestId,
          generatedAt: now().toISOString(),
          source: 'provider',
          provider: {
            name:
              options.providerName?.trim() ||
              options.config.provider.name ||
              'AI provider',
            model:
              options.model?.trim() ||
              options.config.provider.model ||
              'configured model',
          },
          plan,
        };
        const parsedEnvelope = aiPlanEnvelopeSchema.safeParse(envelope);

        if (!parsedEnvelope.success) {
          throw new AiServiceError(
            'invalid-provider-response',
            'The generated plan could not be packaged safely. Nothing was shown or applied.',
          );
        }

        sendJson(response, 200, parsedEnvelope.data);
      } catch (error) {
        if (error instanceof ProviderError) {
          const failure = providerFailure(error);
          sendError(
            response,
            failure.status,
            failure.code,
            failure.message,
            requestId,
            failure.retryAfterSeconds,
          );
          return;
        }

        if (error instanceof AiServiceError) {
          if (error.code === 'invalid-request') {
            sendError(
              response,
              400,
              'invalid-request',
              `${error.message} Nothing was changed.`,
              requestId,
            );
            return;
          }

          sendError(
            response,
            502,
            'invalid-provider-response',
            error.message,
            requestId,
          );
          return;
        }

        logger.error(
          `[ai-api] request=${requestId} failed error=${errorName(error)}`,
        );
        sendError(
          response,
          500,
          'server-error',
          'The AI API server could not complete the request safely. Your saved planning data is unchanged. Try again later or use the deterministic local outline.',
          requestId,
        );
      }
    })();
  };
}

export function createApiServer(options: ApiHandlerOptions): Server {
  return createServer(createApiHandler(options));
}
