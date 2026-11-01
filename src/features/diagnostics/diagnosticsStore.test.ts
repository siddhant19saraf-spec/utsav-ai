import { describe, expect, it, vi } from 'vitest';
import { createDiagnosticsStore } from './diagnosticsStore';

function makeClock(startMs = Date.UTC(2026, 0, 1, 9, 0, 0)) {
  let tick = 0;
  return () => new Date(startMs + tick++ * 1_000);
}

function makeIds() {
  let sequence = 0;
  return () => {
    sequence += 1;
    return `diag-test-${sequence}`;
  };
}

function makeStore(options: Parameters<typeof createDiagnosticsStore>[0] = {}) {
  return createDiagnosticsStore({
    now: makeClock(),
    createReferenceId: makeIds(),
    ...options,
  });
}

describe('diagnostics store', () => {
  it('records a safe entry with a stable reference ID and count', () => {
    const store = makeStore();

    const entry = store.report({
      category: 'persistence',
      severity: 'error',
      feature: 'Workspace storage',
      message: 'Changes could not be saved in this browser.',
      recovery: 'retry-available',
      requestId: 'req-123',
    });

    expect(entry).toMatchObject({
      referenceId: 'diag-test-1',
      category: 'persistence',
      severity: 'error',
      feature: 'Workspace storage',
      message: 'Changes could not be saved in this browser.',
      recovery: 'retry-available',
      requestId: 'req-123',
      count: 1,
    });
    expect(entry.firstSeenAt).toBe(entry.lastSeenAt);
    expect(store.getSnapshot().entries).toEqual([entry]);
  });

  it('deduplicates identical reports and keeps the newest entry first', () => {
    const store = makeStore();

    const first = store.report({
      category: 'api',
      severity: 'warning',
      feature: 'AI Planner',
      message: 'The AI request was rejected.',
    });
    store.report({
      category: 'api',
      severity: 'warning',
      feature: 'AI Planner',
      message: 'A different API failure occurred.',
    });
    const duplicate = store.report({
      category: 'api',
      severity: 'warning',
      feature: 'AI Planner',
      message: 'The AI request was rejected.',
    });

    expect(duplicate.referenceId).toBe(first.referenceId);
    expect(duplicate.count).toBe(2);
    expect(duplicate.firstSeenAt).toBe(first.firstSeenAt);
    expect(duplicate.lastSeenAt).not.toBe(first.lastSeenAt);
    expect(store.getSnapshot().entries[0]?.referenceId).toBe(first.referenceId);
  });

  it('keeps severity or feature changes as separate diagnostics', () => {
    const store = makeStore();

    store.report({
      category: 'api',
      severity: 'warning',
      feature: 'AI Planner',
      message: 'The API request failed.',
    });
    store.report({
      category: 'api',
      severity: 'error',
      feature: 'AI Planner',
      message: 'The API request failed.',
    });
    store.report({
      category: 'api',
      severity: 'warning',
      feature: 'Backup and restore',
      message: 'The API request failed.',
    });

    expect(store.getSnapshot().entries).toHaveLength(3);
  });

  it('sanitises unsafe fields instead of storing raw values', () => {
    const store = makeStore();

    const entry = store.report({
      category: 'application',
      severity: 'warning',
      feature: '   ',
      message: `  ${'x'.repeat(400)}  `,
      requestId: 'not a valid request id!',
    });

    expect(entry.feature).toBe('Application');
    expect(entry.message).toHaveLength(280);
    expect(entry.message.endsWith('…')).toBe(true);
    expect(entry.requestId).toBeNull();

    const valid = store.report({
      category: 'application',
      severity: 'info',
      feature: '  Risk   Intelligence  ',
      message: 'A safe summary.',
      requestId: '  req-abc_1:2.3  ',
    });

    expect(valid.feature).toBe('Risk Intelligence');
    expect(valid.requestId).toBe('req-abc_1:2.3');
  });

  it('falls back to a safe message when the summary is empty', () => {
    const store = makeStore();

    const entry = store.report({
      category: 'application',
      severity: 'info',
      feature: 'Application',
      message: '   ',
    });

    expect(entry.message).toBe('An operation failed without a safe summary.');
  });

  it('bounds the log and drops the oldest entries', () => {
    const store = makeStore({ maxEntries: 2 });

    store.report({
      category: 'application',
      severity: 'info',
      feature: 'Application',
      message: 'First failure.',
    });
    store.report({
      category: 'application',
      severity: 'info',
      feature: 'Application',
      message: 'Second failure.',
    });
    store.report({
      category: 'application',
      severity: 'info',
      feature: 'Application',
      message: 'Third failure.',
    });

    const messages = store.getSnapshot().entries.map((entry) => entry.message);
    expect(messages).toEqual(['Third failure.', 'Second failure.']);
  });

  it('marks the newest unrecovered entry of a category as recovered once', () => {
    const store = makeStore();

    store.report({
      category: 'persistence',
      severity: 'error',
      feature: 'Workspace storage',
      message: 'Changes could not be saved.',
    });

    expect(store.markRecovered('persistence')).toBe(true);

    const entry = store.getSnapshot().entries[0];
    expect(entry?.recovery).toBe('recovered');
    expect(store.markRecovered('persistence')).toBe(false);
    expect(store.markRecovered('import-export')).toBe(false);
  });

  it('records the last successful operation without adding a diagnostic entry', () => {
    const store = makeStore();

    store.recordOperation('  Workspace   storage ', '  Changes   saved. ');
    expect(store.getSnapshot().lastOperation).toMatchObject({
      feature: 'Workspace storage',
      label: 'Changes saved.',
    });
    expect(store.getSnapshot().entries).toEqual([]);

    store.recordOperation('Backup and restore', '');

    const snapshot = store.getSnapshot();
    expect(snapshot.entries).toEqual([]);
    expect(snapshot.lastOperation).toMatchObject({
      feature: 'Backup and restore',
      label: 'Operation completed.',
    });
    expect(snapshot.lastOperation?.at).toBeTruthy();
  });

  it('clears the log but keeps the last operation until reset', () => {
    const store = makeStore();

    store.recordOperation('Event Rescue', 'Rescue plan applied');
    store.report({
      category: 'application',
      severity: 'warning',
      feature: 'Risk Intelligence',
      message: 'Analysis did not complete.',
    });

    store.clearLog();
    expect(store.getSnapshot().entries).toEqual([]);
    expect(store.getSnapshot().lastOperation).toMatchObject({
      feature: 'Event Rescue',
    });

    store.reset();
    expect(store.getSnapshot().entries).toEqual([]);
    expect(store.getSnapshot().lastOperation).toBeNull();
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const store = makeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.report({
      category: 'application',
      severity: 'info',
      feature: 'Application',
      message: 'A safe summary.',
    });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.report({
      category: 'application',
      severity: 'info',
      feature: 'Application',
      message: 'Another summary.',
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('returns a stable snapshot between publishes', () => {
    const store = makeStore();
    const first = store.getSnapshot();

    expect(store.getSnapshot()).toBe(first);

    store.recordOperation('Workspace storage', 'Changes saved');

    expect(store.getSnapshot()).not.toBe(first);
  });
});
