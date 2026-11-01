import {
  AlertTriangle,
  Clock,
  Database,
  HardDrive,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { formatCount, formatCountLabel, formatDateTime } from '@/lib/format';
import type { StatusTone } from '@/types/ui';
import {
  useWorkspace,
  type WorkspacePersistenceStatus,
} from '@/features/workspace/workspaceContext';
import {
  diagnosticsStore,
  type DiagnosticCategory,
  type DiagnosticEntry,
  type DiagnosticRecovery,
  type DiagnosticSeverity,
} from './diagnosticsStore';
import {
  checkServices,
  type AiProviderProbe,
  type HealthProbe,
  type ServiceProbeResult,
} from './serviceStatus';
import { useDiagnostics } from './useDiagnostics';

type SystemState =
  | 'operational'
  | 'degraded'
  | 'unavailable'
  | 'configuration-required'
  | 'configured'
  | 'error'
  | 'checking';

const statusMeta: Record<SystemState, { readonly label: string; readonly tone: StatusTone }> = {
  operational: { label: 'Operational', tone: 'success' },
  degraded: { label: 'Degraded', tone: 'warning' },
  unavailable: { label: 'Unavailable', tone: 'neutral' },
  'configuration-required': { label: 'Configuration Required', tone: 'info' },
  configured: { label: 'Configured', tone: 'info' },
  error: { label: 'Error Detected', tone: 'danger' },
  checking: { label: 'Checking', tone: 'neutral' },
};

const severityMeta: Record<
  DiagnosticSeverity,
  { readonly label: string; readonly tone: StatusTone }
> = {
  error: { label: 'Error', tone: 'danger' },
  warning: { label: 'Warning', tone: 'warning' },
  info: { label: 'Info', tone: 'info' },
};

const categoryLabels: Record<DiagnosticCategory, string> = {
  render: 'Render',
  uncaught: 'Uncaught script',
  'unhandled-rejection': 'Unhandled promise',
  persistence: 'Persistence',
  api: 'API request',
  'import-export': 'Import / export',
  application: 'Application',
};

const recoveryLabels: Record<DiagnosticRecovery, string> = {
  'retry-available': 'Retry available',
  recovered: 'Recovered',
  'not-retryable': 'No in-app retry',
  unknown: 'Unknown',
};

const persistenceStates: Record<WorkspacePersistenceStatus, SystemState> = {
  local: 'operational',
  'load-partial': 'degraded',
  'load-failed': 'error',
  'save-failed': 'error',
  unavailable: 'unavailable',
};

function persistenceDescription(status: WorkspacePersistenceStatus): string {
  switch (status) {
    case 'local':
      return 'Changes are saved in this browser’s local storage. There is no account or cloud sync.';
    case 'load-partial':
      return 'Some saved records could not be loaded. Valid records were kept and the original payload was retained for recovery.';
    case 'load-failed':
      return 'Saved data could not be loaded. Sample data is shown and the saved payload was not overwritten.';
    case 'save-failed':
      return 'The most recent change may not be saved. Export a backup before closing this tab.';
    case 'unavailable':
      return 'Browser storage is unavailable in this context. Changes stay in memory only.';
  }
}

function healthSummary(health: HealthProbe): string {
  switch (health.state) {
    case 'operational':
      return 'available';
    case 'unavailable':
      return 'unavailable';
    case 'error':
      return 'reported an error';
  }
}

function aiSummary(ai: AiProviderProbe): string {
  switch (ai.state) {
    case 'configured':
      return 'configured but not verified';
    case 'configuration-required':
      return 'configuration required';
    case 'unavailable':
      return 'unavailable';
    case 'error':
      return 'error detected';
  }
}

function appState(entries: readonly DiagnosticEntry[]): SystemState {
  return entries.some(
    (entry) =>
      entry.category === 'render' ||
      entry.category === 'uncaught' ||
      entry.category === 'unhandled-rejection',
  )
    ? 'error'
    : 'operational';
}

interface StatusCardProps {
  readonly title: string;
  readonly description: string;
  readonly state: SystemState;
  readonly icon: LucideIcon;
  readonly detail?: ReactNode;
}

function StatusCard({
  title,
  description,
  state,
  icon: Icon,
  detail,
}: StatusCardProps) {
  const meta = statusMeta[state];

  return (
    <section className="surface-card p-5" aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-muted text-maroon-700 dark:text-maroon-200"
            aria-hidden="true"
          >
            <Icon className="size-5" strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{description}</p>
          </div>
        </div>
        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
      </div>
      {detail ? <div className="mt-3 text-xs leading-relaxed text-ink-muted">{detail}</div> : null}
    </section>
  );
}

function DiagnosticEntryCard({ entry }: { readonly entry: DiagnosticEntry }) {
  const severity = severityMeta[entry.severity];

  return (
    <li className="rounded-2xl border border-line bg-surface-muted/45 p-3.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <StatusBadge tone={severity.tone} showDot={false}>
          {severity.label}
        </StatusBadge>
        <span className="text-[0.6875rem] font-semibold tracking-[0.06em] text-ink-soft uppercase">
          {categoryLabels[entry.category]}
        </span>
        <span className="text-[0.6875rem] text-ink-muted">· {entry.feature}</span>
        <time
          className="ml-auto text-[0.6875rem] text-ink-soft"
          dateTime={entry.lastSeenAt}
        >
          {formatDateTime(entry.lastSeenAt)}
        </time>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink">{entry.message}</p>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] text-ink-muted">
        <div>
          <dt className="inline">Reference </dt>
          <dd className="inline font-mono font-semibold text-ink">{entry.referenceId}</dd>
        </div>
        <div>
          <dt className="inline">Recovery </dt>
          <dd className="inline">{recoveryLabels[entry.recovery]}</dd>
        </div>
        {entry.count > 1 ? (
          <div>
            <dt className="inline">Occurrences </dt>
            <dd className="inline">{formatCount(entry.count)}</dd>
          </div>
        ) : null}
        {entry.requestId ? (
          <div>
            <dt className="inline">Server request </dt>
            <dd className="inline font-mono">{entry.requestId}</dd>
          </div>
        ) : null}
      </dl>
      {entry.count > 1 ? (
        <p className="mt-1 text-[0.6875rem] text-ink-soft">
          First seen {formatDateTime(entry.firstSeenAt)}.
        </p>
      ) : null}
    </li>
  );
}

export function DiagnosticsPage() {
  const { persistence } = useWorkspace();
  const { entries, lastOperation } = useDiagnostics();
  const [probe, setProbe] = useState<ServiceProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const sequenceRef = useRef(0);

  const runCheck = useCallback(async () => {
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    setProbing(true);
    setAnnouncement('Checking the API server and AI provider status.');

    try {
      const result = await checkServices({ timeoutMs: 4_000 });

      if (sequenceRef.current !== sequence) {
        return;
      }

      setProbe(result);
      setAnnouncement(
        `Service check complete. API server ${healthSummary(
          result.health,
        )}. AI provider ${aiSummary(result.ai)}.`,
      );
    } catch {
      if (sequenceRef.current === sequence) {
        setAnnouncement(
          'The service check failed before a status could be read. No health claim was recorded.',
        );
      }
    } finally {
      if (sequenceRef.current === sequence) {
        setProbing(false);
      }
    }
  }, []);

  useEffect(() => {
    // Defer the first probe so the initial render is not cascaded by its state.
    const timer = window.setTimeout(() => {
      void runCheck();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      sequenceRef.current += 1;
    };
  }, [runCheck]);

  function clearLog() {
    diagnosticsStore.clearLog();
    setAnnouncement('Diagnostic log cleared for this tab.');
  }

  const health = probe?.health ?? null;
  const ai = probe?.ai ?? null;
  const apiState: SystemState =
    health === null
      ? 'checking'
      : health.state === 'operational'
        ? 'operational'
        : health.state;
  const aiState: SystemState =
    ai === null
      ? 'checking'
      : ai.state === 'configured'
        ? 'configured'
        : ai.state;
  const appCurrentState = appState(entries);
  const lastChecked = probe ? formatDateTime(probe.checkedAt) : null;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Diagnostics"
        title="System health and diagnostics"
        description="Review what is connected in this build, whether the same-origin API responded, and safe summaries of recent failures in this tab. Status here is observed, not assumed."
        actions={
          <>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void runCheck()}
              disabled={probing}
            >
              <RefreshCw
                className={`size-4 ${probing ? 'motion-safe:animate-spin' : ''}`}
                aria-hidden="true"
              />
              {probing ? 'Checking services…' : 'Check services'}
            </button>
            <Link to="/settings" className="btn-secondary">
              Back to settings
            </Link>
          </>
        }
      />

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      <section aria-labelledby="service-status-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2
            id="service-status-heading"
            className="text-xs font-semibold tracking-[0.08em] text-ink-soft uppercase"
          >
            Service status
          </h2>
          <p className="text-[0.6875rem] text-ink-soft">
            {lastChecked ? `Last checked ${lastChecked}` : 'Not checked yet'}
          </p>
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatusCard
            title="Application"
            description="Render and script errors recorded in this tab."
            state={appCurrentState}
            icon={appCurrentState === 'error' ? AlertTriangle : ShieldCheck}
            detail={
              appCurrentState === 'error'
                ? 'A shell error was recorded. The app may have shown a recovery screen; review the entries below.'
                : 'The interface is rendering. This does not test every feature or validate saved data.'
            }
          />
          <StatusCard
            title="Local persistence"
            description="Browser storage for this workspace."
            state={persistenceStates[persistence.status]}
            icon={HardDrive}
            detail={`${persistenceDescription(persistence.status)}${
              persistence.status === 'local' ? '' : ` ${persistence.message}`
            }`}
          />
          <StatusCard
            title="API server"
            description="Same-origin Node API at /api/health."
            state={apiState}
            icon={ServerCog}
            detail={
              health === null
                ? 'Checking the same-origin API…'
                : health.state === 'operational'
                  ? 'The health endpoint responded. This does not verify the AI provider or any planning data.'
                  : health.message
            }
          />
          <StatusCard
            title="AI provider"
            description="Configuration reported by the server; not a live provider check."
            state={aiState}
            icon={Sparkles}
            detail={
              ai === null ? (
                'Waiting for the API check…'
              ) : ai.state === 'configured' ? (
                <>
                  {ai.status.providerName ?? 'A provider'} / {ai.status.model ?? 'model'} is
                  configured on the server. Availability is not verified here because this
                  page sends no paid provider request.
                </>
              ) : ai.state === 'configuration-required' ? (
                'No provider credentials are configured. The deterministic local outline remains available.'
              ) : (
                <>
                  {ai.message}
                  {ai.state === 'error' && ai.requestId ? (
                    <span className="mt-1 block">
                      Server request: <code className="font-mono">{ai.requestId}</code>
                    </span>
                  ) : null}
                </>
              )
            }
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="surface-card p-5 sm:p-6" aria-labelledby="recent-diagnostics-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="recent-diagnostics-heading"
                className="text-xl font-semibold text-ink"
              >
                Recent diagnostics
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                Safe summaries recorded in this tab since it loaded. Raw errors, stacks,
                URLs, and record contents are never stored.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge
                tone={entries.length > 0 ? 'warning' : 'success'}
                showDot={false}
              >
                {entries.length > 0
                  ? formatCountLabel(entries.length, 'entry', 'entries')
                  : 'No errors'}
              </StatusBadge>
              <button
                type="button"
                className="btn-secondary min-h-9 px-3 py-1.5 text-xs"
                onClick={clearLog}
                disabled={entries.length === 0}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Clear log
              </button>
            </div>
          </div>

          {entries.length > 0 ? (
            <ol className="mt-4 space-y-3">
              {entries.map((entry) => (
                <DiagnosticEntryCard key={entry.referenceId} entry={entry} />
              ))}
            </ol>
          ) : (
            <div className="mt-4 rounded-2xl border border-line bg-surface-muted/45 px-4 py-6 text-center">
              <span
                className="mx-auto flex size-10 items-center justify-center rounded-full bg-sage-100 text-sage-700"
                aria-hidden="true"
              >
                <ShieldCheck className="size-4" strokeWidth={1.8} />
              </span>
              <p className="mt-3 text-sm font-semibold text-ink">
                No application errors recorded
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-ink-muted">
                Save failures, AI request failures, import problems, render errors, and
                uncaught script errors will appear here automatically with a reference ID.
              </p>
            </div>
          )}
        </section>

        <div className="space-y-5">
          <section className="surface-card p-5 sm:p-6" aria-labelledby="last-operation-heading">
            <div className="flex items-start gap-3">
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-sage-100 bg-sage-50 text-sage-700"
                aria-hidden="true"
              >
                <Clock className="size-5" strokeWidth={1.7} />
              </span>
              <div>
                <h2 id="last-operation-heading" className="text-xl font-semibold text-ink">
                  Last successful operation
                </h2>
                <p className="mt-1 text-xs text-ink-muted">
                  Latest save, approval, or backup in this tab
                </p>
              </div>
            </div>
            {lastOperation ? (
              <>
                <p className="mt-4 text-sm font-medium text-ink">{lastOperation.label}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {lastOperation.feature} ·{' '}
                  <time dateTime={lastOperation.at}>
                    {formatDateTime(lastOperation.at)}
                  </time>
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-ink-muted">
                No save, approval, or backup has completed in this tab yet.
              </p>
            )}
          </section>

          <section className="surface-card p-5 sm:p-6" aria-labelledby="build-scope-heading">
            <div className="flex items-start gap-3">
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-slate-blue-100 bg-slate-blue-50 text-slate-blue-700"
                aria-hidden="true"
              >
                <Database className="size-5" strokeWidth={1.7} />
              </span>
              <div>
                <h2 id="build-scope-heading" className="text-xl font-semibold text-ink">
                  Build and scope
                </h2>
                <p className="mt-1 text-xs text-ink-muted">
                  What this page can and cannot observe
                </p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-xs leading-relaxed text-ink-muted">
              <div>
                <dt className="inline font-semibold text-ink">Build mode: </dt>
                <dd className="inline">{import.meta.env.MODE}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-ink">Diagnostics scope: </dt>
                <dd className="inline">
                  In memory for this tab session; cleared on reload.
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold text-ink">Automated checks: </dt>
                <dd className="inline">
                  Run by CI and documented in the repository. This page does not execute or
                  claim a test or build result.
                </dd>
              </div>
              <div>
                <dt className="inline font-semibold text-ink">AI verification: </dt>
                <dd className="inline">
                  Configuration is shown; no provider request is sent from this page.
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      <p className="flex items-start gap-2.5 rounded-2xl border border-line bg-canvas/70 px-4 py-3 text-xs leading-relaxed text-ink-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sage-700" aria-hidden="true" />
        Diagnostics never include guest names, contact details, notes, dietary or
        accessibility text, prompts, provider payloads, workspace exports, or API keys.
        Server-side failures use request IDs instead of provider bodies, and no diagnostic
        entry leaves this browser.
      </p>
    </div>
  );
}
