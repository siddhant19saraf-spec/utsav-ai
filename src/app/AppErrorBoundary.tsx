import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { diagnosticsStore } from '@/features/diagnostics/diagnosticsStore';

type AppErrorBoundaryProps = {
  readonly children: ReactNode;
};

type AppErrorBoundaryState = {
  readonly hasError: boolean;
  readonly referenceId: string | null;
};

function AppErrorFallback({
  onRetry,
  referenceId,
}: {
  readonly onRetry: () => void;
  readonly referenceId: string | null;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6">
      <section
        role="alert"
        aria-labelledby="app-error-heading"
        className="surface-card w-full max-w-xl p-6 sm:p-8"
      >
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-rust-100 text-rust-700">
          <AlertTriangle className="size-6" aria-hidden="true" />
        </span>
        <h1
          id="app-error-heading"
          ref={headingRef}
          tabIndex={-1}
          className="mt-5 text-2xl font-semibold text-ink focus:outline-none sm:text-3xl"
        >
          Something went wrong while drawing this screen
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          UTSAV AI hit an unexpected error. Your saved workspace was not intentionally cleared.
          Try again to redraw the screen, or reload the app if the error continues.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-primary" onClick={onRetry}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => window.location.reload()}
          >
            Reload app
          </button>
        </div>
        {referenceId ? (
          <p className="mt-4 rounded-xl border border-line bg-canvas px-3 py-2 text-[0.6875rem] leading-relaxed text-ink-muted">
            Diagnostic reference:{' '}
            <code className="font-mono font-semibold text-ink">{referenceId}</code>. Quote
            this reference when reporting the problem; it never contains your workspace
            data.
          </p>
        ) : null}
      </section>
    </main>
  );
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { hasError: false, referenceId: null };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true, referenceId: null };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('UTSAV AI caught an unexpected render error.', error, info.componentStack);
    } else {
      console.error('UTSAV AI caught an unexpected render error.');
    }

    const entry = diagnosticsStore.report({
      category: 'render',
      severity: 'error',
      feature: 'Application shell',
      message:
        'A screen failed to render and the safe recovery screen was shown. Saved planning data was not intentionally cleared.',
      recovery: 'retry-available',
    });

    this.setState({ referenceId: entry.referenceId });
  }

  private readonly handleRetry = () => {
    this.setState({ hasError: false });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <AppErrorFallback onRetry={this.handleRetry} referenceId={this.state.referenceId} />
      );
    }

    return this.props.children;
  }
}
