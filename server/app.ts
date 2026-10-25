import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { createApiHandler, type ApiHandlerOptions } from './http.ts';
import { createStaticHandler } from './static.ts';

export interface AppServerOptions extends ApiHandlerOptions {
  readonly staticRoot: string | null;
}

function requestPathname(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? '/', 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export function createAppHandler(
  options: AppServerOptions,
): (request: IncomingMessage, response: ServerResponse) => void {
  const apiHandler = createApiHandler(options);
  const staticHandler = options.staticRoot
    ? createStaticHandler({ root: options.staticRoot })
    : null;

  return (request, response) => {
    const pathname = requestPathname(request);

    if (staticHandler && !isApiPath(pathname)) {
      void staticHandler(request, response);
      return;
    }

    apiHandler(request, response);
  };
}

export function createAppServer(options: AppServerOptions): Server {
  return createServer(createAppHandler(options));
}
