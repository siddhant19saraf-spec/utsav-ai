import { diagnosticsStore, type DiagnosticsStore } from './diagnosticsStore';

export interface GlobalDiagnosticsOptions {
  readonly target?: Window;
  readonly store?: DiagnosticsStore;
}

const installedTargets = new WeakSet<Window>();

function safeErrorName(value: unknown): string {
  const candidate = value instanceof Error ? value.name : '';
  return /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(candidate) ? candidate : 'error';
}

/**
 * Captures uncaught script errors and unhandled promise rejections without
 * reading error messages, stacks, URLs, or rejection values. Only a sanitised
 * error name and a fixed description enter the diagnostic log.
 */
export function installGlobalDiagnostics(
  options: GlobalDiagnosticsOptions = {},
): () => void {
  const target = options.target ?? window;
  const store = options.store ?? diagnosticsStore;

  if (installedTargets.has(target)) {
    return () => {};
  }

  installedTargets.add(target);

  const handleError = (event: ErrorEvent) => {
    if (!event.error && !event.message) {
      return;
    }

    store.report({
      category: 'uncaught',
      severity: 'error',
      feature: 'Application shell',
      message: `An unexpected ${safeErrorName(
        event.error,
      )} was not caught by the app. The screen may be incomplete; saved planning data is unchanged.`,
      recovery: 'unknown',
    });
  };

  const handleUnhandledRejection = () => {
    store.report({
      category: 'unhandled-rejection',
      severity: 'error',
      feature: 'Application shell',
      message:
        'An asynchronous operation failed without a handler. The screen may be incomplete; saved planning data is unchanged.',
      recovery: 'unknown',
    });
  };

  target.addEventListener('error', handleError);
  target.addEventListener('unhandledrejection', handleUnhandledRejection);

  return () => {
    target.removeEventListener('error', handleError);
    target.removeEventListener('unhandledrejection', handleUnhandledRejection);
    installedTargets.delete(target);
  };
}
