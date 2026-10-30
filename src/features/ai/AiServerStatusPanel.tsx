import { AlertTriangle, RefreshCw, ServerCog, ShieldCheck } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import type { AiStatus } from './contracts';

export type AiStatusState =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly status: AiStatus }
  | { readonly state: 'error'; readonly message: string };

function statusTone(state: AiStatusState): 'success' | 'warning' | 'neutral' {
  if (state.state === 'ready') {
    return state.status.configured ? 'success' : 'warning';
  }

  return state.state === 'error' ? 'warning' : 'neutral';
}

interface AiServerStatusPanelProps {
  readonly status: AiStatusState;
  readonly onRetry: () => void;
}

export function AiServerStatusPanel({
  status: statusState,
  onRetry,
}: AiServerStatusPanelProps) {
  return (
    <section
      aria-labelledby="ai-status-heading"
      className="surface-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-slate-blue-100 bg-slate-blue-50 text-slate-blue-700"
            aria-hidden="true"
          >
            <ServerCog className="size-5" strokeWidth={1.7} />
          </span>
          <div>
            <h2
              id="ai-status-heading"
              className="text-xl font-semibold tracking-[-0.01em] text-ink"
            >
              Server-side AI status
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              The browser calls the same-origin API at <code>/api</code>. Provider keys
              stay in the API server’s environment and are never bundled into this page.
            </p>
          </div>
        </div>
        <StatusBadge tone={statusTone(statusState)} showDot={false}>
          {statusState.state === 'loading'
            ? 'Checking'
            : statusState.state === 'error'
              ? 'Unavailable'
              : statusState.status.configured
                ? 'Configured'
                : 'Not configured'}
        </StatusBadge>
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-surface-muted/55 px-4 py-3.5">
        {statusState.state === 'loading' ? (
          <p className="text-sm text-ink-muted">Checking the AI API server…</p>
        ) : statusState.state === 'error' ? (
          <>
            <p className="flex items-start gap-2 text-sm leading-relaxed text-ink">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-gold-700"
                aria-hidden="true"
              />
              {statusState.message}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="btn-secondary mt-3 min-h-9 px-3 py-1.5 text-xs"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Check again
            </button>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-ink">
              {statusState.status.message}
            </p>
            {statusState.status.configured ? (
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-ink-muted">
                <div>
                  <dt className="inline font-semibold text-ink">Provider: </dt>
                  <dd className="inline">
                    {statusState.status.providerName ?? 'Configured provider'}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-ink">Model: </dt>
                  <dd className="inline">{statusState.status.model ?? 'Configured model'}</dd>
                </div>
                {statusState.status.limits ? (
                  <>
                    <div>
                      <dt className="inline font-semibold text-ink">Timeout: </dt>
                      <dd className="inline">
                        {Math.round(statusState.status.limits.timeoutMs / 1_000)}s
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-ink">Rate limit: </dt>
                      <dd className="inline">
                        {statusState.status.limits.rateLimitPerMinute}/minute
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                You can still use the deterministic local outline below. It uses saved
                data and app rules only, and clearly labels itself as not AI-generated.
              </p>
            )}
          </>
        )}
      </div>

      <p className="mt-3 flex items-start gap-2 text-[0.6875rem] leading-relaxed text-ink-soft">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Only event facts and aggregates are sent. Guest names, emails, notes, dietary
        text, accessibility text, and other events are never included. AI cannot change
        budgets, guest records, protected priorities, or apply its own proposal.
      </p>
    </section>
  );
}
