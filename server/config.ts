import type { AiStatus } from '../src/features/ai/contracts.ts';

export interface AiProviderConfig {
  readonly apiKey: string | null;
  readonly baseUrl: string;
  readonly model: string | null;
  readonly name: string;
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
}

export interface AiServerConfig {
  readonly host: string;
  readonly port: number;
  readonly maxRequestBytes: number;
  readonly rateLimit: {
    readonly maxRequests: number;
    readonly windowMs: number;
  };
  readonly provider: AiProviderConfig;
  readonly serveStatic: boolean;
  readonly staticDir: string;
  /** Safe configuration notes. They name environment variables, never values. */
  readonly configurationErrors: readonly string[];
  readonly configured: boolean;
}

type Env = Readonly<Record<string, string | undefined>>;

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1_800;
const DEFAULT_MAX_REQUEST_BYTES = 96_000;
const DEFAULT_RATE_LIMIT_MAX = 10;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_STATIC_DIR = 'dist';

function readInteger(
  env: Env,
  name: string,
  fallback: number,
  min: number,
  max: number,
  errors: string[],
): number {
  const raw = env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    errors.push(`${name} must be a whole number from ${min} to ${max}.`);
    return fallback;
  }

  return value;
}

function readBaseUrl(env: Env, errors: string[]): string {
  const raw = env.AI_BASE_URL?.trim() || 'https://api.openai.com/v1';

  try {
    const url = new URL(raw);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Unsupported protocol.');
    }

    return url.toString().replace(/\/+$/, '');
  } catch {
    errors.push('AI_BASE_URL must be a valid http or https URL.');
    return 'https://api.openai.com/v1';
  }
}

function readProviderName(env: Env): string {
  const raw = env.AI_PROVIDER_NAME?.trim();
  return raw ? raw.slice(0, 80) : 'OpenAI-compatible provider';
}

function readBoolean(
  env: Env,
  name: string,
  fallback: boolean,
  errors: string[],
): boolean {
  const raw = env[name]?.trim().toLowerCase();

  if (!raw) {
    return fallback;
  }

  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  errors.push(`${name} must be true or false.`);
  return fallback;
}

function readStaticDir(env: Env, errors: string[]): string {
  const raw = env.STATIC_DIR?.trim() || DEFAULT_STATIC_DIR;

  if (raw.length > 500 || raw.includes('\0')) {
    errors.push('STATIC_DIR must be a filesystem path under 500 characters.');
    return DEFAULT_STATIC_DIR;
  }

  return raw;
}

/**
 * Reads server-only configuration. Secrets never leave this module through
 * `publicAiStatus`; the status payload contains only safe provider metadata.
 */
export function readServerConfig(env: Env): AiServerConfig {
  const errors: string[] = [];
  const apiKey = env.AI_PROVIDER_API_KEY?.trim() || null;
  const model = env.AI_MODEL?.trim() || null;
  const host = env.AI_SERVER_HOST?.trim() || '127.0.0.1';
  const portEnvName = env.AI_SERVER_PORT?.trim()
    ? 'AI_SERVER_PORT'
    : env.PORT?.trim()
      ? 'PORT'
      : 'AI_SERVER_PORT';
  const port = readInteger(env, portEnvName, 8787, 1, 65_535, errors);
  const timeoutMs = readInteger(
    env,
    'AI_REQUEST_TIMEOUT_MS',
    DEFAULT_TIMEOUT_MS,
    1_000,
    120_000,
    errors,
  );
  const maxOutputTokens = readInteger(
    env,
    'AI_MAX_OUTPUT_TOKENS',
    DEFAULT_MAX_OUTPUT_TOKENS,
    256,
    8_192,
    errors,
  );
  const maxRequestBytes = readInteger(
    env,
    'AI_MAX_REQUEST_BYTES',
    DEFAULT_MAX_REQUEST_BYTES,
    1_024,
    1_048_576,
    errors,
  );
  const maxRequests = readInteger(
    env,
    'AI_RATE_LIMIT_MAX',
    DEFAULT_RATE_LIMIT_MAX,
    1,
    1_000,
    errors,
  );
  const windowMs = readInteger(
    env,
    'AI_RATE_LIMIT_WINDOW_MS',
    DEFAULT_RATE_LIMIT_WINDOW_MS,
    1_000,
    3_600_000,
    errors,
  );
  const baseUrl = readBaseUrl(env, errors);
  const serveStatic = readBoolean(env, 'SERVE_STATIC', false, errors);
  const staticDir = readStaticDir(env, errors);

  if (apiKey && !model) {
    errors.push('AI_MODEL is required when AI_PROVIDER_API_KEY is set.');
  }

  if (host.length > 200) {
    errors.push('AI_SERVER_HOST is too long.');
  }

  return {
    host,
    port,
    maxRequestBytes,
    rateLimit: { maxRequests, windowMs },
    provider: {
      apiKey,
      baseUrl,
      model,
      name: readProviderName(env),
      timeoutMs,
      maxOutputTokens,
    },
    serveStatic,
    staticDir,
    configurationErrors: errors,
    configured: Boolean(apiKey && model) && errors.length === 0,
  };
}

function notConfiguredMessage(config: AiServerConfig): string {
  if (config.configurationErrors.length > 0) {
    return `The AI server configuration is invalid. ${config.configurationErrors.join(
      ' ',
    )} AI planning is disabled; your saved planning data is unaffected.`;
  }

  if (!config.provider.apiKey) {
    return 'AI planning is not configured on the API server. Set AI_PROVIDER_API_KEY and AI_MODEL in the server environment. Until then, only the deterministic local outline is available.';
  }

  return 'AI planning is disabled on the API server because its provider configuration is incomplete. No request was sent.';
}

/**
 * Safe status returned to the browser. It deliberately omits API keys, the
 * provider base URL, headers, and any other connection details.
 */
export function publicAiStatus(config: AiServerConfig): AiStatus {
  const rateLimitPerMinute = Math.max(
    1,
    Math.round((config.rateLimit.maxRequests * 60_000) / config.rateLimit.windowMs),
  );

  return {
    configured: config.configured,
    providerName: config.configured ? config.provider.name : null,
    model: config.configured ? config.provider.model : null,
    message: config.configured
      ? 'The server-side AI provider is configured. Requests are validated before any suggestion is shown, and nothing is applied without your approval.'
      : notConfiguredMessage(config),
    limits: {
      maxMessageCharacters: 2_000,
      maxRequestBytes: config.maxRequestBytes,
      timeoutMs: config.provider.timeoutMs,
      rateLimitPerMinute,
    },
  };
}
