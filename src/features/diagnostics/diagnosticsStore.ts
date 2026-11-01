import { createId } from '@/lib/id';
import { stableHash } from '@/lib/stableHash';

export type DiagnosticCategory =
  | 'render'
  | 'uncaught'
  | 'unhandled-rejection'
  | 'persistence'
  | 'api'
  | 'import-export'
  | 'application';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticRecovery =
  | 'retry-available'
  | 'recovered'
  | 'not-retryable'
  | 'unknown';

export interface DiagnosticReport {
  readonly category: DiagnosticCategory;
  readonly severity: DiagnosticSeverity;
  readonly feature: string;
  /** A safe, developer-authored summary. Never pass raw error text or record data. */
  readonly message: string;
  readonly recovery?: DiagnosticRecovery;
  readonly requestId?: string | null;
}

export interface DiagnosticEntry {
  readonly referenceId: string;
  readonly category: DiagnosticCategory;
  readonly severity: DiagnosticSeverity;
  readonly feature: string;
  readonly message: string;
  readonly recovery: DiagnosticRecovery;
  readonly requestId: string | null;
  readonly count: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
}

export interface LastOperation {
  readonly feature: string;
  readonly label: string;
  readonly at: string;
}

export interface DiagnosticsSnapshot {
  readonly entries: readonly DiagnosticEntry[];
  readonly lastOperation: LastOperation | null;
}

export interface DiagnosticsStore {
  /** Records a safe summary and returns the stable entry for that fingerprint. */
  report: (report: DiagnosticReport) => DiagnosticEntry;
  /** Marks the newest entry in a category as recovered after a successful retry. */
  markRecovered: (category: DiagnosticCategory) => boolean;
  recordOperation: (feature: string, label: string) => void;
  clearLog: () => void;
  /** Clears entries and the last operation. Intended for test isolation. */
  reset: () => void;
  getSnapshot: () => DiagnosticsSnapshot;
  subscribe: (listener: () => void) => () => void;
}

export interface DiagnosticsStoreOptions {
  readonly now?: () => Date;
  readonly createReferenceId?: () => string;
  readonly maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 40;
const MAX_MESSAGE_LENGTH = 280;
const MAX_FEATURE_LENGTH = 60;
const MAX_OPERATION_LABEL_LENGTH = 120;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;

function collapse(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function safeMessage(value: string): string {
  const collapsed = collapse(value);
  return collapsed
    ? truncate(collapsed, MAX_MESSAGE_LENGTH)
    : 'An operation failed without a safe summary.';
}

function safeFeature(value: string): string {
  const collapsed = collapse(value);
  return collapsed ? truncate(collapsed, MAX_FEATURE_LENGTH) : 'Application';
}

function safeRequestId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return REQUEST_ID_PATTERN.test(trimmed) ? trimmed : null;
}

function fingerprintOf(report: {
  readonly category: DiagnosticCategory;
  readonly feature: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
}): string {
  return stableHash(
    `${report.category}|${report.feature}|${report.severity}|${report.message}`,
  );
}

export function createDiagnosticsStore(
  options: DiagnosticsStoreOptions = {},
): DiagnosticsStore {
  const now = options.now ?? (() => new Date());
  const createReferenceId =
    options.createReferenceId ?? (() => createId('diag').toUpperCase());
  const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  const listeners = new Set<() => void>();
  let entries: readonly DiagnosticEntry[] = [];
  let lastOperation: LastOperation | null = null;
  let snapshot: DiagnosticsSnapshot = { entries, lastOperation };

  function publish(
    nextEntries: readonly DiagnosticEntry[],
    nextOperation: LastOperation | null,
  ): void {
    entries = nextEntries;
    lastOperation = nextOperation;
    snapshot = { entries, lastOperation };

    for (const listener of listeners) {
      listener();
    }
  }

  function report(input: DiagnosticReport): DiagnosticEntry {
    const at = now().toISOString();
    const message = safeMessage(input.message);
    const feature = safeFeature(input.feature);
    const requestId = safeRequestId(input.requestId);
    const recovery = input.recovery ?? 'unknown';
    const fingerprint = fingerprintOf({
      category: input.category,
      feature,
      severity: input.severity,
      message,
    });
    const existing = entries.find((entry) => fingerprintOf(entry) === fingerprint);

    if (existing) {
      const updated: DiagnosticEntry = {
        ...existing,
        recovery,
        requestId: requestId ?? existing.requestId,
        count: existing.count + 1,
        lastSeenAt: at,
      };
      publish(
        [updated, ...entries.filter((entry) => entry !== existing)].slice(0, maxEntries),
        lastOperation,
      );
      return updated;
    }

    const entry: DiagnosticEntry = {
      referenceId: createReferenceId(),
      category: input.category,
      severity: input.severity,
      feature,
      message,
      recovery,
      requestId,
      count: 1,
      firstSeenAt: at,
      lastSeenAt: at,
    };

    publish([entry, ...entries].slice(0, maxEntries), lastOperation);
    return entry;
  }

  function markRecovered(category: DiagnosticCategory): boolean {
    const entry = entries.find(
      (candidate) =>
        candidate.category === category && candidate.recovery !== 'recovered',
    );

    if (!entry) {
      return false;
    }

    const updated: DiagnosticEntry = { ...entry, recovery: 'recovered' };
    publish(
      entries.map((candidate) => (candidate === entry ? updated : candidate)),
      lastOperation,
    );
    return true;
  }

  function recordOperation(feature: string, label: string): void {
    publish(entries, {
      feature: safeFeature(feature),
      label: truncate(collapse(label) || 'Operation completed.', MAX_OPERATION_LABEL_LENGTH),
      at: now().toISOString(),
    });
  }

  function clearLog(): void {
    publish([], lastOperation);
  }

  function reset(): void {
    publish([], null);
  }

  return {
    report,
    markRecovered,
    recordOperation,
    clearLog,
    reset,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const diagnosticsStore = createDiagnosticsStore();
